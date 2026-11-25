// Only enumerated topics and coarse, non-identifying signals leave the tenant boundary.
const MODEL='openai/gpt-oss-20b';
const subjects={overview:'gestão diária',agenda:'organização de horários',finance:'controlo de receitas sem confundir lucro',customers:'fidelização com consentimento',team:'organização da equipa',stock:'inventário',communications:'comunicação profissional',marketing:'marketing orgânico',setup:'configuração inicial'};
const signals={empty:'histórico de marcações vazio',capacity:'capacidade subaproveitada',busy:'ocupação elevada',noshow:'faltas recorrentes',wait:'clientes em espera',revenue:'receita estimada em queda',growth:'receita estimada em crescimento',return:'oportunidade de rever retorno de clientes',stock:'stock baixo',notify:'notificações falhadas',team:'diferença de ocupação entre profissionais',campaign:'oportunidade de preencher horários',setup:'equipa por configurar'};
export function cloudEnabled(env){return env('BARBEROS_AI_GROQ_FREE_CONFIRMED')==='true'&&Boolean(env('BARBEROS_AI_GROQ_KEY')?.trim())}
export function credentialFromVault(value){return value?.free_confirmed===true&&typeof value.key==='string'&&value.key.trim().length>20?value.key.trim():null}
export function freeTierHeaders(headers){return headers?.get('x-ratelimit-limit-requests')==='1000'&&headers?.get('x-ratelimit-limit-tokens')==='8000'}
export async function genericAdvice(topic,key,fetcher=fetch,insightIds=[]){
  if(!Object.hasOwn(subjects,topic)||!key)return null;
  const safe=[...new Set(Array.isArray(insightIds)?insightIds:[])].filter(id=>typeof id==='string'&&Object.hasOwn(signals,id)).slice(0,5).map(id=>signals[id]);
  try{
    const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'system',content:'És um assistente de gestão de barbearias. Responde em português de Moçambique. Dá até três recomendações práticas e específicas para o tema e sinais qualitativos apresentados. Não inventes números, nomes, preços, horários ou factos, não prometas acções executadas. Não peças dados pessoais. Apenas texto simples.'},{role:'user',content:'Tema: '+subjects[topic]+'. Sinais operacionais: '+(safe.length?safe.join('; '):'sem sinais adicionais')+'. Sugere próximos passos.'}],max_completion_tokens:450,reasoning_effort:'low',temperature:0.2})});
    // A changed limit signature is not accepted as free-tier evidence. No retry or paid fallback.
    if(!response.ok||!freeTierHeaders(response.headers))return null;
    const data=await response.json();
    const answer=data?.choices?.[0]?.message?.content;
    return data?.model===MODEL&&typeof answer==='string'&&answer.trim().length>0?answer.trim().slice(0,2200):null;
  }catch{return null}
}
