"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/");
    });
    return () => subscription.unsubscribe();
  }, [supabase.auth, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (isSignUp) {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) { setError(err.message); setLoading(false); }
      else { setMessage("Account created. You can now sign in."); setIsSignUp(false); setLoading(false); }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) { setError(err.message); setLoading(false); }
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-white px-4">

      {/* Dot grid background — same as canvas bg-dot pattern */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <svg className="absolute inset-0 h-full w-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="12" cy="12" r="1" fill="#000" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>
      </div>

      {/* "julyai" wordmark — top left like Banani's header */}
      <div className="absolute top-6 left-8">
        <span className="text-[15px] font-black tracking-tight text-black select-none">
          july<span className="text-gray-400">ai</span>
        </span>
      </div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-[380px]">

        {/* Heading */}
        <div className="mb-8 text-center">
          <h1 className="text-[28px] font-semibold text-black leading-tight mb-2">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-[14px] text-gray-400 font-medium">
            {isSignUp
              ? "Start building neural networks in seconds."
              : "Sign in to continue to your workspace."}
          </p>
        </div>

        {/* Auth card — exact Banani prompt card shadow */}
        <div className="rounded-2xl bg-white p-6 shadow-[0_0px_1px_0_rgba(0,0,0,0.30),0_8px_20px_0_rgba(0,0,0,0.08)]">

          {/* Error / Success */}
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-3.5 py-2.5 text-[12px] font-semibold text-red-500">
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 rounded-xl bg-green-50 border border-green-100 px-3.5 py-2.5 text-[12px] font-semibold text-green-600">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide pl-0.5">
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="
                  w-full rounded-xl border border-gray-200 bg-gray-50
                  px-3.5 py-2.5 text-[14px] font-medium text-black
                  placeholder:text-gray-300 outline-none
                  focus:border-[#0066FF]/50 focus:bg-white focus:ring-2 focus:ring-[#0066FF]/10
                  transition-all duration-150
                "
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wide pl-0.5">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignUp ? "new-password" : "current-password"}
                className="
                  w-full rounded-xl border border-gray-200 bg-gray-50
                  px-3.5 py-2.5 text-[14px] font-medium text-black
                  placeholder:text-gray-300 outline-none
                  focus:border-[#0066FF]/50 focus:bg-white focus:ring-2 focus:ring-[#0066FF]/10
                  transition-all duration-150
                "
              />
            </div>

            {/* Submit — exact Banani Generate button style */}
            <button
              type="submit"
              disabled={loading}
              className="
                mt-1 flex items-center justify-center gap-1.5
                rounded-xl bg-[#0066FF] px-4 py-3
                text-[14px] font-semibold text-white
                transition-all duration-150
                hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(0,102,255,0.25)]
                disabled:opacity-60 disabled:cursor-not-allowed
                select-none
              "
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2" strokeOpacity="0.3" />
                    <path d="M4 12a8 8 0 018-8" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  {isSignUp ? "Creating account…" : "Signing in…"}
                </div>
              ) : (
                <>
                  {isSignUp ? "Create account" : "Sign in"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M11.9995 17V7M11.9995 7L8 11M11.9995 7L16 11.0005" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Toggle sign up / sign in */}
          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <span className="text-[13px] text-gray-400 font-medium">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
            </span>
            {" "}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
              className="text-[13px] font-semibold text-[#0066FF] hover:underline underline-offset-2 transition-colors"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </div>
        </div>

        {/* Quick-start chips — mirrors the home page chips pattern */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {[
            { label: "Visual graph builder" },
            { label: "Real-time training" },
            { label: "Live API deployment" },
          ].map((f) => (
            <span
              key={f.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-400 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
            >
              {f.label}
            </span>
          ))}
        </div>

      </div>
    </div>
  );
}