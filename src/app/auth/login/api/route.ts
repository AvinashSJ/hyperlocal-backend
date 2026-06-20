import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  // P31: if the user is flagged for a forced password reset, return
  // the redirect target. The LoginForm pushes there instead of
  // /dashboard. Mirrors the server-side signIn action's check.
  let mustResetPassword = false;
  if (data?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_reset_password")
      .eq("id", data.user.id)
      .single();
    mustResetPassword = !!profile?.must_reset_password;
  }

  return NextResponse.json({
    success: true,
    mustResetPassword,
    redirectTo: mustResetPassword ? "/auth/reset-password" : "/dashboard",
  });
}
