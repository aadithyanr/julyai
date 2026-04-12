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
  Trash2, Download, RefreshCw, Copy, Check,
  ExternalLink, Zap, Eye, EyeOff, Key, ChevronDown, ChevronUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Copy button — inline, icon-only
// ---------------------------------------------------------------------------

function CopyIcon({ text, fieldId, copiedField }: {
  text: string;
  fieldId: string;
  copiedField: string | null;
}) {
  return (
    <button
      onClick={() => { /* parent handles */ }}
      data-copy-text={text}
      data-copy-field={fieldId}
      className="shrink-0 rounded p-1 text-black/30 hover:text-black/60 transition-colors"
      title="Copy"
    >
      {copiedField === fieldId
        ? <Check className="h-3.5 w-3.5 text-green-500" />
        : <Copy className="h-3.5 w-3.5" />
      }
    </button>
  );
}

// ---------------------------------------------------------------------------
// Status dot
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`inline-flex h-1.5 w-1.5 rounded-full shrink-0 ${status === "active" ? "bg-green-500" :
      status === "error" ? "bg-red-400" : "bg-amber-400"
      }`} />
  );
}

// ---------------------------------------------------------------------------
// Blurred reveal row — like Banani's "Click to reveal"
// ---------------------------------------------------------------------------

function RevealRow({ value, revealed, onToggle, onCopy, fieldId, copiedField }: {
  value: string;
  revealed: boolean;
  onToggle: () => void;
  onCopy: (text: string, fieldId: string) => void;
  fieldId: string;
  copiedField: string | null;
}) {
  if (!value) return <span className="font-mono text-sm text-black/30">—</span>;

  return (
    <div
      className="relative flex h-10 w-full cursor-pointer items-center overflow-hidden rounded-xl bg-[#707070]"
      onClick={!revealed ? onToggle : undefined}
    >
      {/* blurred content */}
      <div className={`flex flex-1 items-center px-3 transition-all ${revealed ? "" : "blur-[6px] select-none"}`}>
        <Key className="mr-2 h-3.5 w-3.5 shrink-0 text-white/50" />
        <code className="whitespace-nowrap font-mono text-sm text-white">{value}</code>
      </div>

      {/* Overlay when hidden */}
      {!revealed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold text-white">Click to reveal</span>
        </div>
      )}

      {/* Actions when revealed */}
      {revealed && (
        <div className="flex items-center gap-0.5 px-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="rounded p-1 text-white/50 hover:text-white transition-colors"
            title="Hide"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy(value, fieldId); }}
            className="rounded p-1 text-white/50 hover:text-white transition-colors"
            title="Copy"
          >
            {copiedField === fieldId
              ? <Check className="h-3.5 w-3.5 text-green-400" />
              : <Copy className="h-3.5 w-3.5" />
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Endpoint row — like Banani's copyable command rows
// ---------------------------------------------------------------------------

function EndpointRow({ url, onCopy, fieldId, copiedField }: {
  url: string;
  onCopy: (text: string, fieldId: string) => void;
  fieldId: string;
  copiedField: string | null;
}) {
  return (
    <div className="flex h-10 w-full items-center justify-between gap-2 rounded-xl bg-[#E9E9E9] px-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide text-black/40">POST</span>
        <code className="truncate font-mono text-sm text-black/60">{url}</code>
      </div>
      <button
        onClick={() => onCopy(url, fieldId)}
        className="shrink-0 rounded p-1 text-black/30 hover:text-black/70 transition-colors"
        title="Copy endpoint"
      >
        {copiedField === fieldId
          ? <Check className="h-3.5 w-3.5 text-green-500" />
          : <Copy className="h-3.5 w-3.5" />
        }
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single deployment row (expanded/collapsed)
// ---------------------------------------------------------------------------

function DeploymentRow({ dep, onDelete, onRegen, onDownload, onCopy, copiedField }: {
  dep: DeploymentInfo;
  onDelete: (id: string, name: string) => void;
  onRegen: (id: string) => void;
  onDownload: (id: string) => void;
  onCopy: (text: string, fieldId: string) => void;
  copiedField: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const predictUrl = getPredictUrl(dep.id);
  const docsUrl = getDocsUrl(dep.id);

  const formatDate = (iso?: string) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 86_400_000) return "Today";
    if (diff < 172_800_000) return "Yesterday";
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div>
      {/* ── Row header — always visible ── */}
      <div
        className="flex cursor-pointer items-center justify-between py-3 group"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={dep.status} />
          <div className="min-w-0">
            <span className="text-sm font-semibold text-black truncate">{dep.name}</span>
            <span className="ml-2 text-sm text-black/40">{formatDate(dep.created_at)}</span>
            {dep.input_shape?.length ? (
              <span className="ml-2 font-mono text-xs text-black/30">
                {dep.input_shape.join("×")} → {dep.num_classes}cls
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${dep.status === "active" ? "text-green-500" :
            dep.status === "error" ? "text-red-400" : "text-amber-400"
            }`}>
            {dep.status}
          </span>
          <span className="text-black/25 group-hover:text-black/50 transition-colors">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="pb-5 space-y-4">

          {/* Endpoint */}
          <div>
            <p className="mb-2 text-sm text-black/60">Endpoint URL</p>
            <EndpointRow
              url={predictUrl}
              onCopy={onCopy}
              fieldId={`url-${dep.id}`}
              copiedField={copiedField}
            />
          </div>

          {/* API Key */}
          <div>
            <p className="mb-2 text-sm text-black/60">API Key</p>
            <RevealRow
              value={dep.api_key ?? ""}
              revealed={revealed}
              onToggle={() => setRevealed((v) => !v)}
              onCopy={onCopy}
              fieldId={`key-${dep.id}`}
              copiedField={copiedField}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-semibold text-[#0066FF] hover:underline underline-offset-2 flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View docs
            </a>
            <button
              onClick={(e) => { e.stopPropagation(); onRegen(dep.id); }}
              className="text-sm font-semibold text-black/50 hover:text-black transition-colors flex items-center gap-1"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              New key
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDownload(dep.id); }}
              className="text-sm font-semibold text-black/50 hover:text-black transition-colors flex items-center gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              Download code
            </button>
            <div className="flex-1" />
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(dep.id, dep.name); }}
              className="cursor-pointer text-sm font-semibold text-black/40 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="h-px bg-black/[0.06]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DeployDashboard({ userId }: { userId?: string }) {
  const [deployments, setDeployments] = useState<DeploymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copy = useCallback((text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try { setDeployments(await listDeployments(userId)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This stops the API immediately.`)) return;
    setDeletingId(id);
    try {
      await deleteDeployment(id);
      setDeployments((prev) => prev.filter((d) => d.id !== id));
    } catch (e) { console.error(e); }
    finally { setDeletingId(null); }
  };

  const handleRegen = async (id: string) => {
    setRegenId(id);
    try {
      const { api_key } = await regenerateApiKey(id);
      setDeployments((prev) => prev.map((d) => d.id === id ? { ...d, api_key } : d));
    } catch (e) { console.error(e); }
    finally { setRegenId(null); }
  };

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    try { await downloadDeployment(id); }
    catch (e) { console.error(e); }
    finally { setDownloadingId(null); }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <div className="flex items-center gap-3 py-3">
              <div className="h-1.5 w-1.5 rounded-full bg-gray-200 animate-pulse" />
              <div className="h-3.5 w-40 rounded bg-gray-100 animate-pulse" />
              <div className="h-3 w-20 rounded bg-gray-50 animate-pulse ml-2" />
            </div>
            <div className="h-px bg-black/[0.06]" />
          </div>
        ))}
      </div>
    );
  }

  // ── Empty ──
  if (deployments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-50 border border-gray-100">
          <Zap className="h-5 w-5 text-gray-300" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-semibold text-black/50 mb-1">No deployments yet</p>
        <p className="text-xs text-black/30 max-w-[220px] leading-relaxed">
          Deploy a model from the playground to create a live API endpoint.
        </p>
      </div>
    );
  }

  // ── List ──
  return (
    <div className="space-y-8">

      {/* How it works */}
      <div className="flex flex-col gap-2">
        <h2 className="mb-1 text-sm font-semibold">How it works</h2>
        <p className="text-sm text-black/60">1. Build your neural network in the playground</p>
        <p className="text-sm text-black/60">2. Train it on your dataset</p>
        <p className="text-sm text-black/60">3. Deploy to get a live REST API</p>
      </div>

      <div className="h-px bg-black/10" />

      {/* Deployments */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">
            Your deployments
          </h2>
          <button
            onClick={refresh}
            className="flex items-center gap-1 text-sm font-semibold text-black/40 hover:text-black transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Deployment rows */}
        <div>
          {/* Top divider */}
          <div className="h-px bg-black/[0.06]" />

          {deployments.map((dep) => (
            <DeploymentRow
              key={dep.id}
              dep={dep}
              onDelete={handleDelete}
              onRegen={handleRegen}
              onDownload={handleDownload}
              onCopy={copy}
              copiedField={copiedField}
            />
          ))}
        </div>
      </div>

      {/* <div className="h-px bg-black/10" /> */}

      {/* Usage example */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Example request</h2>
        <p className="text-sm text-black/60">Send a POST request with your input data:</p>
        <div className="flex h-10 items-center justify-between rounded-xl bg-[#E9E9E9] px-3">
          <code className="whitespace-nowrap font-mono text-sm text-black/60">
            curl -X POST [endpoint] -H "X-API-Key: [key]" -d {`{"input": [...]}`}
          </code>
          <button
            onClick={() => copy(
              `curl -X POST [endpoint] -H "X-API-Key: [key]" -d '{"input": []}'`,
              "curl-example"
            )}
            className="shrink-0 rounded p-1 text-black/30 hover:text-black/60 transition-colors"
          >
            {copiedField === "curl-example"
              ? <Check className="h-3.5 w-3.5 text-green-500" />
              : <Copy className="h-3.5 w-3.5" />
            }
          </button>
        </div>
        <button className="self-start text-sm font-semibold text-[#0066FF] hover:underline underline-offset-2">
          Learn more
        </button>
      </div>

    </div>
  );
}