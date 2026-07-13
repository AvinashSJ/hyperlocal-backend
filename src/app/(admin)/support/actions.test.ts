import { describe, it, expect, beforeEach, vi } from "vitest";
import "../../../../test/mocks/supabase-clients";
import "../../../../test/mocks/next-cache";
import "../../../../test/mocks/next-navigation";
import "../../../../test/mocks/require-permission";
import {
  getAdminClient,
  resetSupabaseClients,
} from "../../../../test/mocks/supabase-clients";
import {
  asSuperAdmin,
  asAdmin,
  asAnonymous,
  resetPermissionMock,
  PermissionError,
} from "../../../../test/mocks/require-permission";
import { revalidatePathMock } from "../../../../test/mocks/next-cache";

const { getStoreScopeMock } = vi.hoisted(() => ({
  getStoreScopeMock: vi.fn(),
}));

vi.mock("@/lib/store-scope", () => ({
  getStoreScope: getStoreScopeMock,
}));

import {
  getSupportTickets,
  getSupportTicket,
  updateTicketStatus,
  respondToTicket,
} from "./actions";

beforeEach(() => {
  resetSupabaseClients();
  resetPermissionMock();
  getStoreScopeMock.mockReset();
  getStoreScopeMock.mockResolvedValue({ storeId: null, isStoreScoped: false, roleName: "Super Admin" });
  revalidatePathMock.mockClear();
});

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-1",
    user_id: "user-1",
    store_id: null,
    subject: "Test Issue",
    message: "This is a test ticket message.",
    status: "open",
    priority: "medium",
    assigned_to: null,
    admin_response: null,
    resolved_at: null,
    created_at: "2026-07-13T10:00:00Z",
    updated_at: "2026-07-13T10:00:00Z",
    ...overrides,
  };
}

describe("getSupportTickets", () => {
  it("rejects users without support_tickets:view permission", async () => {
    asAdmin({ dashboard: ["view"] });
    await expect(getSupportTickets()).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns an empty list when there are no tickets", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    const result = await getSupportTickets();
    expect(result).toEqual([]);
  });

  it("returns tickets for a super admin (no store filter)", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: [
        {
          ...makeTicket({ id: "t-1", subject: "Issue 1" }),
          profiles: { full_name: "John Doe" },
          assigned: null,
        },
      ],
      error: null,
    });

    const result = await getSupportTickets();
    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe("Issue 1");
    expect(result[0].customer_name).toBe("John Doe");
    expect(result[0].assigned_name).toBeNull();
  });

  it("filters by store_id for a store-scoped manager", async () => {
    asAdmin({ support_tickets: ["view"] });
    getStoreScopeMock.mockResolvedValue({ storeId: "store-1", isStoreScoped: true, roleName: "Manager" });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: [], error: null });

    await getSupportTickets();
    const chain = admin.chainsForTable("support_tickets")[0];
    const storeIdEq = chain.find((c) => c.method === "eq" && c.args[0] === "store_id");
    expect(storeIdEq?.args).toEqual(["store_id", "store-1"]);
  });
});

describe("getSupportTicket", () => {
  it("rejects users without support_tickets:view permission", async () => {
    asAdmin({ dashboard: ["view"] });
    await expect(getSupportTicket("t-1")).rejects.toBeInstanceOf(PermissionError);
  });

  it("returns null when the ticket is not found", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "not found" } });

    const result = await getSupportTicket("t-1");
    expect(result).toBeNull();
  });

  it("returns the ticket detail for a super admin", async () => {
    asSuperAdmin();
    const admin = getAdminClient();
    admin.enqueueResponse({
      data: {
        ...makeTicket({ id: "t-1", subject: "Help", message: "Need help" }),
        profiles: { full_name: "Jane" },
        assigned: null,
      },
      error: null,
    });

    const result = await getSupportTicket("t-1");
    expect(result).not.toBeNull();
    expect(result!.subject).toBe("Help");
    expect(result!.message).toBe("Need help");
    expect(result!.customer_name).toBe("Jane");
  });

  it("filters by store_id for a store-scoped manager", async () => {
    asAdmin({ support_tickets: ["view"] });
    getStoreScopeMock.mockResolvedValue({ storeId: "store-1", isStoreScoped: true, roleName: "Manager" });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: { message: "not found" } });

    await getSupportTicket("t-1");
    const chain = admin.chainsForTable("support_tickets")[0];
    const eqCalls = chain.filter((c) => c.method === "eq");
    expect(eqCalls.length).toBe(2);
    expect(eqCalls[0].args).toEqual(["id", "t-1"]);
    expect(eqCalls[1].args).toEqual(["store_id", "store-1"]);
  });
});

describe("updateTicketStatus", () => {
  it("rejects users without support_tickets:edit permission", async () => {
    asAdmin({ support_tickets: ["view"] });
    await expect(updateTicketStatus("t-1", "in_progress")).rejects.toBeInstanceOf(PermissionError);
  });

  it("updates the status to in_progress", async () => {
    asAdmin({ support_tickets: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await updateTicketStatus("t-1", "in_progress");
    const chain = admin.chainsForTable("support_tickets")[0];
    const updateCall = chain.find((c) => c.method === "update" && (c.args[0] as Record<string, unknown>)?.status === "in_progress");
    expect(updateCall).toBeDefined();
    expect((updateCall!.args[0] as Record<string, unknown>).resolved_at).toBeNull();
  });

  it("sets resolved_at when status is resolved", async () => {
    asAdmin({ support_tickets: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await updateTicketStatus("t-1", "resolved");
    const chain = admin.chainsForTable("support_tickets")[0];
    const updateCall = chain.find((c) => c.method === "update");
    expect((updateCall!.args[0] as Record<string, unknown>).resolved_at).not.toBeNull();
  });

  it("revalidates /support after status update", async () => {
    asAdmin({ support_tickets: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await updateTicketStatus("t-1", "closed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/support");
    expect(revalidatePathMock).toHaveBeenCalledWith("/support/t-1");
  });
});

describe("respondToTicket", () => {
  it("rejects users without support_tickets:edit permission", async () => {
    asAdmin({ support_tickets: ["view"] });
    await expect(respondToTicket("t-1", "Response text")).rejects.toBeInstanceOf(PermissionError);
  });

  it("saves the admin response", async () => {
    asAdmin({ support_tickets: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await respondToTicket("t-1", "Thank you for reaching out.");
    const chain = admin.chainsForTable("support_tickets")[0];
    const updateCall = chain.find((c) => c.method === "update");
    expect((updateCall!.args[0] as Record<string, unknown>).admin_response).toBe("Thank you for reaching out.");
  });

  it("revalidates the ticket detail path", async () => {
    asAdmin({ support_tickets: ["edit"] });
    const admin = getAdminClient();
    admin.enqueueResponse({ data: null, error: null });

    await respondToTicket("t-1", "Response");
    expect(revalidatePathMock).toHaveBeenCalledWith("/support/t-1");
  });
});
