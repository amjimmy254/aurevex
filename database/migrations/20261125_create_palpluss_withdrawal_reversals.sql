-- Allow a PalPluss withdrawal to be marked as reversed.
ALTER TABLE public.palpluss_withdrawals
DROP CONSTRAINT IF EXISTS palpluss_withdrawals_status_check;

ALTER TABLE public.palpluss_withdrawals
ADD CONSTRAINT palpluss_withdrawals_status_check
CHECK (
  status IN (
    'PENDING',
    'PROCESSING',
    'PAID',
    'FAILED',
    'REVERSED'
  )
);

-- Keep B2C withdrawal reversals separate from deposit reversals.
CREATE TABLE public.palpluss_withdrawal_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  webhook_id TEXT NOT NULL UNIQUE,
  provider_transaction_id TEXT NOT NULL UNIQUE,

  withdrawal_id UUID NOT NULL UNIQUE
    REFERENCES public.palpluss_withdrawals(id)
    ON DELETE RESTRICT,

  transaction_id UUID NOT NULL
    REFERENCES public.real_funds_transactions(id)
    ON DELETE RESTRICT,

  user_id UUID NOT NULL
    REFERENCES public.app_users(id)
    ON DELETE RESTRICT,

  amount_cents BIGINT NOT NULL
    CHECK (amount_cents >= 1000),

  currency TEXT NOT NULL DEFAULT 'KES'
    CHECK (currency = 'KES'),

  previous_withdrawal_status TEXT NOT NULL
    CHECK (
      previous_withdrawal_status IN (
        'PENDING',
        'PROCESSING',
        'PAID',
        'FAILED'
      )
    ),

  status TEXT NOT NULL DEFAULT 'RECONCILIATION_REQUIRED'
    CHECK (
      status IN (
        'RECONCILIATION_REQUIRED',
        'RESOLVED'
      )
    ),

  reason TEXT NOT NULL DEFAULT
    'PalPluss reported a reversed B2C payout',

  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX palpluss_withdrawal_reversals_user_created_idx
ON public.palpluss_withdrawal_reversals
(user_id, created_at DESC);

CREATE INDEX palpluss_withdrawal_reversals_status_created_idx
ON public.palpluss_withdrawal_reversals
(status, created_at);
