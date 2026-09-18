import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useShop, type Shop } from '@/lib/shop';
import { humanError } from '@/lib/utils';
import { THEMES, applyTheme, themeVars } from '@/themes';
import { CANCEL_RULES } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Switch, Select, Textarea, ImageUpload } from '@/components/ui/Primitives';

export function useUpdateShop(onDone?: () => void) {
  const { shop, refresh } = useShop();
  return useMutation({
    mutationFn: async (patch: Partial<Shop>) => { const r = await supabase.from('barbershops').update(patch).eq('id', shop!.id); if (r.error) throw r.error; },
    onSuccess: async () => { await refresh(); toast.success('Guardado'); onDone?.(); },
    onError: (e) => toast.error(humanError(e)),
  });
}

export function ProfileForm({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { shop } = useShop();
  const s = shop!;
  const [f, setF] = useState({ name: s.name, description: s.description ?? '', phone: s.phone ?? '', whatsapp: s.whatsapp ?? '', instagram: s.instagram ?? '', address: s.address ?? '', maps_url: s.maps_url ?? '', logo_url: s.logo_url, cover_url: s.cover_url });
  const m = useUpdateShop(onDone);
  const norm = (p: string) => { const d = p.replace(/\D/g, ''); return d ? (d.startsWith('258') ? `+${d}` : `+258${d}`) : null; };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return toast.error('Escreve o nome da barbearia.');
    m.mutate({ name: f.name.trim(), description: f.description.trim() || null, phone: norm(f.phone), whatsapp: norm(f.whatsapp), instagram: f.instagram.replace(/^@/, '').trim() || null, address: f.address.trim() || null, maps_url: f.maps_url.trim() || null, logo_url: f.logo_url, cover_url: f.cover_url });
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={submit} className="space-y-4" data-testid="profile-form">
      <div className="grid grid-cols-[120px_1fr] gap-4">
        <ImageUpload testId="profile-logo-upload" shape="circle" bucket="shop-logos" shopId={s.id} ratio={1} value={f.logo_url} onChange={(u) => setF({ ...f, logo_url: u })} label="Logo" />
        <ImageUpload testId="profile-cover-upload" bucket="shop-photos" shopId={s.id} ratio={16 / 9} value={f.cover_url} onChange={(u) => setF({ ...f, cover_url: u })} label="Capa 16:9" />
      </div>
      <Field data-testid="profile-name-input" label="Nome" name="p_name" value={f.name} onChange={set('name')} />
      <Textarea data-testid="profile-description-input" label="Descrição curta" value={f.description} onChange={set('description')} placeholder="O que faz a tua barbearia diferente, em duas frases." />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field data-testid="profile-phone-input" label="Telemóvel" name="p_phone" type="tel" prefix="+258" value={f.phone.replace(/^\+258/, '')} onChange={set('phone')} placeholder="84 000 0000" />
        <Field data-testid="profile-whatsapp-input" label="WhatsApp" name="p_whatsapp" type="tel" prefix="+258" value={f.whatsapp.replace(/^\+258/, '')} onChange={set('whatsapp')} placeholder="84 000 0000" />
      </div>
      {!compact && (
        <>
          <Field data-testid="profile-instagram-input" label="Instagram" name="p_instagram" prefix="@" value={f.instagram} onChange={set('instagram')} placeholder="abarbearia" />
          <Field data-testid="profile-address-input" label="Morada" name="p_address" value={f.address} onChange={set('address')} placeholder="Av. Julius Nyerere, 123, Maputo" />
          <Field data-testid="profile-maps-input" label="Link do Google Maps" name="p_maps" type="url" value={f.maps_url} onChange={set('maps_url')} placeholder="https://maps.app.goo.gl/..." />
        </>
      )}
      <div className="flex justify-end"><Button data-testid="profile-save-btn" type="submit" loading={m.isPending}>{onDone ? 'Guardar e continuar' : 'Guardar'}</Button></div>
    </form>
  );
}

