import { Link } from 'react-router-dom';
import { ArrowUpRight, QrCode, CalendarClock, BellRing, Check, Scissors } from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth';

const POINTS = [
  { icon: QrCode, index: '01', title: 'Marcação em poucos passos', body: 'O cliente lê o QR no espelho, escolhe corte, barbeiro e hora. Sem conta, sem app.' },
  { icon: CalendarClock, index: '02', title: 'Agenda que não falha', body: 'Disponibilidade calculada no servidor. Dois clientes nunca ficam no mesmo horário.' },
  { icon: BellRing, index: '03', title: 'Menos faltas', body: 'Lembretes por WhatsApp e lista de espera automática ajudam a reduzir faltas e aproveitar horários vagos.' },
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <Page testId="landing-page" className="barber-shell barber-page landing-page min-h-screen">
      
      <header className="landing-nav max-w-7xl mx-auto px-5 sm:px-8">
        <Link to="/" ><Brand size="md" /></Link>
        <nav className="flex items-center gap-2" aria-label="Navegação principal">
          <a className="landing-nav-link hidden sm:inline-flex" href="#funcionalidades">Funcionalidades</a>
          <Link className="landing-nav-link hidden sm:inline-flex" to="/barbearia/oryon">Demonstração</Link>
          {user ? (
            <Link to="/app"><Button data-testid="landing-open-app-btn" size="sm" pill>Abrir painel <ArrowUpRight size={14} /></Button></Link>
          ) : (
            <>
              <Link to="/entrar"><Button data-testid="landing-login-btn" variant="ghost" size="sm" pill>Entrar</Button></Link>
              <Link to="/registar"><Button data-testid="landing-register-btn" size="sm" pill>Criar conta <ArrowUpRight size={14} /></Button></Link>
            </>
          )}
        </nav>
      </header>
      <main>
        <section className="landing-hero max-w-7xl mx-auto px-5 sm:px-8">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow"><span className="landing-eyebrow-line" /> GESTÃO DE BARBEARIA, COM OUTRA PRESENÇA</p>
            <h1 className="landing-title">A barbearia controla o dia.<span> O cliente marca em segundos.</span></h1>
            <p className="landing-lead">Uma experiência premium para quem corta, atende e gere. Página pública, agenda por barbeiro, lembretes e lista de espera, num único sistema feito para o dia-a-dia da tua barbearia.</p>
            <div className="landing-hero-actions">
              <Link to={user ? '/app' : '/registar'}><Button data-testid="landing-cta-btn" size="lg" pill>Começar grátis <ArrowUpRight size={16} /></Button></Link>
              <Link to="/barbearia/oryon"><Button data-testid="landing-demo-btn" variant="secondary" size="lg" pill>Explorar demonstração</Button></Link>
            </div>
            <div className="landing-proof"><span className="landing-proof-mark"><Check size={13} /></span><span>Feito para operações reais, não para folhas de cálculo.</span></div>
          </div>
          <div className="landing-visual">
            <div className="landing-visual-frame">
              <img src="https://images.pexels.com/photos/17027433/pexels-photo-17027433.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=1100" alt="Interior de barbearia com cadeiras e iluminação quente" className="landing-visual-image" fetchPriority="high" decoding="async" />
              <div className="landing-visual-shade" aria-hidden="true" />
              <div className="landing-visual-index"><span>BARBEROS</span><span>01 / 03</span></div>
              <div className="landing-visual-caption"><p>OPERAÇÃO, COM IDENTIDADE</p><h2>Mais tempo para o corte.<br />Mais controlo sobre o negócio.</h2></div>
            </div>
            <div className="landing-visual-note">
              <span className="landing-note-icon"><Scissors size={17} /></span>
              <div><strong>A agenda da equipa.</strong><span>Organizada, acessível e pronta para marcar.</span></div>
              <span className="landing-note-status" aria-hidden="true"><span /></span>
            </div>
          </div>
        </section>
        <section className="landing-trust-strip max-w-7xl mx-auto px-5 sm:px-8" aria-label="Princípios do sistema">
          <span>DESENHADO PARA O RITMO REAL</span><i aria-hidden="true" /><span>MARCAÇÕES SEM CONTA</span><i aria-hidden="true" /><span>AGENDA POR BARBEIRO</span><i aria-hidden="true" /><span>WHATSAPP E LISTA DE ESPERA</span>
        </section>
        <section id="funcionalidades" className="landing-features max-w-7xl mx-auto px-5 sm:px-8">
          <header className="landing-section-heading">
            <p className="landing-section-kicker">O SISTEMA, DE PONTA A PONTA</p>
            <h2>Menos fricção.<br /><span>Mais foco no teu trabalho.</span></h2>
            <p>As tarefas essenciais da barbearia ligadas entre si, da primeira marcação ao fecho do dia.</p>
          </header>
          <div className="landing-feature-grid">{POINTS.map((point) => (
            <article key={point.title} className="landing-feature glass">
              <div className="landing-feature-top"><span>{point.index}</span><point.icon size={19} strokeWidth={1.7} aria-hidden="true" /></div>
              <h3>{point.title}</h3><p>{point.body}</p><span className="landing-feature-line" aria-hidden="true" />
            </article>
          ))}</div>
        </section>
        <section className="landing-cta-wrap max-w-7xl mx-auto px-5 sm:px-8">
          <div className="landing-cta-panel">
            <div className="landing-cta-emblem" aria-hidden="true"><Scissors size={22} strokeWidth={1.4} /></div>
            <div className="landing-cta-copy"><p className="landing-section-kicker">A PRÓXIMA MARCAÇÃO COMEÇA AQUI</p><h2>O teu negócio merece um sistema à altura.</h2><p>Configura os serviços, a equipa e os horários. O BarberOS liga a tua presença online à operação diária.</p></div>
            <div className="landing-cta-actions"><Link to={user ? '/app' : '/registar'}><Button size="lg" pill>{user ? 'Abrir painel' : 'Criar a minha conta'} <ArrowUpRight size={16} /></Button></Link><Link to="/barbearia/oryon" className="landing-quiet-link">Ver página pública</Link></div>
          </div>
        </section>
      </main>
      <footer className="landing-footer max-w-7xl mx-auto px-5 sm:px-8"><Brand size="sm" /><span>Gestão de barbearias · Moçambique</span><a href="#funcionalidades">Funcionalidades <ArrowUpRight size={13} /></a></footer>
    </Page>
  );
}
