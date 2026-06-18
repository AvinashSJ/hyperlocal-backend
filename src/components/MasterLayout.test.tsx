// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// Side-effect mocks — must come before any imports that use them
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
  useRouter: vi.fn(() => ({})),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className, style, onClick }: { href: string; children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) => (
    <a href={href} className={className} style={style} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon, width, height, className, style }: { icon: string; width?: number; height?: number; className?: string; style?: React.CSSProperties }) => (
    <span data-icon={icon} data-width={width} data-height={height} className={className} style={style} />
  ),
}));

vi.mock("react-toastify", () => ({
  ToastContainer: () => <div data-testid="toast-container" />,
}));

import MasterLayout from "./MasterLayout";
import { usePathname } from "next/navigation";
import type { RolePermissions } from "@/lib/permissions";

const mockUsePathname = usePathname as ReturnType<typeof vi.fn>;

const testUser = { email: "admin@example.com", full_name: "Alice Admin", role: "Super Admin" };

const fullPerms: RolePermissions = {
  dashboard: ["view"],
  products: ["view"],
  categories: ["view"],
  orders: ["view"],
  invoices: ["view"],
  customers: ["view"],
  delivery_zones: ["view"],
  delivery_slots: ["view"],
  gst_numbers: ["view"],
  inventory_log: ["view"],
  banners: ["view"],
  media: ["view"],
  notifications: ["view"],
  stores: ["view"],
  users: ["view"],
  roles: ["view"],
  staff: ["view"],
  commissions: ["view"],
  reports: ["view"],
  settings: ["view"],
};

beforeEach(() => {
  mockUsePathname.mockReturnValue("/");
});

describe("MasterLayout — branding and chrome", () => {
  it("renders the 'Hyperlocal' brand and 'Admin Panel' subtitle", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={fullPerms} onSignOut={() => {}}>
        <div>content</div>
      </MasterLayout>,
    );
    expect(html).toContain("Hyperlocal");
    expect(html).toContain("Admin Panel");
  });

  it("renders the user full_name in the topbar when provided", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Alice Admin");
  });

  it("falls back to email when full_name is missing", () => {
    const html = renderToString(
      <MasterLayout user={{ email: "x@y.com" }} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("x@y.com");
  });

  it("falls back to email first letter when both full_name and email are missing", () => {
    const html = renderToString(
      <MasterLayout user={{ email: "" }} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain(">U<");
  });

  it("renders the role label in the topbar", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Super Admin");
  });

  it("defaults role label to 'Admin' when not provided", () => {
    const html = renderToString(
      <MasterLayout user={{ email: "x@y.com" }} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Admin");
  });

  it("renders the ToastContainer", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("toast-container");
  });

  it("renders children in the main area", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={fullPerms} onSignOut={() => {}}>
        <div data-testid="child">Hello World</div>
      </MasterLayout>,
    );
    expect(html).toContain("Hello World");
  });
});

describe("MasterLayout — top-level nav items (no children)", () => {
  it("renders Dashboard when permissions include dashboard:view", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ dashboard: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Dashboard");
  });

  it("hides Dashboard when no dashboard:view permission", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{} as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).not.toContain(">Dashboard<");
  });

  it("always shows Dashboard for super admin regardless of permissions", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{} as RolePermissions}
        isSuperAdmin
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Dashboard");
  });

  it("renders Stores when stores:view permission", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ stores: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Stores");
  });

  it("renders Customers when customers:view permission", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ customers: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Customers");
  });

  it("renders Inventory Log when inventory_log:view permission", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ inventory_log: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Inventory Log");
  });

  it("renders Reports when reports:view permission", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ reports: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Reports");
  });
});

