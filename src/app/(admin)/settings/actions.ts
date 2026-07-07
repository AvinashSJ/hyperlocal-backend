"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";
import { assertCategoriesRemovable } from "@/app/(admin)/stores/actions";
import { demoteOtherPrimaries, validateGstin, warnGstinStateMismatch } from "@/app/(admin)/gst-numbers/actions";

export type StoreData = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  banner_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  delivery_radius_km: number | null;
  commission_rate: number | null;
  is_open: boolean;
  is_active: boolean;
};

export type PoliciesData = {
  min_order: number;
  max_order: number | null;
  open_time: string;
  close_time: string;
  cancellation_policy: string;
  return_policy: string;
  refund_policy: string;
  terms_conditions: string;
};

export type PaymentData = {
  cod_enabled: boolean;
  cod_min_amount: number;
  cod_max_amount: number | null;
  cod_charge: number;
  online_payment_enabled: boolean;
  gateway: string;
  api_key: string;
  api_secret: string;
};

export type GstData = {
  gst_enabled: boolean;
  default_gst_rate: number;
  hsn_prefix: string;
};

export type StoreSettingsData = {
  store: StoreData | null;
  policies: PoliciesData;
  payment: PaymentData;
  gst: GstData;
  zones: unknown[];
  slots: unknown[];
  gstNumbers: unknown[];
};

const DEFAULT_POLICIES: PoliciesData = {
  min_order: 0,
  max_order: null,
  open_time: "08:00",
  close_time: "22:00",
  cancellation_policy: "",
  return_policy: "",
  refund_policy: "",
  terms_conditions: "",
};

const DEFAULT_PAYMENT: PaymentData = {
  cod_enabled: true,
  cod_min_amount: 0,
  cod_max_amount: null,
  cod_charge: 0,
  online_payment_enabled: true,
  gateway: "razorpay",
  api_key: "",
  api_secret: "",
};

const DEFAULT_GST: GstData = {
  gst_enabled: true,
  default_gst_rate: 18,
  hsn_prefix: "",
};

function parseSetting<T>(value: unknown, defaults: T): T {
  if (!value || typeof value !== "object") return defaults;
  return { ...defaults, ...(value as Record<string, unknown>) } as T;
}

export async function getStoreSettings(storeId?: string): Promise<StoreSettingsData> {
  const supabase = createAdminClient();

  function buildStoreQuery() {
    return supabase
      .from("stores")
      .select("id, name, slug, logo_url, banner_url, phone, email, address, city, state, delivery_radius_km, commission_rate, is_open, is_active");
  }

  const storeRes = storeId
    ? await buildStoreQuery().eq("id", storeId).maybeSingle()
    : await buildStoreQuery().limit(1).maybeSingle();

  async function fetchZones() {
    let q = supabase.from("delivery_zones").select("*").order("name", { ascending: true });
    if (storeId) q = q.eq("store_id", storeId);
    return q;
  }

  async function fetchGst() {
    let q = supabase.from("gst_numbers").select("*, stores(name)").order("created_at", { ascending: false });
    if (storeId) q = q.eq("store_id", storeId);
    return q;
  }

  const [settingsRes, zonesRes, slotsRes, gstRes] = await Promise.all([
    supabase
      .from("settings")
      .select("key, value")
      .in("key", ["store_policies", "payment_config", "gst_config"]),
    fetchZones(),
    supabase.from("delivery_slots").select("*").order("start_time", { ascending: true }),
    fetchGst(),
  ]);

  const store = storeRes.data as StoreData | null;

  const settingsMap: Record<string, unknown> = {};
  if (settingsRes.data) {
    for (const s of settingsRes.data) {
      settingsMap[s.key] = s.value;
    }
  }

  return {
    store,
    policies: parseSetting(settingsMap.store_policies, DEFAULT_POLICIES),
    payment: parseSetting(settingsMap.payment_config, DEFAULT_PAYMENT),
    gst: parseSetting(settingsMap.gst_config, DEFAULT_GST),
    zones: zonesRes.data ?? [],
    slots: slotsRes.data ?? [],
    gstNumbers: gstRes.data ?? [],
  };
}

