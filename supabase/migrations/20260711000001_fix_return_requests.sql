-- ============================================================================
-- P62 follow-up: fix return_requests bugs
-- ----------------------------------------------------------------------------
-- 1. Auto-update `updated_at` on return_requests (was missing the trigger).
-- 2. Add return_requests to the Realtime publication so Flutter gets
--    push notifications about return request state changes.
-- 3. Add INSERT RLS policy for customers (needed when the Flutter app
--    creates customer-raised return requests using the anon key).
-- ============================================================================

-- 1. Auto-update `updated_at` on every row change. Uses the same function
--    as banners (public.update_updated_at(), already exists).
CREATE TRIGGER trg_return_requests_updated_at
  BEFORE UPDATE ON return_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 2. Add return_requests to the Realtime publication so the Flutter app
--    gets live updates on return request state transitions.
ALTER PUBLICATION supabase_realtime ADD TABLE public.return_requests;

-- 3. Add INSERT policy for customers. When the Flutter app creates a
--    return request using the anon key, the existing SELECT policy
--    (requested_by = auth.uid()) already covers read-back. The INSERT
--    policy allows the row to be created in the first place.
CREATE POLICY "Customers can insert own return requests" ON return_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid());
