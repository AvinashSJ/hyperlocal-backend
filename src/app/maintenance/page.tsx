import { createAdminClient } from "@/lib/supabase/admin";
import MaintenanceView from "./MaintenanceView";

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

export default async function MaintenancePage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "app_maintenance")
    .maybeSingle();

  const app = normalize(data?.value, DEFAULT);

  // If maintenance is OFF, the user shouldn't be on this page
  // (the middleware gates admin routes; this page is the fallback).
  // But it can also be reached by a Manager who navigated directly.
  // Show a friendly "all good" message either way.
  return <MaintenanceView app={app} />;
}
