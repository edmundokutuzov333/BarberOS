import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const catalog=JSON.parse(readFileSync(path.join(root,'catalog/store-reference.v1.json'),'utf8'));
assert.equal(catalog.version,1);
assert(catalog.products.length>=20);
const keys=new Set();const names=new Set();
for(const p of catalog.products){
 assert(/^[a-z0-9_-]+$/.test(p.key));assert(!keys.has(p.key));keys.add(p.key);
 assert(!names.has(p.name));names.add(p.name);
 assert(p.name&&p.brand&&p.sku&&p.format&&p.description&&p.image_source_note);
 assert.equal(p.currency,'MZN');assert(Number.isSafeInteger(p.price_minor)&&p.price_minor>0);
 for(const field of ['source_url','source_image_url','image_url'])assert.equal(new URL(p[field]).protocol,'https:');
 assert(Number.isFinite(Date.parse(p.source_checked_at)));
 assert(p.image_width>0&&p.image_width<=720&&p.image_height>0&&p.image_height<=720);
 const bytes=readFileSync(path.join(root,'frontend/public/catalog/products',p.key+'.webp'));
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),p.image_sha256);
 assert.equal(new URL(p.image_url).pathname,'/catalog/products/'+p.key+'.webp');
 assert(!/alcohol|cerveja|vinho|whisky/i.test(p.name));
}
const migration=readFileSync(path.join(root,'supabase/migrations/20261124070136_store_reference_catalog_provisioning.sql'),'utf8');
assert.deepEqual(JSON.parse(migration.match(/\$catalog\$([\s\S]*?)\$catalog\$/)[1]),catalog.products);
console.log(JSON.stringify({status:'PASS',products:keys.size,categories:new Set(catalog.products.map(p=>p.category)).size,scope:'Recorded source, price, format and asset integrity. Does not certify physical inventory, image licenses or supplier agreements.'}));
