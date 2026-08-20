import { requirePermission } from "@/lib/require-permission";
import RulesClient from "./RulesClient";

export default async function DeliveryRulesPage() {
  await requirePermission("delivery_rules", "view");
  return <RulesClient />;
}
