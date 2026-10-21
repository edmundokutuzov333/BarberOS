-- Gmail workspace integration. OAuth tokens are encrypted before entering this table.
-- Browser roles cannot read, write, or enumerate connection records or OAuth state.
create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null unique references public.barbershops(id) on delete cascade,
  connected_by uuid references auth.users(id) on delete set null,
  gmail_address text not null,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz not null,
  granted_scopes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gmail_connections_email_valid check (position('@' in gmail_address) > 1),
  constraint gmail_connections_ciphertext_valid check (
    length(access_token_ciphertext) > 24 and length(refresh_token_ciphertext) > 24
  )
);

create table if not exists public.gmail_oauth_states (
  state_hash text primary key,
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint gmail_oauth_state_hash_valid check (state_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists gmail_oauth_states_expiry_idx
  on public.gmail_oauth_states(expires_at);

alter table public.gmail_connections enable row level security;
alter table public.gmail_connections force row level security;
alter table public.gmail_oauth_states enable row level security;
alter table public.gmail_oauth_states force row level security;

revoke all on table public.gmail_connections from public, anon, authenticated;
revoke all on table public.gmail_oauth_states from public, anon, authenticated;
grant all on table public.gmail_connections to service_role;
grant all on table public.gmail_oauth_states to service_role;

comment on table public.gmail_connections is
  'One Gmail connection per barbershop. OAuth access and refresh tokens are encrypted by the gmail-integration Edge Function; no browser role has table access.';
comment on column public.gmail_connections.access_token_ciphertext is
  'AES-GCM ciphertext encoded as base64url IV and payload, encrypted with the GMAIL_TOKEN_ENCRYPTION_KEY Edge Function secret.';
comment on column public.gmail_connections.refresh_token_ciphertext is
  'AES-GCM ciphertext encoded as base64url IV and payload, encrypted with the GMAIL_TOKEN_ENCRYPTION_KEY Edge Function secret.';
comment on table public.gmail_oauth_states is
  'Single-use OAuth state hashes, bound to the initiating user and barbershop and expiring after ten minutes.';
