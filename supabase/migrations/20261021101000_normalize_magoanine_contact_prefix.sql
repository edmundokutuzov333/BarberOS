-- Repair the duplicated country prefix in the Mufundisse public contact fields.
-- Guard the update so already-normalized phone numbers are never changed.
update public.barbershops
set phone = regexp_replace(phone, '^\+258\+258', '+258'),
    whatsapp = regexp_replace(whatsapp, '^\+258\+258', '+258')
where slug = 'magoanine-c'
  and (
    coalesce(phone, '') ~ '^\+258\+258'
    or coalesce(whatsapp, '') ~ '^\+258\+258'
  );
