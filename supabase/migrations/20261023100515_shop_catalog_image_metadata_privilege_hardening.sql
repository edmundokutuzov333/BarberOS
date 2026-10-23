-- Phase 2 follow-up: image verification timestamps and actor stamps are server-owned.
-- UI may edit source URL/note, but cannot forge when/who verified the asset.
revoke update (image_source_checked_at, image_authorized_by, image_authorized_at)
  on public.shop_products from authenticated;
