undefined

revoke all on function public.transition_appointment(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.transition_appointment(uuid,uuid,text,text) to authenticated;
