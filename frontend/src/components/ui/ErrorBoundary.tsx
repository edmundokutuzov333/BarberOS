import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  area?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BarberOS] Render error', error, info.componentStack);
  }

  private reset = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const area = this.props.area ? ` em ${this.props.area}` : '';

    return (
      <main
        data-testid="global-error-state"
        className="min-h-[50vh] grid place-items-center px-4 py-10"
        role="alert"
        aria-live="assertive"
      >
        <section className="glass w-full max-w-lg p-7 sm:p-9 text-center">
          <p className="t-label text-st-noshow">Não foi possível continuar</p>
          <h1 className="t-title text-ink-hi mt-2">Ocorreu um erro inesperado</h1>
          <p className="t-body text-ink-mid mt-3">
            Tivemos um problema{area}. O seu trabalho guardado no servidor não é apagado por este erro.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-2">
            <Button data-testid="global-error-reload-btn" onClick={this.reset}>
              Actualizar e tentar de novo
            </Button>
            <a
              data-testid="global-error-home-link"
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--surface-2)] px-5 text-sm text-ink-hi outline-none transition-colors hover:border-[var(--border-strong)] focus-visible:ring-2 focus-visible:ring-accent-soft"
            >
              Ir para o início
            </a>
          </div>
        </section>
      </main>
    );
  }
}
