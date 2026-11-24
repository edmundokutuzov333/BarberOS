-- Invitations are private, single-use capabilities tied to a verified email.
-- No plaintext invitation token is stored; the creator receives it once.
create table if not exists private.team_invitations (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  email text not null check (email=lower(btrim(email)) and length(email) between 3 and 254),
  role public.app_role not null check (role in ('manager','barber')),
  barber_id uuid references public.barbers(id) on delete set null,
  token_hash bytea not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  check (not (revoked_at is not null and accepted_at is not null))
);
alter table private.team_invitations enable row level security;
revoke all on private.team_invitations from public,anon,authenticated;
create unique index if not exists team_invitations_pending_email_idx
  on private.team_invitations(barbershop_id,email) where revoked_at is null and accepted_at is null;
create index if not exists team_invitations_shop_barber_idx on private.team_invitations(barber_id);
create index if not exists team_invitations_inviter_idx on private.team_invitations(invited_by);
create index if not exists team_invitations_acceptor_idx on private.team_invitations(accepted_by);

create or replace function public.create_team_invitation(p_shop uuid,p_email text,p_role public.app_role,p_barber uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $create$
declare
  v_email text:=lower(btrim(p_email)); v_token text; v_id uuid; v_expires timestamptz:=now()+interval '7 days';
begin
  if p_shop is null or not private.is_member(p_shop,array['owner']::public.app_role[]) then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('barberos:membership:'||p_shop::text,0));
  if not private.is_member(p_shop,array['owner']::public.app_role[]) then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.barbershops s where s.id=p_shop and s.status in ('active','trial')) then
    raise exception 'SHOP_NOT_OPERATIONAL';
  end if;
  if v_email is null or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if p_role is null or p_role not in ('manager','barber') then raise exception 'INVALID_ROLE'; end if;
  if exists(select 1 from public.barbershop_members m join auth.users u on u.id=m.user_id
      where m.barbershop_id=p_shop and lower(u.email)=v_email) then raise exception 'ALREADY_MEMBER'; end if;
  if p_role='barber' then
    if p_barber is null or not exists(select 1 from public.barbers b where b.id=p_barber and b.barbershop_id=p_shop and b.is_active and b.user_id is null) then
      raise exception 'INVITATION_BARBER_UNAVAILABLE';
    end if;
    if exists(select 1 from private.team_invitations i where i.barbershop_id=p_shop and i.barber_id=p_barber
       and i.email<>v_email and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()) then
      raise exception 'BARBER_INVITATION_PENDING';
    end if;
  elsif p_barber is not null then raise exception 'INVALID_ROLE'; end if;
  update private.team_invitations set revoked_at=now()
    where barbershop_id=p_shop and accepted_at is null and revoked_at is null and (email=v_email or expires_at<=now());
  if (select count(*) from private.team_invitations where barbershop_id=p_shop and accepted_at is null and revoked_at is null)>=50 then
    raise exception 'INVITATION_LIMIT';
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into private.team_invitations(barbershop_id,email,role,barber_id,token_hash,invited_by,expires_at)
    values(p_shop,v_email,p_role,p_barber,extensions.digest(v_token,'sha256'),auth.uid(),v_expires) returning id into v_id;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
    values(p_shop,auth.uid(),'team_invitation_created','team_invitation',v_id,jsonb_build_object('role',p_role,'barber_id',p_barber));
  return jsonb_build_object('id',v_id,'token',v_token,'expires_at',v_expires);
end;
$create$;

create or replace function public.list_team_invitations(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $list$
begin
  if p_shop is null or not private.is_member(p_shop,array['owner']::public.app_role[]) then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.email,'role',i.role,'barber_id',i.barber_id,
      'barber_name',b.display_name,'expires_at',i.expires_at
    ) order by i.created_at desc)
    from private.team_invitations i
    left join public.barbers b on b.id=i.barber_id and b.barbershop_id=i.barbershop_id
    where i.barbershop_id=p_shop and i.revoked_at is null and i.accepted_at is null and i.expires_at>now()),'[]'::jsonb);
end;
$list$;

