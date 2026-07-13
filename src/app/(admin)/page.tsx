import { redirect } from "next/navigation";
import { getStoreScope, getPostLoginRedirect } from "@/lib/store-scope";

export default async function AdminPage() {
  const { roleName } = await getStoreScope();
  redirect(getPostLoginRedirect(roleName));
}
