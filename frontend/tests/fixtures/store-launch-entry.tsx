import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import {
  ShopCatalogueStep,
  type ShopCart,
} from "@/features/public-shop/CatalogueStep";
import type { PublicShopCatalog } from "@/features/public-shop/catalog";
import PaymentSettingsForm from "@/features/payments/PaymentSettingsForm";
import { DepositForm } from "@/components/config/ShopForms";
import LojaPagamentos from "@/pages/app/LojaPagamentos";
import "@/index.css";

declare global {
  interface Window {
    __storeCatalog: PublicShopCatalog;
  }
}
function Fixture() {
  const [cart, setCart] = useState<ShopCart>({});
  const [view, setView] = useState("catalog");
  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1>Loja da barbearia</h1>
      <nav className="flex gap-4 mb-6">
        <button onClick={() => setView("catalog")}>Catálogo</button>
        <button onClick={() => setView("payments")}>Pagamentos</button>
      </nav>
      {view === "catalog" ? (
        <ShopCatalogueStep
          catalog={window.__storeCatalog}
          cart={cart}
          onRetry={() => {}}
          onQuantityChange={(p, v, delta) =>
            setCart((old) => ({
              ...old,
              [v.id]: {
                qty: Math.max(0, Math.min(100, (old[v.id]?.qty ?? 0) + delta)),
                options: old[v.id]?.options ?? [],
                fulfilmentMode:
                  old[v.id]?.fulfilmentMode ??
                  (p.product_kind === "takeaway" ? "takeaway" : "consume_here"),
              },
            }))
          }
          onOptionChange={(id, option, checked) =>
            setCart((old) => ({
              ...old,
              [id]: {
                ...old[id],
                options: checked
                  ? [...old[id].options, option]
                  : old[id].options.filter((o) => o !== option),
              },
            }))
          }
          onFulfilmentModeChange={(id, mode) =>
            setCart((old) => ({
              ...old,
              [id]: { ...old[id], fulfilmentMode: mode },
            }))
          }
          onContinueWithoutProducts={() => setCart({})}
        />
      ) : (
        <>
          <PaymentSettingsForm />
          <DepositForm />
          <LojaPagamentos />
        </>
      )}
    </main>
  );
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <Fixture />
    </MemoryRouter>
  </QueryClientProvider>,
);
