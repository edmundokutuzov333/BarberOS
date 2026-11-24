-- Initial catalog sourced from real retailer offers; never imports physical inventory.
-- Installation is performed by the actual authenticated owner/manager/platform admin.
create table private.shop_catalog_references (
 key text primary key,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 release_version integer not null check(release_version>0)
);
alter table private.shop_catalog_references enable row level security;
revoke all on private.shop_catalog_references from public,anon,authenticated;
grant all on private.shop_catalog_references to service_role;
alter table public.shop_products
 add column catalog_reference_key text references private.shop_catalog_references(key),
 add column catalog_verification_mode text not null default 'operator' check(catalog_verification_mode in ('operator','reference_online')),
 add column requires_confirmation boolean not null default false;
create unique index shop_products_reference_tenant_unique on public.shop_products(barbershop_id,catalog_reference_key) where catalog_reference_key is not null;
revoke insert(catalog_reference_key,catalog_verification_mode,requires_confirmation),update(catalog_reference_key,catalog_verification_mode,requires_confirmation) on public.shop_products from authenticated;
comment on column public.shop_products.catalog_verification_mode is 'reference_online verifies cited identity/format/initial price and image source only; never physical stock or supplier agreement.';
comment on column public.shop_products.requires_confirmation is 'Customer requests require staff confirmation. Unknown physical inventory is never represented as guaranteed availability.';
insert into private.shop_catalog_references(key,payload,release_version)
select value->>'key',value,1 from jsonb_array_elements($catalog$[{"key":"mega-4149107","name":"Água da Namaacha 0,5L","brand":"NAMAACHA","category":"Água","format":"500 ml","product_kind":"both","sku":"4149107","price_minor":1800,"currency":"MZN","source_url":"https://megamocambique.com/products/agua-da-namaacha-0-5l","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4149107.jpg?v=1774006595","source_checked_at":"2026-11-24T07:07:30.714971+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4149107.webp","image_alt":"Água da Namaacha 0,5L — 500 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Água da Namaacha 0,5L. Embalagem: 500 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"38cde00623e45e3427b1cd9661a3ca6c302212cc4f73984d3f8ca84b32af2705"},{"key":"mega-4149111","name":"Água da Namaacha 1,5L","brand":"NAMAACHA","category":"Água","format":"1,5 L","product_kind":"both","sku":"4149111","price_minor":3500,"currency":"MZN","source_url":"https://megamocambique.com/products/agua-da-namaacha-1-5l","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4149111.jpg?v=1774006596","source_checked_at":"2026-11-24T07:07:30.715450+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4149111.webp","image_alt":"Água da Namaacha 1,5L — 1,5 L","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Água da Namaacha 1,5L. Embalagem: 1,5 L.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"a111e0219f3515798ae02d3631031205553c83a1fbeb211da2334f02f6c73f15"},{"key":"mega-4109260","name":"Coca Cola lata 330ml","brand":"COCACOLA","category":"Refrigerantes","format":"Lata 330 ml","product_kind":"both","sku":"4109260","price_minor":4900,"currency":"MZN","source_url":"https://megamocambique.com/products/coca-cola-lata-330ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4109260.jpg?v=1774006588","source_checked_at":"2026-11-24T07:07:30.715458+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4109260.webp","image_alt":"Coca Cola lata 330ml — Lata 330 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Coca Cola lata 330ml. Embalagem: Lata 330 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"346e87f7173836a9929fb1f28884055e9dc78f3b2d6b55f6244533c59444a8c4"},{"key":"mega-4102270","name":"Coca Cola zero lata 330ml","brand":"COCACOLA","category":"Refrigerantes","format":"Lata 330 ml","product_kind":"both","sku":"4102270","price_minor":4900,"currency":"MZN","source_url":"https://megamocambique.com/products/coca-cola-zero-lata-330ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4102270.jpg?v=1774006578","source_checked_at":"2026-11-24T07:07:30.715495+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4102270.webp","image_alt":"Coca Cola zero lata 330ml — Lata 330 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Coca Cola zero lata 330ml. Embalagem: Lata 330 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"e4c1ee9270da2c870201c6b4e836904e233b166ae5c53c1eac733f9da7944edc"},{"key":"mega-4109287","name":"Sprite lata 330ml","brand":"SPRITE","category":"Refrigerantes","format":"Lata 330 ml","product_kind":"both","sku":"4109287","price_minor":4900,"currency":"MZN","source_url":"https://megamocambique.com/products/sprite-lata-330ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4109287.jpg?v=1774006589","source_checked_at":"2026-11-24T07:07:30.715525+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4109287.webp","image_alt":"Sprite lata 330ml — Lata 330 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Sprite lata 330ml. Embalagem: Lata 330 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"5089ba90fe871351f7cd0cf7492017fa8d213b5c741d687da23dc0bbc6941dc9"},{"key":"mega-4109275","name":"Fanta laranja lata 330ml","brand":"FANTA","category":"Refrigerantes","format":"Lata 330 ml","product_kind":"both","sku":"4109275","price_minor":4900,"currency":"MZN","source_url":"https://megamocambique.com/products/fanta-laranja-lata-330ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4109275.jpg?v=1774006588","source_checked_at":"2026-11-24T07:07:30.715536+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4109275.webp","image_alt":"Fanta laranja lata 330ml — Lata 330 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Fanta laranja lata 330ml. Embalagem: Lata 330 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"27b9d0d9cd9ca4402911fe6b5a1d44835786d1a1ba740795d42060c549da4575"},{"key":"mega-4109734","name":"Fanta uva lata 330ml","brand":"FANTA","category":"Refrigerantes","format":"Lata 330 ml","product_kind":"both","sku":"4109734","price_minor":4900,"currency":"MZN","source_url":"https://megamocambique.com/products/fanta-uva-lata-330ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4109734.jpg?v=1774006591","source_checked_at":"2026-11-24T07:07:30.715546+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4109734.webp","image_alt":"Fanta uva lata 330ml — Lata 330 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Fanta uva lata 330ml. Embalagem: Lata 330 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"b6cec1a417a21b5e7bc6997ee246a582aa84581163c7c844a559f6a41b53efae"},{"key":"mega-4109749","name":"Fanta ananás lata330ml","brand":"FANTA","category":"Refrigerantes","format":"Lata 330 ml","product_kind":"both","sku":"4109749","price_minor":4900,"currency":"MZN","source_url":"https://megamocambique.com/products/fanta-ananas-lata330ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4109749.jpg?v=1774006592","source_checked_at":"2026-11-24T07:07:30.715555+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4109749.webp","image_alt":"Fanta ananás lata330ml — Lata 330 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Fanta ananás lata330ml. Embalagem: Lata 330 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"c71c2241fee61fbf681d2a1141d29857c3df710960f2f6023a63663bbdd2b0fd"},{"key":"mega-4309688","name":"Sumo de laranja Ceres 200ml","brand":"CERES","category":"Sumos","format":"200 ml","product_kind":"both","sku":"4309688","price_minor":3900,"currency":"MZN","source_url":"https://megamocambique.com/products/sumo-de-laranja-ceres-200ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4309688.jpg?v=1774006652","source_checked_at":"2026-11-24T07:07:30.715567+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4309688.webp","image_alt":"Sumo de laranja Ceres 200ml — 200 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Sumo de laranja Ceres 200ml. Embalagem: 200 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"ffa40deb79494a394a1aa4c1006a8f26751d2cc9c54efc3549e32bac73371637"},{"key":"mega-4309669","name":"Sumo de manga Ceres 200ml","brand":"CERES","category":"Sumos","format":"200 ml","product_kind":"both","sku":"4309669","price_minor":3900,"currency":"MZN","source_url":"https://megamocambique.com/products/sumo-de-manga-ceres-200ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/4309669.jpg?v=1774006651","source_checked_at":"2026-11-24T07:07:30.715576+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-4309669.webp","image_alt":"Sumo de manga Ceres 200ml — 200 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Sumo de manga Ceres 200ml. Embalagem: 200 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"a0fbafd3b42ebcae31c7bcbc03e9cf8ec554b11458b1ca64a06357d9872204ce"},{"key":"mega-2004507","name":"Sumo de manga Compal 500ml","brand":"COMPAL","category":"Sumos","format":"500 ml","product_kind":"both","sku":"2004507","price_minor":6000,"currency":"MZN","source_url":"https://megamocambique.com/products/sumo-de-manga-compal-500ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/2004507.jpg?v=1774004313","source_checked_at":"2026-11-24T07:07:30.715607+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-2004507.webp","image_alt":"Sumo de manga Compal 500ml — 500 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Sumo de manga Compal 500ml. Embalagem: 500 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"806154deea6d54c3f5d7a51cece00a591449157efc279da8fba02dea11e081f8"},{"key":"mega-2012228","name":"Sumo de tutti fruit Compal 500ml","brand":"COMPAL","category":"Sumos","format":"500 ml","product_kind":"both","sku":"2012228","price_minor":6000,"currency":"MZN","source_url":"https://megamocambique.com/products/sumo-de-tutti-fruit-compal-500ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/2012228.jpg?v=1774006131","source_checked_at":"2026-11-24T07:07:30.715625+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-2012228.webp","image_alt":"Sumo de tutti fruit Compal 500ml — 500 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Sumo de tutti fruit Compal 500ml. Embalagem: 500 ml.","order_options":["Fresca","Natural"],"image_width":720,"image_height":720,"image_sha256":"465b7ce1bae794e7d90c13588d4aef47e9a07d45b0dc92e91bc535a7bdc130cf"},{"key":"mega-3169413","name":"Bolacha chocolate original kits Bakers 200g","brand":"BAKERS","category":"Snacks","format":"Pacote 200 g","product_kind":"both","sku":"3169413","price_minor":17200,"currency":"MZN","source_url":"https://megamocambique.com/products/bolacha-chocolate-original-kits-bakers-200g","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/3169413.jpg?v=1774006463","source_checked_at":"2026-11-24T07:07:30.715634+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-3169413.webp","image_alt":"Bolacha chocolate original kits Bakers 200g — Pacote 200 g","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Bolacha chocolate original kits Bakers 200g. Embalagem: Pacote 200 g.","order_options":[],"image_width":694,"image_height":636,"image_sha256":"724dac77ef27277e743f4d881e83be804ea253800f5397a081a89485db48ea34"},{"key":"mega-3082195","name":"Batata frita tomato Simba 25g","brand":"SIMBA","category":"Snacks","format":"Pacote 25 g","product_kind":"both","sku":"3082195","price_minor":2000,"currency":"MZN","source_url":"https://megamocambique.com/products/batata-frita-tomato-simba-25g","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/3082195.jpg?v=1774006429","source_checked_at":"2026-11-24T07:07:30.715640+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-3082195.webp","image_alt":"Batata frita tomato Simba 25g — Pacote 25 g","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Batata frita tomato Simba 25g. Embalagem: Pacote 25 g.","order_options":[],"image_width":694,"image_height":636,"image_sha256":"27c876b7c1fc941505a6a0704ce220263dae60166031fd11d24c9c7fc919cdd5"},{"key":"mega-3082028","name":"Batata frita mexican Simba 25g","brand":"SIMBA","category":"Snacks","format":"Pacote 25 g","product_kind":"both","sku":"3082028","price_minor":2000,"currency":"MZN","source_url":"https://megamocambique.com/products/batata-frita-mexican-simba-25g","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/3082028.jpg?v=1774006428","source_checked_at":"2026-11-24T07:07:30.715644+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-3082028.webp","image_alt":"Batata frita mexican Simba 25g — Pacote 25 g","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Batata frita mexican Simba 25g. Embalagem: Pacote 25 g.","order_options":[],"image_width":700,"image_height":700,"image_sha256":"c3e241e9359a8b3f9f1bbc41e619ed826a331a40caacd3972b7c25f9c647e276"},{"key":"mega-2012208","name":"Chocolate original Cadbury 55g","brand":"CADBURY","category":"Snacks","format":"Barra 55 g","product_kind":"both","sku":"2012208","price_minor":10900,"currency":"MZN","source_url":"https://megamocambique.com/products/chocolate-original-cadbury-55g","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/2012208.jpg?v=1774006121","source_checked_at":"2026-11-24T07:07:30.715650+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-2012208.webp","image_alt":"Chocolate original Cadbury 55g — Barra 55 g","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Chocolate original Cadbury 55g. Embalagem: Barra 55 g.","order_options":[],"image_width":720,"image_height":720,"image_sha256":"3a61099f606dc0d3d46dc81b7b2f87d1abd85a0133848ee3da4a6aec1134420f"},{"key":"mega-3208210","name":"Café Delta moagem máquina 250g","brand":"DELTA","category":"Café e chá","format":"Embalagem 250 g","product_kind":"takeaway","sku":"3208210","price_minor":43900,"currency":"MZN","source_url":"https://megamocambique.com/products/cafe-delta-moagem-maquina-250g","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/3208210.jpg?v=1774006478","source_checked_at":"2026-11-24T07:07:30.715654+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-3208210.webp","image_alt":"Café Delta moagem máquina 250g — Embalagem 250 g","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Café Delta moagem máquina 250g. Produto embalado para levar; não é uma bebida preparada.","order_options":[],"image_width":434,"image_height":289,"image_sha256":"cd805b9b20441ba1f53c69c5ddfdec02086d1806ce90a0ee87ee316120b0b3df"},{"key":"mega-3208517","name":"Café Delta Q qharater intensidade nº9 10uni","brand":"DELTAQ","category":"Café e chá","format":"Caixa de 10 cápsulas","product_kind":"takeaway","sku":"3208517","price_minor":33900,"currency":"MZN","source_url":"https://megamocambique.com/products/cafe-delta-q-qharater-intensidade-nº9-10uni","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/3208517.jpg?v=1774006480","source_checked_at":"2026-11-24T07:07:30.715659+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-3208517.webp","image_alt":"Café Delta Q qharater intensidade nº9 10uni — Caixa de 10 cápsulas","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Café Delta Q qharater intensidade nº9 10uni. Produto embalado para levar; não é uma bebida preparada.","order_options":[],"image_width":720,"image_height":401,"image_sha256":"0ab9bbad4eede0805baad0be15e353c5046099cbc8e77911c4fd61f442871a48"},{"key":"mega-2012090","name":"Creme mãos nutritiv Byphasse 150ml","brand":"BYPHASSE","category":"Cuidado pessoal","format":"Tubo 150 ml","product_kind":"takeaway","sku":"2012090","price_minor":13900,"currency":"MZN","source_url":"https://megamocambique.com/products/creme-maos-nutritiv-byphasse-150ml","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/2012090.jpg?v=1774006025","source_checked_at":"2026-11-24T07:07:30.715664+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-2012090.webp","image_alt":"Creme mãos nutritiv Byphasse 150ml — Tubo 150 ml","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Creme mãos nutritiv Byphasse 150ml. Embalagem: Tubo 150 ml.","order_options":[],"image_width":720,"image_height":720,"image_sha256":"fc1aafed2c8b392936421a2cbc1fb51a7a5f7f37d319209016ce81bc3b3f0fb6"},{"key":"mega-2012438","name":"Sabonete Protex sport 150g","brand":"PROTEX","category":"Cuidado pessoal","format":"Unidade 150 g","product_kind":"takeaway","sku":"2012438","price_minor":5100,"currency":"MZN","source_url":"https://megamocambique.com/products/sabonete-protex-sport-150g","source_image_url":"https://cdn.shopify.com/s/files/1/0623/3148/6395/files/2012438.jpg?v=1774006309","source_checked_at":"2026-11-24T07:07:30.715669+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/mega-2012438.webp","image_alt":"Sabonete Protex sport 150g — Unidade 150 g","image_source_note":"Fotografia de catálogo de Mega – Distribuição de Moçambique. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular da marca/fotografia. Não é fotografia de stock da barbearia.","description":"Sabonete Protex sport 150g. Embalagem: Unidade 150 g.","order_options":[],"image_width":720,"image_height":720,"image_sha256":"4bd61dd7fb58af819c6659e05a200da7bdea3464523166a6352bffa43f7492d7"},{"key":"cmilad-21170","name":"Sofn'Free Styling Gel 250 ml","brand":"Sofn'Free","category":"Cuidado pessoal","format":"Boião 250 ml","product_kind":"takeaway","sku":"21170","price_minor":12000,"currency":"MZN","source_url":"https://cmilad.com/shop/sofn-free-styling-gel-250ml-2081","source_image_url":"https://cmilad.com/s/img/p/2081-711b0f1d5b-t4-720.jpg","source_checked_at":"2026-11-24T07:07:31.880921+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/cmilad-21170.webp","image_alt":"Sofn'Free Styling Gel 250 ml — Boião 250 ml","image_source_note":"Fotografia de catálogo Casa Milad Maputo. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular. Não é fotografia de stock da barbearia.","description":"Sofn'Free Styling Gel 250 ml. Produto embalado para levar. Confirme as instruções e ingredientes na embalagem.","order_options":[],"image_width":720,"image_height":720,"image_sha256":"7516a332fe766e271e50cfbdf128818ea28c91e5fe52ef628d3e6a9464e0fb89"},{"key":"cmilad-mg3","name":"Magico Styling Gel 150 g","brand":"Magico","category":"Cuidado pessoal","format":"Boião 150 g","product_kind":"takeaway","sku":"MG3","price_minor":11000,"currency":"MZN","source_url":"https://cmilad.com/shop/magico-styling-gel-150gm-2737","source_image_url":"https://cmilad.com/s/img/p/2737-36bdf02405-t4-720.jpg","source_checked_at":"2026-11-24T07:07:32.384937+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/cmilad-mg3.webp","image_alt":"Magico Styling Gel 150 g — Boião 150 g","image_source_note":"Fotografia de catálogo Casa Milad Maputo. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular. Não é fotografia de stock da barbearia.","description":"Magico Styling Gel 150 g. Produto embalado para levar. Confirme as instruções e ingredientes na embalagem.","order_options":[],"image_width":720,"image_height":720,"image_sha256":"816fe97fe06e5a2624bb4662ba5d21e1e39755cb2d7323375235089a1296121d"},{"key":"cmilad-dm23","name":"Blackstar Gel 120 ml","brand":"Blackstar","category":"Cuidado pessoal","format":"Boião 120 ml","product_kind":"takeaway","sku":"DM23","price_minor":5000,"currency":"MZN","source_url":"https://cmilad.com/shop/blackstar-gel-120ml-2532","source_image_url":"https://cmilad.com/s/img/p/2532-56373273b0-t4-720.jpg","source_checked_at":"2026-11-24T07:07:32.796716+00:00","image_url":"https://barber-os-orpin.vercel.app/catalog/products/cmilad-dm23.webp","image_alt":"Blackstar Gel 120 ml — Boião 120 ml","image_source_note":"Fotografia de catálogo Casa Milad Maputo. Publicação solicitada pelo proprietário da plataforma; direitos da imagem pertencem ao titular. Não é fotografia de stock da barbearia.","description":"Blackstar Gel 120 ml. Produto embalado para levar. Confirme as instruções e ingredientes na embalagem.","order_options":[],"image_width":720,"image_height":720,"image_sha256":"2b9a03ad315f079cc8b67aba1c02b6ba0048f32e7b7ffcfb30e3d9db91c66063"}]$catalog$::jsonb);

-- Service imports have a system origin, never an invented human verifier.
create or replace function private.reference_catalog_image_matches(p public.shop_products)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.shop_catalog_references r where r.key=p.catalog_reference_key
  and p.image_url=r.payload->>'image_url' and p.image_alt=r.payload->>'image_alt'
  and p.image_source_url=r.payload->>'source_url' and p.image_source_note=r.payload->>'image_source_note');
$$;
revoke all on function private.reference_catalog_image_matches(public.shop_products) from public,anon,authenticated;
grant execute on function private.reference_catalog_image_matches(public.shop_products) to postgres,service_role;

create or replace function private.shop_product_image_approval_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.image_url is not distinct from old.image_url
    and new.image_alt is not distinct from old.image_alt
    and new.image_source_url is not distinct from old.image_source_url
    and new.image_source_note is not distinct from old.image_source_note then
    return new;
  end if;

  new.image_source_url := nullif(btrim(new.image_source_url), '');
  if nullif(btrim(new.image_url), '') is null then
    new.image_url := null;
    new.image_alt := nullif(btrim(new.image_alt), '');
    new.image_source_url := null;
    new.image_source_note := null;
    new.image_source_checked_at := null;
    new.image_authorized_by := null;
    new.image_authorized_at := null;
    return new;
  end if;

  if auth.uid() is null and coalesce(auth.role(),'')='service_role' and private.reference_catalog_image_matches(new) then
    new.image_source_checked_at:=clock_timestamp();new.image_authorized_at:=clock_timestamp();new.image_authorized_by:=null;
    return new;
  end if;
  if auth.uid() is null then
    raise exception 'IMAGE_APPROVAL_ACTOR_REQUIRED';
  end if;
  if nullif(btrim(new.image_alt), '') is null
    or nullif(btrim(new.image_source_note), '') is null then
    raise exception 'IMAGE_METADATA_REQUIRED';
  end if;
  if new.image_source_url is not null and new.image_source_url !~ '^https://' then
    raise exception 'IMAGE_SOURCE_URL_INVALID';
  end if;

  new.image_alt := btrim(new.image_alt);
  new.image_source_note := btrim(new.image_source_note);
  new.image_source_checked_at := now();
  new.image_authorized_by := auth.uid();
  new.image_authorized_at := now();
  return new;
end;
$$;


create or replace function private.shop_product_publication_guard()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.is_active and (
    tg_op = 'INSERT'
    or old.is_active is distinct from new.is_active
    or old.name is distinct from new.name
    or old.brand is distinct from new.brand
    or old.category_id is distinct from new.category_id
    or old.description is distinct from new.description
    or old.image_url is distinct from new.image_url
    or old.image_alt is distinct from new.image_alt
    or old.image_source_url is distinct from new.image_source_url
    or old.image_source_note is distinct from new.image_source_note
    or old.product_kind is distinct from new.product_kind
    or old.track_stock is distinct from new.track_stock
  ) then
    if new.category_id is not null and not exists (
      select 1 from public.shop_product_categories c
      where c.id = new.category_id and c.barbershop_id = new.barbershop_id and c.is_active
    ) then raise exception 'SHOP_PRODUCT_CATEGORY_NOT_PUBLISHED'; end if;
    if not exists (
      select 1 from public.shop_product_variants v
      where v.product_id = new.id and v.barbershop_id = new.barbershop_id and v.is_active
    ) then raise exception 'SHOP_PRODUCT_REQUIRES_ACTIVE_VARIANT'; end if;
    if new.catalog_verified_at is null or (new.catalog_verified_by is null and not (new.catalog_verification_mode='reference_online' and private.reference_catalog_image_matches(new)))
      or new.catalog_verification_note is null then
      raise exception 'SHOP_PRODUCT_CATALOG_NOT_VERIFIED';
    end if;
  end if;
  return new;
end;
$function$;


create or replace function public.verify_shop_catalog_product(
  p_barbershop_id uuid, p_product_id uuid, p_verification_note text
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare v_product public.shop_products%rowtype; v_verified_at timestamptz;
begin
  if not (coalesce(auth.role(),'')='service_role' or (auth.uid() is not null and (private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or private.is_platform_admin()))) then raise exception 'SHOP_CATALOG_VERIFY_FORBIDDEN' using errcode = '42501'; end if;
  if p_verification_note is null or length(btrim(p_verification_note)) not between 20 and 500 then
    raise exception 'SHOP_CATALOG_VERIFICATION_NOTE_REQUIRED';
  end if;

  select p.* into v_product from public.shop_products p
    where p.id = p_product_id and p.barbershop_id = p_barbershop_id for update;
  if not found then raise exception 'SHOP_CATALOG_PRODUCT_NOT_FOUND'; end if;

  if v_product.image_url is null or v_product.image_alt is null
    or v_product.image_source_note is null or v_product.image_source_checked_at is null
    or (v_product.image_authorized_by is null and not private.reference_catalog_image_matches(v_product)) or v_product.image_authorized_at is null then
    raise exception 'SHOP_CATALOG_IMAGE_NOT_APPROVED';
  end if;
  if v_product.image_source_url is not null and v_product.image_source_url !~ '^https://' then
    raise exception 'SHOP_CATALOG_IMAGE_SOURCE_INVALID';
  end if;
  if v_product.category_id is not null and not exists (
    select 1 from public.shop_product_categories c
    where c.id = v_product.category_id and c.barbershop_id = p_barbershop_id and c.is_active
  ) then raise exception 'SHOP_PRODUCT_CATEGORY_NOT_PUBLISHED'; end if;
  if not exists (
    select 1 from public.shop_product_variants v
    where v.product_id = v_product.id and v.barbershop_id = p_barbershop_id and v.is_active
  ) then raise exception 'SHOP_PRODUCT_REQUIRES_ACTIVE_VARIANT'; end if;
  if v_product.track_stock and not exists (
    select 1 from public.shop_product_variants v
    where v.product_id = v_product.id and v.barbershop_id = p_barbershop_id
      and v.is_active and v.stock_on_hand > 0
  ) then raise exception 'SHOP_CATALOG_STOCK_UNAVAILABLE'; end if;

  if auth.uid() is null and not exists(select 1 from private.shop_catalog_references r where r.key=v_product.catalog_reference_key
    and private.reference_catalog_image_matches(v_product) and v_product.name=r.payload->>'name'
    and v_product.brand=r.payload->>'brand' and v_product.description=r.payload->>'description'
    and v_product.product_kind::text=r.payload->>'product_kind' and not v_product.track_stock and v_product.requires_confirmation
    and exists(select 1 from public.shop_product_variants v where v.product_id=v_product.id and v.barbershop_id=p_barbershop_id and v.is_active and v.label=r.payload->>'format' and v.price_minor=(r.payload->>'price_minor')::bigint and v.stock_on_hand=0)) then
    raise exception 'SHOP_REFERENCE_APPROVAL_INVALID';
  end if;
  v_verified_at := clock_timestamp();
  update public.shop_products p set catalog_verification_mode=case when auth.uid() is null then 'reference_online' else 'operator' end, catalog_verified_at = v_verified_at,
    catalog_verified_by = auth.uid(), catalog_verification_note = btrim(p_verification_note)
  where p.id = p_product_id and p.barbershop_id = p_barbershop_id;
  return jsonb_build_object('product_id',p_product_id,'catalog_verified_at',v_verified_at,'catalog_verified_by',auth.uid());
end;
$function$;
revoke all on function public.verify_shop_catalog_product(uuid,uuid,text) from public, anon;
grant execute on function public.verify_shop_catalog_product(uuid,uuid,text) to authenticated,service_role;



-- Stores are part of every new shop; operational suspension still uses shop status.
alter table public.barbershops alter column shop_enabled set default true;
comment on column public.barbershops.shop_enabled is 'Store enabled by default for every shop. Existing shops are enabled transactionally when their reference catalog is installed.';
create or replace function private.shop_feature_flag_guard()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.shop_enabled:=true;
 elsif new.shop_enabled is distinct from old.shop_enabled
   and coalesce(auth.role(),'')<>'service_role'
   and not private.is_platform_admin()
   and not (new.shop_enabled and private.is_member(new.id,array['owner','manager']::public.app_role[])) then
  raise exception 'SHOP_FEATURE_FLAG_SERVER_MANAGED';
 end if;
 return new;
end; $$;
revoke all on function private.shop_feature_flag_guard() from public,anon,authenticated;

create or replace function public.install_shop_reference_catalog(p_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
 r record; cat uuid; product uuid; created_count integer:=0; published_count integer:=0; existing_count integer:=0;
 note text; cat_active boolean;
begin
 if not (coalesce(auth.role(),'')='service_role' or (auth.uid() is not null and (private.is_member(p_barbershop_id,array['owner','manager']::public.app_role[]) or private.is_platform_admin()))) then
  raise exception 'SHOP_CATALOG_FORBIDDEN' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_barbershop_id::text||':reference-catalog',0));
 perform 1 from public.barbershops where id=p_barbershop_id for update;
 if not found then raise exception 'SHOP_CATALOG_PRODUCT_NOT_FOUND'; end if;
 -- Existing names, prices, hidden categories and merchant edits are preserved.
 for r in select key,payload from private.shop_catalog_references order by key loop
  if exists(select 1 from public.shop_products where barbershop_id=p_barbershop_id and (catalog_reference_key=r.key or lower(name)=lower(r.payload->>'name'))) then
   existing_count:=existing_count+1;continue;
  end if;
  cat:=null;
  insert into public.shop_product_categories(barbershop_id,name,is_active,sort_order)
   values(p_barbershop_id,r.payload->>'category',true,case r.payload->>'category' when 'Água' then 10 when 'Refrigerantes' then 20 when 'Sumos' then 30 when 'Café e chá' then 40 when 'Snacks' then 50 when 'Cuidado pessoal' then 60 else 70 end)
   on conflict do nothing returning id into cat;
  if cat is null then select id into cat from public.shop_product_categories where barbershop_id=p_barbershop_id and lower(name)=lower(r.payload->>'category'); end if;
  select is_active into cat_active from public.shop_product_categories where id=cat and barbershop_id=p_barbershop_id;
  insert into public.shop_products(barbershop_id,category_id,name,brand,description,product_kind,track_stock,requires_confirmation,
   image_url,image_alt,image_source_url,image_source_note,order_options,catalog_reference_key)
  values(p_barbershop_id,cat,r.payload->>'name',r.payload->>'brand',r.payload->>'description',(r.payload->>'product_kind')::public.shop_product_kind,false,true,
   r.payload->>'image_url',r.payload->>'image_alt',r.payload->>'source_url',r.payload->>'image_source_note',r.payload->'order_options',r.key)
  returning id into product;
  insert into public.shop_product_variants(barbershop_id,product_id,sku,label,attributes,unit_label,price_minor,stock_on_hand,is_active)
  values(p_barbershop_id,product,'CAT-'||r.key,r.payload->>'format',jsonb_build_object('source_sku',r.payload->>'sku'),'unidade',(r.payload->>'price_minor')::bigint,0,true);
  created_count:=created_count+1;
  if cat_active then
   note:='Catálogo inicial automático: identidade, formato, fotografia e preço de referência recolhidos online em '||left(r.payload->>'source_checked_at',10)||'. Stock físico não verificado; fornecimento sujeito à confirmação da barbearia.';
   perform public.verify_shop_catalog_product(p_barbershop_id,product,note);
   update public.shop_products set is_active=true,catalog_verification_mode='reference_online' where id=product and barbershop_id=p_barbershop_id;
   published_count:=published_count+1;
  end if;
 end loop;
 insert into public.shop_product_categories(barbershop_id,name,is_active,sort_order)
  values(p_barbershop_id,'Outros',false,70) on conflict do nothing;
 update public.barbershops set shop_enabled=true where id=p_barbershop_id and not shop_enabled;
 if created_count>0 then
  insert into public.audit_logs(barbershop_id,actor_id,action,entity,entity_id,diff)
   values(p_barbershop_id,auth.uid(),'shop.reference_catalog_installed','barbershops',p_barbershop_id,
    jsonb_build_object('created',created_count,'published',published_count,'release',1,'physical_stock_imported',false,'actor_origin',case when auth.uid() is null then 'service_reference_import' else 'authenticated_operator' end));
 end if;
 return jsonb_build_object('shop_id',p_barbershop_id,'created',created_count,'published',published_count,'already_present',existing_count);
end;
$function$;
revoke all on function public.install_shop_reference_catalog(uuid) from public,anon;
grant execute on function public.install_shop_reference_catalog(uuid) to authenticated,service_role;

-- The normal create_barbershop transaction inserts its authenticated owner.
-- Import and owner creation share the transaction: failure leaves no half-shop.
create or replace function private.provision_shop_reference_catalog()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if new.role='owner' and auth.uid()=new.user_id then
  perform public.install_shop_reference_catalog(new.barbershop_id);
 end if;
 return new;
end; $$;
revoke all on function private.provision_shop_reference_catalog() from public,anon,authenticated;
create trigger barbershop_owner_provision_reference_catalog after insert on public.barbershop_members
 for each row execute function private.provision_shop_reference_catalog();
notify pgrst,'reload schema';

create or replace function public.get_public_shop_catalog(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop public.barbershops%rowtype;
  v_payload jsonb;
begin
  if p_slug is null or length(btrim(p_slug)) not between 1 and 120 then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  select b.*
    into v_shop
    from public.barbershops b
   where lower(b.slug) = lower(btrim(p_slug))
     and b.status in ('trial', 'active')
   limit 1;

  if not found then
    raise exception 'BARBERSHOP_NOT_FOUND';
  end if;

  -- Keep the public API predictable while the tenant-level shop flag is off.
  if not coalesce(v_shop.shop_enabled, false) then
    return jsonb_build_object(
      'enabled', false,
      'categories', '[]'::jsonb,
      'products', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'enabled', true,
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'description', c.description,
          'sort_order', c.sort_order
        )
        order by c.sort_order, c.name
      )
      from public.shop_product_categories c
      where c.barbershop_id = v_shop.id
        and c.is_active
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'category_id', p.category_id,
          'brand', p.brand,
          'name', p.name,
          'description', p.description,
          'image_url', p.image_url,
          'image_alt', p.image_alt,
          'product_kind', p.product_kind,
          'sort_order', p.sort_order,
          'order_options', p.order_options,
          'variants', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', v.id,
                'label', v.label,
                'attributes', v.attributes || jsonb_build_object('requires_confirmation',p.requires_confirmation),
                'unit_label', v.unit_label,
                'price_minor', v.price_minor,
                'available',
                  case
                    when not p.track_stock then true
                    else v.stock_on_hand - coalesce((
                      select sum(r.qty)
                      from public.inventory_reservations r
                      where r.barbershop_id = v_shop.id
                        and r.variant_id = v.id
                        and r.status = 'reserved'
                        and (r.expires_at is null or r.expires_at > now())
                    ), 0) > 0
                  end
              )
              order by v.created_at, v.id
            )
            from public.shop_product_variants v
            where v.barbershop_id = v_shop.id
              and v.product_id = p.id
              and v.is_active
          ), '[]'::jsonb)
        )
        order by p.sort_order, p.name
      )
      from public.shop_products p
      where p.barbershop_id = v_shop.id
        and p.is_active
        and (p.category_id is null or exists (
          select 1
          from public.shop_product_categories c
          where c.id = p.category_id
            and c.barbershop_id = v_shop.id
            and c.is_active
        ))
        and exists (
          select 1
          from public.shop_product_variants v
          where v.barbershop_id = v_shop.id
            and v.product_id = p.id
            and v.is_active
        )
    ), '[]'::jsonb)
  )
  into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.get_public_shop_catalog(text) from public, anon, authenticated;
