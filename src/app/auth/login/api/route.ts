import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostLoginRedirect } from "@/lib/store-scope";

export async function POST(request: NextRequest) {
  const { email, password, captchaToken } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(
    typeof captchaToken === "string" && captchaToken
      ? { email, password, options: { captchaToken } }
      : { email, password },
  );

  if (error) {
    const isCaptchaError =
      error.code === "captcha_failed" ||
      error.message?.toLowerCase().includes("captcha");
    if (isCaptchaError) {
      return NextResponse.json(
        { error: "Please complete the CAPTCHA and try again." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  let redirectTo = "/dashboard";
  if (data?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_reset_password, role_id")
      .eq("id", data.user.id)
      .single();

    if (profile?.must_reset_password) {
      redirectTo = "/auth/reset-password";
    } else {
      let roleName: string | null = null;
      if (profile?.role_id) {
        const adminSupabase = createAdminClient();
        const { data: role } = await adminSupabase
          .from("roles")
          .select("name")
          .eq("id", profile.role_id)
          .single();
        roleName = role?.name ?? null;
      }
      redirectTo = getPostLoginRedirect(roleName);
    }
  }

  return NextResponse.json({
    success: true,
    mustResetPassword: redirectTo === "/auth/reset-password",
    redirectTo,
  });
}
