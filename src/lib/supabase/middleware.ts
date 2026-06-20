import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  let user: { id: string; email?: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (
      code === "refresh_token_not_found" ||
      code === "refresh_token_already_used"
    ) {
      console.warn(
        "[middleware] Supabase refresh token invalid; clearing auth cookies",
        { path: request.nextUrl.pathname, code },
      );
      for (const { name } of request.cookies.getAll()) {
        if (name.startsWith("sb-") || name.includes("auth-token")) {
          supabaseResponse.cookies.set(name, "", { maxAge: 0, path: "/" });
        }
      }
    } else {
      throw err;
    }
  }

  if (request.nextUrl.pathname === "/auth/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
