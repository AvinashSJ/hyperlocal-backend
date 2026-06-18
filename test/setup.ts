import { vi, afterEach, beforeAll } from "vitest";

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-pub-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-svc-key";
  process.env.NEXT_SUPABASE_ANON_KEY ??= "test-anon-key";
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ??= "test-svc-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
