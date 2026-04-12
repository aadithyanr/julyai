/**
 * Share API client — creates and resolves shareable playground links
 * via the JulyAI backend.
 */

import { getApiBase } from "@/neuralcanvas/lib/trainingApi";
import type { GraphSchema } from "@/types/graph";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateShareResponse {
  token: string;
  share_url: string;
}

export interface SharedPlayground {
  playground_id: string;
  name: string;
  graph_json: GraphSchema;
  created_at: string;
  owner_email?: string;
}

// ---------------------------------------------------------------------------
// Create a share link for a playground
// ---------------------------------------------------------------------------

export async function createShareLink(
  playgroundId: string,
  userId: string,
  name?: string,
): Promise<CreateShareResponse> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/share/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playground_id: playgroundId, user_id: userId, name }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Failed to create share link");
  }

  return res.json() as Promise<CreateShareResponse>;
}

// ---------------------------------------------------------------------------
// Resolve a share token to playground data (public — no auth required)
// ---------------------------------------------------------------------------

export async function getSharedPlayground(token: string): Promise<SharedPlayground> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/share/${token}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Share link not found");
  }

  return res.json() as Promise<SharedPlayground>;
}

// ---------------------------------------------------------------------------
// Revoke a share link (owner only)
// ---------------------------------------------------------------------------

export async function revokeShareLink(token: string, userId: string): Promise<void> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/share/${token}?user_id=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "Failed to revoke share link");
  }
}
