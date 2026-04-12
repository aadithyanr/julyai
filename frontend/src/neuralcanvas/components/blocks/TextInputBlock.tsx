"use client";

import { memo, useCallback, useEffect, useState } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import { Upload, ChevronDown } from "lucide-react";
import { BaseBlock } from "./BaseBlock";
import { fetchDatasets, type DatasetInfo } from "@/neuralcanvas/lib/trainingApi";
import { DatasetUploadModal } from "@/neuralcanvas/components/datasets/DatasetUploadModal";
import { createClient } from "@/lib/supabase/client";

interface BlockData extends Record<string, unknown> {
  params: Record<string, number | string>;
}

/** Text tokens flowing in visualization */
function TextInputViz({ seqLen }: { seqLen: number }) {
  const tokens = Math.min(seqLen, 8);
  const w = 160, h = 32;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {Array.from({ length: tokens }).map((_, i) => (
        <g key={i}>
          <rect
            x={10 + i * 18} y={4}
            width={14} height={16} rx={3}
            fill="#F59E0B"
            opacity={0.4 + (i / tokens) * 0.4}
          />
          <text
            x={17 + i * 18} y={16}
            textAnchor="middle" fontSize="7"
            fill="#F59E0B"
            opacity={0.85 + (i / tokens) * 0.15}
            fontWeight="600"
          >
            {i + 1}
          </text>
        </g>
      ))}
      {tokens < seqLen && (
        <text x={14 + tokens * 18} y={16} fontSize="8" fill="#F59E0B" opacity="0.75">…</text>
      )}
      <text x={10} y={h - 1} fontSize="7" fill="#F59E0B" opacity="0.85">
        Token IDs [B, {seqLen}]
      </text>
    </svg>
  );
}

function TextInputBlockComponent({ id, data, selected }: NodeProps<Node<BlockData>>) {
  const { setNodes } = useReactFlow();
  const params = data?.params ?? {};
  const seqLen = Number(params.seq_len ?? 64);
  const datasetId = (params.dataset_id as string) ?? "";

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
      .then((list) => {
        // Only show text datasets + the built-in dummy_text
        const textDatasets = list.filter(
          (d) => d.is_builtin ? d.id === "dummy_text" : d.format === "text"
        );
        setDatasets(textDatasets);
        setDatasetError(null);
      })
      .catch((e) => {
        setDatasetError(e instanceof Error ? e.message : "Failed to load datasets");
      });
  }, [accessToken]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  const onDatasetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data?.params && typeof n.data.params === "object")
            ? (n.data.params as Record<string, number | string>) : {};
          return { ...n, data: { ...n.data, params: { ...prevParams, dataset_id: value } } };
        }),
      );
    },
    [id, setNodes],
  );

  const handleUploaded = useCallback(
    (dataset: DatasetInfo) => {
      loadDatasets();
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data?.params && typeof n.data.params === "object")
            ? (n.data.params as Record<string, number | string>) : {};
          return { ...n, data: { ...n.data, params: { ...prevParams, dataset_id: dataset.id } } };
        }),
      );
    },
    [id, setNodes, loadDatasets],
  );

  return (
    <BaseBlock id={id} blockType="TextInput" params={params} selected={!!selected} data={data}>
      {/* Visualization */}
      <div className="w-full mb-3 px-1">
        <TextInputViz seqLen={seqLen} />
      </div>

      {/* Dataset selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
            Text Dataset
          </span>
        </div>

        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <select
              value={datasetId}
              onChange={onDatasetChange}
              disabled={!!datasetError}
              className="nodrag nopan w-full appearance-none px-2.5 py-2 pr-7 rounded-xl text-[11px] font-semibold bg-gray-50 border border-gray-100 text-black outline-none focus:border-[#F59E0B]/50 focus:ring-2 focus:ring-[#F59E0B]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
              title={datasetError ?? "Choose a text dataset for training"}
            >
              <option value="">Choose a text dataset…</option>
              <option value="dummy_text">Dummy Text (built-in)</option>
              {datasets.filter(d => !d.is_builtin).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
          </div>

          {accessToken && (
            <button
              onClick={() => setUploadOpen(true)}
              className="nodrag nopan flex items-center justify-center w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 hover:text-[#F59E0B] hover:border-[#F59E0B]/30 hover:bg-[#FEF3C7]/50 transition-all duration-150"
              title="Upload .txt text file"
            >
              <Upload size={12} />
            </button>
          )}
        </div>

        {!datasetId && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-100">
            <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
            <p className="text-[10px] text-amber-600 font-semibold leading-tight">
              Select a dataset or upload a .txt file to train
            </p>
          </div>
        )}

        {datasetError && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-100">
            <div className="w-1 h-1 rounded-full bg-red-400 shrink-0" />
            <p className="text-[10px] text-red-500 font-semibold leading-tight truncate" title={datasetError}>
              {datasetError}
            </p>
          </div>
        )}
      </div>

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

export const TextInputBlock = memo(TextInputBlockComponent);
