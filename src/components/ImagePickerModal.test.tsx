// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { act } from "react";
import type { ReactNode } from "react";

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, width, className }: { icon: string; width?: number; className?: string }) => (
    <span data-icon={icon} data-width={width} className={className} />
  ),
}));

vi.mock("@/app/(admin)/media/actions", () => ({
  listMedia: vi.fn(),
}));

// P32: stub global fetch so the upload handler can be exercised in
// the jsdom test environment without touching the real network.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import ImagePickerModal from "./ImagePickerModal";
import { listMedia } from "@/app/(admin)/media/actions";

const mockListMedia = listMedia as ReturnType<typeof vi.fn>;
const mockFetchGlobal = fetch as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockListMedia.mockReset();
  mockFetchGlobal.mockReset();
});

describe("ImagePickerModal — initial render (loading state)", () => {
  it("renders the modal title 'Select Images'", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("Select Images");
  });

  it("renders the loading spinner in the initial render (useEffect hasn't run yet)", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("Loading images...");
  });

  it("renders the close (X) button", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("btn-close");
  });

  it("renders the Cancel button", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("Cancel");
  });

  it("renders the 'Add Selected' button with count", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    // React injects <!-- --> text-node separators between adjacent expressions
    expect(html).toMatch(/Add Selected \(<!-- -->0<!-- -->\)/);
  });

  it("renders '0 selected' counter in the footer", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    // React injects <!-- --> text-node separators
    expect(html).toMatch(/0<!-- -->\s+selected/);
  });

  it("does NOT call listMedia during SSR (useEffect is client-only)", () => {
    renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(mockListMedia).not.toHaveBeenCalled();
  });
});

describe("ImagePickerModal — initial picked count from selectedUrls prop", () => {
  it("renders '3 selected' when 3 URLs are pre-selected", () => {
    const html = renderToString(
      <ImagePickerModal
        selectedUrls={["url1", "url2", "url3"]}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toMatch(/3<!-- -->\s+selected/);
    expect(html).toMatch(/Add Selected \(<!-- -->3<!-- -->\)/);
  });

  it("renders '1 selected' when 1 URL is pre-selected", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={["url1"]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toMatch(/1<!-- -->\s+selected/);
  });
});

describe("ImagePickerModal — CSS class structure", () => {
  it("renders a fixed-position backdrop overlay", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    // position: fixed + inset: 0 = full-screen backdrop
    expect(html).toContain("position:fixed");
    expect(html).toContain("inset:0");
    // rgba(0,0,0,0.5) is the backdrop color
    expect(html).toContain("rgba(0,0,0,0.5)");
  });

  it("renders a centered card with width 720", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("width:720");
  });

  it("applies z-index 1050 to the modal", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("z-index:1050");
  });
});

describe("ImagePickerModal — interactive elements have click handlers", () => {
  it("renders the close button in the header", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    // The close button is in card-header
    expect(html).toMatch(/card-header[^>]*>[\s\S]*btn-close/);
  });

  it("renders Cancel and Add Selected buttons in the footer", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toMatch(/card-footer[^>]*>[\s\S]*Cancel[\s\S]*Add Selected/);
  });
});

