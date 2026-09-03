import { redirect } from "next/navigation";
import { createClient, safeGetUser } from "@/lib/supabase/server";
import { getStoreScope, getPostLoginRedirect } from "@/lib/store-scope";

export default async function RootPage() {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);

  if (user) {
    const { roleName } = await getStoreScope();
    redirect(getPostLoginRedirect(roleName));
  }

  redirect("/auth/login");
}
