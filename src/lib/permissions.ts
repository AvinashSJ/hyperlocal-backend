export const PERMISSION_MODULES = {
  dashboard: ["view"],
  products: ["view", "create", "edit", "delete"],
  categories: ["view", "create", "edit", "delete"],
  orders: ["view", "create", "edit", "delete"],
  invoices: ["view", "create", "edit", "delete"],
  customers: ["view", "create", "edit", "delete"],
  delivery_zones: ["view", "create", "edit", "delete"],
  delivery_slots: ["view", "create", "edit", "delete"],
  gst_numbers: ["view", "create", "edit", "delete"],
  inventory_log: ["view"],
  banners: ["view", "create", "edit", "delete"],
  media: ["view", "upload", "delete"],
  notifications: ["view", "send", "delete"],
  stores: ["view", "create", "edit", "delete"],
  users: ["view", "create", "edit", "delete"],
  roles: ["view", "create", "edit", "delete"],
  settings: ["view", "edit"],
} as const;

export type PermissionModule = keyof typeof PERMISSION_MODULES;
export type PermissionAction = "view" | "create" | "edit" | "delete" | "upload" | "send";

export type RolePermissions = Partial<Record<PermissionModule, PermissionAction[]>>;

export function hasPermission(
  permissions: RolePermissions,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  const actions = permissions[module];
  if (!actions) return false;
  return actions.includes(action);
}

export function canAccess(
  permissions: RolePermissions | null | undefined,
  module: PermissionModule,
  action: PermissionAction = "view",
): boolean {
  if (!permissions) return false;
  return hasPermission(permissions, module, action);
}
