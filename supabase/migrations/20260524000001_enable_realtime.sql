-- Enable Realtime for order_tracks so Flutter gets live status updates
alter publication supabase_realtime add table public.order_tracks;

-- Also enable for orders so payment/status changes are visible
alter publication supabase_realtime add table public.orders;
