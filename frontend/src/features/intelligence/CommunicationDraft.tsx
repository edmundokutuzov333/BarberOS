import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { draftKinds, classifyCommunication, loadCommunicationDraft, type DraftKind } from './api';
const labels:Record<DraftKind,string>={confirmation:'Confirmar marcação',reschedule:'Reagendar',acknowledgement:'Acusar recepção',feedback:'Responder a feedback',return:'Convidar a regressar',information:'Responder a pedido de informação'};
export default function CommunicationDraft({shopId,disabled,hasText,onApply,messageText}:{shopId:string;disabled:boolean;hasText:boolean;onApply:(subject:string,body:string)=>void;messageText?:string}){
 const [open,setOpen]=useState(false);
 const [kind,setKind]=useState<DraftKind>('acknowledgement');
 const classify=useMutation({mutationFn:()=>classifyCommunication(shopId,messageText??''),retry:false,onSuccess:r=>{draft.reset();setKind(r.kind)}});
 const draft=useMutation({mutationFn:(purpose:DraftKind)=>loadCommunicationDraft(shopId,purpose),retry:false});
 return <div className="rounded-xl border border-white/10 p-3 space-y-3"><Button type="button" size="sm" variant="secondary" disabled={disabled} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Sparkles size={15}/> Assistente de escrita</Button>
 {open&&<><p className="t-body text-ink-mid">Escolha a finalidade. O servidor prepara um modelo editável. A identificação opcional da finalidade usa regras no BarberOS, sem enviar emails a fornecedores de IA.</p>
 {messageText?.trim()&&<><Button type="button" size="sm" variant="secondary" disabled={disabled||draft.isPending} loading={classify.isPending} onClick={()=>classify.mutate()}>Identificar finalidade da última mensagem</Button>{classify.data&&<p role="status" className="t-label text-ink-mid">{classify.data.ambiguous?'Finalidade incerta. Confirme manualmente.':'Finalidade sugerida. Confirme antes de preparar o rascunho.'}</p>}{classify.isError&&<p role="alert" className="t-label text-ink-mid">Não foi possível identificar a finalidade.</p>}</>}
 <label className="t-label text-ink-mid block">Finalidade<select className="field mt-1 w-full" value={kind} disabled={disabled||draft.isPending||classify.isPending} onChange={e=>{draft.reset();setKind(e.target.value as DraftKind)}}>{draftKinds.map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
 <Button type="button" size="sm" variant="secondary" disabled={disabled||classify.isPending} loading={draft.isPending} onClick={()=>draft.mutate(kind)}>Preparar rascunho</Button>
 {draft.isError&&<p role="alert" className="t-body text-ink-mid">Não foi possível preparar o texto. Pode continuar a escrever normalmente.</p>}
 {draft.data&&<div className="space-y-2" aria-live="polite"><p className="font-medium text-ink-hi">{draft.data.subject}</p><p className="t-body text-ink-mid whitespace-pre-wrap break-words">{draft.data.body}</p><Button type="button" size="sm" disabled={disabled||hasText} onClick={()=>onApply(draft.data!.subject,draft.data!.body)}>Inserir no rascunho</Button>{hasText&&<p className="t-label text-ink-mid">O texto existente está protegido. Edite ou limpe os campos antes de inserir.</p>}<p className="t-label text-ink-mid">Reveja os detalhes e confirme consentimento quando necessário. O envio continua manual.</p></div>}</>}</div>
}
