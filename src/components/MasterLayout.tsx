"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@iconify/react";
import { ToastContainer } from "react-toastify";
import { canAccess } from "@/lib/permissions";
import type { RolePermissions, PermissionModule } from "@/lib/permissions";

type NavItem = {
  label: string;
  icon: string;
  href: string;
  module?: PermissionModule;
  children?: { label: string; href: string; module?: PermissionModule }[];
};

const navItems: NavItem[] = [
  { label: "Dashboard", icon: "ri:dashboard-line", href: "/dashboard", module: "dashboard" },
  { label: "Stores", icon: "ri:store-2-line", href: "/stores", module: "stores" },
  {
    label: "Catalog",
    icon: "ri:list-check",
    href: "#",
    children: [
      { label: "Categories", href: "/categories", module: "categories" },
      { label: "Products", href: "/products", module: "products" },
    ],
  },
  {
    label: "Sales",
    icon: "ri:shopping-cart-line",
    href: "#",
    children: [
      { label: "Orders", href: "/orders", module: "orders" },
      { label: "Invoices", href: "/invoices", module: "invoices" },
    ],
  },
  { label: "Customers", icon: "ri:user-3-line", href: "/customers", module: "customers" },
  {
    label: "Management",
    icon: "ri:shield-user-line",
    href: "#",
    children: [
      { label: "Admin Users", href: "/users", module: "users" },
      { label: "Roles", href: "/roles", module: "roles" },
    ],
  },
  {
    label: "Content",
    icon: "ri:file-list-3-line",
    href: "#",
    children: [
      { label: "Media", href: "/media", module: "media" },
      { label: "Banners", href: "/banners", module: "banners" },
      { label: "Notifications", href: "/notifications", module: "notifications" },
    ],
  },
  {
    label: "Configuration",
    icon: "ri:settings-3-line",
    href: "#",
    children: [
      { label: "Settings", href: "/settings", module: "settings" },
      { label: "Delivery Zones", href: "/delivery-zones", module: "delivery_zones" },
      { label: "Delivery Slots", href: "/delivery-slots", module: "delivery_slots" },
      { label: "GST Numbers", href: "/gst-numbers", module: "gst_numbers" },
    ],
  },
  { label: "Inventory Log", icon: "ri:file-chart-line", href: "/inventory-log", module: "inventory_log" },
];

function hasModuleAccess(
  permissions: RolePermissions,
  module?: PermissionModule,
): boolean {
  if (!module) return true;
  return canAccess(permissions, module, "view");
}

function itemHasVisibleChild(
  permissions: RolePermissions,
  children?: { module?: PermissionModule }[],
): boolean {
  if (!children) return false;
  return children.some((c) => hasModuleAccess(permissions, c.module));
}

