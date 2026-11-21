ALTER TABLE real_wallets
  ADD COLUMN IF NOT EXISTS reversal_debt numeric NOT NULL DEFAULT 0;

ALTER TABLE real_wallets
  ADD CONSTRAINT real_wallets_reversal_debt_check
  CHECK (reversal_debt >= 0);

ALTER TABLE real_money_transactions
  DROP CONSTRAINT IF EXISTS real_money_transactions_status_check;

ALTER TABLE real_money_transactions
  ADD CONSTRAINT real_money_transactions_status_check
  CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED', 'REVERSED'));

CREATE TABLE IF NOT EXISTS real_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES real_wallets(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  transaction_id uuid NOT NULL REFERENCES real_money_transactions(id),
  entry_type text NOT NULL CHECK (
    entry_type IN (
      'DEPOSIT_CREDIT',
      'DEPOSIT_REVERSAL',
      'REVERSAL_DEBT_SETTLEMENT'
    )
  ),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, entry_type)
);

CREATE INDEX IF NOT EXISTS real_wallet_ledger_wallet_created_idx
  ON real_wallet_ledger (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS real_wallet_ledger_user_created_idx
  ON real_wallet_ledger (user_id, created_at DESC);
