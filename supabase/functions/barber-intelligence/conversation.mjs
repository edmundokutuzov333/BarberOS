// The model can rank only reviewed actions. Business facts and executable links stay server-owned.
export const actions={
 overview:{review_priorities:'Reveja as prioridades do painel e abra os módulos associados.',review_reports:'Compare períodos completos nos relatórios antes de decidir.',check_setup:'Confirme a configuração de serviços, equipa e horários.'},
 agenda:{review_capacity:'Consulte a Agenda e os Horários para identificar períodos com capacidade por aproveitar.',review_waitlist:'Consulte a Lista de espera e preserve a ordem de ofertas do motor de marcações.',review_reminders:'Verifique lembretes e notificações falhadas antes de alterar o processo de atendimento.',review_week:'Consulte o planeamento da próxima semana e confirme as vagas no motor oficial.'},
 finance:{compare_periods:'Compare receitas estimadas de períodos completos e equivalentes nos Relatórios.',review_services:'Consulte o volume e a contribuição dos serviços sem confundir receita com margem.',review_commission:'Verifique comissões históricas e custos conhecidos antes de interpretar resultados.'},
 customers:{review_history:'Consulte o histórico individual para identificar o ciclo habitual de retorno.',review_consent:'Confirme consentimento e marcações futuras antes de contactar um cliente.',review_preferences:'Consulte serviços e cortes mais frequentes para preparar o atendimento.'},
 team:{review_hours:'Compare horários e capacidade dos profissionais antes de redistribuir trabalho.',review_team:'Compare ocupação e tipo de serviço nos Relatórios, sem classificar automaticamente a qualidade dos profissionais.',review_breaks:'Confirme pausas e disponibilidade no módulo de Horários.'},
 stock:{verify_stock:'Confirme fisicamente as existências e os movimentos registados na Loja.',review_reorder:'Consulte a cobertura indicativa e as sugestões de reposição antes de encomendar.',review_costs:'Verifique custos históricos conhecidos e dados em falta nos relatórios da Loja.'},
 communications:{review_failures:'Consulte notificações falhadas e utilize o reenvio autorizado quando adequado.',review_drafts:'Prepare e reveja o rascunho no módulo de Comunicações antes de enviar.',review_contact:'Confirme destinatário, consentimento e detalhes antes de efectuar qualquer contacto.'},
 marketing:{review_week:'Consulte a ocupação da próxima semana e confirme a disponibilidade real.',review_campaign:'Prepare uma proposta de campanha para períodos tranquilos e reveja o texto antes de publicar.',review_consent:'Confirme consentimento antes de contactar clientes e não invente descontos.'},
 setup:{review_team:'Confirme equipa, serviços e horários no fluxo de configuração.',review_progress:'Consulte o passo seguinte registado no onboarding.',review_profile:'Reveja o perfil público, regras e ligação de marcações.'}
};
export const intents=['summary','explain','next','compare'];
export function resolveIntent(question,selected,contextTopic,topicFor){
 const q=typeof question==='string'?question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim():'';
 const intent=/\b(compar\w*|variac\w*|evoluc\w*|anterior)\b/.test(q)?'compare':/\b(porqu[eê]|por que|explic\w*|motivo|causa)\b/.test(q)?'explain':/\b(como|melhor\w*|proxim\w*|fazer|acao|acoes|recomend\w*|sugest\w*)\b/.test(q)?'next':'summary';
 const explicit=topicFor(q);
 const followup=Boolean(q)&&/^(e\b|entao\b|porqu[eê]\b|por que\b|explic\w*\b|como\b|o que\b|qual\b|quais\b|mais\b|continua\b)/.test(q)&&intent!=='summary';
 const context=typeof contextTopic==='string'&&Object.hasOwn(actions,contextTopic)?contextTopic:null;
 return {topic:explicit??(followup?context:null)??selected,intent,recognized:!q||!!explicit||!!(followup&&context)};
}
export function renderSelection(topic,value){
 if(!Object.hasOwn(actions,topic)||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='first,second,third')return null;
 const ids=[value.first,value.second,value.third].filter(id=>id!=='none');
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!Object.hasOwn(actions[topic],id)))return null;
 return ids.map((id,i)=>(i+1)+'. '+actions[topic][id]).join('\n\n');
}
export function selectionSchema(topic){
 const allowed=['none',...Object.keys(actions[topic])];
 return {type:'json_schema',json_schema:{name:'barberos_recommendations',strict:true,schema:{type:'object',additionalProperties:false,properties:Object.fromEntries(['first','second','third'].map(k=>[k,{type:'string',enum:allowed}])),required:['first','second','third']}}};
}
export function classifyMail(text){
 const q=typeof text==='string'?text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase():'';
 const rules=[
 ['feedback',/\b(reclam\w*|insatisfeit\w*|feedback|elogio|experiencia|queixa)\b/],
 ['reschedule',/\b(reagend\w*|remarc\w*|adiar|alterar (?:a )?marcacao|mudar (?:o )?horario|cancel\w*)\b/],
 ['confirmation',/\b(confirm\w*|marcacao confirmada)\b/],
 ['information',/\b(preco[s]?|quanto custa|informac\w*|horario[s]?|servico[s]?)\b/]
 ];
 const matches=rules.filter(([,re])=>re.test(q)).map(([id])=>id);
 return {version:1,kind:matches.length===1?matches[0]:'acknowledgement',ambiguous:matches.length!==1};
}
