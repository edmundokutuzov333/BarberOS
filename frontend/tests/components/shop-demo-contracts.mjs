import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const app = read('src/App.tsx');
const page = read('src/pages/ShopSimulationDemo.tsx');
const pkg = JSON.parse(read('package.json'));

assert.match(app, /const ShopSimulationDemo = lazy\(\(\) => import\('\.\/pages\/ShopSimulationDemo'\)\)/);
assert.match(app, /path="\/demonstracao-loja" element={<ShopSimulationDemo \/>}/);
assert.match(page, /SIMULAÇÃO QA/);
assert.match(page, /Nenhum pedido foi enviado ou guardado/);
assert.match(page, /não processa pagamentos/);
assert.doesNotMatch(page, /supabase\.|useBookAppointment|book_appointment|fetch\(/i);
assert.match(page, /Fomento Barbershop/);
assert.match(page, /Matola Prime Barber/);
assert.match(page, /MUFU Barber House/);
assert.match(page, /Oryon Barber Studio/);
for (const [fixture, price] of [
  ['Água Namaacha 1,5 L', 'priceMinor: 4000'],
  ['Água Namaacha 500 ml', 'priceMinor: 3000'],
  ['Cappuccino por porção', 'priceMinor: 12000'],
  ['Ceres Laranja 200 ml', 'priceMinor: 4500'],
  ['Coca-Cola Original 330 ml', 'priceMinor: 5500'],
  ['Coca-Cola Zero 330 ml', 'priceMinor: 5100'],
  ['Fanta Laranja 330 ml', 'priceMinor: 5000'],
  ['Fonte Fresca 500 ml', 'priceMinor: 1500'],
  ['Óleo de barba 30 ml', 'priceMinor: 25000'],
]) {
  assert.ok(page.includes(fixture), 'Missing QA fixture: ' + fixture);
  assert.ok(page.includes(price), 'Missing illustrative price for ' + fixture);
}
assert.match(page, /Math\.min\(product\.stock/);
assert.match(page, /data-testid="demo-confirm-selection"/);
assert.match(page, /data-testid="demo-confirmation-success"/);
assert.ok(pkg.scripts.test.includes('yarn test:contracts:shop-demo'), 'The demo contract test must run in the normal test suite.');
console.log('Shop simulation demo contracts: PASS');
