-- WAMERCIO 1.1: support center and manual transaction ledger.

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES stores(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  type varchar(30) NOT NULL DEFAULT 'order_payment',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency varchar(10) NOT NULL DEFAULT 'DOP',
  status varchar(20) NOT NULL DEFAULT 'pending',
  reference varchar(160),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_store_created ON transactions(store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_paid_order ON transactions(order_id, type) WHERE type='order_payment' AND status='paid';

INSERT INTO transactions(user_id,store_id,order_id,type,amount,currency,status,reference,description,created_at)
SELECT s.user_id,o.store_id,o.id,'order_payment',o.total,s.currency,'paid',concat('PED-',o.order_number),'Pago de pedido registrado',o.updated_at
FROM orders o
JOIN stores s ON s.id=o.store_id
WHERE o.payment_status='paid'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number bigint GENERATED ALWAYS AS IDENTITY,
  subject varchar(190) NOT NULL,
  priority varchar(20) NOT NULL DEFAULT 'normal',
  status varchar(20) NOT NULL DEFAULT 'open',
  last_reply_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, last_reply_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, last_reply_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_role varchar(30) NOT NULL DEFAULT 'owner',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at);
