import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { BarberAtmosphere } from './components/background/BarberAtmosphere';

const RequireAuth = lazy(() => import('./components/layout/AppShell').then((m) => ({ default: m.RequireAuth })));
const AppShell = lazy(() => import('./components/layout/AppShell').then((m) => ({ default: m.AppShell })));
const RequireAdmin = lazy(() => import('./components/layout/AppShell').then((m) => ({ default: m.RequireAdmin })));
const AdminShell = lazy(() => import('./components/layout/AdminShell').then((m) => ({ default: m.AdminShell })));
const PrivateProviders = lazy(() => import('./components/layout/PrivateProviders'));

const Landing = lazy(() => import('./pages/Landing'));
const Gateway = lazy(() => import('./pages/Gateway'));
const Privacy = lazy(() => import('./pages/Legal').then((module) => ({ default: module.Privacy })));
const Terms = lazy(() => import('./pages/Legal').then((module) => ({ default: module.Terms })));
const Entrar = lazy(() => import('./pages/auth/Entrar'));
const Registar = lazy(() => import('./pages/auth/Registar'));
const Recuperar = lazy(() => import('./pages/auth/Recuperar'));
const AppointmentManage = lazy(() => import('./pages/AppointmentManage'));
const PublicBarbershop = lazy(() => import('./pages/PublicBarbershop'));
const BookingWizard = lazy(() => import('./pages/BookingWizard'));
const Vaga = lazy(() => import('./pages/Vaga'));
const ReviewSubmit = lazy(() => import('./pages/ReviewSubmit'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Onboarding = lazy(() => import('./pages/app/Onboarding'));
const NotYet = lazy(() => import('./pages/app/NotYet').then((m) => ({ default: m.default })));
const NotFound = lazy(() => import('./pages/app/NotYet').then((m) => ({ default: m.NotFound })));
const Definicoes = lazy(() => import('./pages/app/Definicoes'));
const ServicosPage = lazy(() => import('./pages/app/ConfigPages').then((m) => ({ default: m.ServicosPage })));
const CortesPage = lazy(() => import('./pages/app/ConfigPages').then((m) => ({ default: m.CortesPage })));
const BarbeirosPage = lazy(() => import('./pages/app/ConfigPages').then((m) => ({ default: m.BarbeirosPage })));
const HorariosPage = lazy(() => import('./pages/app/ConfigPages').then((m) => ({ default: m.HorariosPage })));
const AgendaPage = lazy(() => import('./pages/app/Agenda'));
const Marcacoes = lazy(() => import('./pages/app/Marcacoes'));
const Clientes = lazy(() => import('./pages/app/Clientes'));
const ClienteDetalhe = lazy(() => import('./pages/app/ClienteDetalhe'));
const ListaEspera = lazy(() => import('./pages/app/ListaEspera'));
const Notificacoes = lazy(() => import('./pages/app/Notificacoes'));
const Pagamentos = lazy(() => import('./pages/app/Pagamentos'));
const Relatorios = lazy(() => import('./pages/app/Relatorios'));
const Avaliacoes = lazy(() => import('./pages/app/Avaliacoes'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminBarbearias = lazy(() => import('./pages/admin/AdminBarbearias'));
const AdminBarbeariaDetalhe = lazy(() => import('./pages/admin/AdminBarbeariaDetalhe'));
const AdminUtilizadores = lazy(() => import('./pages/admin/AdminUtilizadores'));
const AdminPlanos = lazy(() => import('./pages/admin/AdminPlanos'));
const AdminPagamentos = lazy(() => import('./pages/admin/AdminPagamentos'));
const AdminSuporte = lazy(() => import('./pages/admin/AdminSuporte'));
const AdminMetricas = lazy(() => import('./pages/admin/AdminMetricas'));

function RouteLoading() {
  return (
    <main
      className="min-h-screen grid place-items-center px-5"
      aria-live="polite"
      aria-busy="true"
      aria-label="A carregar"
    >
      <div className="w-full max-w-sm space-y-3">
        <div className="h-3 w-28 rounded-full bg-white/10 animate-pulse" />
        <div className="h-12 w-full rounded-2xl bg-white/5 animate-pulse" />
        <div className="h-24 w-full rounded-3xl bg-white/5 animate-pulse" />
      </div>
    </main>
  );
}


export default function App() {
  const { pathname } = useLocation();
  const isLanding = pathname === '/';
  const isAbout = pathname === '/sobre';
  const isPublicShop = /^\/barbearia\/[^/]+\/?$/.test(pathname);
  const isQuietSurface =
    /^\/(?:entrar|registar|recuperar)(?:\/|$)/.test(pathname) ||
    /^\/(?:marcacao|vaga)(?:\/|$)/.test(pathname) ||
    /^\/barbearia\/[^/]+\/marcar\/?$/.test(pathname);
  const atmosphereVariant: 'ambient' | 'hero' | 'quiet' | 'showcase' =
    isLanding ? 'hero' : isPublicShop ? 'showcase' : isAbout ? 'hero' : isQuietSurface ? 'quiet' : 'ambient';

  useEffect(() => {
    const root = document.documentElement;
    const previousSurface = root.getAttribute('data-barberos-surface');
    root.setAttribute('data-barberos-surface', isLanding ? 'landing' : 'platform');
    return () => {
      if (previousSurface === null) root.removeAttribute('data-barberos-surface');
      else root.setAttribute('data-barberos-surface', previousSurface);
    };
  }, [isLanding, pathname]);

  return (
    <>
      <BarberAtmosphere variant={atmosphereVariant} />
      <Suspense fallback={<RouteLoading />}>
        <Routes>
        <Route path="/" element={<Gateway />} />
        <Route path="/sobre" element={<Landing />} />
        <Route path="/privacidade" element={<Privacy />} />
        <Route path="/termos" element={<Terms />} />
        <Route path="/b/:slug" element={<ShortLink />} />
        <Route path="/entrar" element={<Entrar />} />
        <Route path="/registar" element={<Registar />} />
        <Route path="/recuperar" element={<Recuperar />} />
        <Route path="/marcacao/:token" element={<AppointmentManage />} />
        <Route path="/marcacao/:token/avaliar" element={<ReviewSubmit />} />
        <Route path="/vaga/:token" element={<Vaga />} />
        <Route path="/barbearia/:slug" element={<PublicBarbershop />} />
        <Route path="/barbearia/:slug/marcar" element={<BookingWizard />} />

        <Route element={<PrivateProviders />}>
          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="onboarding" element={<Onboarding />} />
              <Route path="agenda" element={<AgendaPage />} />
              <Route path="marcacoes" element={<Marcacoes />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="clientes/:customerId" element={<ClienteDetalhe />} />
              <Route path="lista-espera" element={<ListaEspera />} />
              <Route path="notificacoes" element={<Notificacoes />} />
              <Route path="pagamentos" element={<Pagamentos />} />
              <Route path="avaliacoes" element={<Avaliacoes />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="servicos" element={<ServicosPage />} />
              <Route path="cortes" element={<CortesPage />} />
              <Route path="barbeiros" element={<BarbeirosPage />} />
              <Route path="horarios" element={<HorariosPage />} />
              <Route path="definicoes" element={<Navigate to="/app/definicoes/perfil" replace />} />
              <Route path="definicoes/:tab" element={<Definicoes />} />
              <Route path="*" element={<NotYet />} />
            </Route>
          </Route>

          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminShell />}>
              <Route index element={<AdminDashboard />} />
              <Route path="barbearias" element={<AdminBarbearias />} />
              <Route path="barbearias/:shopId" element={<AdminBarbeariaDetalhe />} />
              <Route path="utilizadores" element={<AdminUtilizadores />} />
              <Route path="planos" element={<AdminPlanos />} />
              <Route path="pagamentos" element={<AdminPagamentos />} />
              <Route path="suporte" element={<AdminSuporte />} />
              <Route path="metricas" element={<AdminMetricas />} />
              <Route path="*" element={<NotYet />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}

function ShortLink() {
  const { slug } = useParams();
  return <Navigate to={`/barbearia/${slug ?? ''}`} replace />;
}
