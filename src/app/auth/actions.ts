"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostLoginRedirect } from "@/lib/store-scope";

function sanitizeError(msg: string): string {
  if (msg.toLowerCase().includes("invalid login credentials")) return "Invalid email or password.";
  if (msg.toLowerCase().includes("email not confirmed")) return "Please confirm your email address first.";
  if (msg.toLowerCase().includes("user already registered")) return "An account with that email already exists.";
  if (msg.toLowerCase().includes("rate limit")) return "Too many attempts. Please try again later.";
  return "An error occurred. Please try again.";
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/auth/login?error=Email%20and%20password%20are%20required");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(sanitizeError(error.message))}`);
  }

  // P31: if the user is flagged for a forced password reset, route
  // them to /auth/reset-password before they reach the dashboard.
  // The LoginForm does the same check via the API route; this is
  // defense in depth for callers of the signIn action.
  if (data?.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_reset_password, role_id")
      .eq("id", data.user.id)
      .single();

    if (profile?.must_reset_password) {
      revalidatePath("/", "layout");
      redirect("/auth/reset-password");
    }

    if (profile?.role_id) {
      const adminSupabase = createAdminClient();
      const { data: role } = await adminSupabase
        .from("roles")
        .select("name")
        .eq("id", profile.role_id)
        .single();
      revalidatePath("/", "layout");
      redirect(getPostLoginRedirect(role?.name ?? null));
    }
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/auth/login?message=Signed%20out%20successfully.");
}

// P31: Used by /auth/reset-password. The user must already be
// signed in (this is reached after a successful sign-in that
// detected must_reset_password = true). Calls
// supabase.auth.updateUser({ password }) which changes the
// auth.users password AND keeps the current session alive. Then
// clears must_reset_password on the profile.
export async function updateOwnPassword(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!newPassword) {
    throw new Error("New password is required");
  }
  if (newPassword.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  if (newPassword !== confirmPassword) {
    throw new Error("Passwords do not match");
  }

  const { error: authError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (authError) throw new Error(authError.message);

  // Clear the must_reset_password flag so the next login proceeds
  // straight to the appropriate landing page.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({ must_reset_password: false })
    .eq("id", user.id)
    .select("role_id")
    .single();
  if (profileError) throw new Error(profileError.message);

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

  revalidatePath("/", "layout");
  redirect(getPostLoginRedirect(roleName));
}
