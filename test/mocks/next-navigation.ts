import { vi } from "vitest";

// Next.js 16 production format for redirect() (see node_modules/next/dist/client/components/redirect.js):
//   - err.message = "NEXT_REDIRECT" (just the code)
//   - err.digest  = "NEXT_REDIRECT;push;<url>;307;" (semicolons)
// Our mock matches this so the test environment is faithful to production.
export const redirectMock = vi.fn((url: string) => {
  const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
  err.digest = `NEXT_REDIRECT;push;${url};307;`;
  throw err;
});

// Next.js 16 production format for notFound():
//   - err.message = "NEXT_HTTP_ERROR_FALLBACK;404"
//   - err.digest  = "NEXT_HTTP_ERROR_FALLBACK;404"
export const notFoundMock = vi.fn(() => {
  const err = new Error("NEXT_HTTP_ERROR_FALLBACK;404") as Error & { digest: string };
  err.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
  throw err;
});

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
}));
