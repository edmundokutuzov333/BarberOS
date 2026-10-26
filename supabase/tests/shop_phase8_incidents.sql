-- BarberOS | Fase 8 | tenant-safe incident lifecycle and append-only audit events.
-- All fixtures are isolated and removed by ROLLBACK.
begin;
do $shop_phase8_incidents$
declare
 v_actor uuid:=gen_random_uuid(); v_shop uuid; v_other_shop uuid; v_incident uuid;
 v_result jsonb; v_list jsonb; v_rejected boolean; v_error text;
begin
 insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(v_actor,'authenticated','authenticated','phase8-incident-'||replace(v_actor::text,'-','')||'@example.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min)
 values('phase8-'||left(replace(gen_random_uuid()::text,'-',''),12),'BarberOS Phase 8 Incident QA','active','Africa/Maputo',30,120,15)
 returning id into v_shop;
 insert into public.barbershops(slug,name,status,timezone,min_lead_time_min,max_advance_days,slot_interval_min)
 values('phase8-other-'||left(replace(gen_random_uuid()::text,'-',''),10),'BarberOS Phase 8 Other Tenant QA','active','Africa/Maputo',30,120,15)
 returning id into v_other_shop;
 insert into public.barbershop_members(barbershop_id,user_id,role) values(v_shop,v_actor,'owner');
 perform set_config('request.jwt.claim.sub',v_actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_actor,'role','authenticated')::text,true);
 v_result:=public.create_shop_operation_incident(v_shop,null,'complaint','critical','Cliente reportou falha crítica',
  'A confirmação ficou inconsistente e precisa de investigação operacional.');
 v_incident:=(v_result->>'id')::uuid;
 if v_result->>'status'<>'open' or v_result->>'severity'<>'critical' or jsonb_array_length(v_result->'events')<>1 then
  raise exception 'FAIL: incident was not created with an audit event: %',v_result;
 end if;
 if has_table_privilege('authenticated','public.shop_operation_incidents','INSERT')
  or has_table_privilege('authenticated','public.shop_operation_incidents','UPDATE')
  or has_table_privilege('authenticated','public.shop_operation_incidents','DELETE')
  or has_table_privilege('authenticated','public.shop_operation_incident_events','INSERT')
  or has_table_privilege('authenticated','public.shop_operation_incident_events','UPDATE')
  or has_table_privilege('authenticated','public.shop_operation_incident_events','DELETE') then
  raise exception 'FAIL: browser role can write incident or audit tables directly';
 end if;
 v_list:=public.list_shop_operation_incidents(v_shop,null,50);
 if jsonb_array_length(v_list)<>1 or v_list->0->>'id'<>v_incident::text or jsonb_array_length(v_list->0->'events')<>1 then
  raise exception 'FAIL: incident listing or audit history mismatch: %',v_list;
 end if;
 v_rejected:=false;
 begin perform public.create_shop_operation_incident(v_shop,null,'bogus','critical','Tentativa inválida',
  'Detalhes de teste suficientes para passar a validação de texto.');
 exception when raise_exception then
  get stacked diagnostics v_error=message_text;
  if v_error='SHOP_INCIDENT_INVALID_FIELDS' then v_rejected:=true; else raise; end if;
 end;
 if not v_rejected then raise exception 'FAIL: invalid incident type was accepted'; end if;
 v_rejected:=false;
 begin perform public.list_shop_operation_incidents(v_other_shop,null,50);
 exception when insufficient_privilege then
  get stacked diagnostics v_error=message_text;
  if v_error='SHOP_INCIDENT_FORBIDDEN' then v_rejected:=true; else raise; end if;
 end;
 if not v_rejected then raise exception 'FAIL: cross-tenant incident list was accepted'; end if;
 v_result:=public.update_shop_operation_incident(v_shop,v_incident,'investigating',v_actor,null);
 if v_result->>'status'<>'investigating' or v_result->>'assigned_to'<>v_actor::text then
  raise exception 'FAIL: incident was not assigned for investigation: %',v_result;
 end if;
 v_rejected:=false;
 begin perform public.update_shop_operation_incident(v_shop,v_incident,'resolved',null,'Feito');
 exception when raise_exception then
  get stacked diagnostics v_error=message_text;
  if v_error='SHOP_INCIDENT_RESOLUTION_NOTE_REQUIRED' then v_rejected:=true; else raise; end if;
 end;
 if not v_rejected then raise exception 'FAIL: incident was resolved without sufficient resolution evidence'; end if;
 v_result:=public.update_shop_operation_incident(v_shop,v_incident,'resolved',null,
  'A causa foi identificada, corrigida e confirmada pelo responsável operacional.');
 if v_result->>'status'<>'resolved' or v_result->>'resolved_at' is null or v_result->>'resolved_by'<>v_actor::text then
  raise exception 'FAIL: incident resolution was not recorded: %',v_result;
 end if;
 v_list:=public.list_shop_operation_incidents(v_shop,null,50);
 if jsonb_array_length(v_list)<>1 or v_list->0->>'status'<>'resolved' or jsonb_array_length(v_list->0->'events')<>3 then
  raise exception 'FAIL: incident lifecycle history mismatch: %',v_list;
 end if;
 v_rejected:=false;
 begin perform public.update_shop_operation_incident(v_shop,v_incident,'investigating',v_actor,null);
 exception when raise_exception then
  get stacked diagnostics v_error=message_text;
  if v_error='SHOP_INCIDENT_TERMINAL' then v_rejected:=true; else raise; end if;
 end;
 if not v_rejected then raise exception 'FAIL: terminal incident was reopened'; end if;
 raise notice 'PASS | Phase 8: tenant-safe incident lifecycle, resolution evidence and immutable browser-facing audit history';
end;
$shop_phase8_incidents$;
rollback;