export async function updateStore(formData: FormData) {
  await assertPermission("stores", "edit");
  const supabase = createAdminClient();
  const id = formData.get("id") as string;

  const updates: Record<string, unknown> = {};
  const fields = ["name", "slug", "logo_url", "banner_url", "phone", "email", "address", "city", "state"];
  for (const f of fields) {
    const v = formData.get(f);
    updates[f] = v ? String(v) : null;
  }

  const numFields = ["delivery_radius_km", "commission_rate"];
  for (const f of numFields) {
    const v = formData.get(f);
    updates[f] = v ? Number(v) : null;
  }

  updates.is_open = formData.get("is_open") === "on";
  updates.is_active = formData.get("is_active") === "on";

  const { error } = await supabase.from("stores").update(updates).eq("id", id);
  if (error) throw new Error(error.message);

  const categoryIdsRaw = formData.get("category_ids");
  if (categoryIdsRaw !== null) {
    const categoryIds = String(categoryIdsRaw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { data: existingRows } = await supabase
      .from("store_categories")
      .select("category_id")
      .eq("store_id", id);
    const existingIds = new Set((existingRows ?? []).map((r) => r.category_id));
    const newIds = new Set(categoryIds);
    const removed = Array.from(existingIds).filter((cid) => !newIds.has(cid));

    await assertCategoriesRemovable(id, removed);

    const { error: deleteError } = await supabase
      .from("store_categories")
      .delete()
      .eq("store_id", id);
    if (deleteError) throw new Error(deleteError.message);

    if (categoryIds.length > 0) {
      const rows = categoryIds.map((category_id) => ({
        store_id: id,
        category_id,
      }));
      const { error: insertError } = await supabase
        .from("store_categories")
        .insert(rows);
      if (insertError) throw new Error(insertError.message);
    }
  }

  // P64: Primary GSTIN sub-handler. Only runs if the form included the
  // "gstin" field — so loading the page without the field is a no-op.
  // Sync semantics: empty = delete primary, non-empty = create or update
  // the primary row for this store. The store's own columns are untouched
  // (GSTIN lives in gst_numbers, not stores).
  const gstinField = formData.get("gstin");
  if (gstinField !== null) {
    const gstinValue = String(gstinField).trim().toUpperCase();
    const storeName = String(formData.get("name") ?? "").trim();

    const { data: existingPrimary } = await supabase
      .from("gst_numbers")
      .select("id")
      .eq("store_id", id)
      .eq("is_primary", true)
      .maybeSingle();

    if (!gstinValue) {
      // User cleared the field. Delete the primary row if one exists.
      if (existingPrimary) {
        const { error: delError } = await supabase
          .from("gst_numbers")
          .delete()
          .eq("id", existingPrimary.id);
        if (delError) throw new Error(delError.message);
      }
    } else {
      validateGstin(gstinValue);
      warnGstinStateMismatch(gstinValue, String(formData.get("state") ?? "").trim());

      if (existingPrimary) {
        // Update existing primary row.
        const { error: updError } = await supabase
          .from("gst_numbers")
          .update({ gstin: gstinValue, legal_name: storeName || undefined })
          .eq("id", existingPrimary.id);
        if (updError) throw new Error(updError.message);
      } else {
        // No primary exists — create one. Defensive demote in case a
        // legacy row is_primary=true without a match (shouldn't happen
        // post-P64, but cheap insurance).
        await demoteOtherPrimaries(id, null);
        const { error: insError } = await supabase
          .from("gst_numbers")
          .insert({
            store_id: id,
            gstin: gstinValue,
            legal_name: storeName,
            is_primary: true,
            is_active: true,
          });
        if (insError) throw new Error(insError.message);
      }
    }
  }

  revalidatePath("/settings");
  revalidatePath("/stores");
  revalidatePath("/gst-numbers");
}

export async function createStore(formData: FormData) {
  await assertPermission("stores", "create");
  const supabase = createAdminClient();
  const data: Record<string, unknown> = {};
  const fields = ["name", "slug", "logo_url", "banner_url", "phone", "email", "address", "city", "state"];
  for (const f of fields) {
    const v = formData.get(f);
    data[f] = v ? String(v) : null;
  }
  const numFields = ["delivery_radius_km", "commission_rate"];
  for (const f of numFields) {
    const v = formData.get(f);
    data[f] = v ? Number(v) : null;
  }
  data.is_open = formData.get("is_open") === "on";
  data.is_active = formData.get("is_active") === "on";

  const ownerId = String(formData.get("owner_id") ?? "");
  if (ownerId) data.owner_id = ownerId;

  if (!data.name) throw new Error("Store name is required");
  if (!data.slug) throw new Error("Slug is required");

  const { data: newStore, error } = await supabase
    .from("stores")
    .insert(data)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (ownerId) {
    await supabase.from("profiles").update({ store_id: newStore.id }).eq("id", ownerId);
  }

  const categoryIdsRaw = String(formData.get("category_ids") ?? "");
  if (categoryIdsRaw) {
    const categoryIds = categoryIdsRaw.split(",").filter(Boolean);
    if (categoryIds.length > 0) {
      const rows = categoryIds.map((category_id) => ({ store_id: newStore.id, category_id }));
      await supabase.from("store_categories").insert(rows);
    }
  }

  // P66: auto-create primary GSTIN on store create. Field is optional
  // (most stores will add GSTIN later via /gst-numbers). Only runs if
  // the form included the 'gstin' field with a non-empty value.
  // Mirrors the updateStore sub-handler for consistency.
  const gstinValue = String(formData.get("gstin") ?? "").trim().toUpperCase();
  if (gstinValue) {
    validateGstin(gstinValue);
    warnGstinStateMismatch(gstinValue, String(formData.get("state") ?? "").trim());
    await demoteOtherPrimaries(newStore.id, null);
    const { error: insError } = await supabase
      .from("gst_numbers")
      .insert({
        store_id: newStore.id,
        gstin: gstinValue,
        legal_name: String(data.name ?? ""),
        is_primary: true,
        is_active: true,
      });
    if (insError) throw new Error(insError.message);
  }

  revalidatePath("/stores");
  revalidatePath("/gst-numbers");
  return { id: newStore.id };
}

type SettingDef = {
  key: "store_policies" | "payment_config" | "gst_config";
  group: "store" | "payment" | "gst";
  parse: (fd: FormData) => Record<string, unknown>;
};

const SETTING_DEFS: Record<string, SettingDef> = {
  store_policies: {
    key: "store_policies",
    group: "store",
    parse: (fd) => ({
      min_order: fd.has("min_order") ? Number(fd.get("min_order")) : 0,
      max_order: fd.has("max_order") && fd.get("max_order") ? Number(fd.get("max_order")) : null,
      open_time: (fd.get("open_time") as string) || "08:00",
      close_time: (fd.get("close_time") as string) || "22:00",
      cancellation_policy: (fd.get("cancellation_policy") as string) || "",
      return_policy: (fd.get("return_policy") as string) || "",
      refund_policy: (fd.get("refund_policy") as string) || "",
      terms_conditions: (fd.get("terms_conditions") as string) || "",
    }),
  },
  payment_config: {
    key: "payment_config",
    group: "payment",
    parse: (fd) => ({
      cod_enabled: fd.get("cod_enabled") === "on",
      cod_min_amount: fd.has("cod_min_amount") ? Number(fd.get("cod_min_amount")) : 0,
      cod_max_amount: fd.has("cod_max_amount") && fd.get("cod_max_amount") ? Number(fd.get("cod_max_amount")) : null,
      cod_charge: fd.has("cod_charge") ? Number(fd.get("cod_charge")) : 0,
      online_payment_enabled: fd.get("online_payment_enabled") === "on",
      gateway: (fd.get("gateway") as string) || "razorpay",
      api_key: (fd.get("api_key") as string) || "",
      api_secret: (fd.get("api_secret") as string) || "",
    }),
  },
  gst_config: {
    key: "gst_config",
    group: "gst",
    parse: (fd) => ({
      gst_enabled: fd.get("gst_enabled") === "on",
      default_gst_rate: fd.has("default_gst_rate") ? Number(fd.get("default_gst_rate")) : 18,
      hsn_prefix: (fd.get("hsn_prefix") as string) || "",
    }),
  },
};

export async function updateStoreSetting(key: string, formData: FormData) {
  await assertPermission("stores", "edit");
  const def = SETTING_DEFS[key];
  if (!def) throw new Error(`Unknown setting key: ${key}`);

  const supabase = createAdminClient();
  const value = def.parse(formData);

  const { data: existing } = await supabase
    .from("settings")
    .select("id")
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("settings")
      .update({ value, group_name: def.group })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("settings")
      .insert({ key, value, group_name: def.group });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/settings");
}

// P34: shapes and defaults for the new maintenance / grace-period
// settings. The settings table already exists in the live DB (seeded
// by migration 20260620000006).
//
// Note: defaults are local (non-exported) because Next.js "use server"
// files only allow async functions to be exported. Type-only exports
// are allowed since types are erased at build time.
export type AppMaintenanceValue = {
  enabled: boolean;
  reason: "maintenance" | "technical" | "operations";
  message: string;
  etaHours: number | null;
};

export type StoreMaintenanceValue = {
  enabled: boolean;
  reason: "maintenance" | "technical" | "operations";
  message: string;
  etaHours: number | null;
};

const DEFAULT_APP_MAINTENANCE: AppMaintenanceValue = {
  enabled: false,
  reason: "maintenance",
  message: "",
  etaHours: null,
};

const DEFAULT_STORE_MAINTENANCE: StoreMaintenanceValue = {
  enabled: false,
  reason: "maintenance",
  message: "",
  etaHours: null,
};

const DEFAULT_CATEGORY_DELETION_GRACE_DAYS = 30;

const VALID_MAINTENANCE_REASONS: AppMaintenanceValue["reason"][] = [
  "maintenance",
  "technical",
  "operations",
];

function normalizeMaintenanceValue(
  raw: unknown,
  fallback: AppMaintenanceValue,
): AppMaintenanceValue {
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const reason = VALID_MAINTENANCE_REASONS.includes(
    obj.reason as AppMaintenanceValue["reason"],
  )
    ? (obj.reason as AppMaintenanceValue["reason"])
    : fallback.reason;
  const etaRaw = obj.etaHours;
  const etaHours =
    typeof etaRaw === "number" && Number.isFinite(etaRaw) && etaRaw >= 0
      ? etaRaw
      : null;
  return {
    enabled: Boolean(obj.enabled),
    reason,
    message: typeof obj.message === "string" ? obj.message : fallback.message,
    etaHours,
  };
}

export type AppMaintenance = AppMaintenanceValue;
export type StoreMaintenance = StoreMaintenanceValue;

export async function getAppMaintenance(): Promise<AppMaintenanceValue> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "app_maintenance")
    .maybeSingle();
  return normalizeMaintenanceValue(data?.value, DEFAULT_APP_MAINTENANCE);
}

