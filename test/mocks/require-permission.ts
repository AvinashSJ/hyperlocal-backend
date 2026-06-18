import { vi } from "vitest";
import type { PermissionModule, PermissionAction, RolePermissions } from "@/lib/permissions";

export class PermissionError extends Error {
  module: string;
  action: string;
  constructor(module: string, action: string) {
    super(`Permission denied: ${action} on ${module}`);
    this.name = "PermissionError";
    this.module = module;
    this.action = action;
  }
}

type MockState = {
  permissions: RolePermissions;
  role: string;
  isSuperAdmin: boolean;
  storeId: string | null;
};

let state: MockState = {
  permissions: {},
  role: "admin",
  isSuperAdmin: false,
  storeId: null,
};

export const assertPermissionMock = vi.fn(async (_module: PermissionModule, _action: PermissionAction) => {
  if (!state.role) throw new PermissionError("auth", "authenticated");
  if (state.isSuperAdmin) return { ...state };
  const actions = state.permissions[_module];
  if (!actions || !actions.includes(_action)) {
    throw new PermissionError(_module, _action);
  }
  return { ...state };
});

export const requirePermissionMock = vi.fn(async (_module: PermissionModule, _action: PermissionAction = "view") => {
  if (!state.role) {
    throw new Error("NEXT_REDIRECT:/auth/login");
  }
  if (state.isSuperAdmin) return { ...state };
  const actions = state.permissions[_module];
  if (!actions || !actions.includes(_action)) {
    throw new Error("NEXT_REDIRECT:/unauthorized");
  }
  return { ...state };
});

vi.mock("@/lib/require-permission", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    assertPermission: assertPermissionMock,
    requirePermission: requirePermissionMock,
    PermissionError,
    getActionPermissions: actual.getActionPermissions,
  };
});

export function asSuperAdmin() {
  state = { permissions: {}, role: "Super Admin", isSuperAdmin: true, storeId: null };
}

export function asAdmin(permissions: RolePermissions, opts: { role?: string; storeId?: string | null } = {}) {
  state = {
    permissions,
    role: opts.role ?? "Admin",
    isSuperAdmin: false,
    storeId: opts.storeId ?? null,
  };
}

export function asAnonymous() {
  state = { permissions: {}, role: "", isSuperAdmin: false, storeId: null };
}

export function getPermissionState() {
  return { ...state };
}

export function resetPermissionMock() {
  state = { permissions: {}, role: "admin", isSuperAdmin: false, storeId: null };
  assertPermissionMock.mockClear();
  requirePermissionMock.mockClear();
}
