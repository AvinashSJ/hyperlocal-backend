import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStoreScope, getPostLoginRedirect } from "@/lib/store-scope";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { roleName } = await getStoreScope();
    redirect(getPostLoginRedirect(roleName));
  }

  redirect("/auth/login");
}
