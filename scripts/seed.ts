import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

// Load .env.local manually (Next.js convention)
function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureTestStore(): Promise<string> {
  const { data: existing } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", "test-store")
    .single();

  if (existing) {
    console.log("Test store already exists, id:", existing.id);
    return existing.id;
  }

  const { data: store, error } = await supabase
    .from("stores")
    .insert({
      name: "Test Store",
      slug: "test-store",
      phone: "+1-555-TESTORE",
      email: "store@test.com",
      address: "123 Test Street",
      city: "Test City",
      state: "Test State",
      delivery_radius_km: 10,
      commission_rate: 5,
      is_open: true,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create test store:", error.message);
    process.exit(1);
  }

  console.log("Test store created, id:", store.id);
  return store.id;
}

async function getManagerRoleId(): Promise<number> {
  const { data, error } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Manager")
    .single();

  if (error || !data) {
    console.error("Manager role not found. Run migrations first.", error?.message);
    process.exit(1);
  }

  return data.id;
}

async function ensureStoreManager(email: string, password: string, storeId: string, roleId: number) {
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existingProfile) {
    console.log(`Store manager ${email} already exists`);
    return;
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Store Manager" },
  });

  if (authError) {
    console.error("Failed to create auth user:", authError.message);
    process.exit(1);
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    email,
    full_name: "Store Manager",
    phone: "+1-555-MANAGER",
    role: "admin",
    role_id: roleId,
    store_id: storeId,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    console.error("Failed to create profile:", profileError.message);
    process.exit(1);
  }

  console.log(`Store manager created: ${email} / ${password}`);
}

async function ensureSuperAdmin(email: string, password: string, roleId: number) {
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (existingProfile) {
    console.log(`Super Admin ${email} already exists`);
    return;
  }

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Super Admin" },
  });

  if (authError) {
    console.error("Failed to create auth user:", authError.message);
    process.exit(1);
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authUser.user.id,
    email,
    full_name: "Super Admin",
    role: "superadmin",
    role_id: roleId,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    console.error("Failed to create profile:", profileError.message);
    process.exit(1);
  }

  console.log(`Super Admin created: ${email} / ${password}`);
}

async function main() {
  console.log("Seeding test credentials...\n");

  const storeId = await ensureTestStore();
  const managerRoleId = await getManagerRoleId();

  const { data: superAdminRole } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "Super Admin")
    .single();

  if (!superAdminRole) {
    console.error("Super Admin role not found. Run migrations first.");
    process.exit(1);
  }

  await ensureStoreManager("storemanager@test.com", "Manager@123", storeId, managerRoleId);
  await ensureSuperAdmin("superadmin@test.com", "Admin@123", superAdminRole.id);

  console.log("\nDone. Test credentials:");
  console.log("  Super Admin:  superadmin@test.com / Admin@123");
  console.log("  Store Manager: storemanager@test.com / Manager@123");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