export function ThemePicker({ onDone }: { onDone?: () => void }) {
  const { shop } = useShop();
  const [sel, setSel] = useState(shop!.theme_key);
  const m = useUpdateShop(onDone);
  const pick = (k: string) => { setSel(k); applyTheme(k); };
  return (
    <div className="space-y-5" data-testid="theme-picker">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {THEMES.map((t) => {
          const v = themeVars(t) as React.CSSProperties;
          const active = sel === t.key;
          return (
            <button key={t.key} type="button" data-testid={`theme-${t.key}`} onClick={() => pick(t.key)} aria-pressed={active}
              className={`text-left rounded-2xl overflow-hidden border transition-colors ${active ? 'border-accent-soft' : 'border-white/10 hover:border-white/25'}`} style={v}>
              <div className="aspect-[4/3] p-3 relative" style={{ background: `radial-gradient(120% 80% at 50% 100%, ${t.glowA} 0%, transparent 60%), #000` }}>
                <div className="glass !rounded-xl h-full p-2.5 flex flex-col justify-between" style={{ boxShadow: 'none' }}>
                  <div className="flex gap-1.5"><span className="h-2 w-8 rounded-full" style={{ background: t.accentSoft }} /><span className="h-2 w-5 rounded-full bg-white/15" /></div>
                  <span className="h-6 w-16 rounded-lg grid place-items-center text-[9px] font-medium" style={{ background: t.accentSoft, color: t.accentInk }}>Marcar</span>
                </div>
              </div>
              <div className="px-3 py-2 flex items-center justify-between"><span className="text-xs">{t.name}</span>{active && <span className="h-1.5 w-1.5 rounded-full bg-accent-soft" />}</div>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end"><Button data-testid="theme-save-btn" loading={m.isPending} onClick={() => m.mutate({ theme_key: sel })}>{onDone ? 'Guardar e continuar' : 'Guardar tema'}</Button></div>
    </div>
  );
}

export function RulesForm({ onDone }: { onDone?: () => void }) {
  const { shop } = useShop();
  const s = shop!;
  const [f, setF] = useState({ slot: String(s.slot_interval_min), lead: String(s.min_lead_time_min), advance: String(s.max_advance_days), rule: s.cancellation_rule });
  const m = useUpdateShop(onDone);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const slot = parseInt(f.slot, 10), lead = parseInt(f.lead, 10), adv = parseInt(f.advance, 10);
    if (![5, 10, 15, 20, 30, 60].includes(slot)) return toast.error('Intervalo entre 5 e 60 minutos.');
    if (!(lead >= 0 && lead <= 1440)) return toast.error('Antecedência mínima entre 0 e 1440 minutos.');
    if (!(adv >= 1 && adv <= 180)) return toast.error('Antecedência máxima entre 1 e 180 dias.');
    m.mutate({ slot_interval_min: slot, min_lead_time_min: lead, max_advance_days: adv, cancellation_rule: f.rule });
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="rules-form">
      <div className="grid sm:grid-cols-3 gap-3">
        <Select data-testid="rules-slot-select" label="Intervalo da grelha" value={f.slot} onChange={(e) => setF({ ...f, slot: e.target.value })}>{[5, 10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>{n} min</option>)}</Select>
        <Field data-testid="rules-lead-input" label="Antecedência mínima (min)" name="r_lead" inputMode="numeric" value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} />
        <Field data-testid="rules-advance-input" label="Marcar até (dias)" name="r_adv" inputMode="numeric" value={f.advance} onChange={(e) => setF({ ...f, advance: e.target.value })} />
      </div>
      <div>
        <span className="t-label text-ink-mid mb-2 block">Regra de cancelamento e remarcação</span>
        <div className="grid sm:grid-cols-2 gap-2">
          {CANCEL_RULES.map((r) => (
            <button key={r.value} type="button" data-testid={`rule-${r.value}`} onClick={() => setF({ ...f, rule: r.value })} aria-pressed={f.rule === r.value}
              className={`text-left rounded-2xl border p-4 transition-colors ${f.rule === r.value ? 'border-accent-soft bg-accent/10' : 'border-white/10 hover:border-white/25'}`}>
              <p className="text-sm font-medium">{r.label}</p><p className="t-label text-ink-mid mt-0.5">{r.body}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end"><Button data-testid="rules-save-btn" type="submit" loading={m.isPending}>{onDone ? 'Guardar e continuar' : 'Guardar regras'}</Button></div>
    </form>
  );
}

export function DepositForm() {
  const { shop } = useShop();
  const s = shop!;
  const [f, setF] = useState({ enabled: s.deposit_enabled, mode: s.deposit_mode, value: String(s.deposit_mode === 'fixed' ? s.deposit_value / 100 : s.deposit_value), hold: String(s.deposit_hold_min) });
  const m = useUpdateShop();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(f.value.replace(',', '.')), hold = parseInt(f.hold, 10);
    if (f.mode === 'percent' && !(v > 0 && v <= 100)) return toast.error('Percentagem entre 1 e 100.');
    if (f.mode === 'fixed' && !(v > 0)) return toast.error('Valor do sinal tem de ser maior que zero.');
    if (!(hold >= 5 && hold <= 120)) return toast.error('Tempo de reserva entre 5 e 120 minutos.');
    m.mutate({ deposit_enabled: f.enabled, deposit_mode: f.mode, deposit_value: f.mode === 'fixed' ? Math.round(v * 100) : Math.round(v), deposit_hold_min: hold });
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-testid="deposit-form">
      <Switch testId="deposit-enabled-switch" checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} label="Pedir sinal nos serviços marcados como 'exige sinal'" />
      <div className={`grid sm:grid-cols-3 gap-3 ${!f.enabled && 'opacity-50 pointer-events-none'}`}>
        <Select data-testid="deposit-mode-select" label="Tipo" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as 'percent' | 'fixed' })}><option value="percent">Percentagem do preço</option><option value="fixed">Valor fixo</option></Select>
        <Field data-testid="deposit-value-input" label={f.mode === 'percent' ? 'Percentagem (%)' : 'Valor (MT)'} name="d_value" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        <Field data-testid="deposit-hold-input" label="Reserva sem pagar (min)" name="d_hold" inputMode="numeric" value={f.hold} onChange={(e) => setF({ ...f, hold: e.target.value })} hint="Passado este tempo, a marcação é cancelada." />
      </div>
      <p className="t-body text-ink-mid">Depois de configurar M-Pesa ou e-Mola em Pagamentos, o cliente poderá pagar o sinal no próprio link da marcação. Sem provider configurado, o sinal continua pendente até à operação da barbearia.</p>
      <div className="flex justify-end"><Button data-testid="deposit-save-btn" type="submit" loading={m.isPending}>Guardar sinal</Button></div>
    </form>
  );
}
