"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(sanitizeError(error.message))}`);
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
