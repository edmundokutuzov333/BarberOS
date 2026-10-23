-- CHECK constraints invoke their validator as the row-writing role.
-- Allow authenticated catalog managers to pass the constraint without exposing writes beyond the column grants.
grant execute on function private.shop_order_options_valid(jsonb) to authenticated;
