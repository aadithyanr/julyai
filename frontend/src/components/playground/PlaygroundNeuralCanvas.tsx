"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import { 
  Check, 
  Trash2, 
  ArrowUp,
  MousePointer2,
  Hand,
  Maximize,
  Minus,
  Plus,
  Download,
  Paperclip,
  Sparkles,
  ChevronLeft
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getLevelByNumber } from "@/lib/supabase/levels";
import { getPlayground, deletePlayground } from "@/lib/supabase/playgrounds";
import { getPaperProgress } from "@/lib/supabase/paperProgress";
import { recordLevelCompletion } from "@/lib/supabase/levelCompletions";
import { levelGraphToNeuralCanvas } from "@/lib/levelGraphAdapter";
import { PAPER_WALKTHROUGHS } from "@/lib/paperWalkthroughs";
import { getApiBase } from "@/neuralcanvas/lib/trainingApi";
import type { GraphSchema } from "@/types/graph";
import type { Node, Edge } from "@xyflow/react";

const NeuralCanvas = dynamic(
  () =>
    import("@/neuralcanvas/components/canvas/NeuralCanvas").then((m) => m.default),
  { ssr: false }
);

export default function PlaygroundNeuralCanvas({
  playgroundId,
}: {
  playgroundId?: string;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const levelParam = searchParams.get("level");
  const [initialGraph, setInitialGraph] = useState<{
    nodes: Node[];
    edges: Edge[];
  } | null>(null);
  const [playgroundName, setPlaygroundName] = useState<string | undefined>();
  const [challengeTask, setChallengeTask] = useState<string | null>(null);
  const [challengeSolution, setChallengeSolution] = useState<GraphSchema | null>(null);
  const [isPaperLevel, setIsPaperLevel] = useState(false);
  const [loadedLevelName, setLoadedLevelName] = useState<string | null>(null);
  const [walkthroughStepIndex, setWalkthroughStepIndex] = useState(0);
  const [walkthroughSteps, setWalkthroughSteps] = useState<typeof PAPER_WALKTHROUGHS[10] | null>(null);
  const [quizSelected, setQuizSelected] = useState<string | null>(null);
  const [quizCorrect, setQuizCorrect] = useState<boolean | null>(null);
  const [paperChatMessages, setPaperChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [paperChatLoading, setPaperChatLoading] = useState(false);
  const [paperChatInput, setPaperChatInput] = useState("");
  const [loading, setLoading] = useState(!!levelParam || !!playgroundId);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (playgroundId) {
      setLoading(true);
      setError(null);
      getPlayground(playgroundId)
        .then((playground) => {
          if (playground?.graph_json) {
            const { nodes, edges } = levelGraphToNeuralCanvas(playground.graph_json);
            setInitialGraph({ nodes, edges });
            setPlaygroundName(playground.name);
          } else {
            setInitialGraph(null);
            setError("Playground schema not found.");
          }
        })
        .catch(() => {
          setInitialGraph(null);
          setError("Failed to fetch playground data.");
        })
        .finally(() => setLoading(false));
      return;
    }
    if (!levelParam) {
      setInitialGraph(null);
      setLoading(false);
      setError(null);
      setPlaygroundName(undefined);
      setChallengeTask(null);
      setChallengeSolution(null);
      setIsPaperLevel(false);
      setLoadedLevelName(null);
      setWalkthroughSteps(null);
      setWalkthroughStepIndex(0);
      return;
    }
    const levelNum = Number(levelParam);
    if (!Number.isInteger(levelNum) || levelNum < 1) {
      setInitialGraph(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      getLevelByNumber(levelNum),
      levelNum in PAPER_WALKTHROUGHS ? getPaperProgress() : Promise.resolve({} as Record<number, number>),
    ])
      .then(([level, progress]) => {
        if (level?.graph_json) {
          const isPaper = (level.section ?? "challenges") === "papers";
          const steps = levelNum in PAPER_WALKTHROUGHS ? PAPER_WALKTHROUGHS[levelNum as keyof typeof PAPER_WALKTHROUGHS] : null;
          setIsPaperLevel(isPaper);
          setLoadedLevelName(isPaper && level.name ? level.name : null);
          if (isPaper && steps?.length) {
            setWalkthroughSteps(steps);
            const saved = progress[levelNum] ?? 0;
            const stepIndex = Math.min(Math.max(0, saved), steps.length - 1);
            setWalkthroughStepIndex(stepIndex);
            const useGraphPositions = levelNum === 12 || levelNum === 14;
            const { nodes, edges } = levelGraphToNeuralCanvas(steps[stepIndex].graph, {
              forceSequentialLayout: !useGraphPositions,
              sequentialSpacing: levelNum === 14 ? 400 : 320,
            });
            setInitialGraph({ nodes, edges });
          } else {
            setWalkthroughSteps(null);
            setWalkthroughStepIndex(0);
            const { nodes, edges } = levelGraphToNeuralCanvas(level.graph_json);
            setInitialGraph({ nodes, edges });
          }
          const task =
            level.task?.trim() ||
            (levelNum === 1
              ? "Instantiate a feed-forward pipeline using flatten and linear ops."
              : null);
          setChallengeTask(task || null);
          setChallengeSolution(level.solution_graph_json ?? null);
        } else {
          setInitialGraph(null);
          setChallengeTask(null);
          setChallengeSolution(null);
          setIsPaperLevel(false);
          setLoadedLevelName(null);
          setWalkthroughSteps(null);
          setWalkthroughStepIndex(0);
          setError("Task schema 404.");
        }
      })
      .catch(() => {
        setInitialGraph(null);
        setChallengeTask(null);
        setChallengeSolution(null);
        setIsPaperLevel(false);
        setLoadedLevelName(null);
        setWalkthroughSteps(null);
        setWalkthroughStepIndex(0);
        setError("Network error fetching task.");
      })
      .finally(() => setLoading(false));
  }, [levelParam, playgroundId]);

  const levelNum = levelParam ? parseInt(levelParam, 10) : 0;
  const challengeLevelNumber = levelNum >= 1 ? levelNum : null;
  const handleChallengeSuccess = useCallback(
    async (levelNumber: number) => {
      await recordLevelCompletion(levelNumber);
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#0080ff', '#111111', '#d5d5d5']
      });
      setTimeout(() => {
        router.push("/?tab=tasks");
      }, 1500);
    },
    [router]
  );

  const handleNext = useCallback(() => {
    setQuizSelected(null);
    setQuizCorrect(null);
    setWalkthroughStepIndex((i) => {
      const maxIdx = (walkthroughSteps?.length ?? 1) - 1;
      return Math.min(maxIdx, i + 1);
    });
  }, [walkthroughSteps?.length]);

  const handlePrev = useCallback(() => {
    setQuizSelected(null);
    setQuizCorrect(null);
    setWalkthroughStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const handleChoiceSelect = useCallback(
    (choice: string) => {
      if (quizCorrect !== null) return;
      const step = walkthroughSteps?.[walkthroughStepIndex];
      if (!step?.correctNext) return;
      setQuizSelected(choice);
      const correct = choice === step.correctNext;
      setQuizCorrect(correct);
    },
    [walkthroughStepIndex, walkthroughSteps, quizCorrect]
  );

  const handlePaperChatSend = useCallback(
    async () => {
      const trimmed = paperChatInput.trim();
      const currentStep = walkthroughSteps?.[walkthroughStepIndex];
      if (!trimmed || !currentStep) return;
      
      const newMessages: { role: "user" | "assistant"; content: string }[] = [
        ...paperChatMessages,
        { role: "user", content: trimmed },
      ];
      setPaperChatMessages(newMessages);
      setPaperChatInput("");
      setPaperChatLoading(true);
      try {
        const base = getApiBase();
        const body: {
          graph: GraphSchema;
          messages: { role: string; content: string }[];
          paper_context?: string;
          quiz_question?: string;
          quiz_choices?: string[];
          quiz_correct?: string;
        } = {
          graph: currentStep.graph,
          messages: newMessages,
        };
        if (challengeTask?.trim()) body.paper_context = challengeTask.trim();
        if (currentStep.nextQuestion) body.quiz_question = currentStep.nextQuestion;
        if (currentStep.nextChoices?.length) body.quiz_choices = currentStep.nextChoices;
        if (currentStep.correctNext) body.quiz_correct = currentStep.correctNext;
        const res = await fetch(`${base}/api/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        const assistantContent = !res.ok
          ? (data.detail ?? res.statusText ?? "Request failed")
          : data.feedback ?? "No execution output.";
        setPaperChatMessages((m) => [...m, { role: "assistant", content: assistantContent }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to execute.";
        setPaperChatMessages((m) => [...m, { role: "assistant", content: msg }]);
      } finally {
        setPaperChatLoading(false);
      }
    },
    [paperChatMessages, paperChatInput, challengeTask, walkthroughSteps, walkthroughStepIndex]
  );

  const shuffledChoices = useMemo(() => {
    const choices = walkthroughSteps?.[walkthroughStepIndex]?.nextChoices ?? [];
    return [...choices].sort(() => Math.random() - 0.5);
  }, [walkthroughStepIndex, walkthroughSteps]);

  const handleDeletePlayground = useCallback(async () => {
    if (!playgroundId || deleting) return;
    const name = playgroundName ?? "this workspace";
    if (!window.confirm(`Delete "${name}"?`)) return;
    setDeleting(true);
    const ok = await deletePlayground(playgroundId);
    setDeleting(false);
    if (ok) router.push("/");
  }, [playgroundId, playgroundName, deleting, router]);

  const loadingTexts = [
    "Crunching the numbers...",
    "Assembling blocks...",
    "Brewing the architecture...",
    "Connecting the dots...",
    "Polishing the neurons...",
    "Consulting the AI deities...",
    "Just a moment...",
  ];
  
  const [loadingText, setLoadingText] = useState(loadingTexts[0]);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingText(loadingTexts[Math.floor(Math.random() * loadingTexts.length)]);
    }, 2000);
    return () => clearInterval(interval);
  }, [loading]);

  if (loading || error) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#fafafa]">
        {loading ? (
          <div className="flex flex-col items-center">
            <img src="/banana.png" alt="Loading..." className="w-16 h-16 animate-spin opacity-80 mb-6 drop-shadow-md" style={{ animationDuration: '3s' }} />
            <p className="font-semibold text-gray-500 tracking-tight text-sm animate-pulse">{loadingText}</p>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center gap-4 text-center">
            <p className="font-semibold text-red-500">Error: {error}</p>
            <Link href="/" className="btn-secondary">Return Home</Link>
          </div>
        )}
      </div>
    );
  }

  const inWalkthrough = isPaperLevel && walkthroughSteps && walkthroughSteps.length > 0;
  const currentStep = inWalkthrough ? walkthroughSteps[walkthroughStepIndex] : null;
  const stepCount = walkthroughSteps?.length ?? 0;
  const canPrev = walkthroughStepIndex > 0;
  const canNext = walkthroughStepIndex < stepCount - 1;

  const levelNumForLayout = levelParam != null ? Number(levelParam) : 0;
  const useGraphPositionsForStep = levelNumForLayout === 12 || levelNumForLayout === 14;
  const stepGraphNodesEdges = inWalkthrough && currentStep
    ? levelGraphToNeuralCanvas(currentStep.graph, { forceSequentialLayout: !useGraphPositionsForStep })
    : null;
  const initialNodes = stepGraphNodesEdges?.nodes ?? initialGraph?.nodes ?? [];
  const initialEdges = stepGraphNodesEdges?.edges ?? initialGraph?.edges ?? [];
  const paperFocusedNodeId =
    inWalkthrough && currentStep?.graph?.nodes?.length
      ? currentStep.graph.nodes[Math.min(walkthroughStepIndex, currentStep.graph.nodes.length - 1)]?.id ?? null
      : null;

  const canvasKey = inWalkthrough
    ? `${playgroundId ?? levelParam ?? "default"}-walkthrough-step-${walkthroughStepIndex}`
    : playgroundId ?? levelParam ?? "default";

  const hasQuiz = currentStep?.nextQuestion && currentStep?.nextChoices?.length && currentStep?.correctNext;
  const showContinue = quizCorrect === true && hasQuiz;
  const isNewPlayground = playgroundId == null && levelParam == null;
  const initialPrompt = searchParams.get("prompt");

  return (
    <div className="h-screen w-screen relative overflow-hidden bg-[#fbfbfb] font-sans text-black">
      
      {/* ── Background Canvas ── */}
      <div className="absolute inset-0 z-0">
        <NeuralCanvas
          key={canvasKey}
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          playgroundId={playgroundId}
          playgroundName={playgroundName}
          challengeTask={inWalkthrough ? null : challengeTask}
          challengeSolutionGraph={challengeSolution}
          challengeLevelNumber={challengeLevelNumber}
          onChallengeSuccess={handleChallengeSuccess}
          isPaperLevel={isPaperLevel}
          paperLevelNumber={inWalkthrough ? challengeLevelNumber : null}
          paperStepIndex={inWalkthrough ? walkthroughStepIndex : null}
          paperFocusedNodeId={paperFocusedNodeId}
          setPlaygroundName={setPlaygroundName}
          onDeletePlayground={handleDeletePlayground}
          deleting={deleting}
          initialPrompt={initialPrompt}
        />
      </div>

      {/* ── Walkthrough Modal (Floating Tooltip) ── */}
      {inWalkthrough && currentStep && (
        <div className="absolute bottom-36 left-1/2 -translate-x-1/2 z-30 w-full max-w-[420px] animate-fade-in pointer-events-none">
          <div className="bg-white rounded-3xl p-6 shadow-[0_24px_48px_rgba(0,0,0,0.12)] border border-gray-100 pointer-events-auto relative">
            <h3 className="text-[13px] font-bold text-black mb-1">
              Step {walkthroughStepIndex + 1} of {stepCount}
            </h3>
            <p className="text-[14px] text-gray-600 leading-relaxed font-medium mb-5">
              {currentStep.description}
            </p>

            {hasQuiz && (
              <div className="mb-5 space-y-2 border-t border-gray-50 pt-4">
                <p className="font-semibold text-[13px] text-gray-800 mb-3">{currentStep.nextQuestion}</p>
                <div className="flex flex-col gap-2">
                  {shuffledChoices.map((choice) => {
                    const selected = quizSelected === choice;
                    const isCorrectChoice = choice === currentStep.correctNext;
                    const showRight = quizCorrect !== null && isCorrectChoice;
                    const showWrong = quizCorrect === false && selected && !isCorrectChoice;
                    return (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => handleChoiceSelect(choice)}
                        disabled={quizCorrect !== null}
                        className={`
                            text-left px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all border outline-none
                            disabled:pointer-events-none group flex items-center gap-3
                            ${showRight ? "border-green-500 bg-green-50 text-green-700 shadow-sm" : ""}
                            ${showWrong ? "border-red-300 bg-red-50 text-red-600 line-through" : ""}
                            ${!showRight && !showWrong && selected ? "border-blue-500 bg-white shadow-[0_0_0_2px_rgba(0,128,255,0.2)] text-black" : ""}
                            ${!showRight && !showWrong && !selected ? "border-gray-200 bg-white hover:border-gray-300 text-gray-600 hover:shadow-sm" : ""}
                          `}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${showRight ? 'border-green-500 bg-green-500' : 'border-gray-300 group-hover:border-gray-400'}`}>
                          {showRight && <Check size={10} className="text-white" strokeWidth={3} />}
                        </div>
                        {choice}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={handlePrev}
                disabled={!canPrev}
                className="font-semibold text-[14px] text-gray-400 hover:text-black disabled:opacity-0 transition px-2"
              >
                &larr; Previous
              </button>
              {showContinue ? (
                <button onClick={handleNext} className="btn-primary !px-5 shadow-sm hover:shadow-md">
                  Next &rarr;
                </button>
              ) : (
                <button
                  onClick={handleNext}
                  disabled={!canNext || (!!hasQuiz && quizCorrect !== true)}
                  className="btn-primary !px-5 shadow-sm hover:shadow-md disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  Next &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}



    </div>
  );
}
