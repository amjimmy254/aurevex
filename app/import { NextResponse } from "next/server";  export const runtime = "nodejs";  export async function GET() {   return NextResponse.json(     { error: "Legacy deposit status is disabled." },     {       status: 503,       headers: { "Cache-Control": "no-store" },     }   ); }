ALTER TABLE public.real_money_transactions
  DROP CONSTRAINT IF EXISTS real_money_transactions_transaction_type_check;

ALTER TABLE public.real_money_transactions
  ADD CONSTRAINT real_money_transactions_transaction_type_check
  CHECK (
    transaction_type IN (
      'DEPOSIT',
      'WITHDRAWAL',
      'WITHDRAWAL_RELEASE',
      'ADJUSTMENT',
      'TRADE_STAKE',
      'TRADE_PAYOUT',
      'TRADE_REFUND'
    )
  );
