CREATE TABLE IF NOT EXISTS palpluss_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES app_users(id) ON DELETE CASCADE,

  transaction_id uuid NOT NULL UNIQUE
    REFERENCES real_money_transactions(id) ON DELETE RESTRICT,

  reference text NOT NULL UNIQUE,
  palpluss_transaction_id uuid UNIQUE,

  amount_cents bigint NOT NULL
    CHECK (amount_cents >= 100),

  currency text NOT NULL DEFAULT 'KES'
    CHECK (currency = 'KES'),

  phone text NOT NULL,

  status text NOT NULL DEFAULT 'AWAITING_PAYMENT'
    CHECK (
      status IN (
        'AWAITING_PAYMENT',
        'PROCESSING',
        'SUCCEEDED',
        'FAILED',
        'CANCELLED',
        'EXPIRED',
        'REVERSED'
      )
    ),

  mpesa_receipt text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS palpluss_deposits_user_created_idx
  ON palpluss_deposits (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS palpluss_deposits_status_idx
  ON palpluss_deposits (status, updated_at);
