export type ActionResult = {
  ok: boolean;
  redirectedTo: string | null;
  error: Error | null;
  value: unknown;
};

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
      const match = err.message.match(/^NEXT_REDIRECT:(.+)$/);
      if (match) {
        return { ok: false, redirectedTo: match[1], error: null, value: undefined };
      }
      if (err.message === "NEXT_NOT_FOUND") {
        return { ok: false, redirectedTo: null, error: err, value: undefined };
      }
      return { ok: false, redirectedTo: null, error: err, value: undefined };
    }
    return { ok: false, redirectedTo: null, error: new Error(String(err)), value: undefined };
  }
}
