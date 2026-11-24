import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "vite";
import { readFileSync } from "node:fs";
import path from "node:path";
let server, origin;
const reference = JSON.parse(
  readFileSync("../catalog/store-reference.v1.json", "utf8"),
);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const categories = [...new Set(reference.products.map((p) => p.category))].map(
  (name, i) => ({ id: uuid(i + 1), name, description: null, sort_order: i }),
);
const catalog = {
  enabled: true,
  categories,
  products: reference.products.map((p, i) => ({
    id: uuid(i + 100),
    category_id: categories.find((c) => c.name === p.category).id,
    brand: p.brand,
    name: p.name,
    description: p.description,
    image_url: p.image_url,
    image_alt: p.image_alt,
    product_kind: p.product_kind,
    sort_order: i,
    order_options: p.order_options,
    variants: [
      {
        id: uuid(i + 200),
        label: p.format,
        attributes: { requires_confirmation: true },
        unit_label: "unidade",
        price_minor: p.price_minor,
        available: true,
      },
    ],
  })),
};
test.beforeAll(async () => {
  server = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
    logLevel: "error",
    plugins: [
      {
        name: "store-launch-fixture",
        enforce: "pre",
        configureServer(vite) {
          vite.middlewares.use("/__store-launch", async (_req, res, next) => {
            try {
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.end(
                await vite.transformIndexHtml(
                  "/__store-launch",
                  '<!doctype html><html lang="pt-MZ"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Store launch regression</title></head><body><div id="root"></div><script>window.__storeCatalog=' +
                    JSON.stringify(catalog).replaceAll("<", "\\u003c") +
                    '</script><script type="module" src="/tests/fixtures/store-launch-entry.tsx"></script></body></html>',
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
async function open(page) {
  await page.route(
    "https://barber-os-orpin.vercel.app/catalog/products/**",
    (route) =>
      route.fulfill({
        path: path.join(
          process.cwd(),
          "public",
          new URL(route.request().url()).pathname,
        ),
        contentType: "image/webp",
      }),
  );
  await page.goto(origin + "/__store-launch");
  await expect(
    page.getByTestId("public-shop-products").locator("article"),
  ).toHaveCount(reference.products.length);
}
test("real catalog has all sourced products, honest availability and clearable search", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByText("Disponibilidade por confirmar pela barbearia", {
      exact: true,
    }),
  ).toHaveCount(23);
  await page.getByLabel("Pesquisar produtos").fill("Blackstar");
  await expect(
    page.getByTestId("public-shop-products").locator("article"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Blackstar Gel 120 ml" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpar pesquisa de produtos" })
    .click();
  await expect(page.getByLabel("Pesquisar produtos")).toBeFocused();
  await expect(
    page.getByTestId("public-shop-products").locator("article"),
  ).toHaveCount(23);
  await page
    .getByRole("button", { name: "Cuidado pessoal", exact: true })
    .click();
  await expect(
    page.getByTestId("public-shop-products").locator("article"),
  ).toHaveCount(5);
  await page.getByLabel("Pesquisar produtos").fill("inexistente-123");
  await expect(
    page.getByText("Nenhum produto encontrado", { exact: true }),
  ).toBeVisible();
});
test("cart uses the configured product price and can continue without products", async ({
  page,
}) => {
  await open(page);
  await page.getByLabel("Pesquisar produtos").fill("Blackstar");
  await page.getByRole("button", { name: /^Adicionar Blackstar/ }).click();
  await expect(page.getByTestId("public-shop-summary")).toContainText(
    "1 artigo seleccionado",
  );
  await expect(page.getByTestId("public-shop-summary")).toContainText("50");
  await expect(
    page.getByLabel(/Quantidade seleccionada de Blackstar/),
  ).toHaveText("1");
  await page.getByRole("button", { name: "Continuar sem produtos" }).click();
  await expect(page.getByTestId("public-shop-summary")).toContainText(
    "0 artigos seleccionados",
  );
});
test("payment UI and API cannot initiate or configure a charge", async ({
  page,
}) => {
  let providerRequests = 0;
  await page.route("https://*.supabase.co/functions/v1/payments-*", (route) => {
    providerRequests++;
    return route.abort();
  });
  await open(page);
  await page.getByRole("button", { name: "Pagamentos", exact: true }).click();
  await expect(page.getByTestId("payments-unavailable")).toHaveCount(3);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const errors = await page.evaluate(async () => {
    const api = await import("/src/features/payments/api.ts");
    const result = [];
    for (const fn of [
      () =>
        api.initiatePayment({
          token: "00000000-0000-4000-8000-000000000001",
          provider: "mpesa",
          msisdn: "258840000000",
        }),
      () =>
        api.configurePaymentProvider({
          shop: "00000000-0000-4000-8000-000000000002",
          provider: "mpesa",
          enabled: true,
          credentials: {},
          public_config: {},
        }),
    ])
      try {
        await fn();
        result.push("UNEXPECTED_SUCCESS");
      } catch (e) {
        result.push(e.message);
      }
    return result;
  });
  expect(errors).toEqual(["PAYMENTS_UNAVAILABLE", "PAYMENTS_UNAVAILABLE"]);
  expect(providerRequests).toBe(0);
});
test("real product cards pass serious accessibility and mobile overflow checks", async ({
  page,
}, info) => {
  await open(page);
  await page.getByLabel("Pesquisar produtos").fill("Sofn");
  await expect(
    page.getByRole("heading", { name: "Sofn'Free Styling Gel 250 ml" }),
  ).toBeVisible();
  const scan = await new AxeBuilder({ page }).analyze();
  expect(
    scan.violations.filter((v) => ["serious", "critical"].includes(v.impact)),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("store-reference-card.png"),
    fullPage: true,
  });
});
