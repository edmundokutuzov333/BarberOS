import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { transcribeQuestion } from './api';

export default function VoiceQuestion({shopId,disabled,onText}:{shopId:string;disabled:boolean;onText:(text:string)=>void}){
 const [status,setStatus]=useState<'idle'|'starting'|'recording'|'review'|'uploading'>('idle');
 const [error,setError]=useState('');
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),timer=useRef<number|null>(null),audio=useRef<Blob|null>(null),active=useRef(true);
 const supported=typeof MediaRecorder!=='undefined'&&!!navigator.mediaDevices?.getUserMedia;
 const release=()=>{if(timer.current!==null){window.clearTimeout(timer.current);timer.current=null}stream.current?.getTracks().forEach(t=>t.stop());stream.current=null};
 useEffect(()=>{active.current=true;return()=>{active.current=false;if(recorder.current?.state==='recording'){recorder.current.onstop=null;recorder.current.stop()}release();audio.current=null}},[]);
 const stop=()=>{if(recorder.current?.state==='recording')recorder.current.stop();release()};
 async function start(){
  if(!supported||disabled||status!=='idle')return;setError('');setStatus('starting');
  try{
   const s=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!active.current){s.getTracks().forEach(t=>t.stop());return}stream.current=s;
   const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw Error('unsupported');
   const r=new MediaRecorder(s,{mimeType:mime,audioBitsPerSecond:64000});recorder.current=r;const chunks:Blob[]=[];
   r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   r.onerror=()=>{release();if(active.current){setError('Não foi possível gravar. Pode escrever a pergunta.');setStatus('idle')}};
   r.onstop=()=>{release();if(!active.current)return;const b=new Blob(chunks,{type:r.mimeType.split(';')[0]});if(!b.size||b.size>327680){setError('Gravação vazia ou demasiado grande. Tente novamente.');setStatus('idle');return}audio.current=b;setStatus('review')};
   r.start(250);setStatus('recording');timer.current=window.setTimeout(stop,15000);
  }catch{release();if(active.current){setStatus('idle');setError('Microfone indisponível. Verifique as permissões ou escreva a pergunta.')}}
 }
 async function send(){
  const b=audio.current;if(!b||disabled)return;setStatus('uploading');setError('');
  try{const bytes=new Uint8Array(await b.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const r=await transcribeQuestion(shopId,btoa(binary),b.type);if(active.current)onText(r.text)}
  catch{if(active.current)setError('Não foi possível transcrever. Pode escrever a pergunta ou tentar outra gravação.')}
  finally{audio.current=null;if(active.current)setStatus('idle')}
 }
 if(!supported)return null;
 return <div className="rounded-xl border border-white/10 p-3 space-y-2">
 <p className="t-label text-ink-mid">Ditado opcional: até 15 segundos. Não diga nomes, contactos ou informações privadas. Só ao confirmar o envio é que o áudio segue para a Groq para transcrição.</p>
 <div className="flex flex-wrap gap-2">
 {status==='idle'&&<Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={()=>void start()}><Mic size={15}/> Gravar pergunta</Button>}
 {status==='starting'&&<p role="status">A solicitar microfone…</p>}
 {status==='recording'&&<Button type="button" variant="secondary" size="sm" onClick={stop}><Square size={15}/> Terminar gravação</Button>}
 {status==='review'&&<><Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={()=>void send()}>Enviar áudio à Groq e transcrever</Button><Button type="button" variant="ghost" size="sm" onClick={()=>{audio.current=null;setStatus('idle')}}>Descartar áudio</Button></>}
 {status==='uploading'&&<p role="status">A transcrever…</p>}
 </div>{error&&<p role="alert" className="t-label text-ink-mid">{error}</p>}
 </div>
}
