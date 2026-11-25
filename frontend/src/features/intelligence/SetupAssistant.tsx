import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {Sparkles} from 'lucide-react';
import {Button} from '@/components/ui/Button';
import {loadSetupGuide,type SetupQuestion} from './api';
const questions:[SetupQuestion,string][]=[['what','O que devo fazer?'],['why','Porquê este passo?'],['verify','Como posso verificar?']];
export default function SetupAssistant({shopId,step}:{shopId:string;step:number}){
 const [open,setOpen]=useState(false);
 const guide=useMutation({mutationFn:(question:SetupQuestion)=>loadSetupGuide(shopId,step,question),retry:false});
 return <aside className="mt-5 rounded-2xl border border-white/10 p-3 space-y-3" data-testid="setup-assistant">
 <Button variant="secondary" size="sm" type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Sparkles size={15}/> Ajuda inteligente de configuração</Button>
 {open&&<><p className="t-body text-ink-mid">Escolha uma pergunta sobre este passo. A ajuda não altera nem valida automaticamente a configuração.</p><div className="flex flex-wrap gap-2">{questions.map(([id,label])=><Button key={id} variant="secondary" size="sm" type="button" disabled={guide.isPending} onClick={()=>guide.mutate(id)}>{label}</Button>)}</div>
 {guide.isPending&&<p role="status" className="t-label text-ink-mid">A consultar…</p>}
 {guide.isError&&<p role="alert" className="t-label text-ink-mid">Não foi possível consultar a ajuda. Pode continuar normalmente.</p>}
 {guide.data&&<div aria-live="polite" className="space-y-2"><p className="t-label text-accent-soft">{guide.data.title} · progresso registado {guide.data.progress}/9</p><p className="t-body text-ink-hi">{guide.data.answer}</p></div>}</>}
 </aside>
}
