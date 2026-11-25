import { Layers, Settings, ConciergeBell, BarChart3, Users, Megaphone, ShoppingBag, type LucideIcon } from 'lucide-react';
import type { Topic } from './api';
const nodes:{label:string;topic:Topic;icon:LucideIcon;x:number;y:number}[]=[
 {label:'Gestão',topic:'overview',icon:Layers,x:50,y:9.8},
 {label:'Operações',topic:'agenda',icon:Settings,x:18.8,y:27.6},
 {label:'Recepção',topic:'communications',icon:ConciergeBell,x:81.6,y:27.6},
 {label:'Analytics',topic:'finance',icon:BarChart3,x:14.9,y:60.3},
 {label:'Clientes',topic:'customers',icon:Users,x:85.1,y:60.3},
 {label:'Marketing',topic:'marketing',icon:Megaphone,x:27.6,y:85.2},
 {label:'Loja',topic:'stock',icon:ShoppingBag,x:72.4,y:85.2}
];
export default function IntelligenceHub({topic,disabled,onSelect}:{topic:Topic;disabled:boolean;onSelect:(topic:Topic)=>void}){
 return <div className="bi-hub" data-testid="intelligence-hub" data-topic={topic}>
  <div className="bi-orbit-lines" aria-hidden="true"/><div className="bi-atmosphere" aria-hidden="true"/>
  <svg className="bi-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{nodes.map(node=><line key={node.topic} className={topic===node.topic?'bi-line-active':undefined} x1="50" y1="51.2" x2={node.x} y2={node.y} vectorEffect="non-scaling-stroke"/>)}</svg>
  <div className="bi-core" aria-label="BarberOS Intelligence"><div className="bi-core-rim" aria-hidden="true"/><div className="bi-core-reflection" aria-hidden="true"/><div className="bi-core-wordmark"><strong>BarberOS</strong><span>INTELLIGENCE</span></div></div>
  <div className="bi-nodes">{nodes.map(({label,topic:t,icon:Icon,x,y})=><button className="bi-node" key={t} style={{left:x+'%',top:y+'%'}} type="button" disabled={disabled} aria-pressed={topic===t} onClick={()=>onSelect(t)}><Icon size={24} aria-hidden="true"/><span>{label}</span></button>)}</div>
 </div>
}
