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
import { Trash2, Plus, FileText, Zap } from "lucide-react";
import { createDeployment, getDocsUrl } from "@/neuralcanvas/lib/deployApi";
import { DeployDashboard } from "@/components/deploy/DeployDashboard";

type TabId = "home" | "tasks" | "library" | "deployments";

// ---------------------------------------------------------------------------
// Banani-exact SVGs (copy-pasted from their DOM)
// ---------------------------------------------------------------------------

const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.0476 5.67346L9.39683 4.91421L10.0476 5.67346ZM13.9524 5.67346L13.3016 6.43272V6.43272L13.9524 5.67346ZM19 11.3798H18V16H19H20V11.3798H19ZM5 16H6V11.3798H5H4V16H5ZM6.04763 9.10204L6.69842 9.86129L10.6984 6.43272L10.0476 5.67346L9.39683 4.91421L5.39683 8.34278L6.04763 9.10204ZM13.9524 5.67346L13.3016 6.43272L17.3016 9.86129L17.9524 9.10204L18.6032 8.34278L14.6032 4.91421L13.9524 5.67346ZM16 19V18H8V19V20H16V19ZM19 11.3798H20C20 10.2121 19.4897 9.10271 18.6032 8.34278L17.9524 9.10204L17.3016 9.86129C17.7449 10.2413 18 10.796 18 11.3798H19ZM5 11.3798H6C6 10.796 6.25513 10.2413 6.69842 9.86129L6.04763 9.10204L5.39683 8.34278C4.51025 9.10271 4 10.2121 4 11.3798H5ZM19 16H18C18 17.1046 17.1046 18 16 18V19V20C18.2091 20 20 18.2091 20 16H19ZM10.0476 5.67346L10.6984 6.43272C11.4474 5.79074 12.5526 5.79074 13.3016 6.43272L13.9524 5.67346L14.6032 4.91421C13.1052 3.63024 10.8948 3.63024 9.39683 4.91421L10.0476 5.67346ZM5 16H4C4 18.2091 5.79086 20 8 20V19V18C6.89543 18 6 17.1046 6 16H5Z" fill="currentColor" />
    <path d="M14 19V15C14 13.8954 13.1046 13 12 13C10.8954 13 10 13.8954 10 15V19" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const DesignsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 9H6" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="round" />
    <path d="M9 18V10" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="round" />
    <path d="M12.6 5H11.4C9.15979 5 8.03969 5 7.18404 5.43597C6.43139 5.81947 5.81947 6.43139 5.43597 7.18404C5 8.03969 5 9.15979 5 11.4V12.6C5 14.8402 5 15.9603 5.43597 16.816C5.81947 17.5686 6.43139 18.1805 7.18404 18.564C8.03969 19 9.15979 19 11.4 19H12.6C14.8402 19 15.9603 19 16.816 18.564C17.5686 18.1805 18.1805 17.5686 18.564 16.816C19 15.9603 19 14.8402 19 12.6V11.4C19 9.15979 19 8.03969 18.564 7.18404C18.1805 6.43139 17.5686 5.81947 16.816 5.43597C15.9603 5 14.8402 5 12.6 5Z" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// Challenges icon — using the "archive restore" shape
const ChallengesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14.7519 12.8321L11.5547 14.9635C10.8901 15.4066 10 14.9302 10 14.1315V9.86852C10 9.06982 10.8901 8.59343 11.5547 9.03647L14.7519 11.1679C15.3457 11.5638 15.3457 12.4362 14.7519 12.8321Z" stroke="currentColor" strokeWidth="2" />
    <path d="M12.6 5H11.4C9.15979 5 8.03969 5 7.18404 5.43597C6.43139 5.81947 5.81947 6.43139 5.43597 7.18404C5 8.03969 5 9.15979 5 11.4V12.6C5 14.8402 5 15.9603 5.43597 16.816C5.81947 17.5686 6.43139 18.1805 7.18404 18.564C8.03969 19 9.15979 19 11.4 19H12.6C14.8402 19 15.9603 19 16.816 18.564C17.5686 18.1805 18.1805 17.5686 18.564 16.816C19 15.9603 19 14.8402 19 12.6V11.4C19 9.15979 19 8.03969 18.564 7.18404C18.1805 6.43139 17.5686 5.81947 16.816 5.43597C15.9603 5 14.8402 5 12.6 5Z" stroke="currentColor" strokeWidth="2" />
  </svg>
);

