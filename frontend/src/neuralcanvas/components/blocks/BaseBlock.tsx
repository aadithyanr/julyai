"use client";

// ---------------------------------------------------------------------------
// BaseBlock — Cursor format IDE parameter block
// ---------------------------------------------------------------------------

import {
  memo,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type ChangeEvent,
} from "react";
import { motion } from "framer-motion";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import {
  BLOCK_REGISTRY,
  type BlockType,
  type BlockDefinition,
  type ParamSchema,
} from "@/neuralcanvas/lib/blockRegistry";
import { CANVAS_UI_SCALE, BLOCK_BASE_WIDTH } from "@/neuralcanvas/lib/canvasConstants";
import { getShapeLabel, getShapeLabelTooltip, inferInputParamsFromShape } from "@/neuralcanvas/lib/shapeEngine";
import { useShapes } from "@/neuralcanvas/components/canvas/ShapeContext";
import { usePeepInsideContext } from "@/neuralcanvas/components/peep-inside/PeepInsideContext";
import {
  Inbox,
  Target,
  Type,
  Rows3,
  Grid3X3,
  RefreshCw,
  Focus,
  SlidersHorizontal,
  BarChart3,
  Zap,
  Shuffle,
  FoldHorizontal,
  Hash,
  MapPin,
  Percent,
  Plus,
  Combine,
  Eye,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Upload,
  Monitor,
  PenTool,
  Sparkles,
  Cpu,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

export const ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox,
  target: Target,
  type: Type,
  "rows-3": Rows3,
  "grid-3x3": Grid3X3,
  "refresh-cw": RefreshCw,
  focus: Focus,
  "sliders-horizontal": SlidersHorizontal,
  "bar-chart-3": BarChart3,
  zap: Zap,
  shuffle: Shuffle,
  "fold-horizontal": FoldHorizontal,
  hash: Hash,
  "map-pin": MapPin,
  percent: Percent,
  plus: Plus,
  merge: Combine,
  upload: Upload,
  monitor: Monitor,
  "pen-tool": PenTool,
  sparkles: Sparkles,
  cpu: Cpu,
};

// ---------------------------------------------------------------------------
// Human-friendly parameter names
// ---------------------------------------------------------------------------

const FRIENDLY_PARAM_NAMES: Record<string, string> = {
  in_features: "Input size",
  out_features: "Output size",
  in_channels: "Input channels",
  out_channels: "Output channels",
  kernel_size: "Filter size",
  stride: "Step size",
  padding: "Padding",
  embed_dim: "Embedding size",
  num_heads: "Attention heads",
  activation: "Function",
  p: "Drop rate",
  hidden_size: "Hidden size",
  num_layers: "Layers",
  num_embeddings: "Vocabulary size",
  embedding_dim: "Vector size",
  max_len: "Max length",
  dim: "Dimension",
  normalized_shape: "Norm size",
  num_features: "Features",
  vocab_size: "Vocabulary",
  input_size: "Input size",
  d_model: "Model dim",
  batch_size: "Batch size",
  seq_len: "Sequence length",
};

// ---------------------------------------------------------------------------
// Number input with steppers
// ---------------------------------------------------------------------------

interface NumberParamProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  color: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}

