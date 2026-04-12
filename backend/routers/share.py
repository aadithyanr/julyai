"""Share router — create and resolve shareable playground links."""

import secrets
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/share", tags=["share"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CreateShareRequest(BaseModel):
    playground_id: str
    user_id: str
    name: str | None = None


class CreateShareResponse(BaseModel):
    token: str
    share_url: str


class SharedPlaygroundResponse(BaseModel):
    playground_id: str
    name: str
    graph_json: dict
    created_at: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_token(length: int = 16) -> str:
    return secrets.token_urlsafe(length)


def _first(res: Any) -> dict | None:
    """Safely return the first row from a supabase query result."""
    try:
        if res is None:
            return None
        data = res.data
        if not data:
            return None
        if isinstance(data, list):
            return data[0] if data else None
        if isinstance(data, dict):
            return data
        return None
    except Exception:
        return None


def _as_dict(value: Any) -> dict | None:
    """Coerce a value to a dict, returning None if it can't be done."""
    if isinstance(value, dict):
        return value if value else None  # treat {} as None so we fall through
    if isinstance(value, str):
        import json
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None
    return None


# ---------------------------------------------------------------------------
# POST /api/share/create  — idempotent: same playground always gets same token
# ---------------------------------------------------------------------------

@router.post("/create", response_model=CreateShareResponse)
async def create_share(req: CreateShareRequest):
    supabase = get_supabase_client()

    # 1. Validate playground belongs to this user
    pg_res = (
        supabase.table("playgrounds")
        .select("id, name, graph_json")
        .eq("id", req.playground_id)
        .eq("user_id", req.user_id)
        .limit(1)
        .execute()
    )
    playground = _first(pg_res)
    if not playground:
        raise HTTPException(status_code=404, detail="Playground not found or access denied")

    # 2. Return existing token if already shared — also refresh the snapshot
    existing_res = (
        supabase.table("shared_playgrounds")
        .select("token")
        .eq("playground_id", req.playground_id)
        .limit(1)
        .execute()
    )
    existing = _first(existing_res)
    if existing:
        token     = existing["token"]
        graph     = _as_dict(playground.get("graph_json")) or {}
        live_name = playground.get("name") or req.name or "Untitled"
        # Refresh snapshot so shared view always has the latest graph
        supabase.table("shared_playgrounds").update({
            "name":       live_name,
            "graph_json": graph,
        }).eq("token", token).execute()
        logger.info("Refreshed+returning share token=%s playground=%s", token, req.playground_id)
        return CreateShareResponse(token=token, share_url=f"/shared/{token}")

    # 3. Create new token and persist
    token = _generate_token()
    graph = _as_dict(playground.get("graph_json")) or {}
    name  = playground.get("name") or req.name or "Untitled"

    insert_res = (
        supabase.table("shared_playgrounds")
        .insert({
            "token":         token,
            "playground_id": req.playground_id,
            "user_id":       req.user_id,
            "name":          name,
            "graph_json":    graph,
            "created_at":    datetime.now(timezone.utc).isoformat(),
        })
        .execute()
    )

    if not _first(insert_res):
        logger.error("Insert failed for playground_id=%s", req.playground_id)
        raise HTTPException(status_code=500, detail="Failed to create share link")

    logger.info("Created share token=%s playground=%s", token, req.playground_id)
    return CreateShareResponse(token=token, share_url=f"/shared/{token}")


# ---------------------------------------------------------------------------
# GET /api/share/{token}  — public, no auth required
# ---------------------------------------------------------------------------

@router.get("/{token}", response_model=SharedPlaygroundResponse)
async def get_shared_playground(token: str):
    supabase = get_supabase_client()

    # 1. Look up the share record
    share_res = (
        supabase.table("shared_playgrounds")
        .select("playground_id, name, graph_json, created_at")
        .eq("token", token)
        .limit(1)
        .execute()
    )
    share = _first(share_res)
    if not share:
        raise HTTPException(status_code=404, detail="Share link not found or expired")

    playground_id = share["playground_id"]
    snapshot_name  = share.get("name") or "Untitled"
    snapshot_graph = _as_dict(share.get("graph_json"))
    created_at     = share.get("created_at") or datetime.now(timezone.utc).isoformat()

    # 2. Always serve the LIVE graph from the playgrounds table (freshest data)
    #    Only fall back to the snapshot if the live lookup fails.
    final_name  = snapshot_name
    final_graph = snapshot_graph or {}

    try:
        live_res = (
            supabase.table("playgrounds")
            .select("name, graph_json")
            .eq("id", playground_id)
            .limit(1)
            .execute()
        )
        live = _first(live_res)
        if live:
            live_name  = live.get("name")
            live_graph = _as_dict(live.get("graph_json"))
            if live_name:
                final_name = live_name
            if live_graph:          # only override if we actually got a real graph
                final_graph = live_graph
    except Exception as exc:
        logger.warning("Live playground lookup failed for %s — using snapshot. %s", playground_id, exc)

    return SharedPlaygroundResponse(
        playground_id=playground_id,
        name=final_name,
        graph_json=final_graph,
        created_at=created_at,
    )


# ---------------------------------------------------------------------------
# DELETE /api/share/{token}  — owner can revoke
# ---------------------------------------------------------------------------

@router.delete("/{token}")
async def revoke_share(token: str, user_id: str):
    supabase = get_supabase_client()
    res = (
        supabase.table("shared_playgrounds")
        .delete()
        .eq("token", token)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Share link not found or access denied")
    return {"ok": True, "message": "Share link revoked"}
