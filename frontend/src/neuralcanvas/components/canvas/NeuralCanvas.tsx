"use client";

// ---------------------------------------------------------------------------
// NeuralCanvas — Redesigned to match Banani's exact design language
// Floating white panels, soft shadows, Inter font, clean toolbar layout
// ---------------------------------------------------------------------------

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow, Background, BackgroundVariant, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Connection, type Edge, type Node, type NodeTypes, type EdgeTypes,
  type OnConnect, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { BLOCK_BASE_WIDTH } from "@/neuralcanvas/lib/canvasConstants";
import { BLOCK_REGISTRY, getBlockDefaults, type BlockType } from "@/neuralcanvas/lib/blockRegistry";
import { validateConnection, inferInputParamsFromShape } from "@/neuralcanvas/lib/shapeEngine";
import { ShapeProvider, useShapes } from "./ShapeContext";
import { PredictionProvider } from "./PredictionContext";
import { PlaygroundIdProvider } from "./PlaygroundIdContext";
import { ConnectionWire } from "./ConnectionWire";
import { BlockPalette, DRAG_BLOCK_TYPE } from "./BlockPalette";
import { useUndoRedo } from "@/neuralcanvas/hooks/useUndoRedo";
import { PeepInsideProvider, usePeepInsideContext } from "@/neuralcanvas/components/peep-inside/PeepInsideContext";
import { PeepInsideModal } from "@/neuralcanvas/components/peep-inside/PeepInsideModal";
import { AugmentPreviewModal } from "@/neuralcanvas/components/augment/AugmentPreviewModal";
import { TrainingPanel } from "@/neuralcanvas/components/training/TrainingPanel";
import { InferencePanel } from "@/neuralcanvas/components/inference/InferencePanel";
import { GradientFlowProvider } from "@/neuralcanvas/components/peep-inside/GradientFlowContext";
import { neuralCanvasToGraphSchema, levelGraphToNeuralCanvas, graphsMatchStructurally, computeTopologicalLayers } from "@/lib/levelGraphAdapter";
import type { GraphSchema } from "@/types/graph";
import { createPlayground, updatePlayground, getPlayground } from "@/lib/supabase/playgrounds";
import { upsertPaperProgress } from "@/lib/supabase/paperProgress";
import { insertChatMessage, getChatHistory } from "@/lib/supabase/userHistories";
import { createClient } from "@/lib/supabase/client";
import { getApiBase } from "@/neuralcanvas/lib/trainingApi";
import { exportModelPackage } from "@/neuralcanvas/lib/exportApi";
import { createDeployment, getDocsUrl } from "@/neuralcanvas/lib/deployApi";
import { createShareLink, revokeShareLink } from "@/neuralcanvas/lib/shareApi";
import { DeployNameModal } from "@/components/ui/DeployNameModal";
import ReactMarkdown from "react-markdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  MousePointer2, Hand, Minus, Plus, Download, ArrowLeft,
  Save, CheckCircle, XCircle, Loader2, Maximize2, Cpu,
  MessageSquare, X, ChevronUp, Check,
  Trash2, Zap, Share2, Copy, Link2,
} from "lucide-react";
import {
  InputBlock, InputSpaceBlock, BoardBlock, TextInputBlock, OutputBlock,
  DisplayBlock, LinearBlock, Conv2DBlock, MaxPool2DBlock, MaxPool1DBlock,
  LSTMBlock, AttentionBlock, LayerNormBlock, BatchNormBlock, ActivationBlock,
  DropoutBlock, FlattenBlock, EmbeddingBlock, TextEmbeddingBlock,
  PositionalEncodingBlock, PositionalEmbeddingBlock, SoftmaxBlock,
  AddBlock, ConcatBlock, AugmentBlock, ModelBlock,
} from "@/neuralcanvas/components/blocks";

// ---------------------------------------------------------------------------
// Suggestion context
// ---------------------------------------------------------------------------

const CHALLENGE_TASK_NODE_TYPE = "challengeTask";
const SUGGESTED_PREFIX = "gen-";
const SUGGESTION_BLOCK_HEIGHT = 140;

const SuggestionContext = React.createContext<{
  pendingSuggestionIds: string[] | null;
  onAcceptSuggestion: () => void;
  onDeclineSuggestion: () => void;
} | null>(null);

// ---------------------------------------------------------------------------
// Challenge task node
// ---------------------------------------------------------------------------

