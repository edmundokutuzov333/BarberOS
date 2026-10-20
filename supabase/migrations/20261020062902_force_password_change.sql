-- Store only a force-change flag. Temporary passwords are never stored in the database.
alter table public.profiles
  add column if not exists password_change_required boolean not null default false;

comment on column public.profiles.password_change_required is
  'When true, the signed-in user must choose a new password before entering the private application. Never stores the password itself.';
