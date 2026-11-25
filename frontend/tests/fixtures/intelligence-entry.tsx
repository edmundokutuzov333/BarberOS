import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Toaster} from 'sonner';
import Intelligence from '@/pages/app/Intelligence';
import SetupAssistant from '@/features/intelligence/SetupAssistant';
import '@/index.css';
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><MemoryRouter><main className="p-4 min-w-0"><Intelligence/><SetupAssistant shopId="11111111-1111-4111-8111-111111111111" step={6}/></main><Toaster/></MemoryRouter></QueryClientProvider>);
