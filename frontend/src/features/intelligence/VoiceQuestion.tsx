import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { MAX_AUDIO_BYTES, transcribeQuestion } from './api';

type Status='idle'|'starting'|'recording'|'review'|'uploading';
export default function VoiceQuestion({shopId,disabled,onText,onBusy,compact=false}:{shopId:string;disabled:boolean;onText:(text:string)=>void;onBusy:(busy:boolean)=>void;compact?:boolean}){
 const [status,setStatus]=useState<Status>('idle'),[error,setError]=useState(''),[preview,setPreview]=useState<string|null>(null);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),audio=useRef<Blob|null>(null),active=useRef(true),locked=useRef(false),url=useRef<string|null>(null);
 const supported=typeof MediaRecorder!=='undefined'&&!!navigator.mediaDevices?.getUserMedia;
 useEffect(()=>{onBusy(status!=='idle');return()=>onBusy(false)},[status,onBusy]);
 const release=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null};
 const clearAudio=()=>{audio.current=null;if(url.current)URL.revokeObjectURL(url.current);url.current=null};
 useEffect(()=>{active.current=true;return()=>{active.current=false;const r=recorder.current;if(r){r.onstop=null;r.ondataavailable=null;r.onerror=null;if(r.state!=='inactive'){try{r.stop()}catch{/* already released */}}}release();clearAudio()}},[]);
 const discard=()=>{const r=recorder.current;if(r){r.onstop=null;r.ondataavailable=null;r.onerror=null;if(r.state!=='inactive'){try{r.stop()}catch{/* already released */}}}recorder.current=null;release();clearAudio();locked.current=false;setPreview(null);setError('');setStatus('idle')};
 const stop=()=>{const r=recorder.current;if(r?.state==='recording')r.stop();release()};
 async function start(){
  if(!supported||disabled||status!=='idle'||locked.current)return;locked.current=true;setError('');setStatus('starting');
  try{
   const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
   if(!active.current){s.getTracks().forEach(t=>t.stop());return}stream.current=s;
   const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
   if(!mime)throw Error('unsupported');
   const r=new MediaRecorder(s,{mimeType:mime,audioBitsPerSecond:64000});recorder.current=r;const chunks:Blob[]=[];let size=0,limit=false;
   r.ondataavailable=e=>{if(!e.data.size||limit)return;size+=e.data.size;if(size>MAX_AUDIO_BYTES){limit=true;if(r.state==='recording')r.stop();release();return}chunks.push(e.data)};
   r.onerror=()=>{r.onstop=null;r.ondataavailable=null;if(r.state!=='inactive'){try{r.stop()}catch{/* device released */}}release();if(active.current){setError('Não foi possível gravar. Tente novamente ou escreva a pergunta.');locked.current=false;setStatus('idle')}};
   r.onstop=()=>{release();if(!active.current)return;locked.current=false;const b=new Blob(chunks,{type:r.mimeType.split(';')[0]});if(limit||!b.size){setError(limit?'O áudio excedeu o tamanho máximo de 8 MiB. Grave em partes para não perder conteúdo.':'Gravação vazia. Tente novamente.');setStatus('idle');return}audio.current=b;url.current=URL.createObjectURL(b);setPreview(url.current);setStatus('review')};
   r.start(1000);setStatus('recording'); // No time-based automatic stop.
  }catch{release();if(active.current){locked.current=false;setStatus('idle');setError('Microfone indisponível. Verifique as permissões ou escreva a pergunta.')}}
 }
 async function send(){
  const b=audio.current;if(!b||disabled||locked.current||status!=='review')return;locked.current=true;setStatus('uploading');setError('');
  try{const bytes=new Uint8Array(await b.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const r=await transcribeQuestion(shopId,btoa(binary),b.type);if(active.current){clearAudio();setPreview(null);setStatus('idle');onText(r.text)}}
  catch(e){if(active.current){setStatus('review');setError(e instanceof Error&&e.message==='VOICE_QUOTA'?'Limite gratuito de transcrições atingido. Pode ouvir ou descartar a gravação.':'Não foi possível transcrever. A gravação continua disponível para ouvir ou tentar novamente.')}}
  finally{locked.current=false}
 }
 if(!supported)return null;
 return <div className={compact?'bi-voice-compact':'bi-voice-expanded'} data-status={status}>
 <button className="bi-voice-trigger" type="button" aria-label={status==='recording'?'Terminar gravação':'Gravar pergunta'} title={status==='recording'?'Terminar gravação':'Gravar pergunta'} disabled={status!=='recording'&&(disabled||status!=='idle')} onClick={()=>status==='recording'?stop():void start()}>{status==='recording'?<Square size={18} fill="currentColor"/>:status==='uploading'||status==='starting'?<LoaderCircle size={20} className="bi-spin"/>:<Mic size={20}/>}</button>
 {(status!=='idle'||error)&&<div className="bi-voice-popover" role="group" aria-label="Ditado de pergunta">
 <div className="bi-voice-heading"><Mic size={17} aria-hidden="true"/><strong>{status==='recording'?'A gravar':status==='review'?'Rever gravação':status==='uploading'?'A transcrever':'Microfone'}</strong></div>
 {status==='starting'&&<p role="status">A solicitar acesso ao microfone…</p>}
 {status==='recording'&&<><div className="bi-recording-status" role="status"><span className="bi-recording-dot"/>Fale à vontade. Termine quando quiser.</div><Button type="button" size="sm" variant="secondary" onClick={stop}><Square size={15}/> Terminar</Button><Button type="button" variant="ghost" size="sm" onClick={discard}><Trash2 size={15}/> Cancelar</Button></>}
 {status==='review'&&<>{preview&&<audio src={preview} controls preload="metadata" aria-label="Ouvir gravação"/>}<p className="bi-message">Confirme o envio para transcrever na Groq. Não inclua dados pessoais.</p><Button type="button" size="sm" variant="primary" disabled={disabled} onClick={()=>void send()}><Send size={15}/> Enviar áudio à Groq e transcrever</Button><Button type="button" size="sm" variant="ghost" onClick={discard}><Trash2 size={15}/> Descartar áudio</Button></>}
 {status==='uploading'&&<p role="status">A converter a gravação em texto. Pode rever a pergunta antes de consultar a IA.</p>}
 {error&&<p role="alert" className="bi-message">{error}</p>}
 {status==='idle'&&error&&<Button type="button" variant="ghost" size="sm" onClick={()=>setError('')}>Fechar</Button>}
 </div>}
 </div>
}
