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
import ReactMarkdown from "react-markdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  MousePointer2, Hand, Minus, Plus, Download, ArrowLeft,
  Save, CheckCircle, XCircle, Loader2, Maximize2, Cpu,
  MessageSquare, X, ChevronUp, Check,
  Trash2, Zap
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
  return <div className="w-px h-5 bg-gray-100 mx-0.5 shrink-0" />;
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
  const handleDeploy = useCallback(async () => {
    if (nodes.length === 0) return;
    const defaultName = playgroundName || "Untitled";
    const customName = window.prompt("Enter a name for this deployment:", defaultName);
    if (customName === null) return;

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
  }, [nodes, edges, effectivePlaygroundId, playgroundName]);

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
              <FloatingPanel className="p-1">
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
              </FloatingPanel>
            )}

            <FloatingPanel className="flex items-center p-1 gap-0.5">
              {/* Save */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saveStatus === "saving" || nodes.length === 0}
                className={`flex items-center gap-1.5 px-3 h-8 rounded-xl text-[12px] font-bold transition-all duration-150 select-none ${saveStatus === "saved"
                  ? "bg-green-50 text-green-600"
                  : saveStatus === "error"
                    ? "bg-red-50 text-red-500"
                    : saveStatus === "saving"
                      ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                  }`}
                title="Save"
              >
                {saveStatus === "saving"
                  ? <Loader2 size={13} className="animate-spin" />
                  : saveStatus === "saved"
                    ? <Check size={13} strokeWidth={2.5} />
                    : saveStatus === "error"
                      ? <XCircle size={13} />
                      : <Save size={13} strokeWidth={2} />
                }
                {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Error" : "Save"}
              </button>

              {challengeLevelNumber == null && (
                <>
                  <ToolbarDivider />

                  {/* Export */}
                  <button
                    type="button"
                    onClick={handleExportPackage}
                    disabled={exporting || nodes.length === 0}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-[12px] font-bold bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-all duration-150 select-none"
                    title="Export Python package"
                  >
                    {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} strokeWidth={2} />}
                    {exporting ? "Exporting…" : "Export"}
                  </button>

                  {/* Deploy */}
                  <button
                    type="button"
                    onClick={handleDeploy}
                    disabled={deploying || nodes.length === 0}
                    className={`flex items-center gap-1.5 px-3 h-8 rounded-xl text-[12px] font-bold transition-all duration-150 select-none ${deploying ? "bg-amber-100 text-amber-500" : "bg-gray-50 text-gray-600 hover:text-amber-500 hover:bg-amber-50 disabled:opacity-40"}`}
                    title="Deploy as live API endpoint"
                  >
                    {deploying ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} strokeWidth={2} />}
                    {deploying ? "Deploying…" : "Deploy"}
                  </button>

                  {onDeletePlayground && (
                    <>
                      <ToolbarDivider />
                      {/* Delete */}
                      <button
                        type="button"
                        onClick={onDeletePlayground}
                        disabled={deleting}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-[12px] font-bold bg-gray-50 text-red-500 hover:bg-red-50 transition-all duration-150 select-none disabled:opacity-40"
                        title="Delete Workspace"
                      >
                        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2} />}
                        {deleting ? "Deleting…" : "Delete"}
                      </button>
                    </>
                  )}

                  <ToolbarDivider />

                  {/* Train */}
                  <button
                    type="button"
                    onClick={() => { setInferencePanelOpen(false); setTrainingPanelOpen((o) => !o); }}
                    className={`flex items-center gap-1.5 px-3 h-8 rounded-xl text-[12px] font-bold transition-all duration-150 select-none ${trainingPanelOpen
                      ? "bg-[#0066FF] text-white"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                      }`}
                    title="Open training panel"
                  >
                    <Cpu size={13} strokeWidth={2} />
                    Train
                  </button>

                  {/* Inference */}
                  {effectivePlaygroundId && (
                    <button
                      type="button"
                      onClick={() => { setTrainingPanelOpen(false); setInferencePanelOpen((o) => !o); }}
                      className={`flex items-center gap-1.5 px-3 h-8 rounded-xl text-[12px] font-bold transition-all duration-150 select-none ${inferencePanelOpen
                        ? "bg-[#0066FF] text-white"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                        }`}
                      title="Open inference panel"
                    >
                      <MessageSquare size={13} strokeWidth={2} />
                      Inference
                    </button>
                  )}
                </>
              )}
            </FloatingPanel>
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

          {/* Peep inside overlay */}
          <PeepInsideOverlay />
        </div>
      </PlaygroundIdProvider>
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