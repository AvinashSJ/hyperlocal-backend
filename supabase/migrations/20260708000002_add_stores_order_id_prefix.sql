-- Store-level order ID prefix for custom order numbering (e.g. ASORD, AS-ORD)
ALTER TABLE stores ADD COLUMN order_id_prefix TEXT DEFAULT null;
