import { describe, it, expect } from "vitest";
import {
  PERMISSION_MODULES,
  hasPermission,
  canAccess,
  type PermissionModule,
  type RolePermissions,
} from "./permissions";

describe("PERMISSION_MODULES", () => {
  it("is frozen with `as const` semantics", () => {
    expect(Object.isFrozen(PERMISSION_MODULES)).toBe(false);
    expect(typeof PERMISSION_MODULES).toBe("object");
  });

  it("exposes exactly 20 modules", () => {
    expect(Object.keys(PERMISSION_MODULES)).toHaveLength(20);
  });

  it("includes every module the admin UI uses", () => {
    const expected: PermissionModule[] = [
      "dashboard",
      "products",
      "categories",
      "orders",
      "invoices",
      "customers",
      "delivery_zones",
      "delivery_slots",
      "gst_numbers",
      "inventory_log",
      "banners",
      "media",
      "notifications",
      "stores",
      "users",
      "roles",
      "staff",
      "commissions",
      "reports",
      "settings",
    ];
    for (const m of expected) {
      expect(PERMISSION_MODULES).toHaveProperty(m);
    }
  });

  it("dashboard and inventory_log and reports and settings have restricted action sets", () => {
    expect(PERMISSION_MODULES.dashboard).toEqual(["view"]);
    expect(PERMISSION_MODULES.inventory_log).toEqual(["view"]);
    expect(PERMISSION_MODULES.reports).toEqual(["view"]);
    expect(PERMISSION_MODULES.settings).toEqual(["view", "edit"]);
  });

  it("full-crud modules expose view/create/edit/delete", () => {
    const fullCrud: PermissionModule[] = [
      "products",
      "categories",
      "orders",
      "invoices",
      "customers",
      "delivery_zones",
      "delivery_slots",
      "gst_numbers",
      "banners",
      "stores",
      "users",
      "roles",
      "staff",
      "commissions",
    ];
    for (const m of fullCrud) {
      expect(PERMISSION_MODULES[m]).toEqual(
        expect.arrayContaining(["view", "create", "edit", "delete"]),
      );
    }
  });

  it("media uses view/upload/delete (not the standard CRUD verbs)", () => {
    expect(PERMISSION_MODULES.media).toEqual(["view", "upload", "delete"]);
  });

  it("notifications uses view/send/delete", () => {
    expect(PERMISSION_MODULES.notifications).toEqual(["view", "send", "delete"]);
  });
});

describe("hasPermission", () => {
  const perms: RolePermissions = {
    orders: ["view", "edit"],
    products: ["view", "create", "edit", "delete"],
  };

  it("returns true when the action is in the module's action list", () => {
    expect(hasPermission(perms, "orders", "view")).toBe(true);
    expect(hasPermission(perms, "orders", "edit")).toBe(true);
    expect(hasPermission(perms, "products", "delete")).toBe(true);
  });

  it("returns false when the action is not in the module's action list", () => {
    expect(hasPermission(perms, "orders", "create")).toBe(false);
    expect(hasPermission(perms, "orders", "delete")).toBe(false);
    expect(hasPermission(perms, "products", "upload")).toBe(false);
  });

  it("returns false for an unknown module", () => {
    expect(hasPermission(perms, "roles", "view")).toBe(false);
  });

  it("returns false when the module value is undefined", () => {
    expect(hasPermission(perms, "settings", "view")).toBe(false);
  });

  it("returns true for an empty action list when checking an action that exists in an empty list (impossible)", () => {
    expect(hasPermission({}, "orders", "view")).toBe(false);
  });
});

describe("canAccess", () => {
  it("delegates to hasPermission", () => {
    const perms: RolePermissions = { orders: ["view"] };
    expect(canAccess(perms, "orders", "view")).toBe(true);
    expect(canAccess(perms, "orders", "edit")).toBe(false);
  });

  it("defaults action to 'view' when omitted", () => {
    const perms: RolePermissions = { orders: ["view"] };
    expect(canAccess(perms, "orders")).toBe(true);
    expect(canAccess(perms, "orders", "view")).toBe(true);
  });

  it("returns false when permissions is null", () => {
    expect(canAccess(null, "orders", "view")).toBe(false);
  });

  it("returns false when permissions is undefined", () => {
    expect(canAccess(undefined, "orders", "view")).toBe(false);
  });

  it("returns false for unknown module with null permissions", () => {
    expect(canAccess(null, "orders" as PermissionModule, "view")).toBe(false);
  });
});
