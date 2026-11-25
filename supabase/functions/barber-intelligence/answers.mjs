// Deterministic, tenant-scoped metric selection. Never send question text or values to a provider.
import { prepareDraft } from './operations.mjs';
const rules=[
 ['profit','finance',/\b(lucro[s]?|rentabilidade|resultado liquido)\b/],
 ['tips','finance',/\b(gorjeta[s]?)\b/],
 ['residual','finance',/\b(apos|depois|resta|sobra|liquido)\b.*\b(comiss\w*)\b|\b(comiss\w*)\b.*\b(apos|depois|resta|sobra)\b/],
 ['commission','finance',/\b(comiss\w*)\b/],
 ['ticket','finance',/\b(ticket|valor medio|preco medio)\b/],
 ['store_margin','stock',/\b(margem|custo[s]?)\b.*\b(loja|produto[s]?)\b|\b(loja|produto[s]?)\b.*\b(margem|custo[s]?)\b/],
 ['reviews','overview',/\b(avaliac\w*|estrela[s]?|reputacao|feedback|opiniao|opinioes)\b/],
 ['inventory','stock',/\b(reposic\w*|repor|stock|inventario|existencias)\b/],
 ['week','agenda',/\b(proxim[oa]s? (?:sete|7) dias|proxima semana|semana seguinte)\b/],
 ['forecast','agenda',/\b(previs\w*|procura|demanda)\b/],
 ['services','finance',/\b(servico[s]?)\b.*\b(receita[s]?|mais vendid[oa]s?|mais rentavel|mais atendimentos)\b|\b(receita[s]?|mais vendid[oa]s?)\b.*\b(servico[s]?)\b/],
 ['setup','setup',/\b(onboarding|progresso da configuracao|configuracao pendente|falta configurar)\b/],
 ['noshow','agenda',/\b(falta[s]?|no.show|nao comparec\w*)\b/],
 ['waiting','agenda',/\b(lista de espera|clientes em espera)\b/],
 ['today','overview',/\b(marcac\w*|agend\w*)\b.*\bhoje\b|\bhoje\b.*\b(marcac\w*|agend\w*)\b/],
 ['notifications','communications',/\b(notific\w*|lembrete[s]?)\b.*\b(falh\w*|erro[s]?)\b|\b(falh\w*|erro[s]?)\b.*\b(notific\w*|lembrete[s]?)\b/]
];
export function metricQuestion(question){
 if(typeof question!=='string')return null;
 const q=question.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const match=rules.find(([, ,pattern])=>pattern.test(q));
 return match?{target:match[0],topic:match[1]}:null;
}
const num=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('pt-PT',{maximumFractionDigits:1}).format(v):'n/d';
const money=v=>typeof v==='number'&&Number.isSafeInteger(v)?new Intl.NumberFormat('pt-PT',{style:'currency',currency:'MZN'}).format(v/100):'n/d';
const percent=v=>v===null||v===undefined?'n/d':num(v)+'%';
const period=r=>'Período: '+r.from+' a '+r.to+' (dias completos).';
export function metricAnswer(target,result,details={}){
 const r=result.range,m=result.metrics,f=details.finance,inv=details.inventory,rev=details.reviews,plan=details.plan;
 const unavailable='Não foi possível obter os dados necessários para esta consulta. Consulte o módulo correspondente ou tente novamente.';
 switch(target){
 case 'summary':return 'Marcações hoje: '+num(m.today)+'. Atendimentos concluídos: '+num(m.completed)+'. Ocupação: '+percent(m.occupancy)+'. Receita estimada: '+money(m.revenue)+'. '+period(r)+' Não é lucro nem fluxo de caixa.';
 case 'priorities':return result.insights.length?'Prioridades identificadas:\n'+result.insights.slice(0,5).map(i=>i.title+': '+i.detail).join('\n'):'Sem alertas nos indicadores analisados. Continue a acompanhar a agenda e os relatórios.';
 case 'agenda_summary':return 'Ocupação: '+percent(m.occupancy)+'. Marcações: '+num(m.appointments)+'. '+period(r)+' Consulte a capacidade e a disponibilidade oficial antes de alterar horários.';
 case 'revenue':return 'Receita estimada: '+money(m.revenue)+'. Variação face ao período anterior equivalente: '+percent(m.revenueChange)+'. '+period(r)+' Não é lucro nem pagamento confirmado.';
 case 'customer_activity':return 'Clientes registados: '+num(m.customers)+'. Clientes com visita nos últimos 30 dias: '+num(m.recentCustomers)+'. Janela móvel de 30 dias, independente do período seleccionado.';
 case 'customer_absent':return 'Clientes sem visita registada nos últimos 30 dias: '+num(Number.isInteger(m.customers)&&Number.isInteger(m.recentCustomers)&&m.customers>=m.recentCustomers?m.customers-m.recentCustomers:null)+'. Este grupo inclui clientes novos e não confirma abandono. Consulte o histórico e as próximas marcações de cada cliente antes de contactar, respeitando o consentimento.';
 case 'team_occupancy':case 'team_completed':case 'team_commission':return f?(f.team.length?'Equipa (até 30 profissionais):\n'+f.team.map(t=>t.name+': '+(target==='team_occupancy'?percent(t.occupancy)+' de ocupação':target==='team_completed'?num(t.completed)+' atendimentos concluídos':money(t.commission)+' de comissão histórica reconciliada')).join('\n'):'Sem profissionais no relatório.')+'\n'+period(r)+' Considere horários e tipos de serviço; não é uma classificação de qualidade.':unavailable;
 case 'campaign':return plan?(plan.campaign?plan.campaign.title+'. '+plan.campaign.reason:'Não há uma oportunidade de campanha identificada com histórico suficiente. Consulte a agenda antes de publicar.'):unavailable;
 case 'campaign_copy':return plan?(plan.campaign?plan.campaign.body+'\n\n'+plan.campaign.reason+'\nRascunho para revisão, não publicado.':'Sem oportunidade identificada. Confirme a disponibilidade real antes de preparar uma campanha.'):unavailable;
 case 'draft_confirmation':case 'draft_feedback':case 'draft_return':{const d=prepareDraft(target.slice(6));return d.subject+'\n\n'+d.body+'\n\nRascunho para revisão. Não foi enviada nenhuma mensagem.';}

 case 'profit':return 'O BarberOS não calcula lucro líquido a partir destes relatórios: faltam despesas operacionais completas. '+(f?'Receita estimada de serviços: '+money(f.revenue)+'. Receita após comissões conhecidas: '+money(f.afterCommission)+'. ':'')+'Estes valores não são lucro, saldo de caixa ou dinheiro recebido. '+period(r);
 case 'commission':return f?'Comissões históricas conhecidas: '+money(f.commissionKnown)+'. Atendimentos sem comissão conhecida: '+num(f.commissionUnknown)+'. Não são estimadas comissões em falta. '+period(r):unavailable;
 case 'tips':return f?'Gorjetas registadas: '+money(f.tips)+'. São apresentadas separadamente da receita e das comissões. '+period(r):unavailable;
 case 'residual':return f?'Receita estimada após comissões: '+money(f.afterCommission)+'. '+(f.afterCommission===null?'Os dados não permitem reconciliar todas as comissões. ':'')+'Não representa lucro líquido nem pagamento confirmado. '+period(r):unavailable;
 case 'ticket':return f?'Ticket médio de serviços concluídos: '+money(f.ticket)+'. Variação face ao período anterior: '+percent(f.ticketChange)+'. '+period(r):unavailable;
 case 'store_margin':return f?.store?'Margem bruta conhecida da loja: '+money(f.store.knownGrossMargin)+'. Custo conhecido: '+money(f.store.knownCost)+'. Unidades com custo: '+num(f.store.knownUnits)+'; sem custo: '+num(f.store.unknownUnits)+'. '+(f.store.complete?'Cobertura completa das unidades desta coorte.':'Margem parcial ou indisponível.')+' Pedidos criados no período (fuso Maputo); não é lucro líquido. '+period(r):'Relatório de loja indisponível ou loja não activa.';
 case 'services':return f?(f.serviceConsistent?(f.services.length?'Serviços por receita estimada (até cinco):\n'+f.services.slice(0,5).map(s=>s.name+': '+money(s.revenue)+' · '+num(s.completed)+' atendimentos').join('\n'):'Sem serviços concluídos no período.'):'Os totais por serviço não coincidem com o resumo. Não foi calculada a decomposição.')+'\nReceita não equivale a margem. '+period(r):unavailable;
 case 'reviews':return rev?(rev.sampleCount?'Média: '+num(rev.average)+'/5, em '+num(rev.sampleCount)+' avaliações (últimas 100, incluindo ocultas). '+num(rev.positive)+' de 4–5 estrelas; '+num(rev.negative)+' de 1–2 estrelas. '+(rev.topics.length?'Temas mencionados: '+rev.topics.slice(0,3).map(t=>t.label+' ('+t.mentions+')').join(', ')+'. ':'')+'Menções por palavras-chave, não análise semântica de sentimento.':'Ainda não há avaliações registadas.'):unavailable;
 case 'inventory':return inv?'Variantes activas com controlo de stock: '+num(inv.trackedCount)+'. Alertas: '+num(inv.alertCount)+'. Com estimativa: '+num(inv.estimatedCount)+'. '+(inv.rows.some(x=>x.signal!=='ok')?'\nPrioridades (até cinco):\n'+inv.rows.filter(x=>x.signal!=='ok').slice(0,5).map(x=>x.product+' · '+x.variant+': '+num(x.stock)+' em stock, reposição indicativa '+num(x.suggestedUnits)+' un.').join('\n'):'')+'\nEstimativa de 30 dias de saídas por venda. Confirme existências, reservas e fornecedores; não faz encomendas.':unavailable;
 case 'week':return plan?'Próximos sete dias (ocupação reservada, não disponibilidade garantida):\n'+plan.days.map(d=>d.date+' · '+d.weekday+': '+percent(d.occupancy)).join('\n')+(plan.campaign?'\nOportunidade: '+plan.campaign.title+'. Confirme as vagas reais.':'\nSem oportunidade promocional identificada com os dados disponíveis.'):unavailable;
 case 'setup':return plan?.setup?'Progresso registado: '+plan.setup.step+'/9. '+(plan.setup.complete?'Configuração marcada como concluída.':'Próximo passo: '+plan.setup.next+'.')+' O progresso não certifica a disponibilidade real.':unavailable;
 case 'forecast':return result.forecast.length?'Procura indicativa (média histórica por dia da semana):\n'+result.forecast.map(d=>d.date+': '+num(d.expected)+' marcações · '+d.samples+' dias comparáveis').join('\n')+'\nNão é uma garantia de procura ou vagas.':'Histórico insuficiente para apresentar uma previsão indicativa.';
 case 'noshow':return 'Taxa de faltas: '+percent(m.noShow)+'. Denominador: atendimentos concluídos mais faltas. '+period(r)+' Não utilize este indicador para cancelar automaticamente marcações.';
 case 'waiting':return 'Clientes em espera: '+num(m.waiting)+'. Consulte a lista de espera e preserve a ordem do motor de ofertas. Indicador actual.';
 case 'today':return 'Marcações registadas para hoje ('+r.today+'): '+num(m.today)+'. Consulte a agenda para estado e disponibilidade actualizados.';
 case 'notifications':return 'Notificações falhadas: '+num(m.failedNotifications)+'. Consulte o módulo de notificações para detalhes e reenvio autorizado. Indicador actual.';
 default:return result.answer;
 }
}
export function metricSource(target){
 if(['profit','tips','residual','commission','ticket','services','store_margin','team_occupancy','team_completed','team_commission'].includes(target))return 'finance';
 if(target==='reviews')return 'reviews';
 if(target==='inventory')return 'inventory';
 if(['week','setup','campaign','campaign_copy'].includes(target))return 'plan';
 return null;
}
