"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { levelGraphToNeuralCanvas } from "@/lib/levelGraphAdapter";
import { getSharedPlayground, type SharedPlayground } from "@/neuralcanvas/lib/shareApi";
import type { Node, Edge } from "@xyflow/react";

const NeuralCanvas = dynamic(
  () => import("@/neuralcanvas/components/canvas/NeuralCanvas").then((m) => m.default),
  { ssr: false }
);

// ---------------------------------------------------------------------------
// Banana loader — same pattern as PlaygroundNeuralCanvas
// ---------------------------------------------------------------------------

const LOADING_TEXTS = [
  "Loading playground…",
  "Fetching the graph…",
  "Unpacking architecture…",
  "Almost there…",
];

function BananaLoader({ text }: { text: string }) {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#fafafa]">
      <div className="flex flex-col items-center">
        <img
          src="/banana.png"
          alt="Loading..."
          className="w-16 h-16 animate-spin opacity-80 mb-6 drop-shadow-md"
          style={{ animationDuration: "3s" }}
        />
        <p className="font-semibold text-gray-500 tracking-tight text-sm animate-pulse">{text}</p>
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#fafafa]">
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center gap-4 text-center max-w-sm">
        <p className="font-semibold text-red-500">{message}</p>
        <Link
          href="/"
          className="rounded-xl bg-black text-white px-5 py-2 text-sm font-bold hover:bg-gray-800 transition-colors"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only banner
// ---------------------------------------------------------------------------

function ReadOnlyBanner({ name }: { name: string }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex h-11 items-center justify-between border-b border-black/[0.06] bg-white/95 backdrop-blur-md px-4">
      <div className="flex items-center gap-3">
        <span className="text-[15px] font-black tracking-tight text-gray-400 select-none">
          july<span className="text-[#0066FF]">ai</span>
        </span>
        <div className="h-3.5 w-px bg-gray-200 rounded-full" />
        <span className="text-[13px] font-semibold text-black truncate max-w-[300px]">{name}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 border border-gray-200 px-2.5 py-0.5 text-[11px] font-bold text-gray-400 select-none">
          View only
        </span>
        <a
          href="/"
          className="rounded-xl bg-[#0066FF] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-blue-700 transition-colors select-none"
        >
          Try JulyAI →
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function SharedPlaygroundView({ token }: { token: string }) {
  const [data, setData] = useState<SharedPlayground | null>(null);
  const [initialNodes, setInitialNodes] = useState<Node[]>([]);
  const [initialEdges, setInitialEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState(LOADING_TEXTS[0]);
  const [error, setError] = useState<string | null>(null);

  // Cycle through loading text like PlaygroundNeuralCanvas does
  useEffect(() => {
    if (!loading) return;
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % LOADING_TEXTS.length;
      setLoadingText(LOADING_TEXTS[idx]);
    }, 2000);
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    getSharedPlayground(token)
      .then((pg) => {
        setData(pg);
        try {
          const { nodes, edges } = levelGraphToNeuralCanvas(pg.graph_json);
          setInitialNodes(nodes);
          setInitialEdges(edges);
        } catch {
          setInitialNodes([]);
          setInitialEdges([]);
        }
      })
      .catch((e: Error) =>
        setError(e.message ?? "This share link is invalid or has expired.")
      )
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <BananaLoader text={loadingText} />;
  if (error || !data) return <ErrorCard message={error ?? "Share link not found."} />;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <ReadOnlyBanner name={data.name} />
      <div className="flex-1 pt-11">
        <NeuralCanvas
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          playgroundName={data.name}
        /* No playgroundId = read-only: Save/Delete/Deploy/Share buttons are hidden */
        />
      </div>
    </div>
  );
}
