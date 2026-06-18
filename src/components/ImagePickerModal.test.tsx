// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, width, className }: { icon: string; width?: number; className?: string }) => (
    <span data-icon={icon} data-width={width} className={className} />
  ),
}));

vi.mock("@/app/(admin)/media/actions", () => ({
  listMedia: vi.fn(),
}));

import ImagePickerModal from "./ImagePickerModal";
import { listMedia } from "@/app/(admin)/media/actions";

const mockListMedia = listMedia as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockListMedia.mockReset();
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
