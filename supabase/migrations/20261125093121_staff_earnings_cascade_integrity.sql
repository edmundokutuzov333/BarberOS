-- Defer the redundant barber reference until all appointment cascades finish.
alter table private.staff_earnings alter constraint staff_earnings_barber_id_fkey deferrable initially deferred;
