import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "vite";
let server, origin;
const shopId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const productId = "33333333-3333-4333-8333-333333333333";
const version = "2026-11-24T06:00:00.000001+00:00";
test.beforeAll(async () => {
  server = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
    logLevel: "error",
    plugins: [
      {
        name: "catalog-tenant-boundary",
        enforce: "pre",
        transform(_source, id) {
          if (id.endsWith("/src/lib/auth.tsx")) return "export const useAuth=()=>({user:{id:'44444444-4444-4444-8444-444444444444'}});";
          if (id.endsWith("/src/lib/shop.tsx"))
            return `
 import {useState,useEffect} from 'react';
 const first={id:'${shopId}',name:'Loja A',shop_enabled:false};
 export function useShop(){const [shop,setShop]=useState(first);const [role,setRole]=useState('owner');useEffect(()=>{window.__catalogShop=()=>setShop({id:'${otherId}',name:'Loja B',shop_enabled:false});window.__catalogRole=setRole;window.__enableCatalog=()=>setShop(v=>({...v,shop_enabled:true}));return()=>{delete window.__catalogShop;delete window.__catalogRole;delete window.__enableCatalog}},[]);return {shop,role};}`;
        },
        configureServer(vite) {
          vite.middlewares.use("/__catalog-test", async (_req, res, next) => {
            try {
              res.setHeader("Content-Type", "text/html");
              res.end(
                await vite.transformIndexHtml(
                  "/__catalog-test",
                  '<!doctype html><html lang="pt-MZ"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalog regression</title></head><body><div id="root"></div><script type="module" src="/tests/fixtures/shop-catalog-entry.tsx"></script></body></html>',
                ),
              );
            } catch (e) {
              next(e);
            }
          });
        },
      },
    ],
  });
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
});
test.afterAll(async () => {
  await server?.close();
});
async function fixture(page, { product = false } = {}) {
  const state = {
    save: [],
    publish: [],
    failSave: false,
    failPublish: false,
    delay: false,
    release: null,
    products: product
      ? [
          {
            id: productId,
            barbershop_id: shopId,
            name: "Água da Namaacha",
            brand: "Namaacha",
            category_id: null,
            description: null,
            product_kind: "both",
            track_stock: false,
            image_url: null,
            image_alt: null,
            image_source_url: null,
            image_source_note: null,
            order_options: [],
            is_active: false,
            sort_order: 0,
            created_at: version,
            updated_at: version,
          },
        ]
      : [],
  };
  await page.route("https://*.supabase.co/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let result = [];
    let status = 200;
    if (req.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
      });
    if (path.endsWith("/functions/v1/barber-intelligence")) {
      const payload=req.postDataJSON();state.intelligence??=[];state.intelligence.push(payload);
      result={version:1,asOf:version,windowDays:30,trackedCount:1,alertCount:1,estimatedCount:0,rows:[{id:productId,product:"Pomada QA",variant:"100g",stock:0,threshold:2,sold:0,saleDays:0,dailyRate:null,coverDays:null,suggestedUnits:null,signal:"out"}]};
    }
    if (path.endsWith("/shop_products"))
      result = req.url().includes(otherId) ? [] : state.products;
    if (path.endsWith("/rpc/save_shop_catalog_product") || path.endsWith("/rpc/save_shop_catalog_product_presentation")) {
      const body = req.postDataJSON();
      state.save.push(body);
      if (state.delay)
        await new Promise((resolve) => {
          state.release = resolve;
        });
      const row = {
        id: body.p_product_id,
        barbershop_id: body.p_barbershop_id,
        ...body.p_payload,
        gallery: body.p_gallery ?? [],
        is_featured: body.p_featured ?? false,
        is_active: false,
        updated_at: version,
      };
      if (!state.products.some((p) => p.id === row.id))
        state.products.push(row);
      if (state.failSave) {
        status = 503;
        result = { message: "upstream unavailable" };
      } else result = row;
    }
    if (path.endsWith("/rpc/publish_shop_catalog_product")) {
      const body = req.postDataJSON();
      state.publish.push(body);
      if (state.failPublish) {
        status = 409;
        result = { message: "SHOP_CATALOG_CONFLICT" };
      } else {
        const p = state.products.find((p) => p.id === body.p_product_id);
        p.is_active = body.p_publish;
        result = p;
      }
    }
    return route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(result),
    });
  });
  await page.goto(origin + "/__catalog-test");
  await expect(
    page.getByRole("button", { name: "Novo produto" }),
  ).toBeVisible();
  return state;
}
test("validation is inline, focuses the field and preserves input", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.getByRole("button", { name: "Novo produto" }).click();
  const modal = page.getByTestId("shop-product-modal");
  await modal.getByRole("button", { name: "Guardar produto" }).click();
  await expect(modal.getByLabel("Nome do produto")).toBeFocused();
  await expect(modal.getByLabel("Nome do produto")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await modal.getByLabel("Nome do produto").fill("Água da Namaacha");
  await modal
    .getByLabel("Preferências permitidas", { exact: false })
    .fill("Fria\n fria ");
  await modal.getByRole("button", { name: "Guardar produto" }).click();
  await expect(
    modal.getByText("Remova as preferências repetidas."),
  ).toBeVisible();
  await expect(modal.getByLabel("Nome do produto")).toHaveValue(
    "Água da Namaacha",
  );
  expect(state.save).toHaveLength(0);
});
test("uncertain create retries the same product ID and only one product exists", async ({
  page,
}) => {
  const state = await fixture(page);
  state.failSave = true;
  await page.getByRole("button", { name: "Novo produto" }).click();
  const modal = page.getByTestId("shop-product-modal");
  await modal.getByLabel("Nome do produto").fill("Água da Namaacha");
  await modal.getByRole("button", { name: "Guardar produto" }).click();
  await expect(modal.getByRole("alert")).toContainText(
    "dados introduzidos foram preservados",
  );
  state.failSave = false;
  await modal.getByRole("button", { name: "Guardar produto" }).click();
  await expect(modal).toBeHidden();
  expect(state.save).toHaveLength(2);
  expect(state.save[0].p_product_id).toBe(state.save[1].p_product_id);
  expect(state.products).toHaveLength(1);
  expect(state.save[0].p_payload).not.toHaveProperty("is_active");
});
test("publication requires an explicit verification note and sends the row version", async ({
  page,
}) => {
  const state = await fixture(page, { product: true });
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  const modal = page.getByTestId("shop-publication-modal");
  await modal.getByRole("button", { name: "Verificar e publicar" }).click();
  await expect(modal.getByLabel("Registo da verificação")).toBeFocused();
  expect(state.publish).toHaveLength(0);
  await modal
    .getByLabel("Registo da verificação")
    .fill("Identidade, embalagem e fotografia verificadas pelo gestor.");
  await modal.getByRole("button", { name: "Verificar e publicar" }).click();
  await expect(modal).toBeHidden();
  expect(state.publish[0]).toMatchObject({
    p_barbershop_id: shopId,
    p_product_id: productId,
    p_expected_updated_at: version,
    p_publish: true,
  });
  await expect(page.getByText("Publicado", { exact: true })).toBeVisible();
});
test("stale publication preserves the verification note and reports the conflict", async ({
  page,
}) => {
  const state = await fixture(page, { product: true });
  state.failPublish = true;
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  const modal = page.getByTestId("shop-publication-modal");
  const note = "Identidade e fotografia verificadas, sem suposição de stock.";
  await modal.getByLabel("Registo da verificação").fill(note);
  await modal.getByRole("button", { name: "Verificar e publicar" }).click();
  await expect(modal.getByRole("alert")).toContainText(
    "alterado por outra pessoa",
  );
  await expect(modal.getByLabel("Registo da verificação")).toHaveValue(note);
});
test("a delayed save cannot close or overwrite another tenant editor", async ({
  page,
}) => {
  const state = await fixture(page);
  state.delay = true;
  await page.getByRole("button", { name: "Novo produto" }).click();
  await page.getByLabel("Nome do produto").fill("Produto da loja A");
  await page.getByRole("button", { name: "Guardar produto" }).click();
  await expect.poll(() => state.save.length).toBe(1);
  await page.evaluate(() => window.__catalogShop());
  await page.getByRole("button", { name: "Novo produto" }).click();
  await page.getByLabel("Nome do produto").fill("Rascunho da loja B");
  state.release();
  await expect(page.getByLabel("Nome do produto")).toHaveValue(
    "Rascunho da loja B",
  );
  expect(state.save[0].p_barbershop_id).toBe(shopId);
});
test("product modal has no serious accessibility violations or narrow overflow", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Novo produto" }).click();
  await expect(page.getByTestId("shop-product-modal")).toBeVisible();
  const result = await new AxeBuilder({ page })
    .include('[data-testid="shop-product-modal"]')
    .analyze();
  expect(
    result.violations.filter((v) => ["critical", "serious"].includes(v.impact)),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("shop-product-modal")).toBeHidden();
});

