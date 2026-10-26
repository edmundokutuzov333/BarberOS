-- BarberOS | Fase 6 remediation | gerar alerta interno para entrega parcial.
-- Forward-only: amplia o contrato de evento e a notificação de estado; não activa a Loja.
alter table public.shop_notification_events
  drop constraint if exists shop_notification_events_event_type_check;

alter table public.shop_notification_events
  add constraint shop_notification_events_event_type_check
  check (event_type in (
    'order_received','order_accepted','order_needs_confirmation','order_ready',
    'order_partially_delivered','order_delivered','order_cancelled','order_failed'
  ));

create or replace function private.emit_shop_order_notification()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare v_type text; v_title text; v_body text;
begin
  if tg_op='INSERT' then
    v_type := 'order_received';
    v_title := 'Novo pedido de produtos';
    v_body := 'Foi recebido um pedido associado a uma marcação. Reveja a disponibilidade na fila da Loja.';
  elsif new.status is distinct from old.status then
    v_type := case new.status::text
      when 'accepted' then 'order_accepted'
      when 'needs_confirmation' then 'order_needs_confirmation'
      when 'ready' then 'order_ready'
      when 'partially_delivered' then 'order_partially_delivered'
      when 'delivered' then 'order_delivered'
      when 'cancelled' then 'order_cancelled'
      when 'failed' then 'order_failed'
      else null
    end;
    v_title := case v_type
      when 'order_accepted' then 'Pedido aceite'
      when 'order_needs_confirmation' then 'Pedido precisa de confirmação'
      when 'order_ready' then 'Pedido pronto'
      when 'order_partially_delivered' then 'Entrega parcial registada'
      when 'order_delivered' then 'Pedido entregue'
      when 'order_cancelled' then 'Pedido cancelado'
      when 'order_failed' then 'Pedido não cumprido'
      else null end;
    v_body := case v_type
      when 'order_accepted' then 'A equipa aceitou o pedido. O pagamento não é inferido.'
      when 'order_needs_confirmation' then 'Existe uma indisponibilidade ou decisão operacional pendente.'
      when 'order_ready' then 'A equipa marcou o pedido como pronto.'
      when 'order_partially_delivered' then 'Foi entregue apenas parte do pedido. Reveja a quantidade restante e a reserva de stock; o estado não representa entrega completa.'
      when 'order_delivered' then 'A entrega foi registada. Confirme o pagamento separadamente.'
      when 'order_cancelled' then 'O pedido foi cancelado. Consulte o histórico e o stock.'
      when 'order_failed' then 'O pedido não foi cumprido. Consulte a causa registada.'
      else null end;
  end if;
  if v_type is not null then
    insert into public.shop_notification_events(
      barbershop_id,order_id,event_type,title,body,delivery_channel,delivery_status,metadata
    ) values (
      new.barbershop_id,new.id,v_type,v_title,v_body,'internal','visible',
      jsonb_build_object('order_status',new.status::text)
    );
  end if;
  return new;
end;
$function$;
revoke all on function private.emit_shop_order_notification() from public, anon, authenticated;
