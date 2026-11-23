import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Comunicacoes from '@/pages/app/Comunicacoes';
import '@/index.css';
import { Modal } from '@/components/ui/Primitives';
import { Button } from '@/components/ui/Button';

function ModalFixture() {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Abrir diálogo de teste</Button>
    <Modal open={open} onOpenChange={setOpen} title="Edição de teste">
      {Array.from({length: 40}, (_, i) => <p key={i}>Linha de conteúdo controlado {i + 1}.</p>)}
      <Button onClick={() => setOpen(false)}>Concluir edição de teste</Button>
    </Modal></>;
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/app/comunicacoes']}>
      <main className="mx-auto max-w-6xl p-4 sm:p-8"><Comunicacoes /><ModalFixture /></main>
      <Toaster />
    </MemoryRouter>
  </QueryClientProvider>,
);
