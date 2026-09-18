import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Page } from '@/components/layout/Page';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { FormError } from '@/pages/auth/Entrar';
import { supabase } from '@/lib/supabase';
import { useShop } from '@/lib/shop';
import { useAuth } from '@/lib/auth';
import { humanError, slugify } from '@/lib/utils';
import { ProfileForm, ThemePicker, RulesForm } from '@/components/config/ShopForms';
import { ServicesEditor } from '@/components/config/ServicesEditor';
import { HaircutsEditor } from '@/components/config/HaircutsEditor';
import { BarbersEditor } from '@/components/config/BarbersEditor';
import { HoursEditor } from '@/components/config/HoursEditor';
import { LinkQr } from '@/components/config/LinkQr';

const STEPS = [
  { title: 'A tua barbearia', body: 'Começa pelo nome. O resto configuras a seguir, ao teu ritmo.' },
  { title: 'Perfil', body: 'Como o cliente te encontra e te reconhece.' },
  { title: 'Tema', body: 'A cor da tua página pública. Podes mudar quando quiseres.' },
  { title: 'Serviços', body: 'Pelo menos um serviço abre a agenda.' },
  { title: 'Cortes', body: 'Semeia o catálogo e junta as tuas fotos depois.' },
  { title: 'Barbeiros', body: 'Quem corta. Cada barbeiro tem a sua coluna na agenda.' },
  { title: 'Horários', body: 'Quando a barbearia abre e fecha.' },
  { title: 'Regras', body: 'Grelha de horários e política de cancelamento.' },
  { title: 'Link e QR', body: 'Partilha o link e imprime o cartaz. Está pronto.' },
];

function CreateShop() {
  const { refresh, setShopId } = useShop();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (name.trim().length < 2) return setErr('Escreve o nome da barbearia.');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return setErr('O endereço só pode ter letras minúsculas, números e hífens.');
    setBusy(true);
    const p = phone.replace(/\D/g, '');
    const { data, error } = await supabase.rpc('create_barbershop', { p_name: name.trim(), p_slug: slug, p_phone: p ? `+258${p}` : null, p_whatsapp: p ? `+258${p}` : null });
    setBusy(false);
    if (error) return setErr(humanError(error));
    setShopId(data as string);
    await refresh();
  };
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field data-testid="onboarding-name-input" label="Nome da barbearia" name="shop_name" required value={name} onChange={(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} placeholder="Ex.: Barbearia Central" />
      <Field data-testid="onboarding-slug-input" label="Endereço público" name="slug" required value={slug} onChange={(e) => { setTouched(true); setSlug(slugify(e.target.value)); }} prefix="/barbearia/" hint={slug ? `${window.location.host}/barbearia/${slug}` : 'Só letras minúsculas, números e hífens'} />
      <Field data-testid="onboarding-phone-input" label="Telemóvel da barbearia" name="shop_phone" type="tel" prefix="+258" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="84 000 0000" hint="Usado no WhatsApp e na página pública. Opcional." />
      <FormError msg={err} />
      <Button data-testid="onboarding-submit-btn" type="submit" loading={busy} full>Criar barbearia</Button>
    </form>
  );
}

export default function Onboarding() {
  const nav = useNavigate();
  const { shop, refresh } = useShop();
  const { signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const step = shop ? Math.min(8, Math.max(1, parseInt(params.get('passo') ?? '', 10) || Math.max(1, shop.onboarding_step))) : 0;
  const go = (n: number) => setParams({ passo: String(n) });

  const advance = useMutation({
    mutationFn: async (next: number) => {
      if (shop && next > shop.onboarding_step) { const r = await supabase.from('barbershops').update({ onboarding_step: next }).eq('id', shop.id); if (r.error) throw r.error; await refresh(); }
      if (next >= 9) nav('/app', { replace: true }); else go(next);
    },
    onError: (e) => toast.error(humanError(e)),
  });
  const next = () => advance.mutate(step + 1);
  const wide = step >= 3 && step <= 6;

  return (
    <Page testId="onboarding-page" className="min-h-screen flex flex-col">
      <header className="h-20 px-5 sm:px-8 flex items-center justify-between">
        <Brand />
        <div className="flex items-center gap-4">
          {shop && <button type="button" data-testid="onboarding-skip" onClick={() => nav('/app')} className="t-label text-ink-mid hover:text-ink-hi transition-colors">Continuar depois</button>}
          <button type="button" data-testid="onboarding-sign-out" onClick={signOut} className="t-label text-ink-mid hover:text-ink-hi transition-colors">Sair</button>
        </div>
      </header>
      <div className="flex-1 flex items-start justify-center px-4 pb-16 pt-2 sm:pt-8">
        <div className={`glass w-full p-6 sm:p-9 transition-[max-width] ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
          <div className="h-0.5 w-full bg-white/5 rounded-full overflow-hidden mb-7" aria-hidden><div data-testid="onboarding-progress" className="h-full bg-accent-soft rounded-full transition-[width] duration-300" style={{ width: `${((step + 1) / 9) * 100}%` }} /></div>
          <div className="flex items-start justify-between gap-4">
            <div><h1 className="t-title">{STEPS[step].title}</h1><p className="t-body text-ink-mid mt-1.5">{STEPS[step].body}</p></div>
            {step > 1 && <button type="button" data-testid="onboarding-back" onClick={() => go(step - 1)} className="t-label text-ink-mid hover:text-ink-hi transition-colors shrink-0">Anterior</button>}
          </div>
          <div className="mt-7" data-testid={`onboarding-step-${step}`}>
            {step === 0 && <CreateShop />}
            {step === 1 && <ProfileForm key={step} compact onDone={next} />}
            {step === 2 && <ThemePicker key={step} onDone={next} />}
            {step === 3 && <ServicesEditor />}
            {step === 4 && <HaircutsEditor />}
            {step === 5 && <BarbersEditor />}
            {step === 6 && <HoursEditor />}
            {step === 7 && <RulesForm key={step} onDone={next} />}
            {step === 8 && <LinkQr onDone={next} />}
            {[3, 4, 5, 6].includes(step) && (
              <div className="flex justify-end mt-6 pt-5 border-t border-white/5">
                <Button data-testid="onboarding-next-btn" loading={advance.isPending} onClick={next}>Continuar</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Page>
  );
}
