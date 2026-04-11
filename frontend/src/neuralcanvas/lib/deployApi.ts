/**
 * Deploy API — create, manage, and interact with model deployments.
 */

import { getApiBase } from "@/lib/apiConfig";

export interface DeployRequest {
  graph: any;
  playground_id?: string;
  model_id?: string;
  name?: string;
  user_id?: string;
}

export interface DeploymentInfo {
  id: string;
  name: string;
  api_key?: string;
  status: string;
  endpoint: string;
  docs_endpoint: string;
  input_shape: number[];
  num_classes: number;
  has_trained_weights?: boolean;
  is_loaded?: boolean;
  config?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

/** Create a new deployment from a playground graph. */
export async function createDeployment(
  request: DeployRequest
): Promise<DeploymentInfo> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? "Failed to create deployment");
  }
  return res.json();
}

/** List all deployments for a user. */
export async function listDeployments(
  userId?: string
): Promise<DeploymentInfo[]> {
  const base = getApiBase();
  const url = userId
    ? `${base}/api/deploy?user_id=${userId}`
    : `${base}/api/deploy`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to list deployments");
  const data = await res.json();
  return data.deployments ?? [];
}

/** Get a single deployment's details. */
export async function getDeployment(id: string): Promise<DeploymentInfo> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/deploy/${id}`);
  if (!res.ok) throw new Error("Deployment not found");
  return res.json();
}

/** Delete a deployment. */
export async function deleteDeployment(id: string): Promise<void> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/deploy/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete deployment");
}

/** Regenerate the API key for a deployment. */
export async function regenerateApiKey(
  id: string
): Promise<{ api_key: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/deploy/${id}/key`, { method: "PATCH" });
  if (!res.ok) throw new Error("Failed to regenerate API key");
  return res.json();
}

/** Download deployment code as ZIP. */
export async function downloadDeployment(id: string): Promise<void> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/deploy/${id}/download`);
  if (!res.ok) throw new Error("Failed to download deployment");

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deployment-${id.substring(0, 8)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Get the full docs URL for a deployment. */
export function getDocsUrl(deploymentId: string): string {
  const base = getApiBase();
  return `${base}/deploy/api/${deploymentId}/docs`;
}

/** Get the predict endpoint URL. */
export function getPredictUrl(deploymentId: string): string {
  const base = getApiBase();
  return `${base}/deploy/api/${deploymentId}/predict`;
}
