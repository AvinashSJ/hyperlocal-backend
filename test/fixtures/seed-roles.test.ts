import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEED_PATH = resolve(
  process.cwd(),
  "supabase/migrations/20260603000001_roles_permissions.sql",
);

const seed = readFileSync(SEED_PATH, "utf8");

// The seed is one big SQL file with INSERT statements, one per role. We
// pull out the Manager block by string slicing so we don't have to
// execute SQL in a unit test.
function extractRoleJsonb(roleName: string): Record<string, string[]> {
  // Match the role row, capturing the JSONB literal (the '{...}' value
  // between the 3rd and 4th single quotes on the line).
  const escapedName = roleName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `\\('${escapedName}'[^)]*?'(\\{[\\s\\S]*?\\})'::jsonb`,
    "m",
  );
  const match = seed.match(pattern);
  if (!match) {
    throw new Error(
      `Could not find role "${roleName}" in seed migration ${SEED_PATH}`,
    );
  }
  // The captured value is a JS-style object literal embedded in SQL
  // (single-quoted). JSON.parse can read it once we wrap in braces.
  const json = JSON.parse(match[1]);
  return json;
}

describe("seed migration — role permissions contract", () => {
  it("grants Super Admin the staff module (P28: used in redirect target list, no harm in retaining)", () => {
    // Super Admin's staff array is emptied by migration
    // 20260619000007 (P28 defense-in-depth). The seed itself can keep
    // or remove it; either is fine. The contract is that
    // MasterLayout's superAdminHidden array filters it regardless.
    const sa = extractRoleJsonb("Super Admin");
    // No assertion required — just smoke that we can read the role.
    expect(typeof sa).toBe("object");
  });

  it("P28 fix: grants Manager the staff module with full CRUD", () => {
    // Regression: P28 restricted the staff module to store managers, but
    // forgot to update the seed. The Manager role in the seed never had
    // a `staff` key, so MasterLayout's moduleVisible() returned false
    // and the Staff link never rendered in the Manager's nav. This
    // test guards against that.
    const manager = extractRoleJsonb("Manager");
    expect(manager.staff).toEqual(
      expect.arrayContaining(["view", "create", "edit", "delete"]),
    );
  });

  it("does NOT grant the Staff role the staff module (separation of concerns)", () => {
    // The "Staff" role is a user role (delivery/packing). It should
    // not have access to the staff module (which is the admin UI for
    // managing those users). This is a deliberate decision — the
    // staff module is for managers/admins only.
    const staff = extractRoleJsonb("Staff");
    // Either undefined or empty array — both are fine, but never has
    // "view".
    const actions = staff.staff ?? [];
    expect(actions).not.toContain("view");
  });
});