export default function MasterLayout({
  children,
  user,
  permissions = {},
  storeId = null,
  isStoreScoped = false,
  onSignOut,
}: {
  children: React.ReactNode;
  user: { email: string; full_name?: string; role?: string };
  permissions?: RolePermissions;
  storeId?: string | null;
  isStoreScoped?: boolean;
  onSignOut: () => void;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>(["Catalog", "Sales"]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = useCallback(
    (href: string) => href !== "#" && pathname.startsWith(href),
    [pathname],
  );

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) =>
      prev.includes(label) ? prev.filter((m) => m !== label) : [...prev, label],
    );
  };

  const storeScopedHidden: PermissionModule[] = [
    "stores", "categories", "banners", "notifications",
    "users", "roles", "settings",
  ];

  function isNotHidden(module?: PermissionModule): boolean {
    if (!module) return true;
    if (isStoreScoped && storeScopedHidden.includes(module)) return false;
    return true;
  }

  function itemHasVisibleChildScoped(
    children?: { module?: PermissionModule }[],
  ): boolean {
    if (!children) return false;
    return children.some((c) => isNotHidden(c.module) && hasModuleAccess(permissions, c.module));
  }

  const visibleItems = navItems.filter(
    (item) =>
      isNotHidden(item.module) &&
      (hasModuleAccess(permissions, item.module) ||
        itemHasVisibleChildScoped(item.children)),
  );

  const childFilter = (child: { module?: PermissionModule }) =>
    isNotHidden(child.module) && hasModuleAccess(permissions, child.module);

  return (
    <div className="d-flex" style={{ minHeight: "100vh" }}>
      <aside
        className={`bg-white border-end ${sidebarOpen ? "d-block" : "d-none d-lg-block"}`}
        style={{ width: 260, flexShrink: 0, overflowY: "auto", zIndex: 1040 }}
      >
        <div className="d-flex align-items-center px-3 py-3 border-bottom" style={{ height: 60 }}>
          <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-2" style={{ width: 36, height: 36 }}>
            <span className="fw-bold">H</span>
          </div>
          <div>
            <h6 className="mb-0 fw-bold" style={{ fontSize: "0.95rem" }}>Hyperlocal</h6>
            <small className="text-muted">Admin Panel</small>
          </div>
        </div>

        <nav className="py-2" style={{ fontSize: "0.875rem" }}>
          {visibleItems.map((item) => (
            <div key={item.label}>
              {item.children ? (
                <>
                  <button
                    onClick={() => toggleMenu(item.label)}
                    className="d-flex align-items-center w-100 px-3 py-2 border-0 bg-transparent"
                    style={{
                      color: expandedMenus.includes(item.label) ? "#0d6efd" : "#495057",
                      fontWeight: expandedMenus.includes(item.label) ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    <Icon icon={item.icon} className="me-2" width={18} />
                    <span className="flex-grow-1 text-start">{item.label}</span>
                    <Icon
                      icon="ri:arrow-down-s-line"
                      width={16}
                      style={{
                        transform: expandedMenus.includes(item.label) ? "rotate(180deg)" : "",
                        transition: "transform 0.2s",
                      }}
                    />
                  </button>
                  {expandedMenus.includes(item.label) && (
                    <div className="ps-4">
                      {item.children
                        .filter(childFilter)
                        .map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`d-block px-3 py-1 rounded text-decoration-none ${
                              isActive(child.href)
                                ? "bg-primary bg-opacity-10 text-primary fw-semibold"
                                : "text-secondary"
                            }`}
                            style={{ fontSize: "0.85rem" }}
                          >
                            {child.label}
                          </Link>
                        ))}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href={item.href}
                  className={`d-flex align-items-center px-3 py-2 text-decoration-none ${
                    isActive(item.href)
                      ? "bg-primary bg-opacity-10 text-primary fw-semibold"
                      : "text-secondary"
                  }`}
                >
                  <Icon icon={item.icon} className="me-2" width={18} />
                  {item.label}
                </Link>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {sidebarOpen && (
        <div
          className="d-lg-none position-fixed top-0 start-0 w-100 h-100"
          style={{ background: "rgba(0,0,0,0.3)", zIndex: 1030 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
        <header
          className="bg-white border-bottom d-flex align-items-center px-3"
          style={{ height: 60, flexShrink: 0 }}
        >
          <button
            className="btn btn-link d-lg-none text-dark p-0 me-2"
            onClick={() => setSidebarOpen(true)}
          >
            <Icon icon="ri:menu-line" width={22} />
          </button>

          <div className="flex-grow-1" />

          <div className="position-relative">
            <button
              className="btn btn-link text-dark text-decoration-none d-flex align-items-center"
              onClick={() => setUserMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setUserMenuOpen(false), 150)}
            >
              <div
                className="bg-primary bg-opacity-10 text-primary rounded-circle d-flex align-items-center justify-content-center me-2"
                style={{ width: 32, height: 32, fontSize: "0.8rem" }}
              >
                {(user.full_name || user.email)[0].toUpperCase()}
              </div>
              <div className="text-start d-none d-md-block" style={{ fontSize: "0.85rem" }}>
                <div className="fw-medium">{user.full_name || user.email}</div>
                <small className="text-muted">{user.role || "Admin"}</small>
              </div>
            </button>
            {userMenuOpen && (
              <ul
                className="dropdown-menu dropdown-menu-end shadow-sm show"
                style={{ position: "absolute", right: 0, top: "100%", zIndex: 1050 }}
              >
                <li>
                  <button className="dropdown-item text-danger" onClick={onSignOut}>
                    <Icon icon="ri:logout-circle-r-line" className="me-2" />
                    Sign out
                  </button>
                </li>
              </ul>
            )}
          </div>
        </header>

        <main className="flex-grow-1 p-3" style={{ overflowY: "auto", background: "#f8f9fa" }}>
          {children}
        </main>
      </div>

      <ToastContainer position="top-right" theme="light" />
    </div>
  );
}
