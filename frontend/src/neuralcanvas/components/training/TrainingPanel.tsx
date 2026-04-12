"use client";

// ---------------------------------------------------------------------------
// TrainingPanel — v2: cleaner, friendlier, with beginner-friendly labels
// ---------------------------------------------------------------------------

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useDragControls } from "framer-motion";
import type { Node, Edge } from "@xyflow/react";
import {
  serializeGraphForTraining,
  startTraining,
  openTrainingWebSocket,
  stopTraining,
  fetchDatasets,
  type GraphSchema,
  type TrainingConfigSchema,
} from "@/neuralcanvas/lib/trainingApi";
import { saveTrainedModel } from "@/neuralcanvas/lib/modelsApi";
import { usePrediction } from "@/neuralcanvas/components/canvas/PredictionContext";
import type { TrainingStatus, EpochMetric, BatchUpdate } from "./types";
import { LiveTrainingOverlay } from "./LiveTrainingOverlay";
import { Play, Square, X, AlertTriangle, Database, Settings2, Zap, Star } from "lucide-react";
import { createPlayground } from "@/lib/supabase/playgrounds";
import { neuralCanvasToGraphSchema } from "@/lib/levelGraphAdapter";

interface TrainingPanelProps {
  open: boolean;
  onClose: () => void;
  nodes: Node[];
  edges: Edge[];
  compact?: boolean;
  playgroundId?: string;
  userId?: string;
  onPlaygroundCreated?: (id: string) => void;
}

const DEFAULT_CONFIG: TrainingConfigSchema = {
  epochs: 10,
  batch_size: 64,
  learning_rate: 0.001,
  optimizer: "adam",
  train_split: 0.8,
};

/** Friendly explanations for each training setting */
const SETTING_HINTS: Record<string, string> = {
  epochs: "How many times the model sees the entire dataset",
  batch_size: "How many samples the model processes at once",
  learning_rate: "How big the learning steps are (smaller = more careful)",
  optimizer: "The algorithm that adjusts the model weights",
  train_split: "Fraction of data used for training (rest for validation)",
};

