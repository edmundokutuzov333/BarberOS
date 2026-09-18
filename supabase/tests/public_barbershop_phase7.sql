-- BarberOS Phase 7: public barbershop surface acceptance

do $$
declare
  v_payload jsonb;
  v_shop jsonb;
  v_services jsonb;
  v_barbers jsonb;
  v_haircuts jsonb;
  v_hours jsonb;
  v_reviews jsonb;
  v_bad jsonb;
begin
  select public.get_public_barbershop('oryon') into v_payload;
  if v_payload is null then raise exception 'PUBLIC_SHOP_EMPTY'; end if;
  if not (v_payload ? 'shop' and v_payload ? 'services' and v_payload ? 'haircuts' and v_payload ? 'barbers' and v_payload ? 'working_hours' and v_payload ? 'reviews') then
    raise exception 'PUBLIC_SHOP_INCOMPLETE';
  end if;
  if v_payload::text like '%barbershop_id%' or v_payload::text like '%customer_id%' or v_payload::text like '%manage_token%' or v_payload::text like '%internal_note%' then
    raise exception 'PUBLIC_SHOP_LEAKS_PRIVATE_FIELDS';
  end if;
  v_shop:=v_payload->'shop';
  if (v_shop->>'slug')<>'oryon' or (v_shop->>'status') not in ('active','trial') then raise exception 'PUBLIC_SHOP_TENANT_FAILED'; end if;
  if jsonb_array_length(v_payload->'services') <> 2 then raise exception 'PUBLIC_SHOP_SERVICE_COUNT_FAILED'; end if;
  if jsonb_array_length(v_payload->'barbers') <> 1 then raise exception 'PUBLIC_SHOP_BARBER_COUNT_FAILED'; end if;
  if jsonb_array_length(v_payload->'haircuts') <> 22 then raise exception 'PUBLIC_SHOP_HAIRCUT_COUNT_FAILED'; end if;
  if jsonb_array_length(v_payload->'working_hours') <> 7 then raise exception 'PUBLIC_SHOP_HOURS_COUNT_FAILED'; end if;
  if jsonb_array_length(v_payload->'reviews'->'items') <> 0 then raise exception 'PUBLIC_SHOP_REVIEW_COUNT_UNEXPECTED'; end if;

  select public.get_public_barbershop('magoanine-c') into v_payload;
  if v_payload is null then raise exception 'SECOND_PUBLIC_SHOP_EMPTY'; end if;
  if (v_payload->'shop'->>'slug')<>'magoanine-c' then raise exception 'SECOND_TENANT_FAILED'; end if;
  if jsonb_array_length(v_payload->'services')<>0 then raise exception 'SECOND_SHOP_SERVICE_LEAK'; end if;
  if jsonb_array_length(v_payload->'barbers')<>0 then raise exception 'SECOND_SHOP_BARBER_LEAK'; end if;
  if v_payload::text like '%oryon%' then raise exception 'CROSS_TENANT_DATA_LEAK'; end if;

  begin
    perform public.get_public_barbershop('does-not-exist');
    raise exception 'UNKNOWN_SLUG_ACCEPTED';
  exception when others then
    if sqlerrm<>'BARBERSHOP_NOT_FOUND' then raise; end if;
  end;

  raise notice 'PASS | Phase 7 public barbershop surface and tenant isolation';
end
$$;

select
  has_function_privilege('anon','public.get_public_barbershop(text)','execute') as anon_public_rpc,
  has_table_privilege('anon','public.customers','SELECT') as anon_customers_select,
  has_table_privilege('anon','public.appointments','SELECT') as anon_appointments_select,
  has_table_privilege('anon','public.notifications','SELECT') as anon_notifications_select,
  (select count(*) from public.barbershops) as barbershops,
  (select count(*) from public.appointments) as appointments;