import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { MembersEditor } from '@/components/config/MembersEditor';
import '@/index.css';
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <main className="mx-auto max-w-4xl p-4 sm:p-8"><h1 className="t-h2 mb-5">Acessos da equipa</h1><MembersEditor /></main>
    <Toaster />
  </QueryClientProvider>,
);
