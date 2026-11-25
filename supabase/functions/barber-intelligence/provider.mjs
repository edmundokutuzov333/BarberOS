// Only enumerated topics and coarse, non-identifying signals leave the tenant boundary.
const MODEL='openai/gpt-oss-20b';
const subjects={overview:'gestão diária',agenda:'organização de horários',finance:'controlo de receitas sem confundir lucro',customers:'fidelização com consentimento',team:'organização da equipa',stock:'inventário',communications:'comunicação profissional',marketing:'marketing orgânico',setup:'configuração inicial'};
const modules={overview:'painel, relatórios e prioridades',agenda:'Agenda, Horários, Lista de espera e Notificações',finance:'Relatórios, comissões históricas e custos conhecidos',customers:'Clientes, histórico e consentimento para contactos',team:'Relatórios de capacidade e horários da equipa',stock:'Loja, movimentos de inventário e reposição indicativa',communications:'Comunicações, notificações e rascunhos Gmail',marketing:'Planeamento da próxima semana e proposta de campanha',setup:'Configuração da barbearia e progresso de onboarding'};
const signals={empty:'histórico de marcações vazio',capacity:'capacidade subaproveitada',busy:'ocupação elevada',noshow:'faltas recorrentes',wait:'clientes em espera',revenue:'receita estimada em queda',growth:'receita estimada em crescimento',return:'oportunidade de rever retorno de clientes',stock:'stock baixo',notify:'notificações falhadas',team:'diferença de ocupação entre profissionais',campaign:'oportunidade de preencher horários',setup:'equipa por configurar'};
export function cloudEnabled(env){return env('BARBEROS_AI_GROQ_FREE_CONFIRMED')==='true'&&Boolean(env('BARBEROS_AI_GROQ_KEY')?.trim())}
export function credentialFromVault(value){return value?.free_confirmed===true&&typeof value.key==='string'&&value.key.trim().length>20?value.key.trim():null}
export function freeTierHeaders(headers){return headers?.get('x-ratelimit-limit-requests')==='1000'&&headers?.get('x-ratelimit-limit-tokens')==='8000'}
export async function genericAdvice(topic,key,fetcher=fetch,insightIds=[]){
  if(!Object.hasOwn(subjects,topic)||!key)return null;
  const safe=[...new Set(Array.isArray(insightIds)?insightIds:[])].filter(id=>typeof id==='string'&&Object.hasOwn(signals,id)).slice(0,5).map(id=>signals[id]);
  try{
    const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:'És um assistente de gestão de barbearias. Responde em português de Moçambique. Dá até três recomendações práticas e específicas para o tema e sinais qualitativos apresentados. Usa os módulos indicados do BarberOS e não sugiras substituir a plataforma por quadros, folhas de cálculo ou ferramentas externas. Não inventes números, nomes, preços, horários, funcionalidades ou factos. Não sugiras durações ou descontos concretos. Não prometas acções executadas. Não peças dados pessoais. Escreve em texto simples, sem Markdown, em português europeu usado em Moçambique.'},{role:'user',content:'Tema: '+subjects[topic]+'. Módulos disponíveis: '+modules[topic]+'. Sinais operacionais: '+(safe.length?safe.join('; '):'sem sinais adicionais')+'. Sugere próximos passos.'}],max_completion_tokens:450,reasoning_effort:'low',temperature:0.2})});
    // A changed limit signature is not accepted as free-tier evidence. No retry or paid fallback.
    if(!response.ok||!freeTierHeaders(response.headers))return null;
    const data=await response.json();
    const answer=data?.choices?.[0]?.message?.content;
    return data?.model===MODEL&&typeof answer==='string'&&answer.trim().length>0?answer.trim().replace(/\*\*/g,'').slice(0,2200):null;
  }catch{return null}
}
