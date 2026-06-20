/**
 * Wraps a Next.js server action call and normalizes the result.
 *
 * - Returns `{ ok: true, value }` when the action resolves normally.
 * - Returns `{ ok: false, error }` when the action throws a non-redirect error.
 * - RE-THROWS Next.js framework sentinels so the framework can perform the
 *   navigation / 404. Without this, a client `try/catch` would treat the
 *   redirect as a user-facing error and show "NEXT_REDIRECT:..." as a toast.
 *
 * P20: Next.js 16 production throws Error("NEXT_REDIRECT") with the URL in
 * `err.digest` (format "NEXT_REDIRECT;push;/url;307;"), NOT in `err.message`.
 * Earlier Next.js versions (and the test mock) used the format
 * "NEXT_REDIRECT:/url" in `err.message`. This helper detects BOTH formats
 * to work correctly in production AND tests.
 *
 * Usage:
 *   const result = await runServerAction(createBanner, formData);
 *   if (result.ok) { toast.success("Created"); }
 *   else { toast.error(result.error.message); }
 *
 *   // In a useActionState form:
 *   const [state, formAction, pending] = useActionState(async (_, fd) => {
 *     const r = await runServerAction(createBanner, fd);
 *     return r.ok ? { error: null } : { error: r.error.message };
 *   }, { error: null });
 */
export type ServerActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

/**
 * Detects Next.js redirect / notFound sentinels.
 *
 * Next.js 16 production:
 *   - redirect():  err.message = "NEXT_REDIRECT",  err.digest = "NEXT_REDIRECT;push;/url;307;"
 *   - notFound():  err.message = "NEXT_HTTP_ERROR_FALLBACK;404",  err.digest = "NEXT_HTTP_ERROR_FALLBACK;404"
 *
 * Test mock (legacy format, used in some existing tests):
 *   - redirect():  err.message = "NEXT_REDIRECT:/url"
 *   - notFound():  err.message = "NEXT_NOT_FOUND"
 */
function isNextJsSentinel(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  const message = err instanceof Error ? err.message : "";
  // Production format: digest starts with "NEXT_REDIRECT;" (semicolon)
  if (typeof digest === "string") {
    if (
      digest.startsWith("NEXT_REDIRECT;") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")
    ) {
      return true;
    }
  }
  // Legacy / test mock format: message starts with "NEXT_REDIRECT:" (colon)
  // or is exactly "NEXT_NOT_FOUND"
  if (
    message.startsWith("NEXT_REDIRECT:") ||
    message === "NEXT_NOT_FOUND"
  ) {
    return true;
  }
  return false;
}

export async function runServerAction<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  ...args: Args
): Promise<ServerActionResult<Result>> {
  try {
    const value = await fn(...args);
    return { ok: true, value };
  } catch (err) {
    // Re-throw Next.js framework sentinels (redirect / notFound) so the
    // framework can perform the navigation / 404. Without this, the client
    // catches the sentinel as a real error and shows it as a toast.
    if (isNextJsSentinel(err)) {
      throw err;
    }
    if (err instanceof Error) {
      return { ok: false, error: err };
    }
    return { ok: false, error: new Error(String(err)) };
  }
}
