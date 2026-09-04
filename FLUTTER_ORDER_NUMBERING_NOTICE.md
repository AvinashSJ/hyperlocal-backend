# Order Numbering — Backend Change Notice (25 Aug 2026)

## What changed
The order_number generation was rewritten on the backend. No Flutter code changes required, but there's a **timing behavior** to be aware of.

## How it works now

### Before (broken)
Flutter inserts order → backend set `ORD-2026-000001` (global sequence, always 001, duplicates).

### After (fixed)
1. Flutter inserts order → backend sets temporary `PENDING-{uuid}` as order_number
2. Flutter inserts order_items → backend trigger fires and replaces with real `ADORD-NNNNNN` (e.g. `ADORD-000004`)
3. When Flutter refreshes the order, it has the correct number

## What Flutter should do
**Always read `order_number` from the refreshed/polled order, NOT from the initial INSERT response.**

The initial INSERT response will have `order_number: "PENDING-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`. After all order_items are inserted, call `refreshCurrentOrder` (which you already do) — it will return the real `ADORD-NNNNNN`.

### If Flutter displays order_number immediately after INSERT
If you show order_number before items are inserted, it will show `PENDING-{uuid}`. Either:
- **(Preferred)** Don't display order_number until after order_items are inserted and order is refreshed
- Or show "Processing..." until the refresh returns a real number

## Store prefixes
- ARUUN DOORSTEP → `ADORD-NNNNNN`
- SKYYWAY ENTERPRISES → `SEORD-NNNNNN`

## No code changes needed
The existing `refreshCurrentOrder` flow already handles this. Just ensure the displayed order_number comes from the refreshed data, not the initial INSERT response.
