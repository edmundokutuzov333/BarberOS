import { Layers, Settings, ConciergeBell, BarChart3, Users, Megaphone, ShoppingBag, type LucideIcon } from 'lucide-react';
import type { Topic } from './api';
const nodes:{label:string;topic:Topic;icon:LucideIcon;x:number;y:number}[]=[
 {label:'Gestão',topic:'overview',icon:Layers,x:50,y:10},
 {label:'Operações',topic:'agenda',icon:Settings,x:19,y:28},
 {label:'Recepção',topic:'communications',icon:ConciergeBell,x:81,y:28},
 {label:'Analytics',topic:'finance',icon:BarChart3,x:15,y:62},
 {label:'Clientes',topic:'customers',icon:Users,x:85,y:62},
 {label:'Marketing',topic:'marketing',icon:Megaphone,x:28,y:88},
 {label:'Loja',topic:'stock',icon:ShoppingBag,x:72,y:88}
];
export default function IntelligenceHub({topic,disabled,onSelect}:{topic:Topic;disabled:boolean;onSelect:(topic:Topic)=>void}){
 return <div className="bi-hub" data-testid="intelligence-hub">
  <div className="bi-orbit-lines" aria-hidden="true"/>
  <svg className="bi-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{nodes.map(node=><line key={node.topic} x1="50" y1="52" x2={node.x} y2={node.y} vectorEffect="non-scaling-stroke"/>)}</svg>
  <div className="bi-core" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" className="bi-core-star"><path d="M32 1 40 24 63 32 40 40 32 63 24 40 1 32 24 24 32 1Z" fill="currentColor"/></svg><strong>BARBEROS</strong><span>INTELLIGENCE</span></div>
  <div className="bi-nodes">{nodes.map(({label,topic:t,icon:Icon,x,y})=><button className="bi-node" key={t} style={{left:x+'%',top:y+'%'}} type="button" disabled={disabled} aria-pressed={topic===t} onClick={()=>onSelect(t)}><Icon size={24} aria-hidden="true"/><span>{label}</span></button>)}</div>
 </div>
}
