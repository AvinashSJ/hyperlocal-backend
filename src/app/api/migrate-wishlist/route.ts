import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const sql = `
    CREATE TABLE IF NOT EXISTS public.wishlists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, product_id)
    );
    ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can view own wishlist" ON public.wishlists
      FOR SELECT USING (auth.uid() = user_id);
    CREATE POLICY "Users can insert own wishlist" ON public.wishlists
      FOR INSERT WITH CHECK (auth.uid() = user_id);
    CREATE POLICY "Users can delete own wishlist" ON public.wishlists
      FOR DELETE USING (auth.uid() = user_id);
  `;

  const { error } = await supabase.rpc('exec_sql', { query: sql });

  if (error) {
    // try direct query via service_role
    const { error: directError } = await supabase.from('_sql').insert({ query: sql }).single();
    return NextResponse.json({ error: directError?.message ?? error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
