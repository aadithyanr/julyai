"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { listPlaygrounds, createPlayground, deletePlayground } from "@/lib/supabase/playgrounds";
import { listLevels } from "@/lib/supabase/levels";
import { getCompletedLevelNumbers } from "@/lib/supabase/levelCompletions";
import type { PlaygroundRow } from "@/types/playground";
import type { LevelRow } from "@/types/level";
import type { GraphSchema } from "@/types/graph";
import { Trash2, FileText, Zap } from "lucide-react";
import { createDeployment, getDocsUrl } from "@/neuralcanvas/lib/deployApi";
import { DeployDashboard } from "@/components/deploy/DeployDashboard";

type TabId = "home" | "tasks" | "library" | "deployments";

// ---------------------------------------------------------------------------
// SVG Icons — Banani-exact
// ---------------------------------------------------------------------------

const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M10.0476 5.67346L9.39683 4.91421L10.0476 5.67346ZM13.9524 5.67346L13.3016 6.43272V6.43272L13.9524 5.67346ZM19 11.3798H18V16H19H20V11.3798H19ZM5 16H6V11.3798H5H4V16H5ZM6.04763 9.10204L6.69842 9.86129L10.6984 6.43272L10.0476 5.67346L9.39683 4.91421L5.39683 8.34278L6.04763 9.10204ZM13.9524 5.67346L13.3016 6.43272L17.3016 9.86129L17.9524 9.10204L18.6032 8.34278L14.6032 4.91421L13.9524 5.67346ZM16 19V18H8V19V20H16V19ZM19 11.3798H20C20 10.2121 19.4897 9.10271 18.6032 8.34278L17.9524 9.10204L17.3016 9.86129C17.7449 10.2413 18 10.796 18 11.3798H19ZM5 11.3798H6C6 10.796 6.25513 10.2413 6.69842 9.86129L6.04763 9.10204L5.39683 8.34278C4.51025 9.10271 4 10.2121 4 11.3798H5ZM19 16H18C18 17.1046 17.1046 18 16 18V19V20C18.2091 20 20 18.2091 20 16H19ZM10.0476 5.67346L10.6984 6.43272C11.4474 5.79074 12.5526 5.79074 13.3016 6.43272L13.9524 5.67346L14.6032 4.91421C13.1052 3.63024 10.8948 3.63024 9.39683 4.91421L10.0476 5.67346ZM5 16H4C4 18.2091 5.79086 20 8 20V19V18C6.89543 18 6 17.1046 6 16H5Z" fill="currentColor" />
    <path d="M14 19V15C14 13.8954 13.1046 13 12 13C10.8954 13 10 13.8954 10 15V19" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const ChallengesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M14.7519 12.8321L11.5547 14.9635C10.8901 15.4066 10 14.9302 10 14.1315V9.86852C10 9.06982 10.8901 8.59343 11.5547 9.03647L14.7519 11.1679C15.3457 11.5638 15.3457 12.4362 14.7519 12.8321Z" stroke="currentColor" strokeWidth="2" />
    <path d="M12.6 5H11.4C9.15979 5 8.03969 5 7.18404 5.43597C6.43139 5.81947 5.81947 6.43139 5.43597 7.18404C5 8.03969 5 9.15979 5 11.4V12.6C5 14.8402 5 15.9603 5.43597 16.816C5.81947 17.5686 6.43139 18.1805 7.18404 18.564C8.03969 19 9.15979 19 11.4 19H12.6C14.8402 19 15.9603 19 16.816 18.564C17.5686 18.1805 18.1805 17.5686 18.564 16.816C19 15.9603 19 14.8402 19 12.6V11.4C19 9.15979 19 8.03969 18.564 7.18404C18.1805 6.43139 17.5686 5.81947 16.816 5.43597C15.9603 5 14.8402 5 12.6 5Z" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const LibraryIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M12 14H8.4C7.2 14 6 13 6 11C6 9 7.2 8 8.4 8H12L18 4V18L12 14Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M7 13.5C7.5 16 9.66676 18.1667 11.0001 19L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DeploymentsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WhatsNewIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M18.5 8V10.5M18.5 10.5H16M18.5 10.5V13M18.5 10.5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="7" y="6" width="5" height="5" rx="2.5" stroke="currentColor" strokeWidth="2" />
    <path d="M15 18L14.7356 16.8154C14.5014 15.7664 13.9299 14.7857 12.9045 14.4639C11.9867 14.1759 10.8021 14 9.50001 14C8.19786 14 7.01322 14.1759 6.09539 14.4639C5.07002 14.7857 4.49857 15.7664 4.26445 16.8153L4 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MoreIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

const AddWorkspaceIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <g opacity="0.5">
      <path d="M12.6 5H11.4C9.15979 5 8.03969 5 7.18404 5.43597C6.43139 5.81947 5.81947 6.43139 5.43597 7.18404C5 8.03969 5 9.15979 5 11.4V12.6C5 14.8402 5 15.9603 5.43597 16.816C5.81947 17.5686 6.43139 18.1805 7.18404 18.564C8.03969 19 9.15979 19 11.4 19H12.6C14.8402 19 15.9603 19 16.816 18.564C17.5686 18.1805 18.1805 17.5686 18.564 16.816C19 15.9603 19 14.8402 19 12.6V11.4C19 9.15979 19 8.03969 18.564 7.18404C18.1805 6.43139 17.5686 5.81947 16.816 5.43597C15.9603 5 14.8402 5 12.6 5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 9V12M12 12H9M12 12V15M12 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

const ChevronUpDownIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
    <g opacity="0.3">
      <path d="M6 12L10 15L14 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 8L10 5L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

// ---------------------------------------------------------------------------
// Sidebar nav item
// ---------------------------------------------------------------------------

function NavItem({ label, icon: Icon, active, onClick }: {
  label: string;
  icon: React.ComponentType;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold
        transition-colors duration-75 w-full text-left
        ${active ? "bg-primary/20 text-gray-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}
      `}
    >
      <span className={active ? "text-gray-900" : "text-gray-500"}>
        <Icon />
      </span>
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex h-8 items-center px-2 pb-1 text-sm font-semibold text-gray-400">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Neural net thumbnail
// ---------------------------------------------------------------------------

function WorkspaceThumbnail({ graph }: { graph?: GraphSchema | null }) {
  if (!graph || !graph.nodes || graph.nodes.length === 0) {
    return (
      <div className="relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-[#f0f2f5]">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="opacity-[0.12]">
          <circle cx="12" cy="20" r="5" stroke="black" strokeWidth="2" />
          <circle cx="12" cy="44" r="5" stroke="black" strokeWidth="2" />
          <circle cx="32" cy="14" r="5" stroke="black" strokeWidth="2" />
          <circle cx="32" cy="32" r="5" stroke="black" strokeWidth="2" />
          <circle cx="32" cy="50" r="5" stroke="black" strokeWidth="2" />
          <circle cx="52" cy="32" r="5" stroke="black" strokeWidth="2" />
          <line x1="17" y1="20" x2="27" y2="16" stroke="black" strokeWidth="1.5" />
          <line x1="17" y1="22" x2="27" y2="30" stroke="black" strokeWidth="1.5" />
          <line x1="17" y1="22" x2="27" y2="48" stroke="black" strokeWidth="1.5" />
          <line x1="17" y1="44" x2="27" y2="16" stroke="black" strokeWidth="1.5" />
          <line x1="17" y1="44" x2="27" y2="32" stroke="black" strokeWidth="1.5" />
          <line x1="17" y1="44" x2="27" y2="50" stroke="black" strokeWidth="1.5" />
          <line x1="37" y1="14" x2="47" y2="30" stroke="black" strokeWidth="1.5" />
          <line x1="37" y1="32" x2="47" y2="32" stroke="black" strokeWidth="1.5" />
          <line x1="37" y1="50" x2="47" y2="34" stroke="black" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }

  const pad = 30;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  graph.nodes.forEach(n => {
    if (n.position.x < minX) minX = n.position.x;
    if (n.position.x > maxX) maxX = n.position.x;
    if (n.position.y < minY) minY = n.position.y;
    if (n.position.y > maxY) maxY = n.position.y;
  });

  const nodeW = 160;
  const nodeH = 40;

  minX -= pad;
  minY -= pad;
  maxX += nodeW + pad;
  maxY += nodeH + pad;

  const w = Math.max(maxX - minX, 300);
  const h = Math.max(maxY - minY, 170);

  return (
    <div className="relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-[#f8f9fb]">
      <svg viewBox={`${minX} ${minY} ${w} ${h}`} className="w-full h-full opacity-[0.85]">
        {graph.edges?.map(e => {
          const src = graph.nodes.find(n => n.id === e.source);
          const tgt = graph.nodes.find(n => n.id === e.target);
          if (!src || !tgt) return null;
          const x1 = src.position.x + nodeW;
          const y1 = src.position.y + nodeH / 2;
          const x2 = tgt.position.x;
          const y2 = tgt.position.y + nodeH / 2;
          return (
            <path
              key={e.id}
              d={`M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-black/20"
            />
          );
        })}
        {graph.nodes.map(n => (
          <g key={n.id} transform={`translate(${n.position.x}, ${n.position.y})`}>
            <rect width={nodeW} height={nodeH} rx={12} fill="white" className="drop-shadow-sm" />
            <rect width={nodeW} height={nodeH} rx={12} stroke="currentColor" strokeWidth="1.5" fill="none" className="text-black/10" />
            <circle cx={18} cy={20} r={5} fill="currentColor" className="text-black/20" />
            <rect x={34} y={18} width={nodeW - 50} height={4} rx={2} fill="currentColor" className="text-black/10" />
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick-start chip
// ---------------------------------------------------------------------------

function Chip({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-24 cursor-pointer flex-col items-center gap-2 group">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 transition-transform duration-150 group-hover:scale-105">
        {icon}
      </div>
      <span className="text-sm font-semibold text-gray-600 text-center leading-tight">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRelativeTime(timestamp?: string) {
  if (!timestamp) return "Just now";
  const ms = Math.abs(Date.now() - new Date(timestamp).getTime());
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours === 0) return "Just now";
  if (hours < 24) return `Edited ${hours}h ago`;
  return `Edited ${Math.floor(hours / 24)}d ago`;
}

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex aspect-[300/170] w-full animate-pulse overflow-hidden rounded-3xl bg-gray-100 border border-black/5" />
      <div className="flex flex-col gap-1.5">
        <div className="h-3.5 w-3/4 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-3 w-1/2 rounded-lg bg-gray-50 animate-pulse" />
      </div>
    </div>
  );
}

// Page section wrapper — consistent spacing + 693px centering
function PageSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-20">
      <div className="mx-auto mb-5 flex items-baseline" style={{ width: "693px" }}>
        <h1 className="text-[22px] font-semibold leading-[30px] text-black">{title}</h1>
      </div>
      <div className="flex justify-center">
        <div style={{ width: "693px" }}>{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HomeDashboard({ user }: { user: User }) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get("tab");
    if (t === "tasks") return "tasks";
    if (t === "library") return "library";
    if (t === "deployments") return "deployments";
    return "home";
  });

  const [playgrounds, setPlaygrounds] = useState<PlaygroundRow[]>([]);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [completedLevels, setCompletedLevels] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [promptInput, setPromptInput] = useState("");
  const [deployingId, setDeployingId] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "tasks") setActiveTab("tasks");
    else if (t === "library") setActiveTab("library");
    else if (t === "deployments") setActiveTab("deployments");
    else setActiveTab("home");
  }, [searchParams]);

  useEffect(() => {
    Promise.all([listPlaygrounds(), listLevels(), getCompletedLevelNumbers()]).then(
      ([pgs, lvs, comp]) => {
        setPlaygrounds(pgs);
        setLevels(lvs);
        setCompletedLevels(comp);
        setLoading(false);
      }
    );
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleCreateEmpty = async () => {
    const pg = await createPlayground("Untitled Workspace", "{}");
    if (pg) router.push(`/playground/${pg.id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workspace?")) return;
    if (await deletePlayground(id)) {
      setPlaygrounds((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleGenerate = (query: string = promptInput) => {
    if (!query.trim()) handleCreateEmpty();
    else router.push(`/playground?prompt=${encodeURIComponent(query.trim())}`);
  };

  const handleDeployPlayground = async (e: React.MouseEvent, pg: PlaygroundRow) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pg.graph_json) return;
    const customName = window.prompt("Enter a name for this deployment:", pg.name);
    if (customName === null) return;
    setDeployingId(pg.id);
    try {
      const result = await createDeployment({
        graph: pg.graph_json,
        playground_id: pg.id,
        name: customName || pg.name,
        user_id: user.id,
      });
      window.open(getDocsUrl(result.id), "_blank");
      setActiveTab("deployments");
    } catch (err) {
      console.error("Deploy failed:", err);
    } finally {
      setDeployingId(null);
    }
  };

  const workspaceInitial = (user.email ?? "U")[0].toUpperCase();
  const workspaceName = user.email?.split("@")[0] ?? "My Workspace";

  return (
    <div className="flex min-h-screen bg-white">

      {/* ════════════════════════════════════════
          SIDEBAR
      ════════════════════════════════════════ */}
      <div className="fixed left-0 top-0 flex h-screen w-56 flex-col border-r border-gray-200 bg-white px-3 pb-3 pt-4">

        {/* Workspace row */}
        <div className="mb-3 flex w-full items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="group flex items-center whitespace-nowrap h-8 w-full justify-start rounded-lg border-0 bg-transparent px-2 py-1 text-sm font-semibold text-gray-900 hover:bg-gray-100/60 transition-colors duration-75 outline-none"
            >
              <span className="min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <div className="flex items-center justify-center rounded-md bg-gray-200 text-[10px] font-black text-gray-500 size-5">
                      {workspaceInitial}
                    </div>
                  </div>
                  <span className="truncate text-[13px] font-semibold text-gray-900">{workspaceName}</span>
                </div>
              </span>
              <ChevronUpDownIcon />
            </button>
          </div>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 p-0 text-gray-400 hover:text-gray-500 transition-colors"
            title="New workspace"
          >
            <AddWorkspaceIcon />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1">
          <div className="flex flex-col gap-1">
            <NavItem label="Home" icon={HomeIcon} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
            <NavItem label="Deployments" icon={DeploymentsIcon} active={activeTab === "deployments"} onClick={() => setActiveTab("deployments")} />
            <NavItem label="Challenges" icon={ChallengesIcon} active={activeTab === "tasks"} onClick={() => setActiveTab("tasks")} />
            <NavItem label="Literature" icon={LibraryIcon} active={activeTab === "library"} onClick={() => setActiveTab("library")} />
          </div>

          <SectionLabel>Account</SectionLabel>
          <div className="flex flex-col gap-1">
            <button
              onClick={handleSignOut}
              className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm font-semibold transition-colors duration-75 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <span className="text-gray-500">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              Log out
            </button>
          </div>
        </nav>

        {/* Bottom */}
        <div className="flex flex-col gap-1">
          <button className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm font-semibold transition-colors duration-75 text-gray-500 hover:bg-gray-100">
            <span className="text-gray-500"><WhatsNewIcon /></span>
            What's new
          </button>
          <button className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm font-semibold transition-colors duration-75 text-gray-500 hover:bg-gray-100">
            <span className="text-gray-500"><MoreIcon /></span>
            More
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="w-56 shrink-0" />

      {/* ════════════════════════════════════════
          FIXED TOP BAR — DO NOT MODIFY
      ════════════════════════════════════════ */}
      <div className="fixed top-0 left-60 right-0 z-50 flex h-14 items-center justify-start bg-gradient-to-b from-white via-white to-white/0 pr-6 pointer-events-none">
        <span className="pointer-events-auto text-[20px] font-black tracking-tight text-gray-400 select-none">
          july<span className="text-[#0066FF] font-black">ai</span>
        </span>
      </div>

      {/* ════════════════════════════════════════
          MAIN CONTENT
      ════════════════════════════════════════ */}
      <div className="flex-1 overflow-x-hidden px-8 pb-32">

        {/* ── HOME ── */}
        {activeTab === "home" && (
          <>
            <div className="mx-auto w-screen max-w-xl pt-20">
              <div className="mb-6 flex items-center justify-center">
                <h1 className="text-3xl font-semibold text-black">What should we build?</h1>
              </div>

              {/* Prompt card */}
              <div className="relative mb-5 rounded-2xl bg-white p-4 pb-20 shadow-[0_0px_1px_0_rgba(0,0,0,0.30),0_8px_20px_0_rgba(0,0,0,0.08)] transition-all duration-150 hover:shadow-[0_0px_1px_0_rgba(0,0,0,0.40),0_8px_24px_0_rgba(0,0,0,0.15)]">
                <textarea
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                  className="min-h-[22px] w-full resize-none overflow-hidden bg-transparent text-sm text-black placeholder:text-gray-400 placeholder:font-normal font-medium outline-none"
                  placeholder="Describe the neural network architecture you need..."
                  rows={2}
                  style={{ height: "40px", overflowY: "hidden" }}
                />
                <div className="absolute bottom-4 left-4 flex items-center gap-2">
                  <button
                    onClick={() => document.getElementById("paper-upload")?.click()}
                    className="flex items-center gap-1 h-auto rounded-xl bg-transparent px-0 text-[13px] font-semibold text-gray-400 hover:text-gray-600 transition-colors pt-1.5"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="opacity-60">
                      <path d="M18 9.25V13C18 16.3137 15.3137 19 12 19C8.68629 19 6 16.3137 6 13V9C6 6.79086 7.79086 5 10 5C12.2091 5 14 6.79086 14 9V13.1C14 14.2046 13.1046 15.1 12 15.1C10.8954 15.1 10 14.2046 10 13.1V9.55" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Research Paper
                  </button>
                  <input
                    id="paper-upload"
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleGenerate(`Design the neural network architecture described in the research paper: ${file.name.replace(/\.[^/.]+$/, "")}`);
                    }}
                  />
                </div>
                <button
                  onClick={() => handleGenerate()}
                  className="absolute bottom-5 right-5 flex flex-row items-center gap-0 pr-2 select-none bg-[#0066FF] text-white rounded-lg px-3 py-1.5 text-sm font-semibold transition-all hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(0,102,255,0.25)]"
                >
                  Generate
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="ml-0.5 size-4">
                    <path d="M11.9995 17V7M11.9995 7L8 11M11.9995 7L16 11.0005" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Chips */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2 pb-4">
                <Chip label="Empty Graph" onClick={handleCreateEmpty} icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                } />
                <Chip label="Linear" onClick={() => handleGenerate("Linear Feedforward Neural Network")} icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                    <rect x="3" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
                    <rect x="10" y="7" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="2" />
                    <rect x="17" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
                    <line x1="7" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="2" />
                    <line x1="14" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="2" />
                  </svg>
                } />
                <Chip label="Vision CNN" onClick={() => handleGenerate("Vision CNN for image classification")} icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  </svg>
                } />
                <Chip label="Transformer" onClick={() => handleGenerate("Transformer language model")} icon={
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                    <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M12 3V21M4 7.5L20 16.5M20 7.5L4 16.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
                  </svg>
                } />
              </div>
            </div>

            {/* Recents */}
            <div className="mt-4">
              <div className="mx-auto mb-5 flex items-baseline" style={{ width: "693px" }}>
                <h1 className="text-[22px] font-semibold leading-[30px] text-black">Recents</h1>
              </div>
              <div className="flex justify-center">
                <div className="grid grid-cols-3 gap-5" style={{ width: "693px" }}>
                  {loading
                    ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
                    : playgrounds.length === 0
                      ? (
                        <div className="col-span-3 flex flex-col items-center justify-center py-20">
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="mb-3 text-gray-200">
                            <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                          <p className="text-sm font-semibold text-gray-400">No workspaces yet</p>
                          <p className="text-xs mt-1 text-gray-300">Generate or create an empty graph to get started</p>
                        </div>
                      )
                      : playgrounds.map((pg) => (
                        <div key={pg.id} className="group flex flex-col gap-3">
                          <Link href={`/playground/${pg.id}`} className="relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl border border-black/5 transition-all hover:border-black/10">
                            <WorkspaceThumbnail graph={pg.graph_json} />
                          </Link>
                          <div className="flex flex-row items-start justify-between gap-2">
                            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                              <Link href={`/playground/${pg.id}`} className="block truncate text-left text-sm font-semibold text-black">
                                {pg.name || "Untitled Workspace"}
                              </Link>
                              <div className="text-sm font-normal text-gray-400">{getRelativeTime(pg.created_at)}</div>
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                type="button"
                                onClick={(e) => handleDeployPlayground(e, pg)}
                                disabled={deployingId === pg.id}
                                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-amber-50 text-amber-400 disabled:opacity-40 transition-colors"
                                title="Deploy as live API"
                              >
                                {deployingId === pg.id
                                  ? <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" className="opacity-25" /><path d="M4 12a8 8 0 018-8" className="opacity-75" /></svg>
                                  : <Zap size={13} strokeWidth={2.5} />
                                }
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); handleDelete(pg.id); }}
                                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5 text-black/30 hover:text-black/50 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={13} strokeWidth={2} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── DEPLOYMENTS ── */}
        {activeTab === "deployments" && (
          <PageSection title="Your APIs">
            <DeployDashboard userId={user.id} />
          </PageSection>
        )}

        {/* ── CHALLENGES ── */}
        {activeTab === "tasks" && (
          <PageSection title="Challenges">
            <div className="grid grid-cols-3 gap-5">
              {levels.filter((l) => l.section === "challenges" || !l.section).map((level) => {
                const isDone = completedLevels.has(level.level_number);
                return (
                  <div key={level.id} className="group flex flex-col gap-3">
                    <Link
                      href={`/playground?level=${level.level_number}`}
                      className="relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-[#EFF3F8] transition-all hover:bg-[#e5eaf1]"
                    >
                      <span className="text-[28px] font-black text-black/10 tracking-tighter select-none">
                        T{level.level_number.toString().padStart(2, "0")}
                      </span>
                      {isDone && (
                        <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                        </div>
                      )}
                    </Link>
                    <div className="flex flex-col gap-0.5">
                      <Link href={`/playground?level=${level.level_number}`} className="block truncate text-left text-sm font-semibold text-black">
                        {level.name}
                      </Link>
                      <div className="text-sm font-normal text-gray-400 truncate">{level.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </PageSection>
        )}

        {/* ── LITERATURE ── */}
        {activeTab === "library" && (
          <PageSection title="Literature">
            <div className="grid grid-cols-3 gap-5">
              {levels.filter((l) => l.section === "papers").map((level) => {
                const isDone = completedLevels.has(level.level_number);
                return (
                  <div key={level.id} className="group flex flex-col gap-3">
                    <Link
                      href={`/playground?level=${level.level_number}`}
                      className="relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-slate-100 transition-all hover:bg-slate-200/70"
                    >
                      <FileText size={40} className="text-black/10" strokeWidth={1.5} />
                      {isDone && (
                        <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                        </div>
                      )}
                    </Link>
                    <div className="flex flex-col gap-0.5">
                      <Link href={`/playground?level=${level.level_number}`} className="block truncate text-left text-sm font-semibold text-black">
                        {level.name}
                      </Link>
                      <div className="text-sm font-normal text-gray-400 truncate">{level.paper_category ?? "Architecture"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </PageSection>
        )}

      </div>
    </div>
  );
}