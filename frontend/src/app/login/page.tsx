"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GripVertical, Zap, Eye, Command, ArrowRight } from "lucide-react";

/* ── Minimalist Engineering Dot Grid ───────────────────────────────────── */
function TechDotGrid() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[var(--background)]" aria-hidden>
      {/* Crisp, high-contrast, perfectly spaced IDE dot grid */}
      <svg className="absolute inset-0 h-full w-full opacity-40" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dotgrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <rect width="24" height="24" fill="none" />
            <circle cx="12" cy="12" r="1" fill="var(--border-strong)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)" />
      </svg>
    </div>
  );
}

/* ── Schematic Code Block Illustration ────────────────────────────────── */
function SchematicIllustration() {
  return (
    <div className="flex justify-center mb-10 mt-2 select-none pointer-events-none">
      <div className="flex items-center gap-3 opacity-80 font-mono text-xs">
        <div className="flex flex-col items-end gap-2 text-[var(--foreground-muted)]">
          <span>Input[Batch, 768]</span>
          <span>Linear(768, 3072)</span>
          <span>GeLU()</span>
        </div>
        <div className="flex flex-col gap-2 relative">
          <div className="absolute left-[50%] -top-4 bottom-[-16px] w-[1px] bg-[var(--border-neutral)]"></div>
          {/* Connection nodes */}
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] z-10 mx-auto"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] z-10 mx-auto"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] z-10 mx-auto"></div>
        </div>
        <div className="flex flex-col items-start gap-2 text-[var(--foreground-muted)]">
          <span>{`{ status: "ok" }`}</span>
          <span>{`{ grads: true }`}</span>
          <span>{`{ act: 0.94 }`}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Feature Pills ────────────────────────────────────────────────────── */
function FeaturePills() {
  const features = [
    { icon: GripVertical, label: "Visual Graph" },
    { icon: Zap, label: "Real-time Training" },
    { icon: Eye, label: "Tensor Inspection" },
  ];

  return (
    <div className="flex flex-wrap gap-3 justify-center mt-8">
      {features.map((f) => {
        const Icon = f.icon;
        return (
          <span
            key={f.label}
            className="inline-flex items-center gap-1.5 rounded-sm bg-[var(--background-subtle)] px-2.5 py-1 text-[11px] uppercase tracking-wider font-mono text-[var(--foreground-secondary)] border border-[var(--border)]"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.5} />
            {f.label}
          </span>
        );
      })}
    </div>
  );
}

/* ── Main Login Page ──────────────────────────────────────────────────── */
export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("user@july.ai");
  const [password, setPassword] = useState("password123");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/");
    });
    return () => subscription.unsubscribe();
  }, [supabase.auth, router]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (isSignUp) {
      const { error: err } = await supabase.auth.signUp({
        email,
        password,
      });
      if (err) {
        setError(err.message);
        setLoading(false);
      } else {
        setMessage("Account created. You can now sign in.");
        setIsSignUp(false);
        setLoading(false);
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(err.message);
        setLoading(false);
      }
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 bg-[var(--background)] selection:bg-[rgba(0,128,255,0.2)] selection:text-[var(--foreground)]">
      <TechDotGrid />

      {/* Top right floating command icon for the "IDE" feel */}
      <div className="absolute top-6 right-6 hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-[var(--foreground-muted)] border border-[var(--border)] px-2 py-1 rounded shadow-sm bg-[var(--surface)]">
        <Command className="w-3.5 h-3.5" />
        <span>K</span>
        <span className="ml-1">to search</span>
      </div>

      <div className="relative z-10 w-full max-w-[360px] animate-fade-in">
        {/* Brand */}
        <div className="flex justify-center mb-6">
          <div className="flex items-center gap-2">
             <div className="h-6 w-6 rounded bg-[var(--foreground)] text-[var(--surface)] flex items-center justify-center font-bold text-xs uppercase tracking-tighter">
               J
             </div>
             <h1 className="text-xl font-medium tracking-tight text-[var(--foreground)]">
               JulyAI
             </h1>
          </div>
        </div>

        {/* Schematic illustration */}
        <SchematicIllustration />

        {/* Auth Card */}
        <div className="rounded-lg border border-[var(--border-neutral)] bg-[var(--surface)] shadow-md p-6">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-1 uppercase tracking-wider font-mono">
              {isSignUp ? "INITIALIZE_ACCOUNT" : "AUTHENTICATE"}
            </h2>
            <p className="text-xs text-[var(--foreground-muted)]">
              {isSignUp ? "Create a new workspace profile." : "Enter your credentials to continue."}
            </p>
          </div>

          {error && (
            <div
              className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600 font-mono"
              role="alert"
            >
              Error: {error}
            </div>
          )}
          {message && (
            <div
              className="mb-4 rounded border border-green-200 bg-green-50 px-3 py-2 text-[11px] text-green-600 font-mono"
              role="alert"
            >
              Success: {message}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--foreground-secondary)] pl-1">
                Workspace Email
              </label>
              <input
                type="email"
                placeholder="eng@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded border border-[var(--border-strong)] bg-[var(--background-subtle)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface)] placeholder:text-[var(--foreground-muted)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-[var(--foreground-secondary)] pl-1">
                Access Token
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded border border-[var(--border-strong)] bg-[var(--background-subtle)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--surface)] placeholder:text-[var(--foreground-muted)]"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="mt-2 relative overflow-hidden flex items-center justify-between rounded bg-[var(--foreground)] text-[var(--surface)] border border-transparent px-4 py-2.5 font-medium transition-all hover:bg-[#33373a] active:scale-[0.99] disabled:opacity-90 disabled:cursor-wait font-mono text-xs w-full group"
            >
              {loading ? (
                <div className="w-full flex items-center gap-2">
                   {/* Using the global 'generating-text' animation logic */}
                   <div className="generating-text text-[var(--surface)] opacity-90 mx-auto">
                     {isSignUp ? "PROVISIONING..." : "COMPILING..."}
                   </div>
                </div>
              ) : (
                <>
                  <span>{isSignUp ? "Create Workspace" : "Execute Login"}</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-70 group-hover:opacity-100 transition-opacity" />
                </>
              )}
              {loading && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] animate-[generating-shimmer_1.5s_infinite]" />
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-[var(--border)] pt-4">
             <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-[11px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors w-full text-center font-mono"
              >
                {isSignUp ? "← Back to Login" : "Initialize New Account →"}
              </button>
          </div>
        </div>

        <FeaturePills />

      </div>
    </div>
  );
}
