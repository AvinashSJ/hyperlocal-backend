// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import PlaceholderPage from "./PlaceholderPage";

describe("PlaceholderPage", () => {
  it("renders the title as an h5", () => {
    const html = renderToString(<PlaceholderPage title="Coming Soon" />);
    expect(html).toContain("<h5");
    expect(html).toContain("Coming Soon");
  });

  it("renders the 'coming soon' message", () => {
    const html = renderToString(<PlaceholderPage title="Any Title" />);
    expect(html).toContain("This module is coming soon.");
  });

  it("renders the tool icon wrapper", () => {
    const html = renderToString(<PlaceholderPage title="X" />);
    // The Icon component from @iconify/react is NOT mocked here; it renders
    // an <svg> at SSR. We just check the wrapper circle is present.
    expect(html).toContain("rounded-circle");
    expect(html).toContain("bg-primary");
  });

  it("centers content vertically (flex column align/justify center)", () => {
    const html = renderToString(<PlaceholderPage title="X" />);
    expect(html).toContain("d-flex");
    expect(html).toContain("flex-column");
    expect(html).toContain("align-items-center");
    expect(html).toContain("justify-content-center");
  });

  it("applies py-5 padding", () => {
    const html = renderToString(<PlaceholderPage title="X" />);
    expect(html).toContain("py-5");
  });

  it("renders the icon wrapper with 64x64 dimensions", () => {
    const html = renderToString(<PlaceholderPage title="X" />);
    expect(html).toContain("width:64px");
    expect(html).toContain("height:64px");
  });

  it("renders different titles correctly", () => {
    const html1 = renderToString(<PlaceholderPage title="Page A" />);
    const html2 = renderToString(<PlaceholderPage title="Page B" />);
    expect(html1).toContain("Page A");
    expect(html1).not.toContain("Page B");
    expect(html2).toContain("Page B");
    expect(html2).not.toContain("Page A");
  });

  it("handles titles with special characters (escapes HTML)", () => {
    const html = renderToString(<PlaceholderPage title="<script>alert('xss')</script>" />);
    // React escapes the title
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