// Library icon — using Banani's MCP robot face icon (fits "library" as a secondary nav feel)
const LibraryIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 14H8.4C7.2 14 6 13 6 11C6 9 7.2 8 8.4 8H12L18 4V18L12 14Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M7 13.5C7.5 16 9.66676 18.1667 11.0001 19L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WhatsNewIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 14H8.4C7.2 14 6 13 6 11C6 9 7.2 8 8.4 8H12L18 4V18L12 14Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M7 13.5C7.5 16 9.66676 18.1667 11.0001 19L11 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MoreIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <mask id="mask0" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24" style={{ maskType: "alpha" }}>
      <rect width="24" height="24" fill="#D9D9D9" />
    </mask>
    <g mask="url(#mask0)">
      <path d="M12.2495 5.00781C13.0409 5.08183 13.6963 5.66188 13.8657 6.43848L13.894 6.60742L13.9624 7.16406C13.9761 7.18262C13.9968 7.20731 14.0374 7.2405 14.0972 7.2666C14.2774 7.34538 14.4523 7.43422 14.6216 7.5332C14.7865 7.62968 14.946 7.73566 15.0991 7.85059C15.1526 7.89072 15.2031 7.91002 15.2358 7.91602C15.2644 7.92123 15.2603 7.91895L15.7856 7.69531C16.581 7.35791 17.4959 7.62763 17.9849 8.32129L18.0767 8.46582L18.1538 8.61719C18.5045 9.38543 18.2808 10.3059 17.5952 10.8242L17.0972 11.1992C17.1284 11.4465 17.1431 11.6838 17.1431 11.9229C17.1431 12.1619 17.1284 12.3992 17.0981 12.6338L17.5923 13.0186C18.325 13.5724 18.5317 14.5851 18.0747 15.3818C17.6183 16.1775 16.642 16.5111 15.7944 16.1602L15.2495 15.9336C15.1974 15.9418 15.1518 15.9582 15.103 15.9941C14.9484 16.1083 14.7877 16.2144 14.6216 16.3115C14.4498 16.412 14.2724 16.5024 14.0894 16.582C14.0301 16.6078 13.9898 16.6408 13.9692 16.665C13.9556 16.6826L13.8804 17.2549C13.7601 18.165 12.984 18.8447 12.0659 18.8447C11.1415 18.8447 10.3623 18.1557 10.2495 17.2383L10.1812 16.6816C10.1675 16.6631C10.1467 16.6384 10.1061 16.6042 10.0464 16.5781C9.86612 16.4993 9.69123 16.4105 9.52197 16.3115C9.35698 16.215 9.19764 16.1091 9.04443 15.9941C8.99095 15.954 8.94047 15.9347 8.90771 15.9287C8.87899 15.9235 8.8833 15.9258L8.35693 16.1494C7.50867 16.509 6.5253 16.1782 6.06689 15.3789C5.61101 14.5837 5.8171 13.5732 6.54834 13.0205L7.04541 12.6436C7.01458 12.3977 6.99952 12.1619 6.99951 11.9229C6.99951 11.6743 7.01424 11.432 7.04541 11.1982L6.56201 10.8281C5.82243 10.2776 5.61117 9.26075 6.06982 8.46094L6.16162 8.31738C6.61482 7.67373 7.43396 7.39447 8.18604 7.62695L8.34619 7.68457L8.89404 7.91113C8.9165 7.9082C8.94615 7.9029 8.99177 7.88659 9.04053 7.85059C9.19515 7.73641 9.35588 7.63035 9.52197 7.5332C9.69362 7.43283 9.87125 7.34327 10.0542 7.26367C10.1134 7.23792 10.1537 7.20492 10.1743 7.18066C10.188 7.16211L10.2632 6.59082L10.2935 6.42285C10.481 5.59802 11.2168 5 12.0776 5L12.2495 5.00781Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <rect x="10" y="10" width="4" height="4" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

