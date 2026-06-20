export type ActionResult = {
  ok: boolean;
  redirectedTo: string | null;
  error: Error | null;
  value: unknown;
};

/**
 * Extracts the redirect URL from a Next.js redirect sentinel error.
 *
 * Next.js 16 production format:
 *   - err.message = "NEXT_REDIRECT"
 *   - err.digest  = "NEXT_REDIRECT;push;<url>;<status>;"
 *
 * Legacy / direct-throw format (still used in a few test files):
 *   - err.message = "NEXT_REDIRECT:<url>"
 */
function extractRedirectUrl(err: Error): string | null {
  // 1. Production format: URL is in err.digest between "push;" and ";status"
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;")) {
    const parts = digest.split(";");
    // parts: ["NEXT_REDIRECT", "push", "<url>", "<status>", ""]
    if (parts.length >= 4) return parts[2];
  }
  // 2. Legacy format: URL is in err.message
  const match = err.message.match(/^NEXT_REDIRECT:(.+)$/);
  if (match) return match[1];
  return null;
}

function isNotFoundSentinel(err: Error): boolean {
  // Production: err.digest starts with "NEXT_HTTP_ERROR_FALLBACK;"
  const digest = (err as { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;")) {
    return true;
  }
  // Legacy: err.message === "NEXT_NOT_FOUND"
  return err.message === "NEXT_NOT_FOUND";
}

export async function runAction(
  fn: (formData: FormData, ...args: any[]) => Promise<any>,
  formData: FormData,
  ...args: any[]
): Promise<ActionResult> {
  try {
    const value = await fn(formData, ...args);
    return { ok: true, redirectedTo: null, error: null, value };
  } catch (err) {
    if (err instanceof Error) {
      const url = extractRedirectUrl(err);
      if (url) {
        return { ok: false, redirectedTo: url, error: null, value: undefined };
      }
      if (isNotFoundSentinel(err)) {
        return { ok: false, redirectedTo: null, error: err, value: undefined };
      }
      return { ok: false, redirectedTo: null, error: err, value: undefined };
    }
    return { ok: false, redirectedTo: null, error: new Error(String(err)), value: undefined };
  }
}