export function TrainingPanel({ open: isOpen, onClose, nodes, edges, compact, playgroundId, userId, onPlaygroundCreated }: TrainingPanelProps) {
  const [datasets, setDatasets] = useState<{ id: string; name: string; description: string }[]>([]);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const { setPredictedClassIndex } = usePrediction();
  const [config, setConfig] = useState<TrainingConfigSchema>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<TrainingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<EpochMetric[]>([]);
  const [lastMessage, setLastMessage] = useState<Record<string, unknown> | null>(null);
  const [totalBatches, setTotalBatches] = useState<number | undefined>(undefined);
  const [latestBatch, setLatestBatch] = useState<BatchUpdate | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dragControls = useDragControls();
  const closeWsRef = useRef<(() => void) | null>(null);

  // String state for free typing; sync from config when panel opens
  const [epochsInput, setEpochsInput] = useState(String(DEFAULT_CONFIG.epochs));
  const [learningRateInput, setLearningRateInput] = useState(String(DEFAULT_CONFIG.learning_rate));
  const [batchSizeInput, setBatchSizeInput] = useState(String(DEFAULT_CONFIG.batch_size));
  const [trainSplitInput, setTrainSplitInput] = useState(String(DEFAULT_CONFIG.train_split));
  useEffect(() => {
    if (isOpen) {
      setEpochsInput(String(config.epochs));
      setLearningRateInput(String(config.learning_rate));
      setBatchSizeInput(String(config.batch_size));
      setTrainSplitInput(String(config.train_split));
    }
  }, [isOpen]);

  const datasetId = useMemo(() => {
    // 1. Regular Input block (image/csv datasets)
    const inputNode = nodes.find((n) => (n.type as string) === "Input");
    if (inputNode) {
      const params = inputNode.data?.params;
      if (params && typeof params === "object" && "dataset_id" in params) {
        const id = (params as Record<string, unknown>).dataset_id;
        if (typeof id === "string" && id) return id;
      }
    }

    // 2. TextInput block (NLP / text datasets)
    const textInputNode = nodes.find((n) => (n.type as string) === "TextInput");
    if (textInputNode) {
      const params = textInputNode.data?.params;
      if (params && typeof params === "object" && "dataset_id" in params) {
        const id = (params as Record<string, unknown>).dataset_id;
        if (typeof id === "string" && id) return id;
      }
      // TextInput exists but no dataset chosen yet — still block training (force user to pick)
      return null;
    }

    return null;
  }, [nodes]);

  // Model save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelDescription, setModelDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingSuccess, setSavingSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetchDatasets()
      .then((list) => {
        if (!cancelled) {
          setDatasets(list);
          setDatasetError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setDatasetError(e instanceof Error ? e.message : "Failed to load datasets");
          setDatasets([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const { graph, error: graphError } = useMemo(
    () => serializeGraphForTraining(nodes, edges),
    [nodes, edges]
  );

  const handleStart = useCallback(async () => {
    if (!graph || graphError) {
      setError(graphError ?? "Graph cannot be serialized for training.");
      return;
    }
    if (!datasetId) {
      setError("Select a dataset on the Input block.");
      return;
    }
    // Use current input values (with fallbacks) so typing is respected even without blur
    const epochs = (() => {
      const n = parseInt(epochsInput.trim(), 10);
      return !Number.isNaN(n) && n >= 1 && n <= 500 ? n : config.epochs;
    })();
    const learning_rate = (() => {
      const n = parseFloat(learningRateInput.trim());
      return !Number.isNaN(n) && n >= 1e-5 && n <= 10 ? n : config.learning_rate;
    })();
    const batch_size = (() => {
      const n = parseInt(batchSizeInput.trim(), 10);
      return !Number.isNaN(n) && n >= 1 ? n : config.batch_size;
    })();
    const train_split = (() => {
      const n = parseFloat(trainSplitInput.trim());
      return !Number.isNaN(n) && n >= 0.1 && n <= 0.99 ? n : config.train_split;
    })();
    const effectiveConfig = { ...config, epochs, learning_rate, batch_size, train_split };
    setConfig(effectiveConfig);
    setEpochsInput(String(epochs));
    setLearningRateInput(String(learning_rate));
    setBatchSizeInput(String(batch_size));
    setTrainSplitInput(String(train_split));

    setError(null);
    setStatus("starting");
    setMetrics([]);
    setLastMessage(null);
    setTotalBatches(undefined);
    setLatestBatch(null);
    try {
      const { job_id } = await startTraining(graph, datasetId, effectiveConfig);
      setJobId(job_id);
      closeWsRef.current = openTrainingWebSocket(
        job_id,
        (msg) => {
          setLastMessage(msg);
          const type = msg.type as string;
          if (type === "connected" || type === "started") setStatus("running");
          if (type === "started") {
            const total = msg.total_batches as number | undefined;
            if (typeof total === "number") setTotalBatches(total);
          }
          if (type === "batch") {
            setLatestBatch({ epoch: msg.epoch as number, batch: msg.batch as number, loss: msg.loss as number });
            const predClass = msg.predicted_class as number | undefined;
            if (typeof predClass === "number" && predClass >= 0) setPredictedClassIndex(predClass);
          }
          if (type === "epoch") {
            setLatestBatch(null);
            const predClass = msg.sample_predicted_class as number | undefined;
            if (typeof predClass === "number" && predClass >= 0) setPredictedClassIndex(predClass);
            setMetrics((m) => [
              ...m,
              {
                epoch: msg.epoch as number,
                train_loss: msg.train_loss as number,
                val_loss: msg.val_loss as number,
                train_acc: msg.train_acc as number,
                val_acc: msg.val_acc as number,
                elapsed_sec: msg.elapsed_sec as number,
              },
            ]);
          }
          if (type === "completed" || type === "stopped") {
            setStatus(type === "completed" ? "completed" : "stopped");
            setLatestBatch(null);
            // Show save dialog if training completed successfully
            if (type === "completed") {
              setShowSaveDialog(true);
              setModelName(`Model-${new Date().toLocaleTimeString().replace(/:/g, "-")}`);
            }
            closeWsRef.current?.();
            closeWsRef.current = null;
          }
          if (type === "error") {
            setError((msg.message as string) ?? "Training error");
            setStatus("error");
            setLatestBatch(null);
            closeWsRef.current?.();
            closeWsRef.current = null;
          }
        },
        () => {
          setStatus((s) => (s === "running" ? "stopped" : s));
          closeWsRef.current = null;
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start training");
      setStatus("error");
    }
  }, [graph, graphError, config, datasetId, epochsInput, learningRateInput, batchSizeInput, trainSplitInput]);

  const handleStop = useCallback(() => {
    if (jobId) {
      stopTraining(jobId).catch(() => {});
      closeWsRef.current?.();
    }
    setStatus("stopped");
  }, [jobId]);

  const handleSaveModel = useCallback(async () => {
    if (!graph || !lastMessage || lastMessage.type !== "completed") {
      setSaveError("No trained model available to save");
      return;
    }

    if (!modelName.trim()) {
      setSaveError("Model name is required");
      return;
    }

    if (!userId) {
      setSaveError("User ID not available. Please ensure you are logged in.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      // ── Auth Check ──
      if (!userId) {
        setSaveError("Login Required: Please sign in to save your models to the cloud.");
        setIsSaving(false);
        return;
      }

      // Auto-create playground if it doesn't exist
      let effectivePlaygroundId = playgroundId;
      if (!effectivePlaygroundId) {
        setSaveError("Initializing storage...");
        const playgroundGraph = neuralCanvasToGraphSchema(nodes, edges, {
          name: `Auto-saved from model: ${modelName.trim()}`,
          created_at: new Date().toISOString(),
        });
        
        try {
          const playgroundResult = await createPlayground(playgroundGraph);
          if (!playgroundResult?.id) {
            throw new Error("Could not initialize a playground container for this model.");
          }
          effectivePlaygroundId = playgroundResult.id;
          onPlaygroundCreated?.(effectivePlaygroundId);
        } catch (pgErr) {
          setSaveError(pgErr instanceof Error ? pgErr.message : "Failed to create playground container.");
          setIsSaving(false);
          return;
        }
        setSaveError(null);
      }

      const finalMetrics = {
        loss: ((lastMessage.final_metrics as Record<string, unknown>)?.loss as number | null) || null,
        accuracy: ((lastMessage.final_metrics as Record<string, unknown>)?.accuracy as number | null) || null,
        history: ((lastMessage.final_metrics as Record<string, unknown>)?.history as Record<string, unknown>[] | undefined),
      };

      const saveRequest = {
        playground_id: effectivePlaygroundId,
        user_id: userId,
        model_name: modelName.trim(),
        description: modelDescription.trim() || undefined,
        model_state_dict_b64: (lastMessage.model_state_dict_b64 as string) || "",
        graph_json: graph,
        training_config: config,
        final_metrics: finalMetrics,
      };

      await saveTrainedModel(saveRequest);
      setSavingSuccess(true);
      setShowSaveDialog(false);
      setModelName("");
      setModelDescription("");

      // Auto-close success message after 3 seconds
      setTimeout(() => {
        setSavingSuccess(false);
      }, 3000);

    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save model");
    } finally {
      setIsSaving(false);
    }
  }, [graph, lastMessage, modelName, modelDescription, config, playgroundId, userId, nodes, edges, onPlaygroundCreated]);

  useEffect(() => {
    return () => {
      closeWsRef.current?.();
    };
  }, []);

  if (!isOpen) return null;

  const isTraining = status === "running" || status === "starting";

  const inputClass = "w-full px-3 py-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] focus:border-[var(--accent)] transition-all";

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      initial={{ x: 0, y: 0 }}
      className={`
        flex flex-col z-30 bg-[var(--surface)] border border-[var(--border)]
        shadow-2xl backdrop-blur-md rounded-2xl overflow-hidden
        ${compact
          ? "absolute top-20 right-8 w-[360px] max-h-[75vh]"
          : "absolute top-20 right-8 bottom-20 w-[400px]"
        }
      `}
    >
      {/* Header / Drag Handle */}
      <div 
        onPointerDown={(e) => dragControls.start(e)}
        className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] cursor-grab active:cursor-grabbing bg-[var(--background)]/20"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
            <Zap className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Train Model</h2>
            <p className="text-[11px] text-[var(--foreground-muted)]">Configure and run training</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Warnings */}
        {graphError && (
          <div className="rounded-xl bg-[var(--warning-muted)] border border-[var(--warning)]/30 text-[var(--warning)] text-sm p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{graphError}</span>
          </div>
        )}

        {!datasetId && (() => {
          const hasTextInput = nodes.some((n) => (n.type as string) === "TextInput");
          return (
            <div className="rounded-xl bg-[var(--warning-muted)] border border-[var(--warning)]/30 text-[var(--warning)] text-sm p-3">
              {hasTextInput
                ? "Select a text dataset on the Text Input block to train. Upload a .txt file using the ↑ button on the block."
                : "Select a dataset on the Input block to train."}
            </div>
          );
        })()}

        {/* Essential settings */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">
              Epochs
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={epochsInput}
              onChange={(e) => setEpochsInput(e.target.value)}
              onBlur={() => {
                const n = parseInt(epochsInput.trim(), 10);
                if (!Number.isNaN(n) && n >= 1 && n <= 500) {
                  setConfig((c) => ({ ...c, epochs: n }));
                } else {
                  setEpochsInput(String(config.epochs));
                }
              }}
              className={inputClass}
              title={SETTING_HINTS.epochs}
            />
            <p className="text-[11px] text-[var(--foreground-faint)] mt-1">{SETTING_HINTS.epochs}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">
              Learning Rate
            </label>
            <input
              type="number"
              step="any"
              min={0.00001}
              value={learningRateInput}
              onChange={(e) => setLearningRateInput(e.target.value)}
              onBlur={() => {
                const n = parseFloat(learningRateInput.trim());
                if (!Number.isNaN(n) && n >= 1e-5 && n <= 10) {
                  setConfig((c) => ({ ...c, learning_rate: n }));
                } else {
                  setLearningRateInput(String(config.learning_rate));
                }
              }}
              className={inputClass}
              title={SETTING_HINTS.learning_rate}
            />
            <p className="text-[11px] text-[var(--foreground-faint)] mt-1">{SETTING_HINTS.learning_rate}</p>
          </div>
        </div>

        {/* Advanced settings toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="flex items-center gap-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span>{showAdvanced ? "Hide" : "Show"} advanced settings</span>
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 animate-fade-in">
            <div>
              <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">Batch Size</label>
              <input
                type="number"
                min={1}
                value={batchSizeInput}
                onChange={(e) => setBatchSizeInput(e.target.value)}
                onBlur={() => {
                  const n = parseInt(batchSizeInput.trim(), 10);
                  if (!Number.isNaN(n) && n >= 1) {
                    setConfig((c) => ({ ...c, batch_size: n }));
                  } else {
                    setBatchSizeInput(String(config.batch_size));
                  }
                }}
                className={inputClass}
                title={SETTING_HINTS.batch_size}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">Optimizer</label>
              <select
                value={config.optimizer}
                onChange={(e) => setConfig((c) => ({ ...c, optimizer: e.target.value }))}
                className={inputClass}
                title={SETTING_HINTS.optimizer}
              >
                <option value="adam">Adam</option>
                <option value="adamw">AdamW</option>
                <option value="sgd">SGD</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-[var(--foreground-secondary)] mb-1.5">Train / Validation Split</label>
              <input
                type="number"
                step="any"
                min={0.1}
                max={0.99}
                value={trainSplitInput}
                onChange={(e) => setTrainSplitInput(e.target.value)}
                onBlur={() => {
                  const n = parseFloat(trainSplitInput.trim());
                  if (!Number.isNaN(n) && n >= 0.1 && n <= 0.99) {
                    setConfig((c) => ({ ...c, train_split: n }));
                  } else {
                    setTrainSplitInput(String(config.train_split));
                  }
                }}
                className={inputClass}
                title={SETTING_HINTS.train_split}
              />
            </div>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="rounded-xl bg-[var(--danger-muted)] border border-[var(--danger)]/30 text-[var(--danger)] text-sm p-3">
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={!!graphError || !datasetId || status === "starting" || status === "running"}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            <Play className="h-4 w-4" />
            {status === "starting" ? "Starting..." : status === "running" ? "Training..." : "Start Training"}
          </button>
          {isTraining && (
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-hover)] text-sm font-medium transition-all flex items-center gap-2"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          )}
        </div>

        {/* Live training overlay */}
        {status !== "idle" && (
          <LiveTrainingOverlay
            embedded
            status={status}
            metrics={metrics}
            lastMessage={lastMessage}
            totalEpochs={config.epochs}
            totalBatches={totalBatches}
            latestBatch={latestBatch}
          />
        )}

        {/* ── Save Model View ── */}
        {showSaveDialog && (
          <div className="absolute inset-0 z-50 bg-[var(--surface)] flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--success-muted)]">
                  <Star className="h-4 w-4 text-[var(--success)]" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--foreground)]">Training Complete!</h2>
                  <p className="text-[11px] text-[var(--foreground-muted)]">Save your new model</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveError(null);
                }}
                className="p-2 rounded-lg text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
                aria-label="Close save dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--foreground-secondary)] uppercase tracking-wider mb-2">
                    Model Name
                  </label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g., MNIST Classifier v1"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--foreground-secondary)] uppercase tracking-wider mb-2">
                    Description (optional)
                  </label>
                  <textarea
                    value={modelDescription}
                    onChange={(e) => setModelDescription(e.target.value)}
                    placeholder="Add notes about architecture or performance..."
                    rows={4}
                    className={`${inputClass} resize-none`}
                  />
                </div>

                {saveError && (
                  <div className="rounded-xl bg-[var(--danger-muted)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs p-4 leading-relaxed">
                    <div className="flex items-center gap-2 font-bold mb-1">
                      <AlertTriangle size={14} />
                      <span>Action Required</span>
                    </div>
                    {saveError}
                  </div>
                )}

                {savingSuccess && (
                  <div className="rounded-xl bg-[var(--success-muted)] border border-[var(--success)]/30 text-[var(--success)] text-xs p-4 flex items-center gap-2 font-bold animate-pulse">
                    <Zap size={14} />
                    <span>Model saved successfully!</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-[var(--border)] bg-[var(--background)]/40 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowSaveDialog(false);
                  setSaveError(null);
                }}
                disabled={isSaving}
                className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-hover)] text-sm font-bold disabled:opacity-50 transition-all"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSaveModel}
                disabled={isSaving || !modelName.trim()}
                className="flex-2 px-6 py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-95"
              >
                {isSaving ? "Saving..." : "Save Model"}
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