describe("ImagePickerModal — lastSelectedRef guard (regression test for cascading renders fix)", () => {
  it("renders with the same selectedUrls twice without issue", () => {
    // The lastSelectedRef guard prevents setPicked from being called when
    // selectedUrls hasn't changed. We can't directly test the ref in SSR,
    // but we can verify the component renders stably with the same prop.
    const html1 = renderToString(
      <ImagePickerModal selectedUrls={["a"]} onSelect={() => {}} onClose={() => {}} />,
    );
    const html2 = renderToString(
      <ImagePickerModal selectedUrls={["a"]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html1).toMatch(/1<!-- -->\s+selected/);
    expect(html2).toMatch(/1<!-- -->\s+selected/);
  });
});

// P32: the picker now ships an in-modal upload bar so admins can
// upload images while creating a product without first visiting
// /media. The bar is rendered in SSR; the click/change interaction
// requires a real DOM (jsdom).
describe("ImagePickerModal — direct upload (P32)", () => {
  it("renders the 'Upload images' bar with a file input above the grid", () => {
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain("Upload images");
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(html).toContain('data-testid="image-picker-upload-input"');
  });

  it("replaces the empty-state copy with an upload hint", () => {
    // The previous empty-state text "Upload some in the Media
    // section first" is gone — it's now in the upload bar that
    // lives at the top of the modal. The empty state itself is
    // only visible AFTER listMedia resolves with an empty array
    // (i.e. in the live DOM, not in SSR which starts in "loading"
    // state). We assert the hint lives in the upload bar rather
    // than in the body.
    const html = renderToString(
      <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).not.toContain("Upload some in the Media section first");
    expect(html).toContain("Upload images");
  });

  it("client-side: file input change posts to /api/upload and refreshes the list", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    // After upload, the picker calls listMedia() to refresh the file
    // list. We pre-program the second call to return the freshly
    // uploaded file (with the public URL).
    mockListMedia
      .mockResolvedValueOnce([]) // initial fetch in useEffect
      .mockResolvedValueOnce([
        { name: "1700000000-abc.jpg", url: "https://cdn.example.com/1700000000-abc.jpg" },
      ]);

    mockFetchGlobal.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ uploaded: ["1700000000-abc.jpg"], errors: [] }),
    });

    const onSelect = vi.fn();
    // Type the root loosely to avoid the dynamic-import-induced
    // `ReturnType<typeof createRoot>` evaluating to `never`.
    type RootLike = { render: (node: ReactNode) => void; unmount: () => void };
    let root: RootLike | null = null;
    await act(async () => {
      const { createRoot } = await import("react-dom/client");
      root = createRoot(container) as unknown as RootLike;
      root.render(
        <ImagePickerModal selectedUrls={[]} onSelect={onSelect} onClose={() => {}} />,
      );
    });

    // Wait for the initial listMedia to settle (empty list)
    await act(async () => {
      await Promise.resolve();
    });

    // Build a fake File and fire the change event
    const file = new File(["fake-bytes"], "test.png", { type: "image/png" });
    const input = container.querySelector(
      '[data-testid="image-picker-upload-input"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // fetch was called with the upload endpoint and FormData
    expect(mockFetchGlobal).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetchGlobal.mock.calls[0];
    expect(url).toBe("/api/upload");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeInstanceOf(FormData);

    // After the upload resolves, listMedia is called again to
    // refresh the list. Wait for the microtask queue to drain.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The freshly uploaded URL should now be in `picked`, which
    // increments the "Add Selected" count in the footer to 1.
    // (In the live DOM, React strips the <!-- --> comment markers
    // that it injects for adjacent-expression separation in SSR.)
    const html = container.innerHTML;
    expect(html).toContain("Add Selected (1)");
    expect(html).toContain("1 selected");

    container.remove();
    // root.unmount() is intentionally not called — removing the
    // container is sufficient for test cleanup and avoids a
    // TS narrowing edge case with the dynamic-import root type.
  });

  it("client-side: shows an error message when /api/upload returns a non-OK status", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    mockListMedia.mockResolvedValueOnce([]); // initial
    mockFetchGlobal.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal error" }),
    });

    type RootLike = { render: (node: ReactNode) => void; unmount: () => void };
    let root: RootLike | null = null;
    await act(async () => {
      const { createRoot } = await import("react-dom/client");
      root = createRoot(container) as unknown as RootLike;
      root.render(
        <ImagePickerModal selectedUrls={[]} onSelect={() => {}} onClose={() => {}} />,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const file = new File(["x"], "bad.png", { type: "image/png" });
    const input = container.querySelector(
      '[data-testid="image-picker-upload-input"]',
    ) as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="image-picker-upload-error"]')).toBeTruthy();
    expect(container.textContent).toMatch(/internal error|Upload failed/);

    container.remove();
    // root.unmount() not called — see the note in the test above.
  });
});