create or replace function public.revoke_team_invitation(p_shop uuid,p_invite uuid)
returns boolean language plpgsql security definer set search_path = '' as $revoke$
declare v_id uuid;
begin
  if p_shop is null or not private.is_member(p_shop,array['owner']::public.app_role[]) then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('barberos:membership:'||p_shop::text,0));
  if not private.is_member(p_shop,array['owner']::public.app_role[]) then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  update private.team_invitations set revoked_at=now() where id=p_invite and barbershop_id=p_shop
    and revoked_at is null and accepted_at is null returning id into v_id;
  if v_id is not null then
    insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id)
      values(p_shop,auth.uid(),'team_invitation_revoked','team_invitation',v_id);
  end if;
  return v_id is not null;
end;
$revoke$;

create or replace function public.accept_team_invitation(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $accept$
declare
  v_user uuid:=auth.uid(); v_shop uuid; v_email text; v_member uuid; v_role public.app_role;
  v_invite private.team_invitations%rowtype; v_hash bytea; v_barber_user uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if private.current_password_change_required(v_user) then raise exception 'PASSWORD_CHANGE_REQUIRED'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'INVITATION_INVALID'; end if;
  select lower(u.email) into v_email from auth.users u join public.profiles p on p.id=u.id
    where u.id=v_user and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'INVITATION_EMAIL_UNVERIFIED'; end if;
  v_hash:=extensions.digest(p_token,'sha256');
  select i.barbershop_id into v_shop from private.team_invitations i where i.token_hash=v_hash;
  if v_shop is null then raise exception 'INVITATION_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('barberos:membership:'||v_shop::text,0));
  select i.* into v_invite from private.team_invitations i where i.token_hash=v_hash for update;
  if not found or v_invite.email<>v_email or v_invite.revoked_at is not null then
    raise exception 'INVITATION_INVALID';
  end if;
  select m.id,m.role into v_member,v_role from public.barbershop_members m
    where m.barbershop_id=v_shop and m.user_id=v_user for update;
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by=v_user and v_member is not null and v_role=v_invite.role then
      return jsonb_build_object('shop_id',v_shop,'membership_id',v_member,'role',v_role,'idempotent',true);
    end if;
    raise exception 'INVITATION_INVALID';
  end if;
  if v_invite.expires_at<=now()
    or not exists(select 1 from public.barbershop_members m where m.barbershop_id=v_shop and m.user_id=v_invite.invited_by and m.role='owner')
    or not exists(select 1 from public.barbershops s where s.id=v_shop and s.status in ('active','trial')) then
    raise exception 'INVITATION_INVALID';
  end if;
  if v_member is not null and v_role<>v_invite.role then raise exception 'INVITATION_ROLE_CONFLICT'; end if;
  if v_invite.role='barber' then
    select b.user_id into v_barber_user from public.barbers b where b.id=v_invite.barber_id and b.barbershop_id=v_shop and b.is_active for update;
    if not found or (v_barber_user is not null and v_barber_user<>v_user)
      or exists(select 1 from public.barbers b where b.barbershop_id=v_shop and b.user_id=v_user and b.id<>v_invite.barber_id) then
      raise exception 'INVITATION_BARBER_UNAVAILABLE';
    end if;
  end if;
  if v_member is null then
    insert into public.barbershop_members(barbershop_id,user_id,role) values(v_shop,v_user,v_invite.role) returning id into v_member;
    insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
      values(v_shop,v_user,'member_added','barbershop_member',v_member,jsonb_build_object('user_id',v_user,'role',v_invite.role,'source','invitation'));
  end if;
  if v_invite.role='barber' then
    update public.barbers set user_id=v_user where id=v_invite.barber_id and barbershop_id=v_shop;
  end if;
  update private.team_invitations set accepted_at=now(),accepted_by=v_user where id=v_invite.id;
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
    values(v_shop,v_user,'team_invitation_accepted','team_invitation',v_invite.id,jsonb_build_object('role',v_invite.role));
  return jsonb_build_object('shop_id',v_shop,'membership_id',v_member,'role',v_invite.role,'idempotent',false);
end;
$accept$;
revoke all on function public.create_team_invitation(uuid,text,public.app_role,uuid), public.list_team_invitations(uuid), public.revoke_team_invitation(uuid,uuid), public.accept_team_invitation(text) from public,anon,authenticated;
grant execute on function public.create_team_invitation(uuid,text,public.app_role,uuid), public.list_team_invitations(uuid), public.revoke_team_invitation(uuid,uuid), public.accept_team_invitation(text) to authenticated;
