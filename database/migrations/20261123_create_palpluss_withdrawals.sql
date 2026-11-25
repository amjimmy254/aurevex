CREATE TABLE IF NOT EXISTS palpluss_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES app_users(id),

  transaction_id UUID NOT NULL UNIQUE
    REFERENCES real_funds_transactions(id),

  payout_id TEXT UNIQUE,

  idempotency_key TEXT NOT NULL UNIQUE,

  destination_phone TEXT NOT NULL,

  amount_cents BIGINT NOT NULL
    CHECK (amount_cents >= 1000 AND amount_cents % 100 = 0),

  fee_cents BIGINT
    CHECK (fee_cents IS NULL OR fee_cents >= 0),

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'PENDING',
      'PROCESSING',
      'PAID',
      'FAILED'
    )),

  failure_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT palpluss_withdrawals_phone_check
    CHECK (destination_phone ~ '^254[17][0-9]{8}$')
);

CREATE INDEX IF NOT EXISTS
  palpluss_withdrawals_user_created_idx
ON palpluss_withdrawals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS
  palpluss_withdrawals_status_idx
ON palpluss_withdrawals (status);
