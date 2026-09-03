import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components can't set cookies
          }
        },
      },
    },
  );
}

/**
 * Tolerated Supabase auth error codes. When a stale/invalid refresh token
 * is present the SSR client throws an AuthApiError during a Server Component
 * render, which Next.js masks in production as a generic "Server Components
 * render" failure. These codes indicate a broken session, not a real bug, so
 * we degrade to an unauthenticated state — mirroring the middleware's
 * cookie-clearing behaviour — instead of crashing the page render.
 */
const TOLERATED_AUTH_CODES = new Set([
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

/**
 * Wrapper around `supabase.auth.getUser()` that never throws for stale-session
 * auth errors. Returns `null` when the session is invalid so callers treat the
 * request as unauthenticated (matching the middleware) rather than crashing.
 */
export async function safeGetUser(supabase: Awaited<ReturnType<typeof createClient>>): Promise<User | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (TOLERATED_AUTH_CODES.has(code ?? "")) {
      console.warn(
        "[safeGetUser] Supabase session invalid; treating as unauthenticated",
        { code },
      );
      return null;
    }
    throw err;
  }
}
