CREATE TABLE IF NOT EXISTS real_test_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES app_users(id),

  wallet_id UUID NOT NULL
    REFERENCES real_wallets(id),

  asset TEXT NOT NULL,
  direction TEXT NOT NULL,

  amount NUMERIC(18, 2) NOT NULL
    CHECK (amount > 0),

  expiry_seconds INTEGER NOT NULL
    CHECK (expiry_seconds > 0),

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'PENDING',
      'WON',
      'LOST',
      'CANCELLED'
    )),

  simulated_result NUMERIC(18, 2) NOT NULL DEFAULT 0,

  contract_type TEXT NOT NULL DEFAULT 'DIRECTIONAL'
    CHECK (contract_type IN (
      'DIRECTIONAL',
      'EVEN_ODD',
      'OVER_UNDER',
      'MATCHES_DIFFERS'
    )),

  contract_prediction TEXT,
  target_price NUMERIC(18, 8),

  entry_price NUMERIC(18, 8),
  expiry_price NUMERIC(18, 8),

  entry_digit INTEGER
    CHECK (entry_digit IS NULL OR entry_digit BETWEEN 0 AND 9),

  expiry_digit INTEGER
    CHECK (expiry_digit IS NULL OR expiry_digit BETWEEN 0 AND 9),

  provider_symbol TEXT,

  multiplier NUMERIC(8, 4) NOT NULL DEFAULT 1.952,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS
  real_test_trades_user_created_idx
ON real_test_trades (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS
  real_test_trades_pending_idx
ON real_test_trades (user_id, status, created_at)
WHERE status = 'PENDING';
