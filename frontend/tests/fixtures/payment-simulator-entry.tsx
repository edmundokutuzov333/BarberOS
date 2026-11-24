import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import PaymentSimulator from '@/features/payments/PaymentSimulator';
import '@/index.css';
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><main className="p-3"><PaymentSimulator/></main></QueryClientProvider>);
