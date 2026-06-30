// @vitest-environment jsdom
// Tell React 19 this is an act-enabled test environment (suppresses warnings)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { renderToString } from "react-dom/server";
import ClientDate from "./ClientDate";

function mountClient(element: React.ReactElement): {
  container: HTMLDivElement;
  cleanup: () => void;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | null = null;
  act(() => {
    root = createRoot(container);
    root.render(element);
  });
  return {
    container,
    cleanup: () => {
      act(() => {
        root?.unmount();
      });
      container.remove();
    },
  };
}

describe("ClientDate (P63): hydration safety on client-side date renderers", () => {
  it("renders the fallback on the server pass (no formatted date leaks into SSR HTML)", () => {
    // SSR is exactly the scenario where the server's timezone produced
    // '30 Jun 2026' but the client's timezone produces '29 Jun 2026'.
    // Server must render the fallback (default \u00A0) so the client
    // can replace it with the client-localized date on mount.
    const html = renderToString(
      <ClientDate
        value="2026-06-30T18:30:00.000Z"
        format="date"
        dataTestid="server-date"
      />,
    );
    expect(html).not.toContain("30 Jun");
    expect(html).not.toContain("29 Jun");
    expect(html).toContain("server-date");
  });

  it("renders the formatted date after the post-mount effect fires (act flushes effects synchronously)", () => {
    // In React 19 + act(), useEffect runs synchronously after the
    // initial render. So the final state we observe is the post-mount
    // state. The SSR-only path (server side, no client hydration) is
    // covered by the previous test using renderToString.
    const { container, cleanup } = mountClient(
      <ClientDate
        value="2026-06-30T18:30:00.000Z"
        format="date"
        dataTestid="date"
      />,
    );
    const span = container.querySelector('[data-testid="date"]') as HTMLSpanElement;
    expect(span).not.toBeNull();
    expect(span.textContent).toMatch(/2026/);
    cleanup();
  });

  it("returns the fallback when value is null or undefined", () => {
    const { container, cleanup } = mountClient(
      <>
        <ClientDate value={null} format="date" dataTestid="null-date" />
        <ClientDate value={undefined} format="date" dataTestid="undef-date" />
      </>,
    );
    const nullSpan = container.querySelector('[data-testid="null-date"]') as HTMLSpanElement;
    const undefSpan = container.querySelector('[data-testid="undef-date"]') as HTMLSpanElement;
    expect(nullSpan).not.toBeNull();
    expect(undefSpan).not.toBeNull();
    expect(nullSpan.textContent).toBe("\u00A0");
    expect(undefSpan.textContent).toBe("\u00A0");
    cleanup();
  });

  it("returns the fallback when value is an unparseable string", () => {
    const { container, cleanup } = mountClient(
      <ClientDate value="not-a-date" format="date" dataTestid="bad-date" />,
    );
    const span = container.querySelector('[data-testid="bad-date"]') as HTMLSpanElement;
    expect(span.textContent).toBe("\u00A0");
    cleanup();
  });

  it("dataTestid propagates to the rendered <span>", () => {
    const { container, cleanup } = mountClient(
      <ClientDate
        value="2026-06-30T18:30:00.000Z"
        format="date"
        dataTestid="my-date-cell"
        className="text-nowrap"
      />,
    );
    const span = container.querySelector('[data-testid="my-date-cell"]') as HTMLSpanElement;
    expect(span).not.toBeNull();
    expect(span.className).toBe("text-nowrap");
    cleanup();
  });
});