grant execute on function public.get_public_shop_catalog(text) to anon, authenticated, service_role;

comment on function public.get_public_shop_catalog(text) is
  'Public, tenant-scoped catalogue DTO. Omits inventory quantities, private image approval metadata and customer/appointment data. Does not create orders.';

-- Preserve canonical pricing, stock locking, request fingerprint and idempotency.
CREATE OR REPLACE FUNCTION public.book_appointment_with_shop_order_idempotent(p_idempotency_key uuid, p_slug text, p_service_id uuid, p_haircut_id uuid, p_barber_id uuid, p_start timestamp with time zone, p_name text, p_phone text, p_email text, p_shop_items jsonb, p_request_hash text)
 RETURNS TABLE(appointment_id uuid, manage_token uuid, deposit_cents integer, needs_payment boolean, shop_order_status shop_order_status, shop_order_item_count integer, shop_subtotal_minor bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cached jsonb;
  v_cached_hash text;
  v_response jsonb;
  v_cached_shop_order jsonb;
  v_booking record;
  v_shop public.barbershops%rowtype;
  v_item jsonb;
  v_variant_id uuid;
  v_qty integer;
  v_options jsonb;
  v_fulfilment_mode text;
  v_variant record;
  v_order_id uuid;
  v_order_line_id uuid;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_item_count integer := 0;
  v_requested_count integer;
  v_distinct_variants bigint;
  v_reserved integer;
  v_order_status public.shop_order_status;
begin
  if p_idempotency_key is null then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST_FINGERPRINT';
  end if;
  if p_shop_items is null or jsonb_typeof(p_shop_items) is distinct from 'array' then
    raise exception 'INVALID_SHOP_ORDER_ITEMS';
  end if;
  if jsonb_array_length(p_shop_items) > 20 then
    raise exception 'SHOP_ORDER_TOO_MANY_ITEMS';
  end if;

  for v_item in select value from jsonb_array_elements(p_shop_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ? 'variant_id')
       or not (v_item ? 'qty')
       or not (v_item ? 'options')
       or not (v_item ? 'fulfilment_mode')
       or exists (
         select 1 from jsonb_object_keys(v_item) as k(key)
         where k.key not in ('variant_id','qty','options','fulfilment_mode')
       ) then
      raise exception 'INVALID_SHOP_ORDER_ITEMS';
    end if;
    if coalesce(v_item->>'variant_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'INVALID_SHOP_ORDER_ITEMS';
    end if;
    if coalesce(v_item->>'qty','') !~ '^[1-9][0-9]{0,2}$'
       or (v_item->>'qty')::integer > 100 then
      raise exception 'INVALID_SHOP_ORDER_QUANTITY';
    end if;
    v_options := v_item->'options';
    if not private.shop_order_options_valid(v_options) then
      raise exception 'INVALID_SHOP_ORDER_OPTIONS';
    end if;
    if (select count(*) from jsonb_array_elements_text(v_options) e(value))
       <> (select count(distinct e.value) from jsonb_array_elements_text(v_options) e(value)) then
      raise exception 'INVALID_SHOP_ORDER_OPTIONS';
    end if;
    if coalesce(v_item->>'fulfilment_mode','') not in ('consume_here','takeaway') then
      raise exception 'INVALID_SHOP_FULFILMENT_MODE';
    end if;
  end loop;

  select count(*), count(distinct lower(value->>'variant_id'))
    into v_requested_count, v_distinct_variants
  from jsonb_array_elements(p_shop_items);
  if v_requested_count <> v_distinct_variants then
    raise exception 'DUPLICATE_SHOP_ORDER_VARIANT';
  end if;

  -- Claim the same key used by booking-create. Conflicting requests cannot reuse a cached order.
  insert into public.booking_idempotency(key, response, request_hash)
  values (p_idempotency_key, null, p_request_hash)
  on conflict (key) do nothing;

  if not found then
    select bi.response, bi.request_hash
      into v_cached, v_cached_hash
    from public.booking_idempotency bi
    where bi.key = p_idempotency_key
    for update;

    if v_cached is null then
      raise exception 'IDEMPOTENCY_IN_PROGRESS';
    end if;

    if v_cached_hash is null then
      if jsonb_array_length(p_shop_items) > 0 then
        raise exception 'IDEMPOTENCY_KEY_REUSED';
      end if;
    elsif v_cached_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;

    v_cached_shop_order := v_cached->'shop_order';
    return query
    select
      (v_cached->>'appointment_id')::uuid,
      (v_cached->>'manage_token')::uuid,
      coalesce((v_cached->>'deposit_cents')::integer, 0),
      coalesce((v_cached->>'needs_payment')::boolean, false),
      case
        when v_cached_shop_order is null or v_cached_shop_order = 'null'::jsonb then null::public.shop_order_status
        else (v_cached_shop_order->>'status')::public.shop_order_status
      end,
      coalesce((v_cached_shop_order->>'item_count')::integer, 0),
      coalesce((v_cached_shop_order->>'subtotal_minor')::bigint, 0);
    return;
  end if;

  if jsonb_array_length(p_shop_items) > 0 then
    select b.*
      into v_shop
    from public.barbershops b
    where lower(b.slug) = lower(btrim(p_slug))
      and b.status in ('trial','active')
    for update;

    if not found then
      raise exception 'BARBERSHOP_NOT_FOUND';
    end if;
    if not coalesce(v_shop.shop_enabled, false) then
      raise exception 'SHOP_NOT_ENABLED';
    end if;
  end if;

  -- Reuse the existing authoritative engine. Any error below rolls this booking back.
  select * into v_booking
  from public.book_appointment(
    p_slug,
    p_service_id,
    p_haircut_id,
    p_barber_id,
    p_start,
    p_name,
    p_phone,
    p_email
  );

  if not found or v_booking.manage_token is null then
    raise exception 'BOOKING_EMPTY_RESPONSE';
  end if;

  if jsonb_array_length(p_shop_items) > 0 then
    insert into public.appointment_product_orders(
      barbershop_id, appointment_id, status, customer_note
    )
    values (v_shop.id, v_booking.appointment_id, 'received', null)
    returning id into v_order_id;

    for v_item in select value from jsonb_array_elements(p_shop_items)
    loop
      v_variant_id := (v_item->>'variant_id')::uuid;
      v_qty := (v_item->>'qty')::integer;
      v_options := v_item->'options';
      v_fulfilment_mode := v_item->>'fulfilment_mode';

      select
        v.id as variant_id,
        v.product_id,
        v.barbershop_id,
        v.label as variant_label,
        v.price_minor,
        v.stock_on_hand,
        v.is_active as variant_active,
        p.name as product_name,
        p.is_active as product_active,
        p.category_id,
        p.product_kind,
        p.track_stock,
        p.order_options
      into v_variant
      from public.shop_product_variants v
      join public.shop_products p
        on p.id = v.product_id
       and p.barbershop_id = v.barbershop_id
      where v.id = v_variant_id
        and v.barbershop_id = v_shop.id
        and v.is_active
        and p.is_active
        and (
          p.category_id is null or exists (
            select 1
            from public.shop_product_categories c
            where c.id = p.category_id
              and c.barbershop_id = v_shop.id
              and c.is_active
          )
        )
      for update of v, p;

      if not found then
        raise exception 'SHOP_ITEM_UNAVAILABLE';
      end if;

      if (v_variant.product_kind = 'consume_here' and v_fulfilment_mode <> 'consume_here')
         or (v_variant.product_kind = 'takeaway' and v_fulfilment_mode <> 'takeaway') then
        raise exception 'INVALID_SHOP_FULFILMENT_MODE';
      end if;

      if exists (
        select 1
        from jsonb_array_elements_text(v_options) requested(option_name)
        where not exists (
          select 1
          from jsonb_array_elements_text(v_variant.order_options) configured(option_name)
          where configured.option_name = requested.option_name
        )
      ) then
        raise exception 'INVALID_SHOP_ORDER_OPTIONS';
      end if;

      if v_variant.track_stock then
        select coalesce(sum(r.qty), 0)::integer
          into v_reserved
        from public.inventory_reservations r
        where r.barbershop_id = v_shop.id
          and r.variant_id = v_variant_id
          and r.status = 'reserved'
          and (r.expires_at is null or r.expires_at > now());

        if v_variant.stock_on_hand - v_reserved < v_qty then
          raise exception 'SHOP_STOCK_UNAVAILABLE';
        end if;
      end if;

      if v_variant.price_minor < 0 or v_variant.price_minor > 9007199254740991 then
        raise exception 'SHOP_PRICE_INVALID';
      end if;
      v_line_total := v_variant.price_minor * v_qty;
      if v_subtotal > 9007199254740991 - v_line_total then
        raise exception 'SHOP_TOTAL_OVERFLOW';
      end if;

      insert into public.appointment_product_order_items(
        barbershop_id,
        order_id,
        product_id,
        variant_id,
        product_name_snapshot,
        variant_snapshot,
        unit_price_snapshot,
        qty,
        options,
        line_total_snapshot,
        status
      )
      values (
        v_shop.id,
        v_order_id,
        v_variant.product_id,
        v_variant_id,
        v_variant.product_name,
        v_variant.variant_label,
        v_variant.price_minor,
        v_qty,
        jsonb_build_object('preferences', v_options, 'fulfilment_mode', v_fulfilment_mode),
        v_line_total,
        'requested'
      );

      if v_variant.track_stock then
        insert into public.inventory_reservations(
          barbershop_id, order_id, variant_id, qty, status, expires_at
        )
        values (v_shop.id, v_order_id, v_variant_id, v_qty, 'reserved', null);
      end if;

      v_subtotal := v_subtotal + v_line_total;
      v_item_count := v_item_count + 1;
    end loop;

    if v_item_count <> jsonb_array_length(p_shop_items) or v_item_count = 0 then
      raise exception 'SHOP_ORDER_EMPTY';
    end if;

    select case when exists(select 1 from public.appointment_product_order_items i join public.shop_products p on p.id=i.product_id and p.barbershop_id=i.barbershop_id where i.order_id=v_order_id and i.barbershop_id=v_shop.id and p.requires_confirmation) then 'needs_confirmation'::public.shop_order_status else 'received'::public.shop_order_status end into v_order_status;
    update public.appointment_product_orders set status=v_order_status where id=v_order_id and barbershop_id=v_shop.id;

    insert into public.audit_logs(
      barbershop_id, actor_id, action, entity, entity_id, diff
    )
    values (
      v_shop.id, null, 'shop_order_received', 'appointment_product_order', v_order_id,
      jsonb_build_object(
        'appointment_id', v_booking.appointment_id,
        'item_count', v_item_count,
        'subtotal_minor', v_subtotal,
        'inventory_reservations', (
          select count(*) from public.inventory_reservations r
          where r.order_id = v_order_id and r.status = 'reserved'
        )
      )
    );
  end if;

  v_response := jsonb_build_object(
    'appointment_id', v_booking.appointment_id,
    'manage_token', v_booking.manage_token,
    'deposit_cents', coalesce(v_booking.deposit_cents, 0),
    'needs_payment', coalesce(v_booking.needs_payment, false),
    'shop_order', case when v_order_id is null then null else jsonb_build_object(
      'status', v_order_status::text,
      'item_count', v_item_count,
      'subtotal_minor', v_subtotal
    ) end
  );

  update public.booking_idempotency
  set response = v_response, request_hash = p_request_hash
  where key = p_idempotency_key;

  return query
  select v_booking.appointment_id, v_booking.manage_token, coalesce(v_booking.deposit_cents, 0),
         coalesce(v_booking.needs_payment, false), v_order_status, v_item_count, v_subtotal;
end;
$function$;
