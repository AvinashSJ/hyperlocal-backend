-- RLS policies for profiles table (Flutter app uses anon key)
CREATE POLICY "User insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "User select own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "User update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS policies for orders table
CREATE POLICY "User insert own orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User select own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "User update own orders" ON public.orders
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for order_items table
CREATE POLICY "User insert own order items" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );

CREATE POLICY "User select own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
  );

-- Add insert policy for order_tracks so order placement can insert the initial track
CREATE POLICY "User insert own order tracks" ON public.order_tracks
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders WHERE orders.id = order_tracks.order_id AND orders.user_id = auth.uid())
  );
