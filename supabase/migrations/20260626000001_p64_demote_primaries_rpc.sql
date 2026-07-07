-- P64: Atomic primary uniqueness for gst_numbers.
--
-- Previously, createGstNumber and updateGstNumber did not enforce that only
-- one row per store has is_primary=true. This allowed data integrity drift
-- (multiple primary rows for the same store).
--
-- This migration adds a Postgres function that atomically demotes every
-- other primary row for a given store to is_primary=false, excluding the
-- specified row. The JS layer (createGstNumber, updateGstNumber, and
-- updateStore's GSTIN sub-handler) calls this function before insert/update
-- when is_primary=true.
--
-- The function is SECURITY DEFINER + restricted search_path so it works
-- correctly under the service role without needing RLS changes.

CREATE OR REPLACE FUNCTION public.demote_other_primaries(
  p_store_id uuid,
  p_exclude_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_store_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.gst_numbers
     SET is_primary = false
   WHERE store_id = p_store_id
     AND is_primary = true
     AND (p_exclude_id IS NULL OR id <> p_exclude_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.demote_other_primaries(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demote_other_primaries(uuid, uuid) TO service_role;
