import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import LojaProdutos from "@/pages/app/LojaProdutos";
import "@/index.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <main className="p-4">
        <LojaProdutos />
      </main>
      <Toaster />
    </MemoryRouter>
  </QueryClientProvider>,
);
