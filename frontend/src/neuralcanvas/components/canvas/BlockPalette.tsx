"use client";

// ---------------------------------------------------------------------------
// BlockPalette — Redesigned to match Banani's exact design language
// White sidebar, soft shadows, Inter font, clean rounded cards
// ---------------------------------------------------------------------------

import { memo, useState, useCallback, useMemo, type DragEvent } from "react";
import {
  getAllBlockDefinitions,
  type BlockCategory,
  type BlockDefinition,
} from "@/neuralcanvas/lib/blockRegistry";
import {
  Inbox, Target, Type, Rows3, Grid3X3, RefreshCw, Focus,
  SlidersHorizontal, BarChart3, Zap, Shuffle, FoldHorizontal,
  Hash, MapPin, Percent, Upload, Monitor, PenTool, Search,
  ChevronDown, ChevronRight, Layers, Wrench, Star, Minimize2,
  Sparkles, Cpu, GripVertical, type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  inbox: Inbox, target: Target, type: Type, "rows-3": Rows3,
  "grid-3x3": Grid3X3, "refresh-cw": RefreshCw, focus: Focus,
  "sliders-horizontal": SlidersHorizontal, "bar-chart-3": BarChart3,
  zap: Zap, shuffle: Shuffle, "fold-horizontal": FoldHorizontal,
  hash: Hash, "map-pin": MapPin, percent: Percent, "minimize-2": Minimize2,
  upload: Upload, monitor: Monitor, "pen-tool": PenTool,
  sparkles: Sparkles, cpu: Cpu,
};

const CATEGORIES: { key: BlockCategory; label: string; icon: LucideIcon; color: string }[] = [
  { key: "input", label: "Input", icon: Inbox, color: "#F59E0B" },
  { key: "data", label: "Data", icon: Upload, color: "#D97706" },
  { key: "output", label: "Output", icon: Target, color: "#22C55E" },
  { key: "layer", label: "Layers", icon: Layers, color: "#6366F1" },
  { key: "activation", label: "Activations", icon: Zap, color: "#EF4444" },
  { key: "normalization", label: "Normalization", icon: SlidersHorizontal, color: "#8B5CF6" },
  { key: "utility", label: "Utility", icon: Wrench, color: "#64748B" },
];

export const DRAG_BLOCK_TYPE = "application/neuralcanvas-block";

const ESSENTIAL_BLOCK_TYPES = new Set([
  "Input", "Output", "Linear", "Activation", "Flatten", "Dropout", "Softmax",
]);

const FRIENDLY_DESCRIPTIONS: Record<string, string> = {
  Input: "Choose a dataset for training",
  InputSpace: "Upload images, tables, or text",
  Board: "Draw an image with your mouse",
  TextInput: "Where your text data enters the model",
  Output: "Where predictions come out",
  Display: "LCD-style display for predictions",
  Linear: "Connects neurons — the core building block",
  Conv2D: "Finds patterns in images like edges and shapes",
  MaxPool2D: "Shrinks image size by taking the max in 2D windows",
  MaxPool1D: "Shrinks sequence length by taking the max in 1D windows",
  LSTM: "Remembers patterns over time in sequences",
  Attention: "Lets the model focus on what matters most",
  Activation: "Adds non-linearity so the model can learn",
  Dropout: "Prevents over-memorization by randomly dropping neurons",
  Flatten: "Reshapes image data into a list of numbers",
  LayerNorm: "Stabilizes training by normalizing values",
  BatchNorm: "Speeds up training by normalizing across batches",
  Embedding: "Converts categories into meaningful numbers",
  TextEmbedding: "Converts words into meaningful vectors",
  PositionalEncoding: "Tells the model about word order",
  PositionalEmbedding: "Combines word meaning with position info",
  Softmax: "Converts numbers into probabilities",
  Add: "Combines two paths together (residual connection)",
  Concat: "Joins two data streams side by side",
  Augment: "Transforms image data from Input only",
  Model: "Run inference with a trained model",
};

// ---------------------------------------------------------------------------
// PaletteItem — single draggable block card (Banani style)
// ---------------------------------------------------------------------------

interface PaletteItemProps {
  def: BlockDefinition;
  isEssential?: boolean;
}

