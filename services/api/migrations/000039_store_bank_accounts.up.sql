CREATE TABLE IF NOT EXISTS store_bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  bank_id uuid REFERENCES platform_banks(id) ON DELETE SET NULL,
  bank_name text NOT NULL DEFAULT '',
  account_type varchar(40) NOT NULL DEFAULT 'Corriente',
  account_number varchar(120) NOT NULL,
  account_holder text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id,account_number)
);
CREATE INDEX IF NOT EXISTS idx_store_bank_accounts_store_active ON store_bank_accounts(store_id,is_active,created_at DESC);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES store_bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payment_account ON orders(payment_account_id);

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS cheque_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_account_id uuid REFERENCES store_bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS terminal_account_id uuid REFERENCES store_bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS terminal_percentage_fee numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terminal_fixed_fee numeric(12,2) NOT NULL DEFAULT 0;

INSERT INTO store_bank_accounts(store_id,bank_name,account_type,account_number,account_holder,is_active)
SELECT s.id,coalesce(s.bank_name,''),coalesce(nullif(s.bank_account_type,''),'Corriente'),s.bank_account_number,coalesce(s.bank_account_name,''),true
FROM stores s
WHERE trim(coalesce(s.bank_account_number,''))<>''
  AND NOT EXISTS (SELECT 1 FROM store_bank_accounts a WHERE a.store_id=s.id AND a.account_number=s.bank_account_number);

UPDATE store_bank_accounts a
SET bank_id=b.id
FROM platform_banks b
WHERE a.bank_id IS NULL AND lower(trim(a.bank_name))=lower(trim(b.name));

UPDATE stores s SET transfer_account_id=(
  SELECT a.id FROM store_bank_accounts a WHERE a.store_id=s.id AND a.is_active=true ORDER BY a.created_at LIMIT 1
) WHERE s.transfer_account_id IS NULL AND s.bank_transfer_enabled=true;
