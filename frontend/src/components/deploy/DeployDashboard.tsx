"use client";

import { useEffect, useState, useCallback } from "react";
import {
  listDeployments,
  deleteDeployment,
  regenerateApiKey,
  downloadDeployment,
  getDocsUrl,
  getPredictUrl,
  type DeploymentInfo,
} from "@/neuralcanvas/lib/deployApi";
import {
  Trash2,
  Download,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Zap,
  ZapOff,
  Eye,
  Key,
  Activity,
} from "lucide-react";

export function DeployDashboard({ userId }: { userId?: string }) {
  const [deployments, setDeployments] = useState<DeploymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listDeployments(userId);
      setDeployments(list);
    } catch (e) {
      console.error("Failed to load deployments:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete deployment "${name}"? This will stop the API immediately.`)) return;
    setDeletingId(id);
    try {
      await deleteDeployment(id);
      setDeployments((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRegenKey = async (id: string) => {
    setRegenId(id);
    try {
      const { api_key } = await regenerateApiKey(id);
      setDeployments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, api_key } : d))
      );
      setRevealedKeys((prev) => new Set([...prev, id]));
    } catch (e) {
      console.error("Regenerate failed:", e);
    } finally {
      setRegenId(null);
    }
  };

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try {
      await downloadDeployment(id);
    } catch (e) {
      console.error("Download failed:", e);
    } finally {
      setDownloadingId(null);
    }
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const toggleKeyReveal = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return "Today";
    if (diff < 172800000) return "Yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] min-h-[300px] animate-shimmer" />
        ))}
      </div>
    );
  }

  if (deployments.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--foreground-muted)]">
          <Zap className="h-7 w-7" />
        </div>
        <h3 className="font-semibold text-[var(--foreground)]">No deployments yet</h3>
        <p className="max-w-sm text-sm text-[var(--foreground-muted)]">
          Deploy a model from your playground to create a live API endpoint.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-[var(--foreground-muted)]">
          {deployments.length} deployment{deployments.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors px-2.5 py-1.5 rounded-lg hover:bg-[var(--surface-hover)]"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
        {deployments.map((dep) => {
          const predictUrl = getPredictUrl(dep.id);
          const docsUrl = getDocsUrl(dep.id);
          const isActive = dep.status === "active";
          const keyRevealed = revealedKeys.has(dep.id);
          const apiKey = dep.api_key || "";
          const maskedKey = apiKey ? `${apiKey.substring(0, 8)}${"•".repeat(20)}` : "";

          return (
            <div
              key={dep.id}
              className="group rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4 transition-all hover:border-[var(--border-strong)] hover:shadow-lg"
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-500"
                      : dep.status === "error"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-[var(--foreground-muted)]/10 text-[var(--foreground-muted)]"
                  }`}>
                    {isActive ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] truncate max-w-[200px]">{dep.name}</h3>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {formatDate(dep.created_at)} · {dep.input_shape?.join("×")} → {dep.num_classes} classes
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-500"
                    : dep.status === "error"
                      ? "bg-red-500/10 text-red-500"
                      : "bg-yellow-500/10 text-yellow-500"
                }`}>
                  {dep.status}
                </span>
              </div>

              {/* Endpoint URL */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">Endpoint</label>
                <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--background-subtle)] border border-[var(--border)] font-mono text-xs text-[var(--foreground-secondary)] overflow-hidden">
                  <span className="text-emerald-500 font-bold shrink-0">POST</span>
                  <span className="truncate flex-1">{predictUrl}</span>
                  <button
                    onClick={() => copyToClipboard(predictUrl, `url-${dep.id}`)}
                    className="shrink-0 p-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
                    title="Copy endpoint URL"
                  >
                    {copiedField === `url-${dep.id}` ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">API Key</label>
                <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--background-subtle)] border border-[var(--border)] font-mono text-xs text-[var(--foreground-secondary)]">
                  <Key className="h-3 w-3 shrink-0 text-[var(--foreground-muted)]" />
                  <span className="truncate flex-1">
                    {keyRevealed ? apiKey : maskedKey}
                  </span>
                  <button
                    onClick={() => toggleKeyReveal(dep.id)}
                    className="shrink-0 p-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
                    title={keyRevealed ? "Hide API key" : "Show API key"}
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => copyToClipboard(apiKey, `key-${dep.id}`)}
                    className="shrink-0 p-1 rounded hover:bg-[var(--surface-hover)] transition-colors"
                    title="Copy API key"
                  >
                    {copiedField === `key-${dep.id}` ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--accent)] bg-[var(--accent-muted)] hover:bg-[var(--accent-muted)]/80 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Docs
                </a>
                <button
                  onClick={() => handleRegenKey(dep.id)}
                  disabled={regenId === dep.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--foreground-muted)] bg-[var(--surface-elevated)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
                  title="Regenerate API key"
                >
                  <RefreshCw className={`h-3 w-3 ${regenId === dep.id ? "animate-spin" : ""}`} />
                  New Key
                </button>
                <button
                  onClick={() => handleDownload(dep.id)}
                  disabled={downloadingId === dep.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--foreground-muted)] bg-[var(--surface-elevated)] hover:text-emerald-500 transition-colors disabled:opacity-50"
                  title="Download code"
                >
                  <Download className={`h-3 w-3 ${downloadingId === dep.id ? "animate-bounce" : ""}`} />
                  Code
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => handleDelete(dep.id, dep.name)}
                  disabled={deletingId === dep.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--foreground-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title="Delete deployment"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
