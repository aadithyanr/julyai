"""Model deployment: serve trained models as live API endpoints."""

import io
import json
import logging
import os
import secrets
import shutil
import time
import zipfile
import base64
from datetime import datetime
from pathlib import Path
from typing import Any

from PIL import Image
import torch
import torch.nn as nn
from fastapi import APIRouter, HTTPException, Header, Query, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel

from models.schemas import GraphSchema
from compiler.normalize_graph import normalize_graph
from compiler.validator import topological_sort, get_input_node, get_input_nodes
from compiler.shape_inference import infer_shapes
from compiler.model_builder import DynamicModel
from supabase_client import (
    get_supabase_client,
    get_model_from_db,
    get_model_state_dict,
    list_playground_models,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["deploy"])

# ---------------------------------------------------------------------------
# In-memory model cache: deployment_id -> loaded model
# ---------------------------------------------------------------------------
_model_cache: dict[str, nn.Module] = {}
_deployment_meta: dict[str, dict] = {}  # deployment_id -> metadata

DEPLOYMENTS_DIR = Path(__file__).parent.parent / "deployments"
DEPLOYMENTS_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class DeployRequest(BaseModel):
    graph: GraphSchema
    playground_id: str | None = None
    model_id: str | None = None
    name: str | None = None
    user_id: str | None = None


class PredictRequest(BaseModel):
    input: list[list[float]] | list[float] | list[list[list[float]]] | list[list[list[list[float]]]] | None = None
    image_base64: str | None = None


class TrainRequest(BaseModel):
    input: list[list[float]] | list[float] | list[list[list[float]]] | list[list[list[list[float]]]] | None = None
    image_base64: str | None = None
    target: list[float] | list[int] | float | int


class RegenerateKeyResponse(BaseModel):
    api_key: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_api_key() -> str:
    """Generate a unique API key with jly_ prefix."""
    return f"jly_{secrets.token_urlsafe(32)}"


def _get_input_shape(graph: GraphSchema) -> list[int]:
    """Extract input shape from graph."""
    for n in graph.nodes:
        if n.type == "input":
            shape = n.params.get("shape")
            if isinstance(shape, list) and len(shape) > 0:
                return [int(x) for x in shape]
    return [1, 28, 28]


def _get_num_classes(graph: GraphSchema) -> int:
    """Get number of output classes from last linear layer."""
    topo = topological_sort(graph)
    nodes_by_id = {n.id: n for n in graph.nodes}
    last_out = 10
    for nid in topo:
        node = nodes_by_id[nid]
        if node.type == "linear":
            last_out = int(node.params.get("out_features", 128))
    return last_out


def _get_layer_summary(graph: GraphSchema) -> list[dict]:
    """Build a human-readable layer summary for docs."""
    topo = topological_sort(graph)
    nodes_by_id = {n.id: n for n in graph.nodes}
    layers = []
    for nid in topo:
        node = nodes_by_id[nid]
        if node.type in ("input", "output", "text_input", "augment"):
            continue
        info = {"type": node.type, "params": {}}
        for k, v in node.params.items():
            if k not in ("id", "label", "position"):
                info["params"][k] = v
        layers.append(info)
    return layers


def _build_model_from_graph(graph: GraphSchema, state_dict_b64: str | None = None) -> nn.Module:
    """Build a DynamicModel from graph and optionally load weights."""
    normalized = normalize_graph(graph)
    shapes = infer_shapes(normalized)
    model = DynamicModel(normalized, shapes)
    model.eval()

    if state_dict_b64:
        import io as _io
        raw = base64.b64decode(state_dict_b64)
        buf = _io.BytesIO(raw)
        state_dict = torch.load(buf, map_location="cpu", weights_only=True)
        model.load_state_dict(state_dict, strict=True)
        model.eval()

    return model


def _validate_api_key(deployment_id: str, provided_key: str) -> bool:
    """Check API key against cached metadata, then DB."""
    meta = _deployment_meta.get(deployment_id)
    if meta and meta.get("api_key") == provided_key:
        return True
    # Fallback: check DB
    try:
        supabase = get_supabase_client()
        resp = (
            supabase.table("deployments")
            .select("api_key")
            .eq("id", deployment_id)
            .single()
            .execute()
        )
        if resp.data and resp.data.get("api_key") == provided_key:
            # Update cache
            if deployment_id in _deployment_meta:
                _deployment_meta[deployment_id]["api_key"] = provided_key
            return True
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# Startup: load all active deployments into memory
# ---------------------------------------------------------------------------