// Add workspace icon (the + button next to workspace name in Banani)
const AddWorkspaceIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g opacity="0.5">
      <path d="M12.6 5H11.4C9.15979 5 8.03969 5 7.18404 5.43597C6.43139 5.81947 5.81947 6.43139 5.43597 7.18404C5 8.03969 5 9.15979 5 11.4V12.6C5 14.8402 5 15.9603 5.43597 16.816C5.81947 17.5686 6.43139 18.1805 7.18404 18.564C8.03969 19 9.15979 19 11.4 19H12.6C14.8402 19 15.9603 19 16.816 18.564C17.5686 18.1805 18.1805 17.5686 18.564 16.816C19 15.9603 19 14.8402 19 12.6V11.4C19 9.15979 19 8.03969 18.564 7.18404C18.1805 6.43139 17.5686 5.81947 16.816 5.43597C15.9603 5 14.8402 5 12.6 5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M12 9V12M12 12H9M12 12V15M12 12H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

// Chevron up/down for workspace switcher
const ChevronUpDownIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
    <g opacity="0.3">
      <path d="M6 12L10 15L14 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 8L10 5L14 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

// ---------------------------------------------------------------------------
// Sidebar nav item — exact Banani structure
// ---------------------------------------------------------------------------

function NavItem({
  label, icon: Icon, active, onClick,
}: {
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
        ${active
          ? "bg-primary/20 text-gray-900"
          : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        }
      `}
    >
      <span className={active ? "text-gray-900" : "text-gray-500"}>
        <Icon />
      </span>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Section label — small gray uppercase header between nav groups
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex h-8 items-center px-2 pb-1 text-sm font-semibold text-gray-400">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace card thumbnail placeholder
// ---------------------------------------------------------------------------

function WorkspaceThumbnail() {
  return (
    <div className="relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-[#f0f2f5]">
      {/* Generic neural network placeholder SVG */}
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

// ---------------------------------------------------------------------------
// Quick-start chip
// ---------------------------------------------------------------------------

function Chip({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-24 cursor-pointer flex-col items-center gap-2 group"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 transition-transform duration-150 group-hover:scale-105">
        {icon}
      </div>
      <span className="text-sm font-semibold text-gray-600 text-center leading-tight">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function getRelativeTime(timestamp?: string) {
  if (!timestamp) return "Just now";
  const ms = Math.abs(Date.now() - new Date(timestamp).getTime());
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours === 0) return "Just now";
  if (hours < 24) return `Edited ${hours}h ago`;
  return `Edited ${Math.floor(hours / 24)}d ago`;
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
      const docsUrl = getDocsUrl(result.id);
      window.open(docsUrl, "_blank");
      setActiveTab("deployments");
    } catch (err) {
      console.error("Deploy failed:", err);
    } finally {
      setDeployingId(null);
    }
  };

  // Workspace initial from email
  const workspaceInitial = (user.email ?? "U")[0].toUpperCase();
  const workspaceName = user.email?.split("@")[0] ?? "My Workspace";

  return (
    <div className="flex min-h-screen bg-white">

      {/* ══════════════════════════════════════════════════════
          SIDEBAR — pixel-perfect Banani replica
          w-56, border-r border-gray-200, bg-white
      ══════════════════════════════════════════════════════ */}
      <div className="fixed left-0 top-0 flex h-screen w-56 flex-col border-r border-gray-200 bg-white px-3 pb-3 pt-4">

        {/* ── Workspace switcher row ── */}
        <div className="mb-3 flex w-full items-center gap-1.5">
          {/* Workspace dropdown trigger */}
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="
                group flex items-center whitespace-nowrap
                h-8 w-full justify-start rounded-lg
                border-0 bg-transparent px-2 py-1
                text-sm font-semibold text-gray-900
                hover:bg-gray-100/60 transition-colors duration-75
                outline-none
              "
            >
              <span className="min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                  {/* Avatar */}
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <div className="flex items-center justify-center rounded-md bg-gray-200 text-[10px] font-black text-gray-500 size-5">
                      {workspaceInitial}
                    </div>
                  </div>
                  {/* Name */}
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-semibold text-gray-900">{workspaceName}</span>
                  </div>
                </div>
              </span>
              <ChevronUpDownIcon />
            </button>
          </div>

          {/* Add workspace button */}
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 p-0 text-gray-400 hover:text-gray-500 transition-colors"
            title="New workspace"
          >
            <AddWorkspaceIcon />
          </button>

          {/* Separator + July AI wordmark
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-px h-3.5 bg-gray-200 rounded-full" />
            <span className="text-[11px] font-black tracking-tight text-gray-400 select-none leading-none">
              july<span className="text-gray-300">ai</span>
            </span>
          </div> */}
        </div>

        {/* ── Main nav ── */}
        <nav className="flex-1">
          <div className="flex flex-col gap-1">
            <NavItem
              id={"home" as TabId}
              label="Home"
              icon={HomeIcon}
              active={activeTab === "home"}
              onClick={() => setActiveTab("home")}
            />
            <NavItem
              id={"deployments" as TabId}
              label="Deployments"
              icon={() => <Zap size={18} strokeWidth={1.5} />}
              active={activeTab === "deployments"}
              onClick={() => setActiveTab("deployments")}
            />
            <NavItem
              id={"tasks" as TabId}
              label="Challenges"
              icon={ChallengesIcon}
              active={activeTab === "tasks"}
              onClick={() => setActiveTab("tasks")}
            />
            <NavItem
              id={"library" as TabId}
              label="Literature"
              icon={LibraryIcon}
              active={activeTab === "library"}
              onClick={() => setActiveTab("library")}
            />
          </div>

          {/* Team section */}
          <SectionLabel>Account</SectionLabel>
          <div className="flex flex-col gap-1">
            <button
              onClick={handleSignOut}
              className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-sm font-semibold transition-colors duration-75 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <span className="text-gray-500">
                {/* Log out icon */}
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

        {/* ── Bottom items (What's new, More) ── */}
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

      {/* ══════════════════════════════════════════════════════
          SPACER (pushes content past fixed sidebar)
      ══════════════════════════════════════════════════════ */}
      <div className="w-56 shrink-0" />

      {/* ══════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════ */}
      {/* Fixed top bar */}
      <div className="fixed top-0 left-60 right-0 z-50 flex h-14 items-center justify-start bg-gradient-to-b from-white via-white to-white/0 pr-6 pointer-events-none">
        <span className="pointer-events-auto text-[20px] font-black tracking-tight text-gray-900 select-none">
          july<span className="text-gray-400 font-black">ai</span>
        </span>
      </div>

      <div className="Chat-module__pageContainer flex-1 overflow-x-hidden px-8 pb-32">

        {/* ── HOME TAB ── */}
        {activeTab === "home" && (
          <>
            {/* Hero prompt area */}
            <div className="mx-auto w-screen max-w-xl pt-20">

              <div className="mb-6 flex items-center justify-center">
                <h1 className="text-3xl font-semibold text-black">What should we build?</h1>
              </div>

              {/* Prompt card — exact Banani shadow */}
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

                {/* Bottom row */}
                <div className="absolute bottom-4 left-4 flex items-center gap-2">
                  {/* Attach icon (Banani uses a paperclip-style) */}
                  <button
                    onClick={() => document.getElementById("paper-upload")?.click()}
                    className="flex items-center gap-0.5 h-auto w-auto rounded-xl bg-transparent px-0 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-colors pb-0 pt-1.5"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="opacity-60">
                      <path d="M18 9.25V13C18 16.3137 15.3137 19 12 19C8.68629 19 6 16.3137 6 13V9C6 6.79086 7.79086 5 10 5C12.2091 5 14 6.79086 14 9V13.1C14 14.2046 13.1046 15.1 12 15.1C10.8954 15.1 10 14.2046 10 13.1V9.55" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span className="select-none text-[13px]">Research Paper</span>
                  </button>
                  <input
                    id="paper-upload"
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const name = file.name.replace(/\.[^/.]+$/, "");
                        handleGenerate(`Design the neural network architecture described in the research paper: ${name}`);
                      }
                    }}
                  />
                </div>

                {/* Generate button — exact Banani */}
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

              {/* Quick-start chips — exact Banani layout */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2 pb-4">
                <Chip
                  label="Empty Graph"
                  onClick={handleCreateEmpty}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  }
                />
                <Chip
                  label="Linear"
                  onClick={() => handleGenerate("Linear Feedforward Neural Network")}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                      <rect x="3" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
                      <rect x="10" y="7" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="2" />
                      <rect x="17" y="9" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
                      <line x1="7" y1="12" x2="10" y2="12" stroke="currentColor" strokeWidth="2" />
                      <line x1="14" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  }
                />
                <Chip
                  label="Vision CNN"
                  onClick={() => handleGenerate("Vision CNN for image classification")}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                    </svg>
                  }
                />
                <Chip
                  label="Transformer"
                  onClick={() => handleGenerate("Transformer language model")}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                      <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M12 3V21M4 7.5L20 16.5M20 7.5L4 16.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
                    </svg>
                  }
                />
                {/* <Chip
                  label="Landing page"
                  onClick={() => handleGenerate("LSTM sequence model")}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-gray-600">
                      <path d="M9 14H8.00004C4.00001 14 3.99996 9 8.00004 9H9M9 14H13C15 16.5 18 18 18 18V5C18 5 15 6.5 13 9H9M9 14V9" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                  }
                /> */}
              </div>
            </div>

            {/* Recents grid */}
            <div className="flex flex-col gap-16 mt-4">
              <div>
                <div className="mx-auto mb-4 flex items-baseline justify-between" style={{ width: "693px" }}>
                  <h1 className="text-[22px] font-semibold leading-[30px] text-black">Recents</h1>
                </div>

                <div className="flex justify-center">
                  <div className="grid grid-cols-3 gap-5" style={{ width: "693px" }}>
                    {loading
                      ? [0, 1, 2].map((i) => (
                        <div key={i} className="flex flex-col gap-4">
                          <div className="relative flex aspect-[300/170] w-full animate-pulse overflow-hidden rounded-3xl bg-gray-100 border border-black/5" />
                          <div className="flex flex-col gap-1.5">
                            <div className="h-3.5 w-3/4 rounded bg-gray-100 animate-pulse" />
                            <div className="h-3 w-1/2 rounded bg-gray-50 animate-pulse" />
                          </div>
                        </div>
                      ))
                      : playgrounds.length === 0
                        ? (
                          <div className="col-span-3 flex flex-col items-center justify-center py-16 text-gray-400">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mb-3 opacity-30">
                              <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
                              <path d="M12 8V16M8 12H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <p className="text-sm font-semibold">No workspaces yet</p>
                            <p className="text-xs mt-1">Generate or create an empty graph to get started</p>
                          </div>
                        )
                        : playgrounds.map((pg) => (
                          <div key={pg.id} className="group flex flex-col gap-4">
                            <Link href={`/playground/${pg.id}`} className="Chat-module__projectCover border border-black/5 relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl transition-all hover:border-black/10">
                              <WorkspaceThumbnail />
                            </Link>
                            <div className="flex flex-row items-start justify-between gap-4">
                              <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                                <Link href={`/playground/${pg.id}`} className="block truncate text-left text-sm font-semibold text-black">
                                  {pg.name || "Untitled Workspace"}
                                </Link>
                                <div className="text-sm font-normal text-gray-400">{getRelativeTime(pg.created_at)}</div>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => handleDeployPlayground(e, pg)}
                                  disabled={deployingId === pg.id}
                                  className="relative flex h-7 w-7 items-center justify-center rounded-full hover:bg-amber-50 text-amber-500 transition-all disabled:opacity-50"
                                  title="Deploy as live API"
                                >
                                  {deployingId === pg.id ? (
                                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <circle cx="12" cy="12" r="10" className="opacity-25" />
                                      <path d="M4 12a8 8 0 018-8" className="opacity-75" />
                                    </svg>
                                  ) : (
                                    <Zap size={14} strokeWidth={2} />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); handleDelete(pg.id); }}
                                  className="relative flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/10 text-black/40 transition-all"
                                >
                                  <Trash2 size={14} strokeWidth={2} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── CHALLENGES TAB ── */}
        {activeTab === "tasks" && (
          <div className="flex flex-col gap-16 pt-20">
            <div>
              <div className="mx-auto mb-4 flex items-baseline justify-between" style={{ width: "693px" }}>
                <h1 className="text-[22px] font-semibold leading-[30px] text-black">Challenges</h1>
              </div>
              <div className="flex justify-center">
                <div className="grid grid-cols-3 gap-5" style={{ width: "693px" }}>
                  {levels.filter((l) => l.section === "challenges" || !l.section).map((level) => {
                    const isDone = completedLevels.has(level.level_number);
                    return (
                      <div key={level.id} className="group flex flex-col gap-4">
                        <Link
                          href={`/playground?level=${level.level_number}`}
                          className="relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-[#EFF3F8] transition-all hover:bg-[#e5eaf1] hover:border-black/8"
                        >
                          <span className="text-[28px] font-black text-black/10 tracking-tighter select-none">
                            T{level.level_number.toString().padStart(2, "0")}
                          </span>
                          {isDone && (
                            <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                            </div>
                          )}
                        </Link>
                        <div className="flex flex-row items-start justify-between gap-4">
                          <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                            <Link href={`/playground?level=${level.level_number}`} className="block truncate text-left text-sm font-semibold text-black">
                              {level.name}
                            </Link>
                            <div className="text-sm font-normal text-gray-400 truncate">{level.description}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── LIBRARY TAB ── */}
        {activeTab === "library" && (
          <div className="flex flex-col gap-16 pt-20">
            <div>
              <div className="mx-auto mb-4 flex items-baseline justify-between" style={{ width: "693px" }}>
                <h1 className="text-[22px] font-semibold leading-[30px] text-black">Literature</h1>
              </div>
              <div className="flex justify-center">
                <div className="grid grid-cols-3 gap-5" style={{ width: "693px" }}>
                  {levels.filter((l) => l.section === "papers").map((level) => {
                    const isDone = completedLevels.has(level.level_number);
                    return (
                      <div key={level.id} className="group flex flex-col gap-4">
                        <Link
                          href={`/playground?level=${level.level_number}`}
                          className="relative flex aspect-[300/170] w-full items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-slate-100 transition-all hover:bg-slate-200/70"
                        >
                          <FileText size={48} className="text-black/10" strokeWidth={1.5} />
                          {isDone && (
                            <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                            </div>
                          )}
                        </Link>
                        <div className="flex flex-row items-start justify-between gap-4">
                          <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                            <Link href={`/playground?level=${level.level_number}`} className="block truncate text-left text-sm font-semibold text-black">
                              {level.name}
                            </Link>
                            <div className="text-sm font-normal text-gray-400 truncate">{level.paper_category ?? "Architecture"}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DEPLOYMENTS TAB ── */}
        {activeTab === "deployments" && (
          <div className="flex flex-col gap-16 pt-20">
            <div>
              <div className="mx-auto mb-4 flex items-baseline justify-between" style={{ width: "693px" }}>
                <h1 className="text-[22px] font-semibold leading-[30px] text-black">Live APIs</h1>
              </div>
              <div className="flex justify-center">
                 <div style={{ width: "693px" }}>
                    <DeployDashboard userId={user.id} />
                 </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}