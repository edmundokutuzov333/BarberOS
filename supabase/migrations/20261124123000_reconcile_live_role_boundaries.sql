-- Forward-only reconciliation: retain helper EXECUTE revocations; RLS invokes private helpers.
-- Public catalogue RPC remains the shared sanitized contract for authenticated visitors.
alter policy appointment_product_orders_member_read on public.appointment_product_orders to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy inventory_movements_manager_read on public.inventory_movements to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy inventory_reservations_manager_read on public.inventory_reservations to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy payments_operator_read on public.payments to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_catalog_audit_manager_read on public.shop_catalog_audit_events to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_notification_events_manager_read on public.shop_notification_events to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_operation_incident_events_manager_read on public.shop_operation_incident_events to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_operation_incidents_manager_read on public.shop_operation_incidents to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_order_operation_events_manager_read on public.shop_order_operation_events to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_order_payments_manager_read on public.shop_order_payments to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy appointment_product_order_items_member_read on public.appointment_product_order_items to authenticated using (
  (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin()) and exists(select 1 from public.appointment_product_orders o
    where o.id=appointment_product_order_items.order_id and o.barbershop_id=appointment_product_order_items.barbershop_id)
);
alter policy shop_product_categories_manage on public.shop_product_categories to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin()) with check (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_product_categories_member_read on public.shop_product_categories to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_product_categories_public_read on public.shop_product_categories to anon;
alter policy shop_product_variants_manage on public.shop_product_variants to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin()) with check (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_product_variants_member_read on public.shop_product_variants to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_product_variants_public_read on public.shop_product_variants to anon;
alter policy shop_products_manage on public.shop_products to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin()) with check (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_products_member_read on public.shop_products to authenticated using (private.is_member(barbershop_id, ARRAY['owner','manager']::public.app_role[]) OR private.is_platform_admin());
alter policy shop_products_public_read on public.shop_products to anon;
-- The existing anonymous policies join these public boolean columns.
grant select(is_active) on public.shop_product_categories, public.shop_products to anon;

-- Raw writes cannot change a linked account outside the owner workflow.
create or replace function private.guard_barber_account_link()
returns trigger language plpgsql set search_path = '' as $guard$
declare v_changed boolean;
begin
  if current_user not in ('authenticated','anon') then
    if TG_OP='DELETE' then return OLD; end if;
    return NEW;
  end if;
  if TG_OP='DELETE' then
    v_changed:=OLD.user_id is not null;
    if v_changed and not private.is_member(OLD.barbershop_id,array['owner']::public.app_role[]) then
      raise exception 'OWNER_REQUIRED' using errcode='42501';
    end if;
    return OLD;
  elsif TG_OP='INSERT' then
    v_changed:=NEW.user_id is not null;
  else
    v_changed:=NEW.user_id is distinct from OLD.user_id;
  end if;
  if v_changed then
    if not private.is_member(NEW.barbershop_id,array['owner']::public.app_role[]) then
      raise exception 'OWNER_REQUIRED' using errcode='42501';
    end if;
    -- A direct write is not the account-link workflow, even for the owner.
    -- Use save_barber, which serializes with membership changes.
    raise exception 'BARBER_ACCOUNT_LINK_RPC_REQUIRED' using errcode='42501';
  end if;
  return NEW;
end;
$guard$;
revoke all on function private.guard_barber_account_link() from public,anon,authenticated;
drop trigger if exists barber_account_link_guard on public.barbers;
create trigger barber_account_link_guard before insert or update of user_id or delete on public.barbers
for each row execute function private.guard_barber_account_link();

CREATE OR REPLACE FUNCTION public.save_barber(p_shop uuid, p_barber_id uuid, p_display_name text, p_bio text, p_years_experience integer, p_photo_url text, p_user_id uuid, p_service_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_barber_id uuid;
  v_previous_user uuid;
  v_service_count int;
  v_distinct_service_count int;
begin
  perform private.require_shop_operator(p_shop);
  -- The same tenant lock protects membership changes and account linkage.
  perform pg_advisory_xact_lock(hashtextextended('barberos:membership:'||p_shop::text,0));
  if p_barber_id is not null then
    select b.user_id into v_previous_user from public.barbers b
      where b.id=p_barber_id and b.barbershop_id=p_shop for update;
    if not found then raise exception 'BARBER_NOT_IN_SHOP'; end if;
  end if;
  if p_user_id is distinct from v_previous_user
     and not private.is_member(p_shop,array['owner']::public.app_role[]) then
    raise exception 'OWNER_REQUIRED' using errcode='42501';
  end if;

  if p_display_name is null or length(btrim(p_display_name)) < 2 then
    raise exception 'INVALID_BARBER_NAME';
  end if;

  if p_years_experience < 0 or p_years_experience > 80 then
    raise exception 'INVALID_BARBER_EXPERIENCE';
  end if;

  if p_user_id is not null and not exists (
    select 1 from public.barbershop_members m
    where m.barbershop_id=p_shop
      and m.user_id=p_user_id
  ) then
    raise exception 'BARBER_USER_NOT_MEMBER';
  end if;

  v_service_count := coalesce(array_length(p_service_ids,1),0);
  v_distinct_service_count := coalesce(
    (select count(distinct x) from unnest(coalesce(p_service_ids,'{}'::uuid[])) as u(x)),
    0
  );

  if v_service_count <> v_distinct_service_count then
    raise exception 'DUPLICATE_SERVICE';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_service_ids,'{}'::uuid[])) as u(id)
    left join public.services s on s.id=u.id
    where s.id is null or s.barbershop_id<>p_shop
  ) then
    raise exception 'SERVICE_NOT_IN_SHOP';
  end if;

  if p_barber_id is null then
    insert into public.barbers(
      barbershop_id,
      display_name,
      bio,
      years_experience,
      photo_url,
      user_id,
      sort_order
    )
    values (
      p_shop,
      btrim(p_display_name),
      nullif(btrim(p_bio),''),
      p_years_experience,
      p_photo_url,
      p_user_id,
      (select coalesce(max(sort_order)+1,0) from public.barbers where barbershop_id=p_shop)
    )
    returning id into v_barber_id;
  else
    if not exists (
      select 1 from public.barbers b
      where b.id=p_barber_id
        and b.barbershop_id=p_shop
    ) then
      raise exception 'BARBER_NOT_IN_SHOP';
    end if;

    update public.barbers
    set display_name=btrim(p_display_name),
        bio=nullif(btrim(p_bio),''),
        years_experience=p_years_experience,
        photo_url=p_photo_url,
        user_id=p_user_id
    where id=p_barber_id
      and barbershop_id=p_shop
    returning id into v_barber_id;
  end if;

  delete from public.barber_services
  where barber_id=v_barber_id;

  insert into public.barber_services(barber_id,service_id)
  select v_barber_id,u.id
  from unnest(coalesce(p_service_ids,'{}'::uuid[])) as u(id);

  return v_barber_id;
