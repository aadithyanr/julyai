"use client";

// ---------------------------------------------------------------------------
// InputBlock — Redesigned to match Banani's exact design language
// White card, orange accent, clean typography, soft shadows
// ---------------------------------------------------------------------------

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { useReactFlow, useEdges } from "@xyflow/react";
import { Upload, ChevronDown } from "lucide-react";
import { BaseBlock } from "./BaseBlock";
import { useShapes } from "@/neuralcanvas/components/canvas/ShapeContext";
import { getShapeLabel } from "@/neuralcanvas/lib/shapeEngine";
import { fetchDatasets, type DatasetInfo } from "@/neuralcanvas/lib/trainingApi";
import { DatasetUploadModal } from "@/neuralcanvas/components/datasets/DatasetUploadModal";
import { createClient } from "@/lib/supabase/client";

const CUSTOM_DATASET_ID = "__custom__";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

/** Clean data-flow visualization matching Banani's minimal SVG style */
function InputViz() {
  return (
    <svg width="100%" height="32" viewBox="0 0 200 32" preserveAspectRatio="xMidYMid meet">
      {/* Flow arrows */}
      {[8, 16, 24].map((y, i) => (
        <g key={i} opacity={0.4 + i * 0.2}>
          <line x1="0" y1={y} x2="36" y2={y} stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
          <polygon points={`34,${y - 2.5} 40,${y} 34,${y + 2.5}`} fill="#F59E0B" />
        </g>
      ))}
      {/* Funnel shape */}
      <path d="M46,2 L68,10 L68,22 L46,30 Z" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Output line */}
      <line x1="70" y1="16" x2="185" y2="16" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <polygon points="182,13 188,16 182,19" fill="#F59E0B" opacity="0.8" />
      {/* Label */}
      <text x="80" y="10" fontSize="8" fill="#D97706" fontWeight="700" fontFamily="Inter, sans-serif" opacity="0.9">
        Data → Training
      </text>
    </svg>
  );
}

function InputBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  const { shapes } = useShapes();
  const { setNodes, getNode } = useReactFlow();
  const edges = useEdges();
  const result = shapes.get(id);
  const outLabel = getShapeLabel(result?.outputShape ?? null);
  const params = data?.params ?? {};
  const datasetId = (params.dataset_id as string) ?? "";

  const hasCustomInputConnected = useMemo(() => {
    const incoming = edges.filter((e) => e.target === id);
    for (const e of incoming) {
      const sourceNode = getNode(e.source);
      if (sourceNode?.type === "InputSpace" || sourceNode?.type === "Board") return true;
    }
    return false;
  }, [id, edges, getNode]);

  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAccessToken(session?.access_token ?? null);
    });
  }, []);

  const loadDatasets = useCallback(() => {
    fetchDatasets(accessToken ?? undefined)
      .then((list) => setDatasets(list))
      .catch((e) => {
        setDatasetError(e instanceof Error ? e.message : "Failed to load datasets");
      });
  }, [accessToken]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  useEffect(() => {
    if (datasetId === CUSTOM_DATASET_ID || !datasets.length || (params.input_shape as string)?.length) return;
    const match = datasets.find((d) => d.id === datasetId);
    if (!match?.input_shape?.length) return;
    const shapeStr = match.input_shape.join(",");
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const prevParams = (n.data?.params && typeof n.data.params === "object") ? (n.data.params as Record<string, number | string>) : {};
        return { ...n, data: { ...n.data, params: { ...prevParams, input_shape: shapeStr } } };
      }),
    );
  }, [datasetId, datasets, id, setNodes, params.input_shape]);

  useEffect(() => {
    if (hasCustomInputConnected && datasetId !== CUSTOM_DATASET_ID) {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data?.params && typeof n.data.params === "object") ? (n.data.params as Record<string, number | string>) : {};
          return { ...n, data: { ...n.data, params: { ...prevParams, dataset_id: CUSTOM_DATASET_ID } } };
        }),
      );
    }
  }, [hasCustomInputConnected, datasetId, id, setNodes]);

  const onDatasetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data?.params && typeof n.data.params === "object")
            ? (n.data.params as Record<string, number | string>) : {};
          if (value === CUSTOM_DATASET_ID) {
            return { ...n, data: { ...n.data, params: { ...prevParams, dataset_id: CUSTOM_DATASET_ID } } };
          }
          const selectedDataset = datasets.find((d) => d.id === value);
          const inputShape = selectedDataset?.input_shape?.length ? selectedDataset.input_shape.join(",") : "";
          return { ...n, data: { ...n.data, params: { ...prevParams, dataset_id: value, input_shape: inputShape } } };
        }),
      );
    },
    [id, setNodes, datasets],
  );

  const handleUploaded = useCallback(
    (dataset: DatasetInfo) => {
      loadDatasets();
      const inputShape = dataset.input_shape?.length ? dataset.input_shape.join(",") : "";
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data?.params && typeof n.data.params === "object")
            ? (n.data.params as Record<string, number | string>) : {};
          return { ...n, data: { ...n.data, params: { ...prevParams, dataset_id: dataset.id, input_shape: inputShape } } };
        }),
      );
    },
    [id, setNodes, loadDatasets],
  );

  const builtinDatasets = datasets.filter((d) => d.is_builtin);
  const customDatasets = datasets.filter((d) => !d.is_builtin);
  const displayValue = hasCustomInputConnected ? CUSTOM_DATASET_ID : datasetId;
  const isCustom = displayValue === CUSTOM_DATASET_ID;

  return (
    <BaseBlock id={id} blockType="Input" params={params} selected={!!selected} data={data}>
      {/* ── Visualization ── */}
      <div className="w-full mb-3 px-1">
        <InputViz />
      </div>

      {/* ── Dataset selector ── */}
      <div className="space-y-1.5">
        {/* Label row */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            Dataset
          </span>
          {outLabel && (
            <span className="text-[10px] font-mono font-semibold text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded-md" title="Output shape">
              {outLabel}
            </span>
          )}
        </div>

        {/* Select + Upload button */}
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <select
              value={displayValue}
              onChange={onDatasetChange}
              disabled={!!datasetError || isCustom}
              className="nodrag nopan w-full appearance-none px-2.5 py-2 pr-7 rounded-xl text-[11px] font-semibold bg-gray-50 border border-gray-100 text-black outline-none focus:border-[#F59E0B]/50 focus:ring-2 focus:ring-[#F59E0B]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
              title={isCustom ? "Custom data from Input Space" : datasetError ?? "Choose a dataset for training"}
            >
              <option value="">Choose a dataset…</option>
              <option value={CUSTOM_DATASET_ID}>Custom (from Input Space)</option>
              {builtinDatasets.length > 0 && (
                <optgroup label="Built-in">
                  {builtinDatasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </optgroup>
              )}
              {customDatasets.length > 0 && (
                <optgroup label="My Datasets">
                  {customDatasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </optgroup>
              )}
              {builtinDatasets.length === 0 && customDatasets.length === 0 && datasets.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {/* Custom chevron */}
            <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          </div>

          {/* Upload button */}
          {accessToken && (
            <button
              onClick={() => setUploadOpen(true)}
              className="nodrag nopan flex items-center justify-center w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 hover:text-[#F59E0B] hover:border-[#F59E0B]/30 hover:bg-[#FEF3C7]/50 transition-all duration-150"
              title="Upload custom dataset"
            >
              <Upload size={12} />
            </button>
          )}
        </div>

        {/* Custom data notice */}
        {isCustom && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
            <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
            <p className="text-[10px] text-amber-600 font-semibold leading-tight">
              Using custom data from Input Space block
            </p>
          </div>
        )}

        {/* Error notice */}
        {datasetError && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-100">
            <div className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
            <p className="text-[10px] text-red-500 font-semibold leading-tight truncate" title={datasetError}>
              {datasetError}
            </p>
          </div>
        )}
      </div>

      {/* Upload modal */}
      {accessToken && (
        <DatasetUploadModal
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={handleUploaded}
          accessToken={accessToken}
        />
      )}
    </BaseBlock>
  );
}

export const InputBlock = memo(InputBlockComponent);