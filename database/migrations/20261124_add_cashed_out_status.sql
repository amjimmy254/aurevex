ALTER TABLE public.demo_trades
  DROP CONSTRAINT IF EXISTS demo_trades_status_check;

ALTER TABLE public.demo_trades
  ADD CONSTRAINT demo_trades_status_check
  CHECK (
    status IN (
      'PENDING',
      'WON',
      'LOST',
      'CANCELLED',
      'CASHED_OUT'
    )
  );
