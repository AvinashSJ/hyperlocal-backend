"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/require-permission";
import { assertCategoriesRemovable } from "@/app/(admin)/stores/actions";

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

  revalidatePath("/settings");
  revalidatePath("/stores");
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

  revalidatePath("/stores");
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
