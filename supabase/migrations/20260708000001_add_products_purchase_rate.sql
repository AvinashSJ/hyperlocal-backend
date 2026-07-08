-- P&L: purchase_rate (what the store paid per unit) for profit/loss calculations
ALTER TABLE products ADD COLUMN purchase_rate numeric DEFAULT null;
