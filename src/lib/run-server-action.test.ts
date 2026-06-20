import { describe, it, expect } from "vitest";
import { runServerAction } from "./run-server-action";

describe("runServerAction (P19 helper)", () => {
  it("returns { ok: true, value } when the action resolves normally", async () => {
    const fn = async (x: number) => x * 2;
    const result = await runServerAction(fn, 21);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it("returns { ok: false, error } when the action throws a regular Error", async () => {
    const fn = async () => {
      throw new Error("db connection lost");
    };
    const result = await runServerAction(fn);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("db connection lost");
    }
  });

  it("re-throws NEXT_REDIRECT: sentinels (P18/P19 fix)", async () => {
    const fn = async () => {
      throw new Error("NEXT_REDIRECT:/products");
    };
    await expect(runServerAction(fn)).rejects.toThrow(/^NEXT_REDIRECT:\/products$/);
  });

  it("re-throws NEXT_NOT_FOUND sentinels", async () => {
    const fn = async () => {
      throw new Error("NEXT_NOT_FOUND");
    };
    await expect(runServerAction(fn)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("wraps non-Error throws (strings, numbers, etc.) in an Error", async () => {
    const fnString = async () => {
      throw "string error";
    };
    const r1 = await runServerAction(fnString);
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.error).toBeInstanceOf(Error);
      expect(r1.error.message).toBe("string error");
    }

    const fnNumber = async () => {
      throw 42;
    };
    const r2 = await runServerAction(fnNumber);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error).toBeInstanceOf(Error);
      expect(r2.error.message).toBe("42");
    }
  });

  it("passes through all arguments in order to the wrapped function", async () => {
    const calls: unknown[][] = [];
    const fn = async (a: string, b: number, c: { flag: boolean }) => {
      calls.push([a, b, c]);
      return "ok";
    };
    const result = await runServerAction(fn, "hello", 7, { flag: true });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([["hello", 7, { flag: true }]]);
  });

  // P20: Next.js 16 production throws Error("NEXT_REDIRECT") with the URL in
  // err.digest (format "NEXT_REDIRECT;push;/url;307;"), NOT in err.message.
  // These tests simulate the production format and would have caught the
  // original P19 bug (which only checked err.message).
  it("P20: re-throws production-format NEXT_REDIRECT digest (semicolons, URL in digest)", async () => {
    const prodErr = new Error("NEXT_REDIRECT") as Error & { digest: string };
    prodErr.digest = "NEXT_REDIRECT;push;/products;307;";
    const fn = async () => {
      throw prodErr;
    };
    let caught: unknown = null;
    try {
      await runServerAction(fn);
    } catch (e) {
      caught = e;
    }
    // The same error object should be re-thrown
    expect(caught).toBe(prodErr);
    expect((caught as { digest: string }).digest).toBe("NEXT_REDIRECT;push;/products;307;");
  });

  it("P20: re-throws production-format NEXT_HTTP_ERROR_FALLBACK digest (not-found)", async () => {
    const nfErr = new Error("NEXT_HTTP_ERROR_FALLBACK;404") as Error & { digest: string };
    nfErr.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
    const fn = async () => {
      throw nfErr;
    };
    await expect(runServerAction(fn)).rejects.toBe(nfErr);
  });

  it("P20: re-throws legacy test-mock format (NEXT_REDIRECT:/url in message) for backward compat", async () => {
    // This is the format used by direct throws in some test files
    // (e.g. ProductForm.test.tsx, [id]/page.test.tsx). The helper's
    // message-based fallback ensures they still work.
    const legacyErr = new Error("NEXT_REDIRECT:/products");
    const fn = async () => {
      throw legacyErr;
    };
    await expect(runServerAction(fn)).rejects.toBe(legacyErr);
  });

  it("P20: returns { ok: false, error } for a regular error (NOT a redirect)", async () => {
    // This proves the production digest check doesn't false-positive on
    // errors that have a digest field but aren't Next.js sentinels.
    const regularErr = new Error("something went wrong") as Error & { digest?: string };
    regularErr.digest = "some-other-code;123;abc;456;";
    const fn = async () => {
      throw regularErr;
    };
    const result = await runServerAction(fn);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(regularErr);
      expect(result.error.message).toBe("something went wrong");
    }
  });
});
