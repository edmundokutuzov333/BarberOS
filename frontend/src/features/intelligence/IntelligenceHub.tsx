import type { Topic } from './api';
import { managementTopics } from './topics';
export default function IntelligenceHub({topic,disabled,onSelect}:{topic:Topic;disabled:boolean;onSelect:(topic:Topic)=>void}){
 return <div className="bi-hub" data-testid="intelligence-hub" data-topic={topic}>
  <div className="bi-atmosphere" aria-hidden="true"/>
  <svg className="bi-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{managementTopics.map(node=><line key={node.topic} className={topic===node.topic?'bi-line-active':undefined} x1="50" y1="50" x2={node.x} y2={node.y} vectorEffect="non-scaling-stroke"/>)}</svg>
  <div className="bi-core" aria-label="BarberOS Intelligence"><div className="bi-core-rim" aria-hidden="true"/><div className="bi-core-reflection" aria-hidden="true"/><div className="bi-core-wordmark"><strong>BarberOS</strong><span>INTELLIGENCE</span></div></div>
  <div className="bi-nodes" role="group" aria-label="Áreas de inteligência">{managementTopics.map(({label,topic:t,icon:Icon,x,y})=><button className="bi-node" key={t} data-topic={t} style={{left:x+'%',top:y+'%'}} type="button" disabled={disabled} aria-pressed={topic===t} onClick={()=>onSelect(t)}><Icon size={20} aria-hidden="true"/><span>{label}</span></button>)}</div>
 </div>
}
