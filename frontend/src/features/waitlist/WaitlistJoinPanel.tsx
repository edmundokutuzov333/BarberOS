import { useEffect, useState } from 'react';
import { BellRing, Check, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/States';
import { humanError } from '@/lib/utils';
import { normalizeMozPhone } from '@/features/booking/api';
import { useJoinWaitlist } from './api';

type Props = {
  slug: string;
  serviceId: string;
  haircutId?: string | null;
  barberId?: string | null;
  date: string;
  maxDate: string;
};

const periods = [
  { value: 'any', label: 'Qualquer hora' },
  { value: 'morning', label: 'Manhã' },
  { value: 'afternoon', label: 'Tarde' },
  { value: 'evening', label: 'Noite' },
];

function validPhone(value: string): boolean {
  const normalized = normalizeMozPhone(value).replace(/\s+/g, '');
  return /^\+2588[2-7]\d{7}$/.test(normalized);
}

function validEmail(value: string): boolean {
  return !value || (value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

export function WaitlistJoinPanel({ slug, serviceId, haircutId, barberId, date, maxDate }: Props) {
  const join = useJoinWaitlist();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dateFrom, setDateFrom] = useState(date);
  const [dateTo, setDateTo] = useState(date);
  const [period, setPeriod] = useState('any');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    setDateFrom(date);
    setDateTo(date);
    setJoined(false);
  }, [date]);

  const submit = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      toast.error('Introduza o seu nome.');
      return;
    }
    if (!validPhone(phone)) {
      toast.error('Use um número móvel de Moçambique.');
      return;
    }
    if (!validEmail(cleanEmail)) {
      toast.error('Indica um email válido.');
      return;
    }
    if (dateTo < dateFrom) {
      toast.error('A data final deve ser igual ou posterior à inicial.');
      return;
    }

    try {
      await join.mutateAsync({
        slug,
        serviceId,
        customerName: cleanName,
        phone: normalizeMozPhone(phone),
        haircutId,
        barberId,
        email: cleanEmail || null,
        dateFrom,
        dateTo,
        period,
      });
      setJoined(true);
      toast.success('Entrou na lista de espera.');
    } catch (error) {
      toast.error(humanError(error));
    }
  };

  if (joined) {
    return (
      <Panel testId="waitlist-joined-panel">
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 rounded-2xl bg-accent-soft/15 border border-accent-soft/20 grid place-items-center text-accent-soft">
            <Check size={17} />
          </span>
          <div>
            <p className="t-card text-ink-hi">Está na lista de espera</p>
            <p className="t-body text-ink-mid mt-1">
              Quando uma vaga compatível for libertada, o primeiro cliente elegível recebe uma oferta temporária.
            </p>
            <p className="t-label text-ink-lo mt-3">A oferta dura 15 minutos.</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Entrar na lista de espera"
      aside={<BellRing size={17} className="text-accent-soft" aria-hidden />}
      testId="waitlist-join-panel"
    >
      <p className="t-body text-ink-mid mb-5">
        Não há horários livres para esta data. Deixe os seus dados e recebemos uma vaga quando alguém cancelar ou remarcar.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block"><span className="t-label text-ink-mid block mb-1.5">Nome</span><input className="field" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} data-testid="waitlist-name" autoComplete="name" /></label>
        <label className="block"><span className="t-label text-ink-mid block mb-1.5">Telefone</span><input className="field" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={20} placeholder="84 000 0000" data-testid="waitlist-phone" autoComplete="tel" /></label>
        <label className="block"><span className="t-label text-ink-mid block mb-1.5">Email (opcional)</span><input className="field" value={email} onChange={(event) => setEmail(event.target.value)} inputMode="email" maxLength={254} data-testid="waitlist-email" autoComplete="email" /></label>
        <label>
          <span className="t-label text-ink-mid block mb-1.5">Período</span>
          <select className="field w-full" value={period} onChange={(event) => setPeriod(event.target.value)} data-testid="waitlist-period">
            {periods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block"><span className="t-label text-ink-mid block mb-1.5">A partir de</span><input type="date" className="field" value={dateFrom} min={date} max={maxDate} onChange={(event) => {
            const value = event.target.value;
            setDateFrom(value);
            if (value > dateTo) setDateTo(value);
          }} data-testid="waitlist-date-from" /></label>
        <label className="block"><span className="t-label text-ink-mid block mb-1.5">Até</span><input type="date" className="field" value={dateTo} min={dateFrom || date} max={maxDate} onChange={(event) => setDateTo(event.target.value)} data-testid="waitlist-date-to" /></label>
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4 flex items-start gap-3">
        <Clock3 size={16} className="text-accent-soft mt-0.5" aria-hidden />
        <p className="t-label text-ink-mid">
          A fila é por ordem de entrada. Quando uma vaga compatível aparecer, uma única pessoa recebe a oportunidade durante 15 minutos.
        </p>
      </div>

      {join.error && <p className="t-body text-st-noshow mt-4" role="alert">{humanError(join.error)}</p>}

      <div className="flex justify-end mt-5">
        <Button loading={join.isPending} onClick={() => void submit()} data-testid="waitlist-join-btn">
          Entrar na fila
        </Button>
      </div>
    </Panel>
  );
}