export type StoreMaintenanceMap = Record<string, StoreMaintenanceValue>;

export async function getStoreMaintenanceMap(): Promise<StoreMaintenanceMap> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "store_maintenance")
    .maybeSingle();
  const raw = (data?.value as Record<string, unknown> | null) ?? {};
  const out: StoreMaintenanceMap = {};
  for (const [storeId, value] of Object.entries(raw)) {
    out[storeId] = normalizeMaintenanceValue(value, DEFAULT_STORE_MAINTENANCE);
  }
  return out;
}

export async function getCategoryDeletionGraceDays(): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "category_deletion_grace_days")
    .maybeSingle();
  const raw = data?.value;
  // The value can be a JSONB number (e.g. "30") or an object — the
  // seed inserts the raw number, but other writers might wrap it in
  // an object. Be liberal in what we accept.
  let days: number = DEFAULT_CATEGORY_DELETION_GRACE_DAYS;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    days = raw;
  } else if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) days = n;
  } else if (raw && typeof raw === "object" && "days" in raw) {
    const n = Number((raw as Record<string, unknown>).days);
    if (Number.isFinite(n) && n > 0) days = n;
  }
  return days;
}

// P34: Super-Admin-only. Updates the app_maintenance setting. The
// middleware reads this on every request to gate admin routes.
export async function updateAppMaintenance(formData: FormData) {
  const { isSuperAdmin } = await assertPermission("settings", "edit");
  if (!isSuperAdmin) {
    throw new Error("Only Super Admin can change app-wide maintenance");
  }
  const supabase = createAdminClient();
  const enabled = formData.get("enabled") === "true";
  const reasonRaw = formData.get("reason") as string;
  const reason = VALID_MAINTENANCE_REASONS.includes(
    reasonRaw as AppMaintenanceValue["reason"],
  )
    ? (reasonRaw as AppMaintenanceValue["reason"])
    : "maintenance";
  const etaRaw = formData.get("etaHours");
  const etaHours =
    etaRaw && etaRaw !== "" && Number.isFinite(Number(etaRaw))
      ? Number(etaRaw)
      : null;
  const message = ((formData.get("message") as string) ?? "").trim();

  const value: AppMaintenanceValue = { enabled, reason, message, etaHours };

  // Upsert
  const { data: existing } = await supabase
    .from("settings")
    .select("id")
    .eq("key", "app_maintenance")
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("settings")
      .update({ value, group_name: "general", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("settings")
      .insert({ key: "app_maintenance", value, group_name: "general" });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/maintenance");
  revalidatePath("/", "layout");
}

// P34: per-store on/off toggle. Super Admin can target any store;
// Manager can target only their own store.
export async function updateStoreMaintenance(formData: FormData) {
  const { isSuperAdmin } = await assertPermission("settings", "edit");
  const supabase = createAdminClient();
  const targetStoreId = formData.get("store_id") as string;
  if (!targetStoreId) throw new Error("store_id is required");

  // Manager restriction: must match the caller's store
  if (!isSuperAdmin) {
    const { createClient } = await import("@/lib/supabase/server");
    const serverSupabase = await createClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const { data: profile } = await serverSupabase
      .from("profiles")
      .select("store_id")
      .eq("id", user.id)
      .single();
    if (!profile || profile.store_id !== targetStoreId) {
      throw new Error("Managers can only toggle their own store");
    }
  }

  const enabled = formData.get("enabled") === "true";
  const reasonRaw = formData.get("reason") as string;
  const reason = VALID_MAINTENANCE_REASONS.includes(
    reasonRaw as StoreMaintenanceValue["reason"],
  )
    ? (reasonRaw as StoreMaintenanceValue["reason"])
    : "maintenance";
  const etaRaw = formData.get("etaHours");
  const etaHours =
    etaRaw && etaRaw !== "" && Number.isFinite(Number(etaRaw))
      ? Number(etaRaw)
      : null;
  const message = ((formData.get("message") as string) ?? "").trim();

  // Load current map
  const { data: existing } = await supabase
    .from("settings")
    .select("id, value")
    .eq("key", "store_maintenance")
    .maybeSingle();

  const currentMap = (existing?.value as StoreMaintenanceMap | null) ?? {};
  const newMap: StoreMaintenanceMap = {
    ...currentMap,
    [targetStoreId]: { enabled, reason, message, etaHours },
  };

  if (existing) {
    const { error } = await supabase
      .from("settings")
      .update({ value: newMap, group_name: "store", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("settings")
      .insert({ key: "store_maintenance", value: newMap, group_name: "store" });
    if (error) throw new Error(error.message);
  }

  // P34: store-off cascade. Mirror the manager-disable cascade but
  // scoped to a single store. Unassigns categories and inactivates
  // products when the store is being switched off.
  if (!enabled) {
    // Inactivate products in the store (respecting cascade_locked)
    await supabase
      .from("products")
      .update({ status: "inactive" })
      .eq("store_id", targetStoreId)
      .eq("cascade_locked", true)
      .neq("status", "inactive");
    // Unassign categories
    await supabase
      .from("store_categories")
      .delete()
      .eq("store_id", targetStoreId);
  }

  revalidatePath("/maintenance");
  revalidatePath("/", "layout");
}