const PaletteItem = memo(function PaletteItem({ def, isEssential }: PaletteItemProps) {
  const Icon = ICON_MAP[def.icon];
  const [hovered, setHovered] = useState(false);

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(DRAG_BLOCK_TYPE, def.type);
      e.dataTransfer.effectAllowed = "move";
    },
    [def.type],
  );

  const friendlyDesc = FRIENDLY_DESCRIPTIONS[def.type] ?? def.description;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group/item relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-grab select-none transition-all duration-100 hover:bg-gray-50 active:cursor-grabbing active:scale-[0.98]"
    >
      {/* Colored left accent bar */}
      <div
        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full opacity-80"
        style={{ backgroundColor: def.color }}
      />

      {/* Icon */}
      {Icon && (
        <div
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg ml-2"
          style={{ backgroundColor: `${def.color}18` }}
        >
          <Icon size={14} style={{ color: def.color }} />
        </div>
      )}

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-[12px] font-semibold text-black truncate leading-tight">
            {def.label}
          </p>
          {isEssential && (
            <Star className="h-2.5 w-2.5 text-amber-400 fill-amber-400 shrink-0" />
          )}
        </div>
        <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5 font-medium">
          {friendlyDesc}
        </p>
      </div>

      {/* Drag handle */}
      <GripVertical size={12} className="shrink-0 text-gray-300 opacity-0 group-hover/item:opacity-100 transition-opacity" />

      {/* Tooltip on hover — appears to the right */}
      {hovered && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[9999] w-56 p-3.5 rounded-2xl bg-white border border-gray-100 shadow-[0_0px_1px_0_rgba(0,0,0,0.20),0_8px_24px_0_rgba(0,0,0,0.12)] pointer-events-none">
          <p className="text-[12px] font-bold text-black mb-1">{def.label}</p>
          <p className="text-[11px] text-gray-500 leading-relaxed mb-2.5 font-medium">{friendlyDesc}</p>
          {Object.keys(def.defaultParams).length > 0 && (
            <>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5 font-semibold">Defaults</p>
              <div className="space-y-1">
                {Object.entries(def.defaultParams).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[11px]">
                    <span className="text-gray-400 font-mono">{k}</span>
                    <span className="text-gray-600 font-mono font-semibold">{String(v)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Collapsible category section
// ---------------------------------------------------------------------------

interface CategorySectionProps {
  label: string;
  icon: LucideIcon;
  color: string;
  blocks: BlockDefinition[];
  defaultOpen?: boolean;
}

const CategorySection = memo(function CategorySection({
  label, icon: Icon, color, blocks, defaultOpen = true,
}: CategorySectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (blocks.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors duration-100 hover:bg-gray-50 rounded-lg mb-0.5"
      >
        <div className="w-1 h-3.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <Icon size={12} style={{ color }} className="shrink-0" />
        <span className="text-[11px] font-bold text-gray-400 flex-1 select-none uppercase tracking-wide">
          {label}
        </span>
        <span className="text-gray-300">
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
      </button>

      {open && (
        <div className="space-y-0.5 mb-2">
          {blocks.map((def) => (
            <PaletteItem key={def.id} def={def} isEssential={ESSENTIAL_BLOCK_TYPES.has(def.type)} />
          ))}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main palette component — Banani style
// ---------------------------------------------------------------------------

function BlockPaletteInner() {
  const [search, setSearch] = useState("");
  const [showAllBlocks, setShowAllBlocks] = useState(false);
  const allDefs = useMemo(() => getAllBlockDefinitions(), []);

  const { essentials, filteredByCategory, totalResults } = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = q
      ? allDefs.filter(
        (d) =>
          d.label.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          d.category.toLowerCase().includes(q) ||
          (FRIENDLY_DESCRIPTIONS[d.type] ?? "").toLowerCase().includes(q),
      )
      : allDefs;

    const essentials = filtered.filter((d) => ESSENTIAL_BLOCK_TYPES.has(d.type));

    const map = new Map<BlockCategory, BlockDefinition[]>();
    for (const cat of CATEGORIES) map.set(cat.key, []);
    for (const def of filtered) map.get(def.category)?.push(def);

    let count = 0;
    map.forEach((v) => (count += v.length));

    return { essentials, filteredByCategory: map, totalResults: count };
  }, [allDefs, search]);

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">

      {/* ── Search ── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blocks..."
            className="w-full pl-8 pr-3 py-2 text-[12px] font-medium text-black placeholder-gray-300 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:border-[#0066FF]/40 focus:bg-white focus:ring-2 focus:ring-[#0066FF]/10 transition-all duration-150"
          />
        </div>
      </div>

      {/* ── Block list ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        {totalResults === 0 && (
          <p className="text-[11px] text-gray-300 text-center mt-8 font-medium">
            No blocks match &ldquo;{search}&rdquo;
          </p>
        )}

        {search.trim() ? (
          /* Search results grouped by category */
          <div className="mt-1 space-y-1">
            {CATEGORIES.map((cat) => (
              <CategorySection
                key={cat.key}
                label={cat.label}
                icon={cat.icon}
                color={cat.color}
                blocks={filteredByCategory.get(cat.key) ?? []}
                defaultOpen
              />
            ))}
          </div>
        ) : (
          <>
            {/* ── Essentials Section ── */}
            <div className="mt-1">
              {/* Section header */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 mb-0.5">
                <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                <span className="text-[11px] font-bold text-black select-none">Essentials</span>
                <span className="ml-auto text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  Start here
                </span>
              </div>

              {/* Essential blocks */}
              <div className="space-y-0.5">
                {essentials.map((def) => (
                  <PaletteItem key={def.id} def={def} isEssential />
                ))}
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="mx-2 my-3 border-t border-gray-100" />

            {/* ── All Blocks expandable ── */}
            <button
              onClick={() => setShowAllBlocks((s) => !s)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-gray-50 transition-colors duration-100 mb-0.5"
            >
              <Layers className="h-3 w-3 text-gray-400" />
              <span className="text-[11px] font-bold text-gray-500 flex-1 select-none">All Blocks</span>
              <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mr-1">
                {allDefs.length}
              </span>
              <span className="text-gray-300">
                {showAllBlocks ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </span>
            </button>

            {showAllBlocks && (
              <div className="mt-1 space-y-1">
                {CATEGORIES.map((cat) => (
                  <CategorySection
                    key={cat.key}
                    label={cat.label}
                    icon={cat.icon}
                    color={cat.color}
                    blocks={filteredByCategory.get(cat.key) ?? []}
                    defaultOpen
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2.5 border-t border-gray-100 shrink-0">
        <p className="text-[10px] text-gray-300 text-center select-none leading-relaxed font-medium">
          Drag blocks onto the canvas to build your model
        </p>
      </div>
    </div>
  );
}

export const BlockPalette = memo(BlockPaletteInner);