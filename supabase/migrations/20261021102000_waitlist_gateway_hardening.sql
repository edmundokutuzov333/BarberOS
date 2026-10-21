-- Anonymous waitlist requests must pass through the rate-limited Edge Function.
-- The database RPC remains the transactional domain implementation, not the public HTTP boundary.
revoke all on function public.join_waitlist(text, uuid, text, text, uuid, uuid, text, date, date, text)
  from public, anon, authenticated;
grant execute on function public.join_waitlist(text, uuid, text, text, uuid, uuid, text, date, date, text)
  to service_role;