function ChallengeTaskNode({ data }: NodeProps<Node<{ task?: string; isPaperLevel?: boolean }>>) {
  const task = data?.task?.trim();
  const isPaper = data?.isPaperLevel === true;
  if (!task) return null;
  return (
    <div
      className="text-black font-medium select-none max-w-[320px] leading-snug bg-white/95 backdrop-blur-sm rounded-2xl px-4 py-3 border border-gray-100 shadow-[0_0px_1px_0_rgba(0,0,0,0.20),0_4px_16px_0_rgba(0,0,0,0.08)]"
      style={{ fontSize: 12, pointerEvents: "none", whiteSpace: isPaper ? "pre-line" : "normal" }}
    >
      {isPaper ? (
        <>
          <span className="text-amber-500 font-bold block mb-1">About this paper</span>
          <span className="text-gray-500 font-medium">{task}</span>
        </>
      ) : (
        <>
          <span className="text-[#0066FF] font-bold">Task:</span>{" "}
          <span className="text-gray-700">{task}</span>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  Input: InputBlock, InputSpace: InputSpaceBlock, Board: BoardBlock,
  TextInput: TextInputBlock, Output: OutputBlock, Display: DisplayBlock,
  Linear: LinearBlock, Conv2D: Conv2DBlock, MaxPool2D: MaxPool2DBlock,
  MaxPool1D: MaxPool1DBlock, LSTM: LSTMBlock, Attention: AttentionBlock,
  LayerNorm: LayerNormBlock, BatchNorm: BatchNormBlock, Activation: ActivationBlock,
  Dropout: DropoutBlock, Flatten: FlattenBlock, Embedding: EmbeddingBlock,
  TextEmbedding: TextEmbeddingBlock, PositionalEncoding: PositionalEncodingBlock,
  PositionalEmbedding: PositionalEmbeddingBlock, Softmax: SoftmaxBlock,
  Add: AddBlock, Concat: ConcatBlock, Augment: AugmentBlock, Model: ModelBlock,
  [CHALLENGE_TASK_NODE_TYPE]: ChallengeTaskNode,
};

const edgeTypes: EdgeTypes = { shape: ConnectionWire };
const defaultEdgeOptions = { type: "shape" as const, animated: false, selectable: true };

// ---------------------------------------------------------------------------
// Initial demo nodes
// ---------------------------------------------------------------------------

const INITIAL_NODE_SPACING = 340;
const INITIAL_NODES: Node[] = [
  { id: "input-1", type: "Input", position: { x: 60, y: 200 }, data: { params: {} } },
  { id: "flatten-1", type: "Flatten", position: { x: 60 + INITIAL_NODE_SPACING, y: 200 }, data: { params: {} } },
  { id: "linear-1", type: "Linear", position: { x: 60 + INITIAL_NODE_SPACING * 2, y: 200 }, data: { params: { in_features: 784, out_features: 128 } } },
  { id: "activation-1", type: "Activation", position: { x: 60 + INITIAL_NODE_SPACING * 3, y: 200 }, data: { params: { activation: "relu" } } },
  { id: "linear-2", type: "Linear", position: { x: 60 + INITIAL_NODE_SPACING * 4, y: 200 }, data: { params: { in_features: 128, out_features: 10 } } },
  { id: "softmax-1", type: "Softmax", position: { x: 60 + INITIAL_NODE_SPACING * 5, y: 200 }, data: { params: {} } },
  { id: "output-1", type: "Output", position: { x: 60 + INITIAL_NODE_SPACING * 6, y: 200 }, data: { params: {} } },
];

const INITIAL_EDGES: Edge[] = [
  { id: "e-1", source: "input-1", target: "flatten-1", type: "shape" },
  { id: "e-2", source: "flatten-1", target: "linear-1", type: "shape" },
  { id: "e-3", source: "linear-1", target: "activation-1", type: "shape" },
  { id: "e-4", source: "activation-1", target: "linear-2", type: "shape" },
  { id: "e-5", source: "linear-2", target: "softmax-1", type: "shape" },
  { id: "e-6", source: "softmax-1", target: "output-1", type: "shape" },
];

function getUniqueNodeId(existingNodes: Node[], blockType: string): string {
  const used = new Set(existingNodes.map((n) => n.id));
  for (let i = 1; i < 100_000; i++) {
    const id = `${blockType}-${i}`;
    if (!used.has(id)) return id;
  }
  return `${blockType}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Banani-style floating panel wrapper
// ---------------------------------------------------------------------------

function FloatingPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white/95 backdrop-blur-xl border border-gray-100 rounded-2xl shadow-[0_0px_1px_0_rgba(0,0,0,0.20),0_8px_24px_0_rgba(0,0,0,0.10)] ${className}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Banani-style toolbar button
// ---------------------------------------------------------------------------

function ToolbarBtn({
  active = false, onClick, title, children, danger = false,
}: {
  active?: boolean;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`
        flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-100 select-none
        ${active
          ? danger
            ? "bg-red-500 text-white"
            : "bg-black text-white"
          : danger
            ? "text-red-400 hover:bg-red-50"
            : "text-black/60 hover:bg-black/5 hover:text-black"
        }
      `}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Divider for toolbar
// ---------------------------------------------------------------------------

function ToolbarDivider() {
  return <div className="h-4 w-[1px] bg-gray-200 rounded-full" />;
}

// ---------------------------------------------------------------------------
// ShareModal — Banani-style share dialog (backed by /api/share)
// ---------------------------------------------------------------------------

function ShareModal({ open, onClose, playgroundId, userId }: {
  open: boolean;
  onClose: () => void;
  playgroundId?: string | null;
  userId?: string | null;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shareUrl = typeof window !== "undefined" && token
    ? `${window.location.origin}/shared/${token}`
    : "";

  useEffect(() => {
    if (!open || !playgroundId || !userId || token) return;
    setCreating(true);
    setError(null);
    createShareLink(playgroundId, userId)
      .then((res) => setToken(res.token))
      .catch((e: Error) => setError(e.message ?? "Failed to create share link"))
      .finally(() => setCreating(false));
  }, [open, playgroundId, userId, token]);

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleRevoke = async () => {
    if (!token || !userId || !window.confirm("Revoke this share link?")) return;
    setRevoking(true);
    try { await revokeShareLink(token, userId); setToken(null); }
    catch (e) { console.error(e); }
    finally { setRevoking(false); }
  };

  const handleClose = () => { setCopied(false); setError(null); onClose(); };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/20 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      {/* Modal — exact Banani dimensions and layout */}
      <div
        className="
          fixed left-[50%] top-[50%] z-[201]
          w-full max-w-sm
          translate-x-[-50%] translate-y-[-50%]
          grid gap-5 overflow-hidden
          rounded-2xl bg-white p-[18px] text-sm shadow-lg
          duration-100
          data-[state=open]:animate-in data-[state=open]:fade-in-0
          data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1/2
          data-[state=open]:slide-in-from-top-[48%]
        "
        data-state="open"
        style={{ pointerEvents: "auto" }}
      >
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="font-semibold text-black">Share</div>
          <div className="text-sm text-black/40">
            Anyone with the link can view and run inference on this playground.
          </div>
        </div>

        <hr className="-mx-[18px] border-black/10" />

        {/* URL display + Copy button */}
        <div className="flex min-w-0 flex-col gap-3">
          {/* URL pill */}
          <div className="flex h-9 items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-3 min-w-0">
            <Link2 size={13} className="shrink-0 text-black/30" />
            {creating ? (
              <span className="flex-1 text-[12px] text-black/30 font-medium truncate">Generating link…</span>
            ) : error ? (
              <span className="flex-1 text-[12px] text-red-400 font-medium truncate">{error}</span>
            ) : shareUrl ? (
              <span className="flex-1 truncate font-mono text-[12px] text-black/50 select-all">{shareUrl}</span>
            ) : (
              <span className="flex-1 text-[12px] text-black/30">Save the playground first to get a link</span>
            )}
          </div>

          {/* Full-width blue Copy link button — exact Banani style */}
          <button
            onClick={handleCopy}
            disabled={!shareUrl || creating}
            className="
              bg-[#0066FF] text-white rounded-lg px-3 py-1.5
              select-none content-center self-stretch
              text-sm font-semibold
              flex w-full items-center justify-center gap-1.5
              hover:bg-blue-700 transition-colors
              disabled:opacity-40
            "
          >
            {creating ? (
              <><Loader2 size={16} className="animate-spin" /> Creating link…</>
            ) : copied ? (
              <><Check size={16} strokeWidth={2.5} /> Copied!</>
            ) : (
              <>
                Copy link
                {/* Banani's link/chain SVG */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="M16.6629 7.33714L15.9558 8.04424M15.9558 13.0863C15.5652 13.4768 15.5652 14.11 15.9558 14.5005C16.3463 14.891 16.9794 14.891 17.37 14.5005L16.6629 13.7934L15.9558 13.0863ZM7.33714 16.6629L8.04424 15.9558M14.5005 17.37C14.891 16.9794 14.891 16.3463 14.5005 15.9558C14.11 15.5652 13.4768 15.5652 13.0863 15.9558L13.7934 16.6629L14.5005 17.37ZM8.04425 10.9137C8.43477 10.5232 8.43477 9.89001 8.04425 9.49948C7.65372 9.10896 7.02056 9.10896 6.63003 9.49948L7.33714 10.2066L8.04425 10.9137ZM9.49948 6.63003C9.10896 7.02056 9.10896 7.65372 9.49948 8.04424C9.89001 8.43477 10.5232 8.43477 10.9137 8.04425L10.2066 7.33714L9.49948 6.63003ZM14.1418 11.2724C14.5324 10.8819 14.5324 10.2487 14.1418 9.85817C13.7513 9.46764 13.1181 9.46764 12.7276 9.85817L13.4347 10.5653L14.1418 11.2724ZM9.85817 12.7276C9.46764 13.1181 9.46764 13.7513 9.85817 14.1418C10.2487 14.5324 10.8819 14.5324 11.2724 14.1418L10.5653 13.4347L9.85817 12.7276ZM16.6629 7.33714L15.9558 8.04424C17.3481 9.43657 17.3481 11.694 15.9558 13.0863L16.6629 13.7934L17.37 14.5005C19.5433 12.3271 19.5433 8.80341 17.37 6.63003L16.6629 7.33714ZM7.33714 16.6629L6.63003 17.37C8.80341 19.5433 12.3271 19.5433 14.5005 17.37L13.7934 16.6629L13.0863 15.9558C11.694 17.3481 9.43657 17.3481 8.04424 15.9558L7.33714 16.6629ZM7.33714 10.2066L6.63003 9.49948C4.45666 11.6729 4.45665 15.1966 6.63003 17.37L7.33714 16.6629L8.04424 15.9558C6.65192 14.5634 6.65192 12.306 8.04425 10.9137L7.33714 10.2066ZM10.2066 7.33714L10.9137 8.04425C12.306 6.65192 14.5634 6.65192 15.9558 8.04424L16.6629 7.33714L17.37 6.63003C15.1966 4.45666 11.6729 4.45666 9.49948 6.63003L10.2066 7.33714ZM13.4347 10.5653L12.7276 9.85817L9.85817 12.7276L10.5653 13.4347L11.2724 14.1418L14.1418 11.2724L13.4347 10.5653Z" fill="currentColor" />
                </svg>
              </>
            )}
          </button>
        </div>

        <hr className="-mx-[18px] border-black/10" />

        {/* Access options — Banani radio style */}
        <div className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-black">View access</div>
          <div className="flex flex-col gap-2">
            {/* Anyone with link option */}
            <div className="rounded-lg bg-gray-50 p-3" style={{ backgroundColor: "color-mix(in srgb, #0066FF 15%, transparent)" }}>
              <div className="flex items-start gap-1.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white border border-black/10 shadow-sm mt-0.5">
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                    <path d="M16 11H10M16 11H14V9C14 7.89543 13.1046 7 12 7C10.8954 7 10 7.89543 10 9V11M16 11V17H8V11H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black/50" />
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-black">Anyone with the link</span>
                  <span className="text-sm text-black/40">Can view the architecture and run inference</span>
                </div>
                {/* Checkmark */}
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="ml-auto shrink-0 text-[#0066FF]">
                  <path d="M6 10.6667L8.83077 14L14 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Revoke */}
        {token && (
          <>
            <hr className="-mx-[18px] border-black/10" />
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="text-left text-sm font-semibold text-black/30 hover:text-red-400 transition-colors disabled:opacity-40"
            >
              {revoking ? "Revoking…" : "Revoke link"}
            </button>
          </>
        )}

        {/* Close X — exact Banani position */}
        <button
          onClick={handleClose}
          className="absolute right-[18px] top-[18px] rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-black/40">
            <path d="M9.9994 10.0005L5 15.0004M9.9994 10.0005L15 15.001M9.9994 10.0005L5 5.0012M9.9994 10.0005L15 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Close</span>
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main canvas inner component
// ---------------------------------------------------------------------------

function CanvasInner({
  initialNodes, initialEdges, playgroundId, playgroundName,
  challengeTask, challengeSolutionGraph, challengeLevelNumber, onChallengeSuccess,
  isPaperLevel, paperLevelNumber, paperStepIndex, paperFocusedNodeId,
  setPlaygroundName, onDeletePlayground, deleting, initialPrompt,
}: {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  playgroundId?: string;
  playgroundName?: string;
  challengeTask?: string | null;
  challengeSolutionGraph?: GraphSchema | null;
  challengeLevelNumber?: number | null;
  onChallengeSuccess?: (levelNumber: number) => void;
  isPaperLevel?: boolean;
  paperLevelNumber?: number | null;
  paperStepIndex?: number | null;
  paperFocusedNodeId?: string | null;
  setPlaygroundName?: (name: string) => void;
  onDeletePlayground?: () => void;
  deleting?: boolean;
  initialPrompt?: string | null;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes ?? INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges ?? INITIAL_EDGES);
  const { shapes, recompute } = useShapes();
  const { takeSnapshot, undo, redo } = useUndoRedo();
  const [canvasTool, setCanvasTool] = useState<"pan" | "select">("pan");
  const [spaceKeyHeld, setSpaceKeyHeld] = useState(false);
  const effectivePanOnDrag = canvasTool === "pan" && !spaceKeyHeld;
  const selectionOnDrag = !effectivePanOnDrag;
  const [trainingPanelOpen, setTrainingPanelOpen] = useState(false);
  const [inferencePanelOpen, setInferencePanelOpen] = useState(false);
  const [userId, setUserId] = useState<string | undefined>();
  const [effectivePlaygroundId, setEffectivePlaygroundId] = useState<string | undefined>(playgroundId);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useReactFlow();
  const suggestionAnimationRef = useRef<{ newNodes: Node[]; newEdges: Edge[]; layers: string[][] } | null>(null);
  const [suggestionAnimationTrigger, setSuggestionAnimationTrigger] = useState<number | null>(null);
  const [pendingSuggestionIds, setPendingSuggestionIds] = useState<string[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitResult, setSubmitResult] = useState<"idle" | "correct" | "wrong">("idle");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackMessages, setFeedbackMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [feedbackChatOpen, setFeedbackChatOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [shareOpen, setShareOpen] = useState(false);
  const router = useRouter();

  // ── Sync playground id ──
  useEffect(() => { setEffectivePlaygroundId(playgroundId); }, [playgroundId]);

  // ── Load chat history ──
  useEffect(() => {
    if (!effectivePlaygroundId) return;
    let cancelled = false;
    getChatHistory(effectivePlaygroundId).then((history) => {
      if (!cancelled) setFeedbackMessages(history);
    }).catch(() => { });
    return () => { cancelled = true; };
  }, [effectivePlaygroundId]);

  // ── Auth ──
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Suggestion animation ──
  useEffect(() => {
    const pending = suggestionAnimationRef.current;
    if (!pending || suggestionAnimationTrigger === null) return;
    let layerIndex = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const scheduleNext = () => {
      if (layerIndex >= pending.layers.length) {
        suggestionAnimationRef.current = null;
        setSuggestionAnimationTrigger(null);
        return;
      }
      const layerIds = new Set<string>(pending.layers[layerIndex]!);
      const placedIds = new Set(pending.layers.slice(0, layerIndex).flat());
      const nodesToAdd = [...layerIds]
        .map((id: string) => pending.newNodes.find((n: Node) => n.id === id))
        .filter((n): n is Node => !!n)
        .map((n) => ({ ...n, data: { ...n.data, animateFromPalette: true } }));
      const edgesToAdd = pending.newEdges
        .filter((e) => layerIds.has(e.target) && placedIds.has(e.source))
        .map((e) => ({ ...e, data: { ...e.data, animateIn: true } }));
      const isFirstLayer = layerIndex === 0;
      setNodes((nds) => {
        const base = isFirstLayer ? nds.filter((n) => !String(n.id).startsWith(SUGGESTED_PREFIX)) : nds;
        return [...base, ...nodesToAdd];
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setEdges((eds) => {
            const base = isFirstLayer ? eds.filter((e) => !String(e.id).startsWith(SUGGESTED_PREFIX)) : eds;
            return [...base, ...edgesToAdd];
          });
        });
      });
      layerIndex++;
      if (layerIndex < pending.layers.length) {
        const t = setTimeout(scheduleNext, 550);
        timeouts.push(t);
      } else {
        suggestionAnimationRef.current = null;
        setSuggestionAnimationTrigger(null);
        const suggestedNodeRefs = pending.newNodes.map((n) => ({ id: n.id }));
        setTimeout(() => {
          try { reactFlowInstance.fitView({ nodes: suggestedNodeRefs, padding: 0.4, duration: 400 }); }
          catch (_) { }
        }, 150);
      }
    };
    const t = setTimeout(scheduleNext, 320);
    timeouts.push(t);
    return () => timeouts.forEach((id) => clearTimeout(id));
  }, [suggestionAnimationTrigger, setNodes, setEdges, reactFlowInstance]);

  // ── Drag-and-drop ──
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const blockType = e.dataTransfer.getData(DRAG_BLOCK_TYPE) as BlockType;
    if (!blockType || !BLOCK_REGISTRY[blockType]) return;
    const bounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!bounds) return;
    const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    takeSnapshot(nodes, edges);
    setNodes((nds) => [...nds, {
      id: getUniqueNodeId(nodes, blockType),
      type: blockType,
      position,
      data: { params: getBlockDefaults(blockType) },
    }]);
  }, [reactFlowInstance, nodes, edges, setNodes, takeSnapshot]);

  // ── Shape propagation ──
  useEffect(() => { recompute(nodes, edges); }, [nodes, edges, recompute]);

  // ── Infer params from shape ──
  useEffect(() => {
    const updates = new Map<string, Record<string, number>>();
    for (const node of nodes) {
      if (node.type === CHALLENGE_TASK_NODE_TYPE) continue;
      const result = shapes.get(node.id);
      const inputShape = result?.inputShape ?? null;
      if (!inputShape?.length) continue;
      const inferred = inferInputParamsFromShape(node.type as string, inputShape);
      if (!inferred) continue;
      const params = (node.data?.params ?? {}) as Record<string, number | string>;
      const needsUpdate = Object.entries(inferred).some(([key, value]) => {
        const cur = params[key];
        const num = typeof cur === "number" ? cur : parseInt(String(cur), 10);
        return !Number.isFinite(num) || num !== value;
      });
      if (needsUpdate) updates.set(node.id, inferred);
    }
    if (!updates.size) return;
    setNodes((nds) => nds.map((n) => {
      const patch = updates.get(n.id);
      if (!patch) return n;
      const params = (n.data?.params ?? {}) as Record<string, number | string>;
      return { ...n, data: { ...n.data, params: { ...params, ...patch } } };
    }));
  }, [shapes, nodes, setNodes]);

  // ── Edge validation ──
  useEffect(() => {
    setEdges((currentEdges) => {
      let changed = false;
      const next = currentEdges.map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        const targetNode = nodes.find((n) => n.id === edge.target);
        if (!sourceNode || !targetNode) return edge;
        const sourceShape = shapes.get(edge.source)?.outputShape ?? null;
        const validation = validateConnection(
          { id: sourceNode.id, type: sourceNode.type ?? "Input", data: { params: (sourceNode.data?.params ?? {}) as Record<string, string | number> } },
          { id: targetNode.id, type: targetNode.type ?? "Input", data: { params: (targetNode.data?.params ?? {}) as Record<string, string | number> } },
          sourceShape,
        );
        const newError = validation.valid ? undefined : (validation.error ?? undefined);
        const prevError = (edge.data?.error as string) || undefined;
        if (prevError === newError) return edge;
        changed = true;
        return { ...edge, data: validation.valid ? {} : { error: validation.error } };
      });
      return changed ? next : currentEdges;
    });
  }, [nodes, shapes, setEdges]);

  // ── Connect ──
  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    if (!sourceNode || !targetNode) return;
    takeSnapshot(nodes, edges);
    const sourceShape = shapes.get(sourceNode.id)?.outputShape ?? null;
    const validation = validateConnection(
      { id: sourceNode.id, type: sourceNode.type ?? "Input", data: { params: (sourceNode.data?.params ?? {}) as Record<string, string | number> } },
      { id: targetNode.id, type: targetNode.type ?? "Input", data: { params: (targetNode.data?.params ?? {}) as Record<string, string | number> } },
      sourceShape,
    );
    setEdges((eds) => addEdge({
      ...connection, id: `e-${Date.now()}`, type: "shape",
      data: validation.valid ? {} : { error: validation.error },
    } as Edge, eds));
  }, [nodes, edges, shapes, setEdges, takeSnapshot]);

  const deleteSelectedEdges = useCallback(() => {
    const selectedEdgeIds = edges.filter((e) => e.selected).map((e) => e.id);
    if (!selectedEdgeIds.length) return false;
    takeSnapshot(nodes, edges);
    const ids = new Set(selectedEdgeIds);
    setEdges((eds) => eds.filter((e) => !ids.has(e.id)));
    return true;
  }, [nodes, edges, setEdges, takeSnapshot]);

  const deleteSelectedNodes = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (!selected.length) return false;
    takeSnapshot(nodes, edges);
    const ids = new Set(selected.map((n) => n.id));
    setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
    setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
    return true;
  }, [nodes, edges, setNodes, setEdges, takeSnapshot]);

  const duplicateSelectedNode = useCallback(() => {
    const selected = nodes.find((n) => n.selected);
    if (!selected) return;
    takeSnapshot(nodes, edges);
    const newId = getUniqueNodeId(nodes, selected.type as string);
    setNodes((nds) => [...nds, {
      ...structuredClone(selected), id: newId,
      position: { x: selected.position.x + 40, y: selected.position.y + 40 },
      selected: false,
    }]);
  }, [nodes, edges, setNodes, takeSnapshot]);

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (isPaperLevel && paperLevelNumber != null && paperStepIndex != null) {
      setSaveStatus("saving");
      const ok = await upsertPaperProgress(paperLevelNumber, paperStepIndex);
      setSaveStatus(ok ? "saved" : "error");
      if (ok) setTimeout(() => setSaveStatus("idle"), 2000);
      return;
    }
    if (!nodes.length) return;
    setSaveStatus("saving");
    try {
      const row = effectivePlaygroundId ? await getPlayground(effectivePlaygroundId) : null;
      const metadata = row
        ? { name: playgroundName?.trim() || row.name, created_at: (row.graph_json as { metadata?: { created_at?: string } } | undefined)?.metadata?.created_at }
        : { name: playgroundName?.trim() || "Untitled" };
      const graph = neuralCanvasToGraphSchema(nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE), edges, metadata);
      if (effectivePlaygroundId) {
        const ok = await updatePlayground(effectivePlaygroundId, graph, metadata.name);
        setSaveStatus(ok ? "saved" : "error");
        if (ok) setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        const result = await createPlayground(graph);
        if (result) {
          setSaveStatus("saved");
          setEffectivePlaygroundId(result.id);
          router.replace(`/playground/${result.id}`);
          setTimeout(() => setSaveStatus("idle"), 1500);
        } else setSaveStatus("error");
      }
    } catch { setSaveStatus("error"); }
  }, [nodes, edges, effectivePlaygroundId, playgroundName, router, isPaperLevel, paperLevelNumber, paperStepIndex]);

  // ── Export ──
  const [exporting, setExporting] = useState(false);
  const handleExportPackage = useCallback(async () => {
    if (!nodes.length) return;
    setExporting(true);
    try {
      const graph = neuralCanvasToGraphSchema(nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE), edges, { name: playgroundName || "Untitled" });
      await exportModelPackage({ graph, playground_id: effectivePlaygroundId ?? undefined });
    } catch (e) { console.error("Export failed:", e); }
    finally { setExporting(false); }
  }, [nodes, edges, effectivePlaygroundId, playgroundName]);

  // ── Submit challenge ──
  const handleSubmitChallenge = useCallback(() => {
    if (!challengeSolutionGraph) return;
    const currentGraph = neuralCanvasToGraphSchema(nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE), edges, { name: "", created_at: "" });
    const match = graphsMatchStructurally(currentGraph, challengeSolutionGraph);
    setSubmitResult(match ? "correct" : "wrong");
    if (match && challengeLevelNumber != null && onChallengeSuccess) onChallengeSuccess(challengeLevelNumber);
    else if (match) setTimeout(() => setSubmitResult("idle"), 3000);
  }, [nodes, edges, challengeSolutionGraph, challengeLevelNumber, onChallengeSuccess]);

  useEffect(() => { if (submitResult === "wrong") setSubmitResult("idle"); }, [nodes, edges]);

  // ── Feedback chat ──
  const handleFeedbackSend = useCallback(async (userMessage: string) => {
    if (!userMessage.trim()) return;
    const trimmed = userMessage.trim();
    const newMessages: { role: "user" | "assistant"; content: string }[] = [...feedbackMessages, { role: "user", content: trimmed }];
    setFeedbackMessages(newMessages);
    if (effectivePlaygroundId) insertChatMessage(effectivePlaygroundId, "user", trimmed).catch(() => { });
    setFeedbackLoading(true);
    try {
      const row = effectivePlaygroundId ? await getPlayground(effectivePlaygroundId) : null;
      const graph = neuralCanvasToGraphSchema(nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE), edges, row ? { name: row.name } : undefined);
      const base = getApiBase();
      const body: { graph: GraphSchema; messages: typeof newMessages; paper_context?: string } = { graph, messages: newMessages };
      if (challengeTask?.trim()) body.paper_context = challengeTask.trim();
      const res = await fetch(`${base}/api/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      const assistantContent = !res.ok ? (data.detail ?? res.statusText ?? "Request failed") : (data.feedback ?? "No response.");
      setFeedbackMessages((m) => [...m, { role: "assistant", content: assistantContent }]);
      if (effectivePlaygroundId) insertChatMessage(effectivePlaygroundId, "assistant", assistantContent).catch(() => { });
      const suggested = data.suggested_graph as GraphSchema | undefined;
      if (suggested?.nodes?.length && suggested?.edges) {
        let suggestedNodes: Node[], suggestedEdges: Edge[];
        try { const converted = levelGraphToNeuralCanvas(suggested); suggestedNodes = converted.nodes; suggestedEdges = converted.edges; }
        catch { suggestedNodes = []; suggestedEdges = []; }
        if (suggestedNodes.length > 0) {
          const batchId = Date.now().toString(36);
          const pref = `${SUGGESTED_PREFIX}${batchId}-`;
          const maxY = nodes.length === 0 ? 400 : Math.max(...nodes.map((n) => n.position.y + SUGGESTION_BLOCK_HEIGHT)) + 80;
          const minSuggestedY = Math.min(...suggestedNodes.map((n) => n.position.y));
          const offsetY = maxY - minSuggestedY;
          const idMap = new Map<string, string>();
          suggestedNodes.forEach((n) => idMap.set(n.id, pref + n.id));
          const newNodes = suggestedNodes.map((n) => ({ ...n, id: idMap.get(n.id) ?? n.id, position: { x: n.position.x, y: n.position.y + offsetY } }));
          const newEdges = suggestedEdges.map((e) => ({ ...e, id: pref + (e.id ?? `e-${e.source}-${e.target}`), source: idMap.get(e.source) ?? e.source, target: idMap.get(e.target) ?? e.target }));
          const suggestedIds = newNodes.map((n) => n.id);
          const layers = computeTopologicalLayers(suggestedIds, newEdges.map((e) => ({ source: e.source, target: e.target })));
          takeSnapshot(nodes, edges);
          setPendingSuggestionIds(suggestedIds);
          suggestionAnimationRef.current = { newNodes, newEdges, layers };
          setSuggestionAnimationTrigger(Date.now());
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to get feedback.";
      setFeedbackMessages((m) => [...m, { role: "assistant", content: msg }]);
      if (effectivePlaygroundId) insertChatMessage(effectivePlaygroundId, "assistant", msg).catch(() => { });
    } finally { setFeedbackLoading(false); }
  }, [nodes, edges, effectivePlaygroundId, feedbackMessages, challengeTask]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); if (deleteSelectedEdges()) return; deleteSelectedNodes(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) { const s = redo(nodes, edges); if (s) { setNodes(s.nodes); setEdges(s.edges); } }
        else { const s = undo(nodes, edges); if (s) { setNodes(s.nodes); setEdges(s.edges); } }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") { e.preventDefault(); duplicateSelectedNode(); return; }
      if (e.key === " " && e.type === "keydown") { e.preventDefault(); setSpaceKeyHeld(true); }
    };
    const keyUp = (e: KeyboardEvent) => { if (e.key === " ") setSpaceKeyHeld(false); };
    document.addEventListener("keydown", handler);
    document.addEventListener("keyup", keyUp);
    return () => { document.removeEventListener("keydown", handler); document.removeEventListener("keyup", keyUp); };
  }, [nodes, edges, setNodes, setEdges, deleteSelectedEdges, deleteSelectedNodes, duplicateSelectedNode, undo, redo]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      if (changes.some((c) => c.type === "position" && c.dragging)) takeSnapshot(nodes, edges);
      onNodesChange(changes);
    },
    [onNodesChange, nodes, edges, takeSnapshot],
  );

  const minimapNodeColor = useCallback((node: Node) => BLOCK_REGISTRY[node.type as BlockType]?.color ?? "#6366f1", []);

  const onAcceptSuggestion = useCallback(() => setPendingSuggestionIds(null), []);
  const onDeclineSuggestion = useCallback(() => {
    if (!pendingSuggestionIds?.length) return;
    const idSet = new Set(pendingSuggestionIds);
    takeSnapshot(nodes, edges);
    setNodes((nds) => nds.filter((n) => !idSet.has(n.id)));
    setEdges((eds) => eds.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)));
    setPendingSuggestionIds(null);
  }, [pendingSuggestionIds, nodes, edges, takeSnapshot, setNodes, setEdges]);

  // Auto-send initial prompt if provided
  const initialPromptSent = useRef(false);
  useEffect(() => {
    if (initialPrompt && !isPaperLevel && !initialPromptSent.current) {
      initialPromptSent.current = true;
      setFeedbackChatOpen(true);
      setTimeout(() => {
        handleFeedbackSend(initialPrompt);
      }, 500);
    }
  }, [initialPrompt, isPaperLevel, handleFeedbackSend]);

  const suggestionContextValue = useMemo(() => ({
    pendingSuggestionIds, onAcceptSuggestion, onDeclineSuggestion,
  }), [pendingSuggestionIds, onAcceptSuggestion, onDeclineSuggestion]);

  const fitViewOptions = isPaperLevel ? { padding: 0.65, minZoom: 0.2, maxZoom: 0.85 } : { padding: 0.3 };

  useEffect(() => {
    if (!isPaperLevel || !paperFocusedNodeId) return;
    const opts = { padding: 0.65, minZoom: 0.2, maxZoom: 0.85, duration: 150 };
    const t = setTimeout(() => {
      try { reactFlowInstance.fitView({ ...opts, nodes: [{ id: paperFocusedNodeId }] }); }
      catch { reactFlowInstance.fitView(opts); }
    }, 120);
    return () => clearTimeout(t);
  }, [isPaperLevel, paperFocusedNodeId, reactFlowInstance]);

  const defaultViewport = isPaperLevel ? undefined : { x: 0, y: 0, zoom: 0.72 };
  const shouldFitView = isPaperLevel || nodes.length > 1;

  // ── Zoom controls ──
  const handleZoomIn = useCallback(() => {
    reactFlowInstance.zoomIn({ duration: 200 });
    setTimeout(() => setZoomLevel(Math.round(reactFlowInstance.getZoom() * 100)), 220);
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    reactFlowInstance.zoomOut({ duration: 200 });
    setTimeout(() => setZoomLevel(Math.round(reactFlowInstance.getZoom() * 100)), 220);
  }, [reactFlowInstance]);

  const handleFitView = useCallback(() => {
    reactFlowInstance.fitView({ padding: 0.3, duration: 300 });
    setTimeout(() => setZoomLevel(Math.round(reactFlowInstance.getZoom() * 100)), 320);
  }, [reactFlowInstance]);

  // ── Deploy model as API ──
  const [deploying, setDeploying] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployDefaultName, setDeployDefaultName] = useState("");

  const handleDeploy = useCallback(() => {
    if (nodes.length === 0) return;
    setDeployDefaultName(playgroundName || "Untitled");
    setDeployModalOpen(true);
  }, [nodes, playgroundName]);

  const handleDeployConfirm = useCallback(async (customName: string) => {
    setDeployModalOpen(false);
    setDeploying(true);
    try {
      const graph = neuralCanvasToGraphSchema(
        nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE),
        edges,
        { name: customName }
      );
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;

      const result = await createDeployment({
        graph,
        playground_id: effectivePlaygroundId ?? undefined,
        name: customName,
        user_id: userId,
      });

      const docsUrl = getDocsUrl(result.id);
      window.open(docsUrl, "_blank");
    } catch (e) {
      console.error("Deploy failed:", e);
    } finally {
      setDeploying(false);
    }
  }, [nodes, edges, effectivePlaygroundId]);

  return (
    <SuggestionContext.Provider value={suggestionContextValue}>
      <PlaygroundIdProvider playgroundId={effectivePlaygroundId}>
        <div className="relative w-full h-full overflow-hidden bg-[#F8F9FB]">

          {/* ═══════════════════════════════════════════════════
          CANVAS
      ═══════════════════════════════════════════════════ */}
          <div
            ref={reactFlowWrapper}
            className="absolute inset-0 z-0"
            style={{ cursor: effectivePanOnDrag ? "grab" : "default" }}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              panOnDrag={effectivePanOnDrag}
              selectionOnDrag={selectionOnDrag}
              defaultViewport={defaultViewport}
              fitView={shouldFitView}
              fitViewOptions={fitViewOptions}
              onInit={isPaperLevel ? (instance) => {
                window.setTimeout(() => {
                  const opts = { padding: 0.65, minZoom: 0.2, maxZoom: 0.85, duration: 150 };
                  if (paperFocusedNodeId) instance.fitView({ ...opts, nodes: [{ id: paperFocusedNodeId }] });
                  else instance.fitView(opts);
                }, 80);
              } : (instance) => {
                setTimeout(() => setZoomLevel(Math.round(instance.getZoom() * 100)), 100);
              }}
              onMoveEnd={() => setZoomLevel(Math.round(reactFlowInstance.getZoom() * 100))}
              minZoom={isPaperLevel ? 0.2 : 0.15}
              maxZoom={isPaperLevel ? 0.85 : 2.5}
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={null}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={24}
                size={1}
                color="#000"
                className="opacity-[0.06]"
              />
              <MiniMap
                nodeColor={minimapNodeColor}
                maskColor="rgba(248,249,251,0.85)"
                className="!bg-white/90 !backdrop-blur-md !border-gray-100 !rounded-2xl !shadow-[0_0px_1px_0_rgba(0,0,0,0.15),0_4px_16px_0_rgba(0,0,0,0.08)] overflow-hidden"
                pannable
                zoomable
                position="bottom-right"
                style={{ marginBottom: "20px", marginRight: "20px", border: "1px solid #f3f4f6" }}
              />
            </ReactFlow>
          </div>

          {/* ═══════════════════════════════════════════════════
          LEFT SIDEBAR — Banani-style white floating panel
      ═══════════════════════════════════════════════════ */}
          <div className="absolute inset-y-3 left-3 z-10 flex w-[260px] flex-col rounded-3xl bg-white/97 backdrop-blur-xl overflow-hidden shadow-[0_0px_1px_0_rgba(0,0,0,0.20),0_8px_32px_0_rgba(0,0,0,0.10)] border border-gray-100/80">
            {/* Sidebar header */}
            <div className="flex h-[52px] items-center gap-2 px-3 border-b border-gray-100 shrink-0">
              <button
                onClick={() => window.location.href = "/"}
                className="flex items-center justify-center w-8 h-8 rounded-xl hover:bg-gray-50 text-gray-400 hover:text-gray-700 transition-all duration-150"
                title="Go home"
              >
                <ArrowLeft size={16} strokeWidth={2.5} />
              </button>
              <div className="flex-1 min-w-0 px-1">
                {setPlaygroundName ? (
                  <input
                    type="text"
                    value={playgroundName ?? ""}
                    onChange={(e) => setPlaygroundName(e.target.value)}
                    placeholder="Untitled Project"
                    className="w-full bg-transparent text-[13px] font-bold text-black placeholder-gray-400 outline-none truncate tracking-tight"
                  />
                ) : (
                  <p className="text-[13px] font-bold text-black truncate tracking-tight">
                    {playgroundName || "Untitled Project"}
                  </p>
                )}
              </div>
              <ThemeToggle />
            </div>

            {/* Block palette */}
            <div className="flex-1 overflow-hidden min-h-0">
              <BlockPalette />
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════
          TOP CENTER TOOLBAR — Banani floating toolbar
      ═══════════════════════════════════════════════════ */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30">
            <FloatingPanel className="flex items-center p-1 gap-0.5">
              {/* Select tool */}
              <ToolbarBtn
                active={canvasTool === "select"}
                onClick={() => setCanvasTool("select")}
                title="Selection Tool"
              >
                <MousePointer2 size={15} strokeWidth={2.5} />
              </ToolbarBtn>

              {/* Pan tool */}
              <ToolbarBtn
                active={canvasTool === "pan"}
                onClick={() => setCanvasTool("pan")}
                title="Pan Tool"
              >
                <Hand size={15} strokeWidth={2.5} />
              </ToolbarBtn>

              <ToolbarDivider />

              {/* Zoom out */}
              <ToolbarBtn onClick={handleZoomOut} title="Zoom Out">
                <Minus size={14} strokeWidth={2.5} />
              </ToolbarBtn>

              {/* Zoom level */}
              <button
                onClick={handleFitView}
                className="flex items-center justify-center text-[12px] font-bold text-black/60 hover:text-black px-2 h-8 rounded-xl hover:bg-black/5 transition-all min-w-[52px] select-none"
                title="Fit to screen"
              >
                {zoomLevel}%
              </button>

              {/* Zoom in */}
              <ToolbarBtn onClick={handleZoomIn} title="Zoom In">
                <Plus size={14} strokeWidth={2.5} />
              </ToolbarBtn>

              <ToolbarDivider />

              {/* Fit view */}
              <ToolbarBtn onClick={handleFitView} title="Fit to screen">
                <Maximize2 size={14} strokeWidth={2.5} />
              </ToolbarBtn>
            </FloatingPanel>
          </div>

          {/* ═══════════════════════════════════════════════════
          TOP RIGHT TOOLBAR — Save / Export / Train
      ═══════════════════════════════════════════════════ */}
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
            {/* Challenge submit */}
            {challengeSolutionGraph && !isPaperLevel && (
              <div className="touch-pan-y-only shadow-[0_0px_1px_0_rgba(0,0,0,0.20),0_4px_16px_0_rgba(0,0,0,0.08)] rounded-2xl bg-white p-1.5">
                <button
                  type="button"
                  onClick={handleSubmitChallenge}
                  disabled={nodes.filter((n) => n.type !== CHALLENGE_TASK_NODE_TYPE).length === 0}
                  className={`flex items-center gap-1.5 px-3 h-8 rounded-xl text-[12px] font-bold transition-all duration-150 select-none ${submitResult === "correct"
                    ? "bg-green-500 text-white"
                    : submitResult === "wrong"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                    }`}
                >
                  {submitResult === "correct" ? <Check size={13} strokeWidth={2.5} /> : <CheckCircle size={13} strokeWidth={2} />}
                  {submitResult === "correct" ? "Correct!" : submitResult === "wrong" ? "Not quite" : "Submit"}
                </button>
              </div>
            )}

            <div className="touch-pan-y-only shadow-[0_0px_1px_0_rgba(0,0,0,0.20),0_8px_24px_0_rgba(0,0,0,0.10)] rounded-2xl bg-white p-1.5">
              <div className="relative flex items-center gap-1.5">

                {/* Save */}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveStatus === "saving" || nodes.length === 0}
                  className={`
                    rounded-lg py-1.5 select-none content-center self-stretch
                    text-sm font-semibold flex h-8 items-center px-2.5 gap-1.5
                    transition-all duration-150
                    ${saveStatus === "saved" ? "bg-green-50 text-green-600"
                      : saveStatus === "error" ? "bg-red-50 text-red-500"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"}
                  `}
                  title="Save"
                >
                  {saveStatus === "saving" ? <Loader2 size={14} className="animate-spin" />
                    : saveStatus === "saved" ? <Check size={14} strokeWidth={2.5} />
                      : saveStatus === "error" ? <XCircle size={14} />
                        : <Save size={14} strokeWidth={2} />}
                  {saveStatus === "saving" ? "Saving…"
                    : saveStatus === "saved" ? "Saved"
                      : saveStatus === "error" ? "Error"
                        : "Save"}
                </button>

                {challengeLevelNumber == null && (
                  <>
                    {/* Export */}
                    <button
                      type="button"
                      onClick={handleExportPackage}
                      disabled={exporting || nodes.length === 0}
                      className="rounded-lg px-2.5 py-1.5 select-none content-center self-stretch text-sm font-semibold h-8 flex items-center gap-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-all"
                      title="Export Python package"
                    >
                      {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={2} />}
                      Export
                    </button>

                    {/* Deploy */}
                    <button
                      type="button"
                      onClick={handleDeploy}
                      disabled={deploying || nodes.length === 0}
                      className={`
                        rounded-lg px-2.5 py-1.5 select-none content-center self-stretch
                        text-sm font-semibold h-8 flex items-center gap-1.5
                        transition-all disabled:opacity-40
                        ${deploying ? "bg-amber-100 text-amber-500" : "bg-gray-100 text-gray-600 hover:text-amber-500 hover:bg-amber-50"}
                      `}
                      title="Deploy as live API"
                    >
                      {deploying ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} strokeWidth={2} />}
                      {deploying ? "Deploying…" : "Deploy"}
                    </button>

                    {onDeletePlayground && (
                      <button
                        type="button"
                        onClick={onDeletePlayground}
                        disabled={deleting}
                        className="rounded-lg px-2 py-1.5 select-none content-center self-stretch text-sm font-semibold h-8 flex items-center gap-1.5 text-red-400 hover:bg-red-50 transition-all disabled:opacity-40"
                        title="Delete workspace"
                      >
                        {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={2} />}
                      </button>
                    )}

                    {/* Train — Banani play triangle icon */}
                    <button
                      type="button"
                      onClick={() => { setInferencePanelOpen(false); setTrainingPanelOpen((o) => !o); }}
                      className={`
                        rounded-lg py-1.5 select-none content-center self-stretch
                        text-sm font-semibold flex h-8 items-center px-2 gap-1
                        transition-all
                        ${trainingPanelOpen ? "bg-gray-200 text-gray-800" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}
                      `}
                      title="Open training panel"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                        <path d="M7 9.54722V14.4557C7 16.4167 7 17.3972 7.40831 17.9339C7.76395 18.4013 8.30709 18.6888 8.89362 18.72C9.567 18.7559 10.3778 18.2046 11.9994 17.1019L15.6086 14.6476C16.913 13.7607 17.5652 13.3172 17.7935 12.7608C17.9932 12.2743 17.9932 11.7287 17.7935 11.2421C17.5652 10.6858 16.913 10.2423 15.6086 9.3553L11.9994 6.90106C10.3778 5.79837 9.567 5.24703 8.89362 5.28289C8.30709 5.31414 7.76395 5.60162 7.40831 6.06907C7 6.60573 7 7.58623 7 9.54722Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>

                    {/* Inference */}
                    {effectivePlaygroundId && (
                      <button
                        type="button"
                        onClick={() => { setTrainingPanelOpen(false); setInferencePanelOpen((o) => !o); }}
                        className={`
                          rounded-lg px-2.5 py-1.5 select-none content-center self-stretch
                          text-sm font-semibold h-8 flex items-center gap-1.5
                          transition-all
                          ${inferencePanelOpen ? "bg-gray-200 text-gray-800" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}
                        `}
                        title="Open inference panel"
                      >
                        <MessageSquare size={14} strokeWidth={2} />
                        Inference
                      </button>
                    )}

                    {/* Share — PRIMARY blue, exact Banani */}
                    <button
                      type="button"
                      onClick={() => setShareOpen(true)}
                      disabled={!effectivePlaygroundId}
                      className="bg-[#0066FF] text-white rounded-lg px-3 py-1.5 select-none content-center self-stretch text-sm font-semibold flex h-8 items-center gap-1 pr-2 hover:bg-blue-700 disabled:opacity-40 transition-colors"
                      title="Share playground"
                    >
                      Share
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                        <path d="M5 14V16C5 17.6569 6.34315 19 8 19H16C17.6569 19 19 17.6569 19 16V14M11.9995 12V5M11.9995 5L9 8M11.9995 5L15 8.00048" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Training & Inference Panels */}
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 w-fit">
            <TrainingPanel
              open={trainingPanelOpen}
              onClose={() => setTrainingPanelOpen(false)}
              nodes={nodes}
              edges={edges}
              compact
              playgroundId={effectivePlaygroundId}
              userId={userId}
              onPlaygroundCreated={setEffectivePlaygroundId}
            />
            {effectivePlaygroundId && (
              <InferencePanel
                open={inferencePanelOpen}
                onClose={() => setInferencePanelOpen(false)}
                playgroundId={effectivePlaygroundId}
              />
            )}
          </div>

          {/* ═══════════════════════════════════════════════════
          BOTTOM CHAT — Banani-style floating prompt bar
      ═══════════════════════════════════════════════════ */}
          {!isPaperLevel && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
              <ChatBar
                onSend={handleFeedbackSend}
                loading={feedbackLoading}
                disabled={false}
                messages={feedbackMessages}
                open={feedbackChatOpen}
                onOpen={() => setFeedbackChatOpen(true)}
                onClose={() => setFeedbackChatOpen(false)}
              />
            </div>
          )}

          {/* Share Modal */}
          <ShareModal
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            playgroundId={effectivePlaygroundId}
            userId={userId}
          />

          {/* Peep inside overlay */}
          <PeepInsideOverlay />
        </div>
      </PlaygroundIdProvider>

      {/* Deploy name modal */}
      <DeployNameModal
        open={deployModalOpen}
        defaultName={deployDefaultName}
        onConfirm={handleDeployConfirm}
        onClose={() => setDeployModalOpen(false)}
      />
    </SuggestionContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// ChatBar — Banani-style floating prompt input
