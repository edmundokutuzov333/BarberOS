import { Link } from 'react-router-dom';
import { QrCode, CalendarClock, BellRing } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';

const POINTS = [
  { icon: QrCode, title: 'Marcação em 40 segundos', body: 'O cliente lê o QR no espelho, escolhe corte, barbeiro e hora. Sem conta, sem app.' },
  { icon: CalendarClock, title: 'Agenda que não falha', body: 'Disponibilidade calculada no servidor. Dois clientes nunca ficam no mesmo horário.' },
  { icon: BellRing, title: 'Menos faltas', body: 'Lembretes por WhatsApp, lista de espera automática e sinal opcional por M-Pesa.' },
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <Page testId="landing-page" className="min-h-screen">
      <header className="max-w-6xl mx-auto px-5 sm:px-8 h-20 flex items-center justify-between">
        <Brand />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link to="/app"><Button data-testid="landing-open-app-btn" size="sm" pill>Abrir a minha barbearia</Button></Link>
          ) : (
            <>
              <Link to="/entrar"><Button data-testid="landing-login-btn" variant="ghost" size="sm" pill>Entrar</Button></Link>
              <Link to="/registar"><Button data-testid="landing-register-btn" size="sm" pill>Criar conta</Button></Link>
            </>
          )}
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-16 sm:pt-28 pb-20 grid lg:grid-cols-[1.1fr_.9fr] gap-12 items-center">
        <div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-medium tracking-[-0.02em] leading-[1.05] max-w-xl">
            A barbearia controla o dia. O cliente marca em segundos.
          </h1>
          <p className="t-body text-ink-mid mt-6 max-w-md text-base">
            Gestão de marcações para barbearias em Moçambique. Página pública com os teus cortes, agenda por barbeiro, lembretes e lista de espera, tudo no telemóvel.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={user ? '/app' : '/registar'}><Button data-testid="landing-cta-btn" size="lg" pill>Começar grátis</Button></Link>
            <Link to="/barbearia/oryon"><Button data-testid="landing-demo-btn" variant="secondary" size="lg" pill>Ver uma página pública</Button></Link>
          </div>
        </div>

        <div className="glass p-2 overflow-hidden">
          <img
            src="https://images.pexels.com/photos/17027433/pexels-photo-17027433.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
            alt="Interior de barbearia com luz suave"
            className="w-full aspect-[4/3] object-cover rounded-[calc(var(--radius-panel)-.5rem)] opacity-90"
            loading="lazy"
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-5 sm:px-8 pb-24 grid sm:grid-cols-3 gap-4">
        {POINTS.map((p) => (
          <div key={p.title} className="glass p-6">
            <p.icon size={20} className="text-accent-soft" />
            <h2 className="t-card mt-4 text-base md:text-lg">{p.title}</h2>
            <p className="t-body text-ink-mid mt-2">{p.body}</p>
          </div>
        ))}
      </section>

      <footer className="max-w-6xl mx-auto px-5 sm:px-8 pb-10 flex items-center justify-between t-label text-ink-mid">
        <Brand size="sm" />
        <span>Maputo · Africa/Maputo</span>
      </footer>
    </Page>
  );
}
