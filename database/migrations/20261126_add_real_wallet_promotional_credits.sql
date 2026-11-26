-- Store promotional display credits separately from genuine-funds wallets.
-- These records do not create cash, deposits, trading funds, or withdrawal eligibility.

CREATE TABLE IF NOT EXISTS public.real_wallet_promotional_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,

  grant_code TEXT NOT NULL UNIQUE,

  amount_cents BIGINT NOT NULL
    CHECK (amount_cents > 0),

  currency TEXT NOT NULL
    CHECK (currency = 'USD'),

  credit_type TEXT NOT NULL DEFAULT 'DISPLAY_ONLY'
    CHECK (credit_type = 'DISPLAY_ONLY'),

  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVOKED')),

  description TEXT NOT NULL DEFAULT 'Non-cash promotional display credit',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT real_wallet_promotional_credits_user_uq UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS real_wallet_promotional_credits_status_idx
  ON public.real_wallet_promotional_credits (status);

INSERT INTO public.real_wallet_promotional_credits
  (user_id, grant_code, amount_cents, currency, credit_type, status, description)
SELECT id, 'JIMMY-REAL-DISPLAY-150-USD', 15000, 'USD',
       'DISPLAY_ONLY', 'ACTIVE',
       'Non-cash display credit for the AUREVEX account. Not withdrawable and not cash.'
FROM public.app_users
WHERE lower(email) = lower('jimmy@gmail.com')
ON CONFLICT (user_id) DO NOTHING;
