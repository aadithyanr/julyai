"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GripVertical, Zap, Eye } from "lucide-react";

/* ── Soft pastel gradient background with floating shapes ────────────── */
function LightBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Subtle dot grid */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="14" r="1" fill="var(--accent)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)" />
      </svg>

      {/* Pastel gradient blobs */}
      <div
        className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, #C7D2FE 0%, transparent 70%)" }}
      />
      <div
        className="absolute top-1/3 -right-32 h-[400px] w-[400px] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, #BBF7D0 0%, transparent 70%)" }}
      />
      <div
        className="absolute -bottom-32 left-1/3 h-[350px] w-[350px] rounded-full opacity-20 blur-[100px]"
        style={{ background: "radial-gradient(circle, #FECDD3 0%, transparent 70%)" }}
      />
    </div>
  );
}

/* ── CSS-only neural network illustration ─────────────────────────────── */
function NeuralIllustration() {
  const layers = [
    { count: 3, color: "var(--block-input)" },
    { count: 4, color: "var(--accent)" },
    { count: 4, color: "var(--block-conv)" },
    { count: 2, color: "var(--block-output)" },
  ];

  const layerSpacing = 56;
  const nodeRadius = 6;
  const startX = 30;
  const totalWidth = startX * 2 + (layers.length - 1) * layerSpacing;
  const maxNodes = Math.max(...layers.map((l) => l.count));
  const totalHeight = maxNodes * 28 + 20;

  const getY = (nodeIndex: number, total: number) => {
    const spacing = 28;
    const layerHeight = (total - 1) * spacing;
    return (totalHeight - layerHeight) / 2 + nodeIndex * spacing;
  };

  return (
    <div className="flex justify-center mb-6">
      <svg
        width={totalWidth}
        height={totalHeight}
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="opacity-60"
      >
        {/* Connections */}
        {layers.map((layer, li) => {
          if (li === 0) return null;
          const prev = layers[li - 1];
          return Array.from({ length: prev.count }).flatMap((_, pi) =>
            Array.from({ length: layer.count }).map((_, ni) => (
              <line
                key={`${li}-${pi}-${ni}`}
                x1={startX + (li - 1) * layerSpacing}
                y1={getY(pi, prev.count)}
                x2={startX + li * layerSpacing}
                y2={getY(ni, layer.count)}
                stroke="#D1D5DB"
                strokeWidth="1"
                opacity="0.6"
              />
            ))
          );
        })}
        {/* Nodes */}
        {layers.map((layer, li) =>
          Array.from({ length: layer.count }).map((_, ni) => (
            <circle
              key={`node-${li}-${ni}`}
              cx={startX + li * layerSpacing}
              cy={getY(ni, layer.count)}
              r={nodeRadius}
              fill={layer.color}
              opacity="0.85"
            />
          ))
        )}
      </svg>
    </div>
  );
}

/* ── Logo ──────────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white shadow-lg overflow-hidden border border-[var(--border-muted)]">
        <img src="/logo.png" alt="JulyAI Logo" className="w-full h-full object-cover scale-110" />
      </div>
      <h1
        className="text-4xl font-bold tracking-tight text-[var(--foreground)]"
        style={{ fontFamily: "var(--font-outfit), var(--font-sans)" }}
      >
        JulyAI
      </h1>
    </div>
  );
}


/* ── Feature Pills ────────────────────────────────────────────────────── */
function FeaturePills() {
  const features = [
    { icon: GripVertical, label: "Drag & Drop", color: "#F59E0B" },
    { icon: Zap, label: "Train in Real-time", color: "#6366F1" },
    { icon: Eye, label: "Peek Inside Models", color: "#10B981" },
  ];

  return (
    <div className="flex flex-wrap gap-2.5 justify-center mt-8">
      {features.map((f) => {
        const Icon = f.icon;
        return (
          <span
            key={f.label}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2 text-xs font-medium text-[var(--foreground-secondary)] shadow-sm border border-[var(--border)]"
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color: f.color }} strokeWidth={2.25} />
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
      } else {
        setMessage("Account created! You can now sign in (or check email for confirmation).");
        setIsSignUp(false);
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        // Log errors or handle invalid credentials
        setError(err.message);
      }
    }
    setLoading(false);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 bg-gradient-to-b from-[var(--background)] to-[var(--background-subtle)]">
      <LightBg />

      <div className="relative z-10 w-full max-w-[420px] animate-fade-in">
        {/* Brand */}
        <div className="flex justify-center mb-6">
          <Logo />
        </div>

        {/* Neural illustration */}
        <NeuralIllustration />

        <p className="text-center text-[var(--foreground-muted)] text-[13px] mb-8">
          The next generation of visual intelligence.
        </p>

        {/* Auth Card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm p-8 shadow-lg">
          <h2 className="text-center text-lg font-semibold text-[var(--foreground)] mb-1">
            Get Started
          </h2>
          <p className="text-center text-xs text-[var(--foreground-muted)] mb-6">
            Sign in to save your playgrounds and track progress
          </p>

          {error && (
            <div
              className="mb-5 rounded-xl bg-[var(--danger-muted)] border border-[var(--danger)]/30 px-4 py-3 text-sm text-[var(--danger)]"
              role="alert"
            >
              {error}
            </div>
          )}
          {message && (
            <div
              className="mb-5 rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-500"
              role="alert"
            >
              {message}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
            <div>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background-subtle)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--foreground-muted)]"
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background-subtle)] px-4 py-3 text-sm text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] placeholder:text-[var(--foreground-muted)]"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[var(--foreground)] text-[var(--background)] px-4 py-3.5 font-medium transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Spinner /> : null}
              <span className="text-sm">{isSignUp ? "Create Account" : "Sign In"}</span>
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-[var(--foreground-muted)] leading-relaxed">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-[var(--foreground)] hover:underline focus:outline-none font-medium"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </div>

        {/* Feature pills */}
        <FeaturePills />

        {/* Footer */}
        <p className="text-center text-[11px] text-[var(--foreground-muted)] mt-8 opacity-60">
          Made with care for curious minds
        </p>
      </div>
    </div>
  );
}

/* ── Spinner ──────────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-[var(--accent)]" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.15" />
      <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────── */