function NumberParam({ value, min, max, step = 1, color, disabled, onChange }: NumberParamProps) {
  const clamp = useCallback(
    (v: number) => {
      let n = v;
      if (min !== undefined) n = Math.max(min, n);
      if (max !== undefined) n = Math.min(max, n);
      return n;
    },
    [min, max],
  );

  const [localValue, setLocalValue] = useState<string>(() => String(value));
  const isFocusedRef = useRef(false);
  useEffect(() => {
    if (!isFocusedRef.current) setLocalValue(String(value));
  }, [value]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setLocalValue(raw);
      if (raw === "" || raw === "-") return;
      const parsed = step < 1 ? parseFloat(raw) : parseInt(raw, 10);
      if (Number.isFinite(parsed)) onChange(clamp(parsed));
    },
    [onChange, clamp, step],
  );

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    const trimmed = localValue.trim();
    if (trimmed === "" || trimmed === "-") {
      const fallback = min !== undefined ? min : 0;
      onChange(clamp(fallback));
      setLocalValue(String(fallback));
      return;
    }
    const parsed = step < 1 ? parseFloat(trimmed) : parseInt(trimmed, 10);
    if (Number.isFinite(parsed)) {
      const clamped = clamp(parsed);
      onChange(clamped);
      setLocalValue(String(clamped));
    } else {
      setLocalValue(String(value));
    }
  }, [localValue, min, step, value, onChange, clamp]);

  return (
    <div className="flex items-center gap-0.5">
      <input
        type="number"
        value={localValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={`
          nodrag nopan
          w-[48px] px-1 py-0.5 rounded-sm text-[10px] font-mono text-right
          bg-[var(--surface)] border border-[var(--border)]
          text-[var(--foreground)]
          outline-none focus:border-[var(--accent-blue)]
          transition-colors duration-100
          [appearance:textfield]
          [&::-webkit-outer-spin-button]:appearance-none
          [&::-webkit-inner-spin-button]:appearance-none
          ${disabled ? "opacity-50 cursor-not-allowed bg-[var(--background-subtle)]" : ""}
        `}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Select input
// ---------------------------------------------------------------------------

interface SelectParamProps {
  value: string;
  options: string[];
  color: string;
  onChange: (v: string) => void;
}

function SelectParam({ value, options, onChange }: SelectParamProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="
        nodrag nopan
        w-[72px] px-1 py-0.5 rounded-sm text-[10px] font-mono
        bg-[var(--surface)] border border-[var(--border)]
        text-[var(--foreground)]
        outline-none focus:border-[var(--accent-blue)]
        transition-colors duration-100 cursor-pointer
      "
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Param row
// ---------------------------------------------------------------------------

interface ParamRowProps {
  schema: ParamSchema;
  value: number | string;
  color: string;
  disabled?: boolean;
  onUpdate: (name: string, value: number | string) => void;
}

function ParamRow({ schema, value, color, disabled, onUpdate }: ParamRowProps) {
  const renderInput = () => {
    if (schema.type === "select" && schema.options) {
      return (
        <SelectParam
          value={String(value)}
          options={schema.options}
          color={color}
          onChange={(v) => onUpdate(schema.name, v)}
        />
      );
    }
    const numVal = typeof value === "number" ? value : parseFloat(String(value)) || 0;
    const step = schema.type === "float" ? 0.05 : 1;
    return (
      <NumberParam
        value={numVal}
        min={schema.min}
        max={schema.max}
        step={step}
        color={color}
        disabled={disabled}
        onChange={(v) => onUpdate(schema.name, v)}
      />
    );
  };

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1 hover:bg-[var(--background-subtle)]">
      <span
        className={`text-[10px] font-mono truncate ${disabled ? "text-[var(--foreground-muted)] opacity-50" : "text-[var(--foreground-secondary)]"}`}
        title={disabled ? `${schema.name} — auto-set` : schema.name}
      >
        {schema.name}
      </span>
      {renderInput()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BaseBlock props
// ---------------------------------------------------------------------------

export interface BaseBlockProps {
  id: string;
  blockType: BlockType;
  params: Record<string, number | string>;
  selected: boolean;
  data?: Record<string, unknown>;
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// BaseBlock component — IDE Parameter Card Design
// ---------------------------------------------------------------------------

function BaseBlockComponent({
  id,
  blockType,
  params,
  selected,
  data,
  children,
}: BaseBlockProps) {
  const def: BlockDefinition | undefined = BLOCK_REGISTRY[blockType];
  const { shapes } = useShapes();
  const result = shapes.get(id);
  const { setNodes } = useReactFlow();
  const [errorTooltip, setErrorTooltip] = useState(false);
  const { open: openPeep } = usePeepInsideContext();

  const handlePeepInside = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      openPeep({
        blockId: id,
        blockType,
        anchorX: rect.right,
        anchorY: rect.top,
        activationType:
          blockType === "Activation"
            ? String(params.activation ?? "")
            : undefined,
        params: { ...params },
      });
    },
    [id, blockType, params, openPeep],
  );

  const color = def?.color ?? "var(--foreground-muted)";
  const Icon = def ? ICON_MAP[def.icon] : null;
  const hasError = !!result?.error;
  const inLabel = getShapeLabel(result?.inputShape ?? null);
  const outLabel = getShapeLabel(result?.outputShape ?? null);

  const inferredParamNames = useMemo(() => {
    const inputShape = result?.inputShape ?? null;
    if (!inputShape?.length) return new Set<string>();
    const inferred = inferInputParamsFromShape(blockType, inputShape);
    return inferred ? new Set(Object.keys(inferred)) : new Set<string>();
  }, [result?.inputShape, blockType]);

  const onParamUpdate = useCallback(
    (name: string, value: number | string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prevParams = (n.data?.params && typeof n.data.params === "object") ? n.data.params as Record<string, number | string> : {};
          return {
            ...n,
            data: {
              ...n.data,
              params: { ...prevParams, [name]: value },
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  if (!def) {
    return (
      <div className="px-2 py-1 rounded bg-red-50 border border-red-200 text-[10px] font-mono text-red-600">
        Unknown block: {blockType}
      </div>
    );
  }

  const animateFromPalette = !!(data as { animateFromPalette?: boolean } | undefined)?.animateFromPalette;
  const blockWidth = def.width ? Math.max(def.width - 20, 200) : 200;

  const blockContent = (
    <div
      className={`
        group/block relative flex flex-col bg-white
        rounded-2xl border
        ${selected ? "border-gray-400 shadow-[0_8px_24px_0_rgba(0,0,0,0.12)]" : "border-gray-100 shadow-[0_4px_16px_0_rgba(0,0,0,0.06)] hover:border-gray-200"}
        ${hasError ? "!border-red-400 !shadow-[0_4px_16px_0_rgba(239,68,68,0.2)]" : ""}
        transition-all duration-200
      `}
      style={{ width: blockWidth }}
    >
      {/* ── IDE Syntax Color Bar (Top) ── */}
      <div
        className="absolute left-0 top-0 right-0 h-[3px] z-10 rounded-t-2xl"
        style={{ backgroundColor: hasError ? "#ef4444" : color }}
      />

      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2 border-b border-gray-50 bg-[#fafafa] rounded-t-2xl">
        {Icon && (
          <div className="flex flex-col items-center justify-center shrink-0">
            <Icon size={12} className="text-gray-400" />
          </div>
        )}
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
          <span className="text-[13px] font-bold text-gray-800 tracking-tight truncate shrink-0 max-w-[70%]">
            {def.label}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 truncate mt-0.5">
            {def.category}
          </span>
        </div>
        <button
          className="
            nodrag nopan
            flex items-center justify-center w-6 h-6 rounded-lg shrink-0
            text-gray-400 hover:text-gray-800 hover:bg-gray-100
            transition-all duration-150
            opacity-0 group-hover/block:opacity-100
          "
          title="Inspect tensor operations"
          onClick={handlePeepInside}
        >
          <Eye size={12} />
        </button>
      </div>

      {children && (
        <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
          {children}
        </div>
      )}

      {/* ═══ Parameters ═══ */}
      {def.paramSchema.length > 0 && (
        <div className="py-1 flex flex-col">
          {def.paramSchema.map((schema) => (
            <ParamRow
              key={schema.name}
              schema={schema}
              value={params[schema.name] ?? def.defaultParams[schema.name] ?? 0}
              color={color}
              disabled={inferredParamNames.has(schema.name)}
              onUpdate={onParamUpdate}
            />
          ))}
        </div>
      )}

      {/* ═══ Shape bar / Status ═══ */}
      <div
        className={`
          flex items-center px-3.5 py-2 text-[10px] font-semibold border-t transition-colors rounded-b-2xl
          ${hasError ? "border-red-100 bg-red-50/50" : "border-gray-50 bg-[#fafafa] group-hover/block:bg-gray-50/80"}
        `}
      >
        {hasError ? (
          <div className="flex items-center gap-1.5 text-red-500 w-full font-medium">
            <AlertCircle size={12} className="shrink-0" />
            <span className="truncate flex-1" title={result?.error}>{result?.error}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full opacity-60 group-hover/block:opacity-100 transition-opacity">
            <div className="flex items-center gap-1.5 truncate" title={getShapeLabelTooltip(result?.inputShape ?? null) || undefined}>
               <span className="text-gray-400 opacity-80">IN</span>
               <span className="text-gray-600 font-medium">{inLabel || "-"}</span>
            </div>
            <div className="flex items-center gap-1.5 truncate justify-end" title={getShapeLabelTooltip(result?.outputShape ?? null) || undefined}>
               <span className="text-gray-400 opacity-80">OUT</span>
               <span className="text-gray-600 font-medium">{outLabel || "-"}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Handles (Crisp dots) ── */}
      {def.inputPorts.map((port, i) => {
        const topPct = def.inputPorts.length === 1
          ? 50
          : 25 + (i / Math.max(def.inputPorts.length - 1, 1)) * 50;
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="target"
            position={Position.Left}
            className="!transition-all !duration-300 !w-[10px] !h-[10px] hover:!scale-[1.4] !opacity-100"
            style={{
              top: `${topPct}%`,
              left: "-5px",
              background: hasError ? "#ef4444" : "white",
              border: `2px solid ${hasError ? "#ef4444" : color}`,
              boxShadow: `0 0 0 3px white, 0 2px 4px rgba(0,0,0,0.05)`,
            }}
          />
        );
      })}
      {def.outputPorts.map((port, i) => {
        const topPct = def.outputPorts.length === 1
          ? 50
          : 25 + (i / Math.max(def.outputPorts.length - 1, 1)) * 50;
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            position={Position.Right}
            className="!transition-all !duration-300 !w-[10px] !h-[10px] hover:!scale-[1.4] !opacity-100"
            style={{
              top: `${topPct}%`,
              right: "-5px",
              background: hasError ? "#ef4444" : color,
              border: `2px solid white`,
              boxShadow: `0 0 0 3px white, 0 2px 4px rgba(0,0,0,0.05)`,
            }}
          />
        );
      })}
    </div>
  );

  if (animateFromPalette) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{ width: "100%", transformOrigin: "center center" }}
      >
        {blockContent}
      </motion.div>
    );
  }
  return blockContent;
}

export const BaseBlock = memo(BaseBlockComponent);