end;
$function$;

-- Membership revocation must also detach the login from the operational record,
-- without deleting appointments or the barber's service history.
create or replace function private.detach_removed_barber_member()
returns trigger language plpgsql security definer set search_path = '' as $detach$
begin
  update public.barbers set user_id=null
    where barbershop_id=OLD.barbershop_id and user_id=OLD.user_id;
  return OLD;
end;
$detach$;
revoke all on function private.detach_removed_barber_member() from public,anon,authenticated;
drop trigger if exists detach_removed_barber_member on public.barbershop_members;
create trigger detach_removed_barber_member after delete on public.barbershop_members
for each row execute function private.detach_removed_barber_member();

-- Add an operational-only directory to each queue row, without emails or granting
-- the manager access to the owner-only membership RPC. Existing queue fields stay intact.
CREATE OR REPLACE FUNCTION public.get_shop_order_queue(p_barbershop_id uuid, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
  v_assignees jsonb;
begin
  if auth.uid() is null or not (
    public.is_member(p_barbershop_id, array['owner','manager']::public.app_role[])
    or public.is_platform_admin()
  ) then
    raise exception 'SHOP_ORDER_FORBIDDEN' using errcode='42501';
  end if;
  if p_status is not null and p_status not in (
    'received','needs_confirmation','accepted','preparing','ready','partially_delivered','delivered','cancelled','failed'
  ) then raise exception 'INVALID_SHOP_ORDER_FILTER'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',m.user_id,'role',m.role,
    'full_name',coalesce(nullif(btrim(p.full_name),''),nullif(btrim(b.display_name),''),'Membro '||left(m.user_id::text,8))
  ) order by m.created_at,m.user_id),'[]'::jsonb) into v_assignees
  from public.barbershop_members m
  left join public.profiles p on p.id=m.user_id
  left join public.barbers b on b.barbershop_id=m.barbershop_id and b.user_id=m.user_id
  where m.barbershop_id=p_barbershop_id;

  select coalesce(jsonb_agg(q.order_json order by q.requested_for asc), '[]'::jsonb)
  into v_result
  from (
    select o.requested_for,
      jsonb_build_object(
        'id',o.id,'barbershop_id',o.barbershop_id,'appointment_id',o.appointment_id,
        'status',o.status,'requested_for',o.requested_for,'customer_note',o.customer_note,
        'internal_note',o.internal_note,'needs_confirmation_reason',o.needs_confirmation_reason,
        'assigned_to',o.assigned_to,'assignees',v_assignees,'created_at',o.created_at,'accepted_at',o.accepted_at,
        'ready_at',o.ready_at,'delivered_at',o.delivered_at,'cancelled_at',o.cancelled_at,
        'cancellation_reason',o.cancellation_reason,
        'appointment',jsonb_build_object('starts_at',a.starts_at,'status',a.status,'customer_id',a.customer_id),
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',i.id,'product_name',i.product_name_snapshot,'variant',i.variant_snapshot,
            'qty',i.qty,'delivered_qty',i.delivered_qty,'unit_price_minor',i.unit_price_snapshot,
            'line_total_minor',i.line_total_snapshot,'options',i.options,'status',i.status,
            'variant_id',i.variant_id,'product_id',i.product_id
          ) order by i.created_at)
          from public.appointment_product_order_items i
          where i.order_id=o.id and i.barbershop_id=o.barbershop_id
        ),'[]'::jsonb)
      ) as order_json
    from public.appointment_product_orders o
    join public.appointments a on a.id=o.appointment_id and a.barbershop_id=o.barbershop_id
    where o.barbershop_id=p_barbershop_id
      and (p_status is null or o.status::text=p_status)
      and o.status not in ('delivered','cancelled','failed')
  ) q;
  return v_result;
end;
$function$;
