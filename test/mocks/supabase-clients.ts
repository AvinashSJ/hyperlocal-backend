import { vi } from "vitest";
import { createMockSupabase, type MockSupabaseHandle, type MockSupabaseUser } from "./supabase";

let adminHandle: MockSupabaseHandle = createMockSupabase();
let serverHandle: MockSupabaseHandle = createMockSupabase();
let pendingServerUser: MockSupabaseUser | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    return adminHandle.client;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const user = pendingServerUser;
    pendingServerUser = null;
    const realAuth = (serverHandle.client as any).auth;
    const stubAuth = {
      getUser: async () =>
        user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: null },
      signInWithPassword: realAuth.signInWithPassword.bind(realAuth),
      signOut: realAuth.signOut.bind(realAuth),
      signUp: realAuth.signUp.bind(realAuth),
      // P31: server-side password change for the current user.
      // Delegates to the chainable mock's auth.updateUser so the
      // test can queue success/error responses via the admin
      // handle's setResponses/enqueueResponse.
      updateUser: realAuth.updateUser.bind(realAuth),
    };
    return new Proxy(serverHandle.client, {
      get(target, prop) {
        if (prop === "auth") return stubAuth;
        return target[prop as keyof typeof target];
      },
    });
  },
}));

vi.mock("@/lib/supabase/middleware", () => ({
  updateSession: vi.fn(async (_request: unknown) => {
    return new Response(null, { status: 200 });
  }),
}));

export function getAdminClient(): MockSupabaseHandle {
  return adminHandle;
}

export function getServerClient(): MockSupabaseHandle {
  return serverHandle;
}

export function resetSupabaseClients() {
  adminHandle = createMockSupabase();
  serverHandle = createMockSupabase();
  pendingServerUser = null;
}

export function setServerUser(user: MockSupabaseUser | null) {
  pendingServerUser = user;
}