async def load_all_deployments():
    """Load all active deployments from DB into memory on server startup."""
    try:
        supabase = get_supabase_client()
        resp = (
            supabase.table("deployments")
            .select("*")
            .eq("status", "active")
            .execute()
        )
        deployments = resp.data or []
        loaded = 0
        for dep in deployments:
            try:
                graph_data = dep.get("graph_json")
                if not graph_data:
                    continue
                graph = GraphSchema(**graph_data) if isinstance(graph_data, dict) else graph_data
                if isinstance(graph, dict):
                    graph = GraphSchema(**graph)

                model = _build_model_from_graph(
                    graph,
                    state_dict_b64=dep.get("model_state_dict_b64"),
                )
                _model_cache[dep["id"]] = model
                _deployment_meta[dep["id"]] = {
                    "name": dep.get("name", ""),
                    "api_key": dep.get("api_key", ""),
                    "input_shape": dep.get("input_shape"),
                    "num_classes": dep.get("num_classes"),
                    "status": dep.get("status", "active"),
                    "user_id": dep.get("user_id"),
                    "playground_id": dep.get("playground_id"),
                    "created_at": dep.get("created_at"),
                }
                loaded += 1
            except Exception as e:
                logger.warning(f"Failed to load deployment {dep.get('id')}: {e}")
                # Mark as error
                try:
                    supabase.table("deployments").update(
                        {"status": "error"}
                    ).eq("id", dep["id"]).execute()
                except Exception:
                    pass

        logger.info(f"Loaded {loaded}/{len(deployments)} active deployments into memory")
    except Exception as e:
        logger.warning(f"Failed to load deployments on startup: {e}")


# ---------------------------------------------------------------------------
# CRUD Endpoints
# ---------------------------------------------------------------------------

