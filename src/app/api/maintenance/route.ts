import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// P34: public, no-auth endpoint consumed by the Flutter customer
// app on launch + on resume from background. Returns the combined
// maintenance state for the app and every store.
//
// Response shape (stable contract — Flutter deserialises this):
// {
//   "app": { "enabled": bool, "reason": "maintenance"|"technical"|"operations", "message": string, "etaHours": number|null },
//   "stores": { "<storeId>": { enabled, reason, message, etaHours } }
// }

const VALID_REASONS = ["maintenance", "technical", "operations"] as const;
type Reason = (typeof VALID_REASONS)[number];

type MaintenanceValue = {
  enabled: boolean;
  reason: Reason;
  message: string;
  etaHours: number | null;
};

const DEFAULT: MaintenanceValue = {
  enabled: false,
  reason: "maintenance",
  message: "",
  etaHours: null,
};

function normalize(raw: unknown, fallback: MaintenanceValue): MaintenanceValue {
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const reason = (VALID_REASONS as readonly string[]).includes(
    obj.reason as string,
  )
    ? (obj.reason as Reason)
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["app_maintenance", "store_maintenance"]);

  const map: Record<string, unknown> = {};
  for (const row of data ?? []) {
    map[row.key] = row.value;
  }

  const app = normalize(map.app_maintenance, DEFAULT);

  const rawStores = (map.store_maintenance as Record<string, unknown> | null) ?? {};
  const stores: Record<string, MaintenanceValue> = {};
  for (const [storeId, value] of Object.entries(rawStores)) {
    stores[storeId] = normalize(value, DEFAULT);
  }

  return NextResponse.json({ app, stores });
}
