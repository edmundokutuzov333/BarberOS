import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth, RequireAdmin, AppShell } from './components/layout/AppShell';
import { AdminShell } from './components/layout/AdminShell';
import Landing from './pages/Landing';
import Entrar from './pages/auth/Entrar';
import Registar from './pages/auth/Registar';
import Recuperar from './pages/auth/Recuperar';
import Dashboard from './pages/app/Dashboard';
import Onboarding from './pages/app/Onboarding';
import NotYet, { NotFound } from './pages/app/NotYet';
import AdminBarbearias from './pages/admin/AdminBarbearias';
import Definicoes from './pages/app/Definicoes';
import AppointmentManage from './pages/AppointmentManage';
import PublicBarbershop from './pages/PublicBarbershop';
import BookingWizard from './pages/BookingWizard';
import { ServicosPage, CortesPage, BarbeirosPage, HorariosPage } from './pages/app/ConfigPages';
import AgendaPage from './pages/app/Agenda';
import Clientes from './pages/app/Clientes';
import ClienteDetalhe from './pages/app/ClienteDetalhe';
import ListaEspera from './pages/app/ListaEspera';
import Notificacoes from './pages/app/Notificacoes';
import Vaga from './pages/Vaga';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/registar" element={<Registar />} />
      <Route path="/recuperar" element={<Recuperar />} />
      <Route path="/marcacao/:token" element={<AppointmentManage />} />
      <Route path="/vaga/:token" element={<Vaga />} />
      <Route path="/barbearia/:slug" element={<PublicBarbershop />} />
      <Route path="/barbearia/:slug/marcar" element={<BookingWizard />} />

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="marcacoes" element={<NotYet />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="clientes/:customerId" element={<ClienteDetalhe />} />
          <Route path="lista-espera" element={<ListaEspera />} />
          <Route path="notificacoes" element={<Notificacoes />} />
          <Route path="servicos" element={<ServicosPage />} />
          <Route path="cortes" element={<CortesPage />} />
          <Route path="barbeiros" element={<BarbeirosPage />} />
          <Route path="horarios" element={<HorariosPage />} />
          <Route path="definicoes" element={<Navigate to="/app/definicoes/perfil" replace />} />
          <Route path="definicoes/:tab" element={<Definicoes />} />
          <Route path="*" element={<NotYet />} />
        </Route>
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<Navigate to="/admin/barbearias" replace />} />
            <Route path="barbearias" element={<AdminBarbearias />} />
            <Route path="*" element={<NotYet />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
