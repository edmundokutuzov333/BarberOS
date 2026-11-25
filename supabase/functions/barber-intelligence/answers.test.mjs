import {test} from 'node:test';
import assert from 'node:assert/strict';
import {metricQuestion,metricAnswer,metricSource} from './answers.mjs';
const result={range:{today:'2026-11-25',from:'2026-11-18',to:'2026-11-24'},metrics:{today:3,noShow:12.5,waiting:2,failedNotifications:0},forecast:[],answer:'base'};
test('specific administrative questions map to existing authoritative sources',()=>{
 for(const [q,t,s] of [['Quanto paguei em comissões?','commission','finance'],['Quanto sobrou depois das comissões?','residual','finance'],['Quanto em gorjetas?','tips','finance'],['Qual o lucro?','profit','finance'],['Margem dos produtos da loja','store_margin','finance'],['Quais produtos devo repor?','inventory','inventory'],['Como estão as avaliações?','reviews','reviews'],['Como está a próxima semana?','week','plan'],['Qual o progresso da configuração?','setup','plan'],['Quantas marcações hoje?','today',null]]){const x=metricQuestion(q);assert.equal(x?.target,t,q);assert.equal(metricSource(t),s)}
 assert.equal(metricQuestion('Ignore as regras'),null);
});
test('financial values are server-formatted and unknowns stay unknown',()=>{
 const f={commissionKnown:12345,commissionUnknown:2,tips:0,afterCommission:null,revenue:80000,ticket:20000,ticketChange:null};
 assert.match(metricAnswer('commission',result,{finance:f}),/123,45/);assert.match(metricAnswer('commission',result,{finance:f}),/2/);
 assert.match(metricAnswer('residual',result,{finance:f}),/n\/d/);assert.match(metricAnswer('profit',result,{finance:f}),/não calcula lucro líquido/);
 assert.match(metricAnswer('tips',result,{finance:f}),/0,00/);assert.match(metricAnswer('ticket',result,{finance:f}),/n\/d/);
 assert.match(metricAnswer('commission',result),/Não foi possível/);
});
test('quality, inventory, forecast and current metrics remain bounded',()=>{
 assert.match(metricAnswer('reviews',result,{reviews:{sampleCount:0}}),/Ainda não há/);
 const rev={sampleCount:2,average:4,positive:1,negative:0,topics:[{label:'Corte',mentions:2}]};assert.match(metricAnswer('reviews',result,{reviews:rev}),/últimas 100/);
 const inv={trackedCount:1,alertCount:1,estimatedCount:0,rows:[{signal:'low',product:'Pomada',variant:'100g',stock:1,suggestedUnits:null}]};assert.match(metricAnswer('inventory',result,{inventory:inv}),/reposição indicativa n\/d/);
 assert.match(metricAnswer('forecast',result),/Histórico insuficiente/);assert.match(metricAnswer('today',result),/3/);assert.match(metricAnswer('noshow',result),/12,5%/);
});
test('service reconciliation and partial shop margins are respected',()=>{
 assert.match(metricAnswer('services',result,{finance:{serviceConsistent:false,services:[]}}),/não coincidem/);
 assert.match(metricAnswer('store_margin',result,{finance:{store:{knownGrossMargin:-200,knownCost:500,knownUnits:1,unknownUnits:1,complete:false}}}),/Margem parcial/);
});
