-- BYO provider credentials are encrypted by the application before persistence.
CREATE TABLE IF NOT EXISTS public.user_provider_credentials (
  tenant_id uuid NOT NULL,
  owner_id text NOT NULL,
  provider text NOT NULL CHECK (provider = 'elevenlabs'),
  ciphertext text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_id, provider)
);
ALTER TABLE public.user_provider_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_provider_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_provider_credentials TO service_role;
