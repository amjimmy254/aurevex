CREATE TABLE IF NOT EXISTS aurevex_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  wallet_id uuid NOT NULL REFERENCES real_wallets(id),
  transaction_id uuid NOT NULL UNIQUE
    REFERENCES real_money_transactions(id),
  idempotency_key text NOT NULL UNIQUE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  fee numeric(18,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  total_debit numeric(18,2) NOT NULL CHECK (total_debit > 0),
  currency text NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  destination_phone text NOT NULL
    CHECK (destination_phone ~ '^254[17][0-9]{8}$'),
  status text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN (
      'PENDING_REVIEW',
      'APPROVED',
      'DECLINED',
      'CANCELLED',
      'PROCESSING',
      'PAID',
      'FAILED'
    )),
  reviewed_by uuid REFERENCES app_users(id),
  reviewed_at timestamptz,
  review_note text,
  payout_reference text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_debit = amount + fee)
);

CREATE INDEX IF NOT EXISTS aurevex_withdrawals_user_created_idx
ON aurevex_withdrawal_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS aurevex_withdrawals_status_created_idx
ON aurevex_withdrawal_requests (status, created_at DESC);

ALTER TABLE real_wallet_ledger
DROP CONSTRAINT IF EXISTS real_wallet_ledger_entry_type_check;

ALTER TABLE real_wallet_ledger
ADD CONSTRAINT real_wallet_ledger_entry_type_check
CHECK (entry_type IN (
  'DEPOSIT_CREDIT',
  'DEPOSIT_REVERSAL',
  'REVERSAL_DEBT_SETTLEMENT',
  'WITHDRAWAL_RESERVE',
  'WITHDRAWAL_RELEASE',
  'WITHDRAWAL_DEBIT'
));