@router.post("/api/deploy")
async def create_deployment(request: DeployRequest):
    """Create a new model deployment from a playground graph."""
    try:
        graph = request.graph

        # Normalize and validate
        normalized = normalize_graph(graph)
        shapes = infer_shapes(normalized)
        input_shape = _get_input_shape(normalized)
        num_classes = _get_num_classes(normalized)

        # Try to get trained weights
        state_dict_b64 = None
        model_id_used = request.model_id

        if request.model_id:
            try:
                state_dict_b64 = get_model_state_dict(request.model_id)
            except Exception as e:
                logger.warning(f"Could not load weights for model {request.model_id}: {e}")

        if not state_dict_b64 and request.playground_id:
            try:
                models = list_playground_models(request.playground_id)
                if models:
                    model_id_used = models[0]["id"]
                    state_dict_b64 = get_model_state_dict(model_id_used)
            except Exception as e:
                logger.warning(f"Could not load playground models: {e}")

        # Build and validate model
        model = _build_model_from_graph(normalized, state_dict_b64)

        # Generate API key
        api_key = _generate_api_key()
        deploy_name = request.name or f"deployment-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}"

        # Save to database
        supabase = get_supabase_client()
        row = {
            "user_id": request.user_id or "anonymous",
            "playground_id": request.playground_id,
            "model_id": str(model_id_used) if model_id_used else None,
            "name": deploy_name,
            "api_key": api_key,
            "status": "active",
            "graph_json": graph.dict(),
            "model_state_dict_b64": state_dict_b64,
            "input_shape": input_shape,
            "num_classes": num_classes,
            "config": {
                "has_trained_weights": state_dict_b64 is not None,
                "layer_count": len([n for n in graph.nodes if n.type not in ("input", "output", "text_input")]),
            },
        }

        resp = supabase.table("deployments").insert(row).execute()
        if not resp.data:
            raise HTTPException(status_code=500, detail="Failed to save deployment")

        dep_id = resp.data[0]["id"]

        # Cache model in memory
        _model_cache[dep_id] = model
        _deployment_meta[dep_id] = {
            "name": deploy_name,
            "api_key": api_key,
            "input_shape": input_shape,
            "num_classes": num_classes,
            "status": "active",
            "user_id": request.user_id,
            "playground_id": request.playground_id,
            "created_at": resp.data[0].get("created_at"),
        }

        # Save code files to disk for download
        _save_deployment_code(dep_id, normalized, shapes, input_shape, num_classes, deploy_name)

        logger.info(f"Deployment created: {dep_id} ({deploy_name})")

        return {
            "id": dep_id,
            "name": deploy_name,
            "api_key": api_key,
            "status": "active",
            "endpoint": f"/deploy/api/{dep_id}/predict",
            "docs_endpoint": f"/deploy/api/{dep_id}/docs",
            "input_shape": input_shape,
            "num_classes": num_classes,
            "has_trained_weights": state_dict_b64 is not None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to create deployment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deploy")
async def list_deployments(user_id: str | None = None):
    """List all deployments (optionally filtered by user)."""
    try:
        supabase = get_supabase_client()
        query = supabase.table("deployments").select(
            "id, user_id, playground_id, name, status, input_shape, num_classes, config, created_at, updated_at"
        ).order("created_at", desc=True)

        if user_id:
            query = query.eq("user_id", user_id)

        resp = query.execute()
        deployments = resp.data or []

        # Add endpoint URLs
        for dep in deployments:
            dep["endpoint"] = f"/deploy/api/{dep['id']}/predict"
            dep["docs_endpoint"] = f"/deploy/api/{dep['id']}/docs"
            dep["is_loaded"] = dep["id"] in _model_cache

        return {"deployments": deployments}

    except Exception as e:
        logger.exception(f"Failed to list deployments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deploy/{deployment_id}")
async def get_deployment(deployment_id: str):
    """Get deployment details."""
    try:
        supabase = get_supabase_client()
        resp = (
            supabase.table("deployments")
            .select("id, user_id, playground_id, name, api_key, status, input_shape, num_classes, config, created_at, updated_at")
            .eq("id", deployment_id)
            .single()
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Deployment not found")

        dep = resp.data
        dep["endpoint"] = f"/deploy/api/{dep['id']}/predict"
        dep["docs_endpoint"] = f"/deploy/api/{dep['id']}/docs"
        dep["is_loaded"] = dep["id"] in _model_cache
        return dep

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to get deployment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/deploy/{deployment_id}")
async def delete_deployment(deployment_id: str):
    """Delete a deployment: remove from DB, memory, and disk."""
    try:
        # Remove from memory
        _model_cache.pop(deployment_id, None)
        _deployment_meta.pop(deployment_id, None)

        # Remove files from disk
        dep_dir = DEPLOYMENTS_DIR / deployment_id
        if dep_dir.exists():
            shutil.rmtree(dep_dir)

        # Remove from DB
        supabase = get_supabase_client()
        supabase.table("deployments").delete().eq("id", deployment_id).execute()

        logger.info(f"Deployment deleted: {deployment_id}")
        return {"status": "deleted", "id": deployment_id}

    except Exception as e:
        logger.exception(f"Failed to delete deployment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/api/deploy/{deployment_id}/key")
async def regenerate_api_key(deployment_id: str):
    """Regenerate the API key for a deployment."""
    try:
        new_key = _generate_api_key()

        supabase = get_supabase_client()
        resp = (
            supabase.table("deployments")
            .update({"api_key": new_key, "updated_at": datetime.utcnow().isoformat()})
            .eq("id", deployment_id)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Deployment not found")

        # Update cache
        if deployment_id in _deployment_meta:
            _deployment_meta[deployment_id]["api_key"] = new_key

        return {"api_key": new_key}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Failed to regenerate API key: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/deploy/{deployment_id}/download")
async def download_deployment(deployment_id: str):
    """Download deployment code as ZIP."""
    dep_dir = DEPLOYMENTS_DIR / deployment_id
    if not dep_dir.exists():
        raise HTTPException(status_code=404, detail="Deployment code not found")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fpath in sorted(dep_dir.rglob("*")):
            if fpath.is_file():
                arcname = fpath.relative_to(dep_dir)
                zf.write(fpath, arcname)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=deployment-{deployment_id[:8]}.zip"},
    )


# ---------------------------------------------------------------------------
# Live Inference and Training Endpoints (API key protected)
# ---------------------------------------------------------------------------

def _parse_input_to_tensor(
    request_input: Any, 
    image_base64: str | None, 
    expected_shape: list[int]
) -> torch.Tensor:
    """Safely convert request payload into a properly shaped Tensor."""
    # Handle Image Base64
    if image_base64:
        try:
            # Strip standard data URL prefix if present
            if "," in image_base64:
                image_base64 = image_base64.split(",")[1]
            image_bytes = base64.b64decode(image_base64)
            img = Image.open(io.BytesIO(image_bytes))
            
            if len(expected_shape) == 3:  # [C, H, W]
                c, h, w = expected_shape
                # Convert
                if c == 1:
                    img = img.convert("L")
                elif c == 3:
                    img = img.convert("RGB")
                    
                # Resize
                img = img.resize((w, h))
                
                import torchvision.transforms.functional as TF
                tensor = TF.to_tensor(img)
                return tensor
            else:
                raise HTTPException(status_code=400, detail="image_base64 provided but model does not expect an image shape.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to process image_base64: {e}")

    # Handle raw array input
    if not request_input:
        raise HTTPException(status_code=400, detail="Must provide either 'input' array or 'image_base64' string.")

    tensor = torch.tensor(request_input, dtype=torch.float32)

    # Dimensionality validation and fixing
    # If the user passed [C, H, W] but model expects [C, H, W], it's ok.
    # If the user passed flat array [C*H*W] but model expects [C, H, W], reshape it
    
    expected_dims = len(expected_shape)
    expected_elements = 1
    for dim in expected_shape: expected_elements *= dim

    # Check for totally mismatched element count
    # e.g., if expected is 784, passing 5 total elements is bad. Passing 6272 is fine (8 batches of 784)
    if tensor.numel() % expected_elements != 0:
        provided = tensor.numel() if tensor.numel() < expected_elements else (tensor.numel() / (tensor.shape[0] if tensor.dim() > 0 else 1))
        raise HTTPException(
            status_code=400, 
            detail=f"Shape mismatch: The model expects {expected_elements} values (shape {expected_shape}), but received {tensor.numel()} total values which is not perfectly divisible."
        )
    
    batch_size = tensor.numel() // expected_elements

    # Reshape uniformly to [B, *expected_shape]
    try:
        tensor = tensor.view(batch_size, *expected_shape)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to automatically reshape tensor: {e}")

    # If it's a single batch, we can return either [B, ...] or just [...]
    # Predict endpoint `input_tensor.unsqueeze(0)` logic expects the base shape if unbatched
    if batch_size == 1 and request_input and isinstance(request_input, list) and not isinstance(request_input[0], list) and expected_dims > 1:
        # User passed a flat single list, return unbatched
        return tensor.squeeze(0)

    if batch_size == 1 and tensor.dim() > expected_dims:
         # Return unbatched if user just wanted 1 item unless they explicitly asked for batch
         # Actually just let the view([1, *shape]) persist, it's fine.
         pass
         
    return tensor

@router.post("/deploy/api/{deployment_id}/predict")
async def predict(
    deployment_id: str,
    request: PredictRequest,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    api_key: str | None = Query(None),
):
    """Run inference on a deployed model.

    Requires a valid API key via X-API-Key header or api_key query param.
    """
    # Authenticate
    key = x_api_key or api_key
    if not key:
        raise HTTPException(
            status_code=401,
            detail="API key required. Pass via X-API-Key header or api_key query parameter.",
        )

    if not _validate_api_key(deployment_id, key):
        raise HTTPException(status_code=403, detail="Invalid API key")

    # Get model
    model = _model_cache.get(deployment_id)
    if model is None:
        # Try lazy-loading
        try:
            supabase = get_supabase_client()
            resp = (
                supabase.table("deployments")
                .select("*")
                .eq("id", deployment_id)
                .eq("status", "active")
                .single()
                .execute()
            )
            if not resp.data:
                raise HTTPException(status_code=404, detail="Deployment not found or not active")

            dep = resp.data
            graph = GraphSchema(**dep["graph_json"])
            model = _build_model_from_graph(graph, dep.get("model_state_dict_b64"))
            _model_cache[deployment_id] = model
            _deployment_meta[deployment_id] = {
                "name": dep.get("name", ""),
                "api_key": dep.get("api_key", ""),
                "input_shape": dep.get("input_shape"),
                "num_classes": dep.get("num_classes"),
                "status": "active",
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load model: {e}")

    # Run inference
    start_time = time.time()
    try:
        meta = _deployment_meta.get(deployment_id, {})
        expected_shape = meta.get("input_shape", [])
        
        input_tensor = _parse_input_to_tensor(request.input, request.image_base64, expected_shape)

        # Auto-add batch dim if needed
        if input_tensor.dim() == len(expected_shape):
            input_tensor = input_tensor.unsqueeze(0)

        model.eval()
        with torch.no_grad():
            output = model(input_tensor)

        latency_ms = round((time.time() - start_time) * 1000, 2)

        # Format response
        output_np = output.cpu()
        probabilities = torch.softmax(output_np, dim=-1) if output_np.shape[-1] > 1 else output_np
        predicted_class = torch.argmax(probabilities, dim=-1).item()
        confidence = round(probabilities[0, predicted_class].item() * 100, 2)

        return {
            "prediction": [round(p, 6) for p in probabilities[0].tolist()],
            "predicted_class": predicted_class,
            "confidence": confidence,
            "output_shape": list(output.shape),
            "latency_ms": latency_ms,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Inference failed for deployment {deployment_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Inference error: {e}")


@router.post("/deploy/api/{deployment_id}/train")
async def train_model(
    deployment_id: str,
    request: TrainRequest,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    api_key: str | None = Query(None),
):
    """Run a single training step (finetuning) on the deployed model."""
    key = x_api_key or api_key
    if not key:
        raise HTTPException(status_code=401, detail="API key required")
    if not _validate_api_key(deployment_id, key):
        raise HTTPException(status_code=403, detail="Invalid API key")

    # Load model using prediction's lazy-load pattern
    model = _model_cache.get(deployment_id)
    if model is None:
        try:
            supabase = get_supabase_client()
            resp = supabase.table("deployments").select("*").eq("id", deployment_id).eq("status", "active").single().execute()
            if not resp.data:
                raise HTTPException(status_code=404, detail="Deployment not found or not active")
            dep = resp.data
            graph = GraphSchema(**dep["graph_json"])
            model = _build_model_from_graph(graph, dep.get("model_state_dict_b64"))
            _model_cache[deployment_id] = model
            _deployment_meta[deployment_id] = {
                "name": dep.get("name", ""),
                "api_key": dep.get("api_key", ""),
                "input_shape": dep.get("input_shape"),
                "num_classes": dep.get("num_classes"),
                "status": "active",
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load model: {e}")

    meta = _deployment_meta.get(deployment_id, {})
    expected_shape = meta.get("input_shape", [])

    try:
        # 1. Prepare Input
        input_tensor = _parse_input_to_tensor(request.input, request.image_base64, expected_shape)
        if input_tensor.dim() == len(expected_shape):
            input_tensor = input_tensor.unsqueeze(0)  # batch dim

        # 2. Prepare Target
        target_val = request.target
        # target could be list or scalar
        if not isinstance(target_val, list):
            target_val = [target_val]
            
        num_classes = meta.get("num_classes", 2)
        if num_classes > 1:
            # Classification
            target_tensor = torch.tensor(target_val, dtype=torch.long)
            criterion = nn.CrossEntropyLoss()
        else:
            # Regression
            target_tensor = torch.tensor(target_val, dtype=torch.float32).view(-1, 1)
            criterion = nn.MSELoss()

        # Check target length matches batch size
        if target_tensor.shape[0] != input_tensor.shape[0]:
            # simple broadcast if target is length 1
            if target_tensor.shape[0] == 1:
                target_tensor = target_tensor.expand(input_tensor.shape[0])
            else:
                raise HTTPException(status_code=400, detail=f"Target batch size ({target_tensor.shape[0]}) does not match input batch size ({input_tensor.shape[0]}).")

        # 3. Optimize Backwards
        model.train()
        # Initialize an optimizer if we haven't
        # Usually we'd persist the optimizer state, but for a simple stateless API fine-tuning step:
        optimizer = torch.optim.Adam(model.parameters(), lr=0.001)
        optimizer.zero_grad()
        
        output = model(input_tensor)
        loss = criterion(output, target_tensor)
        loss.backward()
        optimizer.step()
        
        loss_val = loss.item()
        
        # Switch back to eval
        model.eval()

        # 4. Save updated weights to database
        # Export state dict
        buf = io.BytesIO()
        torch.save(model.state_dict(), buf)
        buf.seek(0)
        state_dict_b64 = base64.b64encode(buf.read()).decode("utf-8")

        supabase = get_supabase_client()
        supabase.table("deployments").update({
            "model_state_dict_b64": state_dict_b64,
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", deployment_id).execute()

        return {
            "status": "success",
            "loss": round(loss_val, 6),
            "weights_updated": True
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Training step failed: {e}")
        raise HTTPException(status_code=500, detail=f"Training error: {e}")


@router.get("/deploy/api/{deployment_id}/health")
async def deployment_health(deployment_id: str):
    """Health check for a deployment (public, no API key needed)."""
    is_loaded = deployment_id in _model_cache
    meta = _deployment_meta.get(deployment_id, {})

    if not is_loaded and not meta:
        raise HTTPException(status_code=404, detail="Deployment not found")

    return {
        "status": "healthy" if is_loaded else "not_loaded",
        "deployment_id": deployment_id,
        "name": meta.get("name", ""),
        "input_shape": meta.get("input_shape"),
        "num_classes": meta.get("num_classes"),
    }


# ---------------------------------------------------------------------------
# Dynamic API Documentation (model-specific)
# ---------------------------------------------------------------------------

@router.get("/deploy/api/{deployment_id}/docs", response_class=HTMLResponse)
async def deployment_docs(deployment_id: str, req: Request):
    """Serve dynamic, model-specific API documentation as HTML."""
    meta = _deployment_meta.get(deployment_id)
    if not meta:
        # Try loading from DB
        try:
            supabase = get_supabase_client()
            resp = (
                supabase.table("deployments")
                .select("*")
                .eq("id", deployment_id)
                .single()
                .execute()
            )
            if not resp.data:
                raise HTTPException(status_code=404, detail="Deployment not found")
            dep = resp.data
            meta = {
                "name": dep.get("name", ""),
                "input_shape": dep.get("input_shape"),
                "num_classes": dep.get("num_classes"),
                "status": dep.get("status", "unknown"),
                "created_at": dep.get("created_at"),
                "api_key": dep.get("api_key", ""),
            }
            # Also get graph for layer info
            graph_json = dep.get("graph_json")
            if graph_json:
                graph = GraphSchema(**graph_json) if isinstance(graph_json, dict) else graph_json
                if isinstance(graph, dict):
                    graph = GraphSchema(**graph)
                layer_summary = _get_layer_summary(graph)
            else:
                layer_summary = []
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        layer_summary = []
        # Try to get layer summary from graph in DB
        try:
            supabase = get_supabase_client()
            resp = (
                supabase.table("deployments")
                .select("graph_json")
                .eq("id", deployment_id)
                .single()
                .execute()
            )
            if resp.data and resp.data.get("graph_json"):
                graph = GraphSchema(**resp.data["graph_json"])
                layer_summary = _get_layer_summary(graph)
        except Exception:
            pass

    name = meta.get("name", "Untitled")
    input_shape = meta.get("input_shape", [1, 28, 28])
    num_classes = meta.get("num_classes", 10)
    status = meta.get("status", "active")
    created = meta.get("created_at", "")

    # Build base URL from request
    base_url = str(req.base_url).rstrip("/")
    predict_url = f"{base_url}/deploy/api/{deployment_id}/predict"
    train_url = f"{base_url}/deploy/api/{deployment_id}/train"
    health_url = f"{base_url}/deploy/api/{deployment_id}/health"

    # Determine input type description
    if len(input_shape) == 3:
        c, h, w = input_shape
        input_desc = f"Image tensor — {c} channel(s), {h}x{w} pixels"
        input_example_flat = f"[{', '.join(['0.5'] * min(c * h * w, 10))}{'...' if c * h * w > 10 else ''}]"
        total_features = c * h * w
        shape_desc = f"[{c}, {h}, {w}] (channels, height, width)"
        # Build a realistic example
        example_input = [[0.0] * w for _ in range(h)] if c == 1 else [[[0.0] * w for _ in range(h)] for _ in range(c)]
        example_json = json.dumps({"input": example_input}, indent=2)[:500]
    elif len(input_shape) == 1:
        total_features = input_shape[0]
        input_desc = f"Feature vector — {total_features} features"
        shape_desc = f"[{total_features}] (features)"
        example_json = json.dumps({"input": [[0.0] * min(total_features, 8) + ([0.0] if total_features > 8 else [])]}, indent=2)
    else:
        total_features = 1
        for d in input_shape:
            total_features *= d
        input_desc = f"Tensor with shape {input_shape}"
        shape_desc = str(input_shape)
        example_json = json.dumps({"input": [[0.0] * min(total_features, 10)]}, indent=2)

    # Layer table HTML
    layer_rows = ""
    for i, layer in enumerate(layer_summary, 1):
        params_str = ", ".join(f"{k}={v}" for k, v in layer["params"].items()) if layer["params"] else "—"
        layer_rows += f"<tr><td>{i}</td><td><code>{layer['type']}</code></td><td>{params_str}</td></tr>\n"

    if not layer_rows:
        layer_table = "<p style='color:#888;'>Layer details not available.</p>"
    else:
        layer_table = f"""<table>
<thead><tr><th>#</th><th>Layer</th><th>Parameters</th></tr></thead>
<tbody>{layer_rows}</tbody>
</table>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{name} — API Docs | JulyAI</title>
<style>
  :root {{
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a26;
    --border: #2a2a3a;
    --text: #e4e4ef;
    --muted: #8888a0;
    --accent: #6366f1;
    --accent2: #818cf8;
    --green: #10b981;
    --red: #ef4444;
    --orange: #f59e0b;
    --code-bg: #1e1e2e;
  }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
  }}
  .container {{ max-width: 900px; margin: 0 auto; padding: 40px 24px; }}
  .header {{
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
  }}
  .header .badge {{
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
  }}
  .badge.active {{ background: rgba(16,185,129,0.15); color: var(--green); }}
  .badge.stopped {{ background: rgba(239,68,68,0.15); color: var(--red); }}
  .badge.error {{ background: rgba(245,158,11,0.15); color: var(--orange); }}
  h1 {{ font-size: 28px; font-weight: 700; }}
  h2 {{ font-size: 20px; font-weight: 600; margin: 32px 0 16px; color: var(--accent2); }}
  h3 {{ font-size: 16px; font-weight: 600; margin: 24px 0 12px; }}
  .subtitle {{ color: var(--muted); font-size: 14px; margin-top: 4px; }}
  .card {{
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin: 16px 0;
  }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }}
  .stat {{ padding: 16px; background: var(--surface2); border-radius: 8px; }}
  .stat .label {{ font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }}
  .stat .value {{ font-size: 18px; font-weight: 700; margin-top: 4px; }}
  pre {{
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    font-size: 13px;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    line-height: 1.5;
    margin: 12px 0;
  }}
  code {{ font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; }}
  .inline-code {{
    background: var(--surface2);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 12px;
  }}
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 14px;
  }}
  th, td {{
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid var(--border);
  }}
  th {{ color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }}
  .method {{
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
  }}
  .method.post {{ background: rgba(16,185,129,0.15); color: var(--green); }}
  .method.get {{ background: rgba(99,102,241,0.15); color: var(--accent); }}
  .copy-btn {{
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }}
  .copy-btn:hover {{ color: var(--text); border-color: var(--accent); }}
  .endpoint-box {{
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: monospace;
    font-size: 14px;
    margin: 8px 0;
  }}
  .footer {{ margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); text-align: center; color: var(--muted); font-size: 13px; }}
  a {{ color: var(--accent2); text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
<div class="container">

<div class="header">
  <div>
    <h1>{name}</h1>
    <p class="subtitle">Model API deployed via JulyAI</p>
  </div>
  <span class="badge {status}">{status.upper()}</span>
</div>

<div class="grid">
  <div class="stat">
    <div class="label">Input Shape</div>
    <div class="value">{shape_desc}</div>
  </div>
  <div class="stat">
    <div class="label">Output Classes</div>
    <div class="value">{num_classes}</div>
  </div>
  <div class="stat">
    <div class="label">Input Type</div>
    <div class="value" style="font-size:14px">{input_desc}</div>
  </div>
  <div class="stat">
    <div class="label">Status</div>
    <div class="value" style="color: var(--green)">{status}</div>
  </div>
</div>

<h2>Endpoints</h2>

<table>
  <thead><tr><th>Method</th><th>Path</th><th>Auth</th><th>Description</th></tr></thead>
  <tbody>
    <tr>
      <td><span class="method post">POST</span></td>
      <td><code>/deploy/api/{deployment_id}/predict</code></td>
      <td>API Key</td>
      <td>Run inference</td>
    </tr>
    <tr>
      <td><span class="method post">POST</span></td>
      <td><code>/deploy/api/{deployment_id}/train</code></td>
      <td>API Key</td>
      <td>Live fine-tuning (backprop validation)</td>
    </tr>
    <tr>
      <td><span class="method get">GET</span></td>
      <td><code>/deploy/api/{deployment_id}/health</code></td>
      <td>Public</td>
      <td>Health check</td>
    </tr>
    <tr>
      <td><span class="method get">GET</span></td>
      <td><code>/deploy/api/{deployment_id}/docs</code></td>
      <td>Public</td>
      <td>This documentation</td>
    </tr>
  </tbody>
</table>

<h2>Authentication</h2>

<p>All prediction requests require an API key. Pass it via:</p>

<div class="card">
  <h3>Option 1: HTTP Header (recommended)</h3>
  <pre>X-API-Key: your_api_key_here</pre>

  <h3>Option 2: Query Parameter</h3>
  <pre>POST {predict_url}?api_key=your_api_key_here</pre>
</div>

<h2>Prediction Request</h2>

<h3>Request Format</h3>
<p>Send a JSON body with either an <code class="inline-code">input</code> field containing your tensor data matching shape <code class="inline-code">{shape_desc}</code> OR an <code class="inline-code">image_base64</code> field with a base64 encoded image.</p>

<pre>{example_json}</pre>

<h3>cURL Example (Raw Array)</h3>
<pre>curl -X POST {predict_url} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{{"input": {json.dumps([[0.0] * min(total_features, 5)])}}}'</pre>

<h3>cURL Example (Base64 Image)</h3>
<pre>curl -X POST {predict_url} \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{{"image_base64": "iVBORw0KGgoAAAANSUhEUgAA..."}}'</pre>

<h3>Python Example</h3>
<pre>import requests

url = "{predict_url}"
headers = {{
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_API_KEY",
}}

# Prepare input matching shape {shape_desc}
import numpy as np
data = np.random.randn(*{input_shape}).tolist()

response = requests.post(url, json={{"input": data}}, headers=headers)
result = response.json()

print(f"Predicted class: {{result['predicted_class']}}")
print(f"Confidence: {{result['confidence']}}%")
print(f"Latency: {{result['latency_ms']}}ms")</pre>

<h3>JavaScript Example</h3>
<pre>const response = await fetch("{predict_url}", {{
  method: "POST",
  headers: {{
    "Content-Type": "application/json",
    "X-API-Key": "YOUR_API_KEY",
  }},
  body: JSON.stringify({{
    input: Array.from({{ length: {total_features} }}, () => Math.random()),
  }}),
}});

const result = await response.json();
console.log(`Predicted: ${{result.predicted_class}} (${{result.confidence}}%)`);
</pre>

<h2>Response Format</h2>
<pre>{{
  "prediction": [0.02, 0.95, 0.01, ...],   // Probabilities for each class
  "predicted_class": 1,                      // Argmax class index
  "confidence": 95.23,                       // Confidence percentage
  "output_shape": [1, {num_classes}],        // Output tensor shape
  "latency_ms": 12.5                         // Inference time in ms
}}</pre>

<h2>Training Request (Live Fine-Tuning)</h2>
<p>You can fine-tune your deployed model dynamically via the API. Send a single batch of inputs and targets.</p>

<h3>Request Format</h3>
<pre>{{
  "input": [[0.0...]],       // OR "image_base64": "..."
  "target": 1                // The correct label or expected value
}}</pre>

<h3>Python Example</h3>
<pre>response = requests.post("{train_url}", json={{
  "input": data,
  "target": [1] # Expected class
}}, headers=headers)
print(response.json()) # {{"status": "success", "loss": 0.45, "weights_updated": true}}</pre>

<h2>Model Architecture</h2>
{layer_table}

<div class="footer">
  <p>Powered by <a href="https://julyai.currycoders.link">JulyAI</a> &middot; Deployment ID: <code class="inline-code">{deployment_id}</code></p>
  <p style="margin-top:4px">Created: {created}</p>
</div>

</div>

<script>
function copyText(text) {{
  navigator.clipboard.writeText(text).then(() => {{
    // Brief visual feedback could go here
  }});
}}
</script>
</body>
</html>"""

    return HTMLResponse(content=html)


# ---------------------------------------------------------------------------
# Save deployment code to disk (for download)
# ---------------------------------------------------------------------------

def _save_deployment_code(
    deployment_id: str,
    graph: GraphSchema,
    shapes: dict,
    input_shape: list[int],
    num_classes: int,
    name: str,
):
    """Save generated model code to deployments/<id>/ directory."""
    dep_dir = DEPLOYMENTS_DIR / deployment_id
    dep_dir.mkdir(parents=True, exist_ok=True)

    # Reuse export code generation
    from routers.export import (
        _generate_model_code,
        _generate_predict_code,
        _generate_train_code,
        _generate_requirements,
    )

    # Save model.py
    (dep_dir / "model.py").write_text(_generate_model_code(graph, shapes))

    # Save predict.py
    (dep_dir / "predict.py").write_text(_generate_predict_code(input_shape, num_classes))

    # Save train.py
    (dep_dir / "train.py").write_text(_generate_train_code(input_shape, num_classes))

    # Save requirements.txt
    (dep_dir / "requirements.txt").write_text(_generate_requirements())

    # Save config
    config = {
        "deployment_id": deployment_id,
        "name": name,
        "input_shape": input_shape,
        "num_classes": num_classes,
        "created_at": datetime.utcnow().isoformat(),
    }
    (dep_dir / "config.json").write_text(json.dumps(config, indent=2))

    logger.info(f"Saved deployment code to {dep_dir}")
