"""Local inference function for trained models."""

import torch
import base64
import io
import time
import logging
from typing import Any
from compiler.model_builder import build_model
from models.schemas import GraphSchema, InferenceResponse

logger = logging.getLogger(__name__)


async def run_inference_local(
    model_state_dict_b64: str,
    graph_json: dict[str, Any],
    input_tensor: list[list[float]],
) -> InferenceResponse:
    """Run inference on a trained model locally.

    Args:
        model_state_dict_b64: Base64-encoded model state dict
        graph_json: Graph schema as dictionary
        input_tensor: Input tensor as 2D list [batch_size, features...]

    Returns:
        InferenceResponse with model output
    """
    try:
        start_time = time.time()

        # Decode model state dict and validate before torch.load (avoids opaque EOFError)
        logger.info("Decoding model state dict...")
        if not (model_state_dict_b64 and isinstance(model_state_dict_b64, str)):
            raise ValueError(
                "Model state dict is missing or empty. "
                "The saved model file may not have been uploaded. Re-train and save the model again."
            )
        try:
            model_bytes = base64.b64decode(model_state_dict_b64, validate=True)
        except Exception as e:
            raise ValueError("Model state dict is not valid base64") from e
        if len(model_bytes) < 100:
            raise ValueError(
                f"Model state dict is too small ({len(model_bytes)} bytes). "
                "The stored model may be truncated. Try re-training and saving the model."
            )
        try:
            state_dict = torch.load(io.BytesIO(model_bytes), map_location="cpu", weights_only=True)
        except EOFError as e:
            # Truncated/corrupt pickle from storage; surface a clear message instead of raw EOFError
            raise ValueError(
                "Model file is truncated or corrupted (invalid pickle). "
                "Re-train the model and save it again, or choose a different model."
            ) from e

        # Rebuild model from graph
        logger.info("Rebuilding model from graph...")
        if isinstance(graph_json, dict):
            graph_json = GraphSchema(**graph_json)
        model = build_model(graph_json)
        model.load_state_dict(state_dict)
        model.eval()

        # Move to device
        if torch.cuda.is_available():
            device = torch.device("cuda")
        elif torch.backends.mps.is_available():
            device = torch.device("mps")
        else:
            device = torch.device("cpu")
            
        logger.info(f"Using device: {device}")
        model = model.to(device)


        # Convert input to tensor and move to device
        input_tensor_torch = torch.tensor(input_tensor, dtype=torch.float32, device=device)

        # Handle automatic reshaping for CNNs (2D -> 4D)
        # If input is [batch, features] but model needs [batch, C, H, W]
        if input_tensor_torch.dim() == 2:
            batch_size = input_tensor_torch.shape[0]
            # Get expected input shape from graph metadata
            input_nodes = [n for n in (graph_json.nodes if hasattr(graph_json, 'nodes') else []) if n.type == "input"]
            if input_nodes:
                expected_shape = input_nodes[0].params.get("shape") or input_nodes[0].params.get("input_shape")
                if expected_shape:
                    if isinstance(expected_shape, str):
                        try:
                            expected_shape = [int(x) for x in expected_shape.split(',')]
                        except:
                            expected_shape = None
                    
                    if isinstance(expected_shape, (list, tuple)) and len(expected_shape) == 3:
                        # Check if product matches
                        total_features = input_tensor_torch.shape[1]
                        import math
                        if math.prod(expected_shape) == total_features:
                            logger.info(f"Reshaping input from {list(input_tensor_torch.shape)} to {[batch_size] + list(expected_shape)}")
                            input_tensor_torch = input_tensor_torch.reshape(batch_size, *expected_shape)
                        else:
                            logger.warning(f"Input feature count ({total_features}) doesn't match expected product ({math.prod(expected_shape)})")


        # Run inference
        logger.info(f"Running inference with input shape {input_tensor_torch.shape}...")
        with torch.no_grad():
            output = model(input_tensor_torch)

        # Ensure 2D for API contract [batch_size, num_classes]
        if output.dim() == 1:
            output = output.unsqueeze(0)
        output_np = output.cpu().numpy().tolist()

        inference_time_ms = (time.time() - start_time) * 1000

        logger.info(f"Inference completed in {inference_time_ms:.2f}ms, output shape: {output.shape}")

        return InferenceResponse(
            output=output_np,
            shape=list(output.shape),
            inference_time_ms=inference_time_ms,
        )

    except Exception as e:
        logger.exception(f"Local inference failed: {e}")
        raise
