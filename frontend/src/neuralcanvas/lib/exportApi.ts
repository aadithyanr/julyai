/**
 * Export API — download a standalone Python model package as a ZIP.
 */

import type { GraphSchema } from "@/types/graph";
import { getApiBase } from "@/lib/apiConfig";

export interface ExportPackageRequest {
  graph: GraphSchema;
  playground_id?: string;
  model_id?: string;
}

/**
 * Request and download the model export package (ZIP file).
 * Returns a Blob that can be triggered as a download.
 */
export async function exportModelPackage(
  request: ExportPackageRequest
): Promise<void> {
  const base = getApiBase();

  const res = await fetch(`${base}/api/export/package`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.detail ?? res.statusText ?? "Failed to generate export package"
    );
  }

  // Get the ZIP blob and trigger download
  const blob = await res.blob();
  const contentDisposition = res.headers.get("Content-Disposition");
  let filename = "julyai-model.zip";
  if (contentDisposition) {
    const match = contentDisposition.match(/filename=(.+)/);
    if (match) filename = match[1].replace(/"/g, "");
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
