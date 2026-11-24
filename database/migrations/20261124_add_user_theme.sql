ALTER TABLE public.app_users
ADD COLUMN theme text NOT NULL DEFAULT 'DARK'
CHECK (theme IN ('DARK', 'LIGHT'));
