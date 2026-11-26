CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES app_users(id)
    ON DELETE CASCADE,

  message TEXT NOT NULL
    CHECK (
      LENGTH(TRIM(message)) BETWEEN 1 AND 2000
    ),

  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'REVIEWED')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
  support_messages_user_created_idx
ON support_messages (user_id, created_at ASC);

CREATE INDEX IF NOT EXISTS
  support_messages_status_created_idx
ON support_messages (status, created_at DESC);