// ---------------------------------------------------------------------------

function ChatBar({
  onSend, loading, disabled, messages, open, onOpen, onClose,
}: {
  onSend: (text: string) => void;
  loading: boolean;
  disabled: boolean;
  messages: { role: "user" | "assistant"; content: string }[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const suggestionCtx = React.useContext(SuggestionContext);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading || disabled) return;
    onSend(text);
    setInput("");
    if (!open) onOpen();
  }, [input, loading, disabled, onSend, open, onOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  return (
    <div className="flex flex-col rounded-3xl bg-white/97 backdrop-blur-xl shadow-[0_0px_1px_0_rgba(0,0,0,0.25),0_8px_32px_0_rgba(0,0,0,0.12)] border border-gray-100/80 overflow-hidden w-[500px] max-w-[90vw]">

      {/* Message history */}
      {open && messages.length > 0 && (
        <div className="overflow-y-auto px-4 py-3 space-y-3 border-b border-gray-100 max-h-[280px] scrollbar-hide">
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 text-[12px] text-gray-400 font-semibold">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[95%] px-3.5 py-2.5 rounded-2xl bg-gray-50 border border-gray-100 text-[12px] text-gray-800 leading-relaxed font-medium">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-2">{children}</ol>,
                      code: ({ children }) => <code className="px-1.5 py-0.5 rounded-md bg-gray-200/60 text-[11px] font-mono">{children}</code>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            )
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="px-3 py-2 text-[11px] text-gray-400 font-semibold animate-pulse flex items-center gap-2">
                <Loader2 size={11} className="animate-spin" />
                Thinking…
              </div>
            </div>
          )}

          {/* Suggestion accept/decline */}
          {suggestionCtx?.pendingSuggestionIds?.length && (
            <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-2xl bg-[#E8F2FF] border border-[#0066FF]/15">
              <span className="text-[11px] font-bold text-[#0066FF] flex items-center gap-2">
                Architecture suggestion ready
              </span>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" onClick={suggestionCtx.onAcceptSuggestion} className="rounded-xl bg-[#0066FF] px-3 py-1 text-[11px] font-bold text-white hover:bg-blue-700 transition-colors">Accept</button>
                <button type="button" onClick={suggestionCtx.onDeclineSuggestion} className="rounded-xl bg-white border border-gray-200 px-3 py-1 text-[11px] font-bold text-gray-600 hover:bg-gray-50 transition-colors">Reject</button>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1 p-1.5">
        {/* Toggle history */}
        <button
          type="button"
          onClick={() => open ? onClose() : onOpen()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-all duration-150"
          title={open ? "Close chat" : "View chat history"}
        >
          {open
            ? <ChevronUp size={16} strokeWidth={2.5} />
            : <MessageSquare size={15} strokeWidth={2} />
          }
        </button>

        {/* Input */}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || disabled}
          placeholder="Ask for help or describe what to build…"
          rows={1}
          className="flex-1 resize-none bg-transparent py-2 px-1 text-[13px] font-medium text-black placeholder-gray-300 focus:outline-none disabled:opacity-50 scrollbar-hide leading-snug"
          style={{ height: "36px" }}
        />

        {/* Send */}
        <button
          type="submit"
          disabled={!input.trim() || loading || disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-black text-white transition-all duration-150 disabled:bg-gray-100 disabled:text-gray-300 hover:bg-gray-800 active:scale-95"
          title="Send"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 20V8M12 8L8 12M12 8L16 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PeepInsideOverlay
// ---------------------------------------------------------------------------

function PeepInsideOverlay() {
  const { target, close } = usePeepInsideContext();
  const { setNodes, getNodes, getEdges } = useReactFlow();
  if (!target) return null;
  if (target.blockType === "Augment") {
    const color = BLOCK_REGISTRY.Augment?.color ?? "#EA580C";
    const nodes = getNodes();
    const edges = typeof getEdges === "function" ? getEdges() : [];
    const edgeIntoAugment = edges.find((e) => e.target === target.blockId);
    const sourceNode = edgeIntoAugment ? nodes.find((n) => n.id === edgeIntoAugment.source) : null;
    const inputNode = sourceNode?.type === "Input" ? sourceNode : nodes.find((n) => n.type === "Input");
    const raw = (inputNode?.data?.params as Record<string, unknown> | undefined)?.dataset_id;
    const datasetIdStr = typeof raw === "string" && raw.trim() && raw !== "__custom__" ? raw.trim().toLowerCase() : "mnist";
    return (
      <AugmentPreviewModal
        open onClose={close} blockId={target.blockId}
        initialAugmentations={(target.params?.augmentations as string) ?? "[]"}
        datasetId={datasetIdStr} anchorX={target.anchorX} anchorY={target.anchorY} color={color}
        onSave={(augmentationsJson) => {
          setNodes((nds) => nds.map((n) => n.id === target.blockId
            ? { ...n, data: { ...n.data, params: { ...(n.data?.params as Record<string, unknown>), augmentations: augmentationsJson } } }
            : n
          ));
        }}
      />
    );
  }
  return (
    <PeepInsideModal
      blockId={target.blockId} blockType={target.blockType}
      anchorX={target.anchorX} anchorY={target.anchorY}
      activationType={target.activationType} params={target.params} onClose={close}
    />
  );
}

// ---------------------------------------------------------------------------
// Exported wrapper
// ---------------------------------------------------------------------------

const CHALLENGE_TASK_NODE_ID = "challenge-task";

export interface NeuralCanvasProps {
  initialNodes?: Node[];
  initialEdges?: Edge[];
  playgroundId?: string;
  playgroundName?: string;
  challengeTask?: string | null;
  isPaperLevel?: boolean;
  challengeSolutionGraph?: GraphSchema | null;
  challengeLevelNumber?: number | null;
  onChallengeSuccess?: (levelNumber: number) => void;
  paperLevelNumber?: number | null;
  paperStepIndex?: number | null;
  paperFocusedNodeId?: string | null;
  setPlaygroundName?: (name: string) => void;
  onDeletePlayground?: () => void;
  deleting?: boolean;
  initialPrompt?: string | null;
}

export default function NeuralCanvas({
  initialNodes, initialEdges, playgroundId, playgroundName,
  challengeTask, isPaperLevel = false, challengeSolutionGraph,
  challengeLevelNumber, onChallengeSuccess,
  paperLevelNumber = null, paperStepIndex = null, paperFocusedNodeId = null,
  setPlaygroundName, onDeletePlayground, deleting, initialPrompt,
}: NeuralCanvasProps = {}) {
  const effectiveInitialNodes = useMemo(() => {
    const base = initialNodes ?? INITIAL_NODES;
    if (isPaperLevel || !challengeTask?.trim()) return base;
    const taskNode: Node = {
      id: CHALLENGE_TASK_NODE_ID,
      type: CHALLENGE_TASK_NODE_TYPE,
      position: { x: 24, y: 24 },
      data: { task: challengeTask.trim(), isPaperLevel: false },
      draggable: false, selectable: false, connectable: false,
    };
    return [taskNode, ...base];
  }, [initialNodes, challengeTask, isPaperLevel]);

  return (
    <ReactFlowProvider>
      <ShapeProvider>
        <PredictionProvider>
          <PeepInsideProvider>
            <GradientFlowProvider>
              <div className="w-full h-full min-h-0">
                <CanvasInner
                  initialNodes={effectiveInitialNodes}
                  initialEdges={initialEdges}
                  playgroundId={playgroundId}
                  playgroundName={playgroundName}
                  challengeTask={challengeTask}
                  challengeSolutionGraph={challengeSolutionGraph}
                  challengeLevelNumber={challengeLevelNumber}
                  onChallengeSuccess={onChallengeSuccess}
                  isPaperLevel={isPaperLevel}
                  paperLevelNumber={paperLevelNumber ?? undefined}
                  paperStepIndex={paperStepIndex ?? undefined}
                  paperFocusedNodeId={paperFocusedNodeId ?? undefined}
                  setPlaygroundName={setPlaygroundName}
                  onDeletePlayground={onDeletePlayground}
                  deleting={deleting}
                  initialPrompt={initialPrompt}
                />
              </div>
            </GradientFlowProvider>
          </PeepInsideProvider>
        </PredictionProvider>
      </ShapeProvider>
    </ReactFlowProvider>
  );
}