describe("MasterLayout — group menus with children", () => {
  it("renders the Management group when any of its children has view permission", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ users: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Management");
  });

  it("shows the Management group label even when no children are visible (SOURCE BUG: filter uses `isNotHidden(item.module) && moduleVisible(item.module) || hasChild` — when item has no module, isNotHidden returns true and moduleVisible returns true, so group always passes)", () => {
    // The filter is: isNotHidden(item.module) && (moduleVisible(item.module) || itemHasVisibleChildScoped(...))
    // For the Management item, item.module is undefined.
    // isNotHidden(undefined) returns true (no module = not hidden).
    // moduleVisible(undefined) returns true (no module = no perm check).
    // So the first part of the OR is true, and the group is always shown.
    // The children are filtered, but the parent group label persists.
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{} as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Management");
  });

  it("renders Catalog when products:view or categories:view", () => {
    const html1 = renderToString(
      <MasterLayout user={testUser} permissions={{ products: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    const html2 = renderToString(
      <MasterLayout user={testUser} permissions={{ categories: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html1).toContain("Catalog");
    expect(html2).toContain("Catalog");
  });

  it("renders Sales when orders:view", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ orders: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Sales");
  });

  it("renders Configuration when settings:view", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ settings: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Configuration");
  });

  it("renders Content when media:view or banners:view or notifications:view", () => {
    const html1 = renderToString(
      <MasterLayout user={testUser} permissions={{ media: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    const html2 = renderToString(
      <MasterLayout user={testUser} permissions={{ banners: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html1).toContain("Content");
    expect(html2).toContain("Content");
  });

  it("filters out children of a group that lack view permission", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ products: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    // Catalog group shows, Products child shows, but Categories child (no perm) is hidden
    expect(html).toContain("Products");
    // Categories is hidden because no categories:view permission
    expect(html).not.toMatch(/href="\/categories"/);
  });
});

describe("MasterLayout — store-scoped role hides admin-only modules", () => {
  const storeScopedHiddenPerms: RolePermissions = {
    dashboard: ["view"],
    products: ["view"],
    orders: ["view"],
    customers: ["view"],
    inventory_log: ["view"],
    reports: ["view"],
    commissions: ["view"],
    invoices: ["view"],
    delivery_zones: ["view"],
    delivery_slots: ["view"],
    gst_numbers: ["view"],
  };

  it("hides Stores from nav when isStoreScoped=true (even with stores:view permission)", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{ ...storeScopedHiddenPerms, stores: ["view"] } as RolePermissions}
        isStoreScoped
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    // No link to /stores
    expect(html).not.toMatch(/href="\/stores"/);
  });

  it("hides Categories from nav when isStoreScoped=true (even with categories:view permission)", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{ ...storeScopedHiddenPerms, categories: ["view"] } as RolePermissions}
        isStoreScoped
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    expect(html).not.toMatch(/href="\/categories"/);
  });

  it("hides Users from nav when isStoreScoped=true", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{ ...storeScopedHiddenPerms, users: ["view"] } as RolePermissions}
        isStoreScoped
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    expect(html).not.toMatch(/href="\/users"/);
  });

  it("hides Roles from nav when isStoreScoped=true", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{ ...storeScopedHiddenPerms, roles: ["view"] } as RolePermissions}
        isStoreScoped
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    expect(html).not.toMatch(/href="\/roles"/);
  });

  it("hides Settings from nav when isStoreScoped=true", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{ ...storeScopedHiddenPerms, settings: ["view"] } as RolePermissions}
        isStoreScoped
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    expect(html).not.toMatch(/href="\/settings"/);
  });

  it("hides Banners, Notifications from nav when isStoreScoped=true", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{ ...storeScopedHiddenPerms, banners: ["view"], notifications: ["view"] } as RolePermissions}
        isStoreScoped
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    expect(html).not.toMatch(/href="\/banners"/);
    expect(html).not.toMatch(/href="\/notifications"/);
  });

  it("STILL shows Products, Orders, Customers, Reports for store-scoped role", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={storeScopedHiddenPerms}
        isStoreScoped
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    expect(html).toMatch(/href="\/products"/);
    expect(html).toMatch(/href="\/orders"/);
    expect(html).toMatch(/href="\/customers"/);
    expect(html).toMatch(/href="\/reports"/);
  });
});

describe("MasterLayout — isSuperAdmin bypasses permission checks", () => {
  it("shows all top-level nav items even with no permissions", () => {
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{} as RolePermissions}
        isSuperAdmin
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    expect(html).toContain("Dashboard");
    expect(html).toContain("Stores");
    expect(html).toContain("Customers");
    expect(html).toContain("Inventory Log");
    expect(html).toContain("Reports");
  });

  it("shows children of DEFAULT-EXPANDED groups (Catalog, Sales) when isSuperAdmin=true", () => {
    // The default expandedMenus is ["Catalog", "Sales"]. Other groups
    // (Management, Content, Configuration) are collapsed by default and
    // their children are NOT rendered even with super admin.
    const html = renderToString(
      <MasterLayout
        user={testUser}
        permissions={{} as RolePermissions}
        isSuperAdmin
        onSignOut={() => {}}
      >
        <div />
      </MasterLayout>,
    );
    // All 2 Catalog children (expanded by default)
    expect(html).toMatch(/href="\/categories"/);
    expect(html).toMatch(/href="\/products"/);
    // All 3 Sales children (expanded by default)
    expect(html).toMatch(/href="\/orders"/);
    expect(html).toMatch(/href="\/invoices"/);
    expect(html).toMatch(/href="\/commissions"/);
    // Management children are collapsed (not rendered)
    expect(html).not.toMatch(/href="\/users"/);
    expect(html).not.toMatch(/href="\/roles"/);
    expect(html).not.toMatch(/href="\/staff"/);
  });
});

describe("MasterLayout — active link highlighting", () => {
  it("does NOT highlight a link when pathname does not start with its href", () => {
    mockUsePathname.mockReturnValue("/orders");
    const html = renderToString(
      <MasterLayout user={testUser} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    // Customers link should NOT have the active class
    expect(html).not.toMatch(/href="\/customers"[^>]*class="[^"]*bg-primary[^"]*"/);
  });

  it("highlights a top-level link when pathname starts with its href", () => {
    mockUsePathname.mockReturnValue("/orders/123");
    const html = renderToString(
      <MasterLayout user={testUser} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    // Orders link should have the active class
    expect(html).toMatch(/href="\/orders"[^>]*class="[^"]*bg-primary[^"]*"/);
  });

  it("does NOT highlight '#' placeholder hrefs (parent group buttons)", () => {
    mockUsePathname.mockReturnValue("/catalog");
    const html = renderToString(
      <MasterLayout user={testUser} permissions={fullPerms} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    // The Catalog group button has href="#" — should never be highlighted
    // (Catalog is expanded by default but not "active")
    expect(html).not.toMatch(/href="#"[^>]*class="[^"]*bg-primary[^"]*"/);
  });
});

describe("MasterLayout — initial expanded menus", () => {
  it("Catalog children are rendered (expanded by default)", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ products: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toMatch(/href="\/products"/);
  });

  it("Sales children are rendered (expanded by default)", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ orders: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    expect(html).toMatch(/href="\/orders"/);
  });

  it("Management children are NOT rendered initially (not in default expanded set)", () => {
    const html = renderToString(
      <MasterLayout user={testUser} permissions={{ users: ["view"] } as RolePermissions} onSignOut={() => {}}>
        <div />
      </MasterLayout>,
    );
    // Group is visible (label shows)
    expect(html).toContain("Management");
    // But the children links are NOT rendered because Management is collapsed by default
    expect(html).not.toMatch(/href="\/users"/);
  });
});
