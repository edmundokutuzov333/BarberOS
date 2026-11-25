// Single source of truth for UI prompts and exact server routing.
const entries={
 overview:[['Quantas marcações temos hoje?','today'],['O que merece a minha atenção?','priorities','next'],['Como está o negócio neste período?','summary']],
 agenda:[['Como posso aumentar a ocupação da agenda?','agenda_summary','next'],['Qual é a taxa de faltas?','noshow'],['Como está a próxima semana?','week']],
 finance:[['Como evoluíram as receitas?','revenue','compare'],['Qual foi o ticket médio?','ticket'],['Quanto em comissões?','commission']],
 customers:[['Quantos clientes visitaram nos últimos 30 dias?','customer_activity'],['Quantos clientes não visitaram nos últimos 30 dias?','customer_absent'],['Como posso melhorar a fidelização de clientes?','customer_absent','next']],
 team:[['Como está a ocupação da equipa?','team_occupancy'],['Quantos atendimentos fez cada barbeiro?','team_completed'],['Quais são as comissões da equipa?','team_commission']],
 stock:[['Quais produtos devo repor?','inventory'],['Quais produtos têm stock baixo?','inventory'],['Qual é a margem conhecida da loja?','store_margin']],
 communications:[['Existem notificações falhadas?','notifications'],['Prepare uma confirmação de marcação.','draft_confirmation'],['Prepare uma resposta a feedback.','draft_feedback']],
 marketing:[['Que dias são melhores para campanhas?','campaign','next'],['Prepare um texto para uma campanha.','campaign_copy'],['Prepare uma mensagem de retorno.','draft_return']],
 setup:[['O que falta configurar?','setup'],['Como verifico a configuração?','setup','next'],['Qual é o progresso do onboarding?','setup']]
};
export const quickPrompts=Object.freeze(Object.fromEntries(Object.entries(entries).map(([topic,items])=>[topic,Object.freeze(items.map(([question])=>question))])));
export function resolveQuick(topic,question){
 if(!Object.hasOwn(entries,topic)||typeof question!=='string')return null;
 const item=entries[topic].find(([q])=>q===question.trim());
 return item?{topic,target:item[1],intent:item[2]??'summary',recognized:true}:null;
}
