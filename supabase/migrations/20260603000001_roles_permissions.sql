-- Roles & Permissions table
CREATE TABLE IF NOT EXISTS public.roles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activity log for admin actions
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add role_id FK to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_id BIGINT REFERENCES public.roles(id);

-- Seed default roles
INSERT INTO public.roles (name, description, permissions, is_system) VALUES
  ('Super Admin', 'Full system access to all modules', '{
    "dashboard": ["view"],
    "products": ["view", "create", "edit", "delete"],
    "categories": ["view", "create", "edit", "delete"],
    "orders": ["view", "create", "edit", "delete"],
    "invoices": ["view", "create", "edit", "delete"],
    "customers": ["view", "create", "edit", "delete"],
    "delivery_zones": ["view", "create", "edit", "delete"],
    "delivery_slots": ["view", "create", "edit", "delete"],
    "gst_numbers": ["view", "create", "edit", "delete"],
    "inventory_log": ["view"],
    "banners": ["view", "create", "edit", "delete"],
    "media": ["view", "upload", "delete"],
    "notifications": ["view", "send", "delete"],
    "users": ["view", "create", "edit", "delete"],
    "roles": ["view", "create", "edit", "delete"],
    "stores": ["view", "create", "edit", "delete"],
    "settings": ["view", "edit"]
  }'::jsonb, true),
  ('Manager', 'Can manage most content but cannot manage users, roles, or settings', '{
    "dashboard": ["view"],
    "products": ["view", "create", "edit", "delete"],
    "categories": ["view", "create", "edit", "delete"],
    "orders": ["view", "create", "edit", "delete"],
    "invoices": ["view", "create", "edit", "delete"],
    "customers": ["view"],
    "delivery_zones": ["view", "create", "edit", "delete"],
    "delivery_slots": ["view", "create", "edit", "delete"],
    "gst_numbers": ["view", "create", "edit", "delete"],
    "inventory_log": ["view"],
    "banners": ["view", "create", "edit", "delete"],
    "media": ["view", "upload", "delete"],
    "notifications": ["view", "send", "delete"],
    "users": ["view"],
    "roles": [],
    "stores": ["view", "create", "edit", "delete"],
    "settings": ["view"],
    "staff": ["view", "create", "edit", "delete"]
  }'::jsonb, true),
  ('Staff', 'View-only access with limited content management', '{
    "dashboard": ["view"],
    "products": ["view", "edit"],
    "categories": ["view"],
    "orders": ["view", "edit"],
    "invoices": ["view"],
    "customers": ["view"],
    "delivery_zones": ["view"],
    "delivery_slots": ["view"],
    "gst_numbers": ["view"],
    "inventory_log": ["view"],
    "banners": [],
    "media": ["view", "upload"],
    "notifications": ["view"],
    "users": [],
    "roles": [],
    "stores": ["view"],
    "settings": []
  }'::jsonb, true)
ON CONFLICT (name) DO NOTHING;

-- Map existing profiles roles to new role_id
UPDATE public.profiles p
SET role_id = r.id
FROM public.roles r
WHERE p.role_id IS NULL
  AND (r.name = 'Super Admin' AND p.role = 'superadmin'
    OR r.name = 'Manager' AND p.role = 'admin');