test("featured catalogue presentation survives save and reload", async ({page}) => {
  const state=await fixture(page);
  await page.getByRole("button",{name:"Novo produto"}).click();
  const modal=page.getByTestId("shop-product-modal");
  await modal.getByLabel("Nome do produto").fill("Produto destaque QA");
  await modal.getByText("Destacar este produto na vitrine",{exact:true}).click();
  await modal.getByRole("button",{name:"Guardar produto"}).click();
  await expect(modal).toBeHidden();
  expect(state.save[0].p_featured).toBe(true);
  expect(state.save[0].p_gallery).toEqual([]);
  await page.reload();
  await expect(page.getByText("Em destaque na vitrine",{exact:true})).toBeVisible();
});

test("inventory intelligence is opt-in, tenant scoped and never changes stock",async({page})=>{
 const state=await fixture(page);
 await page.evaluate(()=>window.__enableCatalog());
 await page.getByTestId("shop-tab-stock").click();
 const panel=page.getByTestId("inventory-intelligence");
 await expect(panel.getByRole("button",{name:"Analisar stock"})).toBeVisible();
 expect(state.intelligence).toBeUndefined();
 await panel.getByRole("button",{name:"Analisar stock"}).click();
 await expect(panel.getByText("Pomada QA · 100g")).toBeVisible();
 await expect(panel.getByText("Sem stock",{exact:true})).toBeVisible();
 expect(state.intelligence).toEqual([{shopId,action:"inventory",days:30,topic:"stock"}]);
 expect(state.save).toHaveLength(0);expect(state.publish).toHaveLength(0);
 await page.evaluate(()=>window.__catalogShop());
 await expect(panel).toHaveCount(0);
});
