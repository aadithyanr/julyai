import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  // Handle password recovery link (token_hash + type=recovery)
  if (token_hash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash,
    });
    if (!error) {
      // Session is created on the server; client often gets INITIAL_SESSION, not PASSWORD_RECOVERY.
      // Flag recovery so /login shows the reset form instead of redirecting home.
      return NextResponse.redirect(`${origin}/login?recovery=1`);
    }
    return NextResponse.redirect(`${origin}/login?error=invalid_reset_link`);
  }

  // Handle OAuth / magic link / PKCE password recovery (code + type=recovery)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/login?recovery=1`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
