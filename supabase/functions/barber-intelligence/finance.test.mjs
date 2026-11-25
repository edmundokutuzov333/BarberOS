import assert from 'node:assert/strict';
import {test} from 'node:test';
import {financialIntelligence} from './finance.mjs';
const range={from:'2026-11-18',to:'2026-11-24',previousFrom:'2026-11-11',previousTo:'2026-11-17'};
const current={estimated_revenue_cents:100000,completed_count:10,capacity_minutes:1000,booked_minutes:400};
const prev={estimated_revenue_cents:80000,completed_count:8};
const services=[{service_id:'s',service_name:'Corte',completed_count:10,estimated_revenue_cents:100000}];
const barbers=[{barber_id:'b',barber_name:'QA',completed_count:10,estimated_revenue_cents:100000,capacity_minutes:1000,booked_minutes:400}];
const staff={total:10,summary:[{barber_id:'b',completed_count:10,unknown_count:0,commission_minor:30000,tip_minor:5000}]};
const calc=(s=staff,store=null,c=current,sv=services)=>financialIntelligence(c,prev,sv,barbers,s,store,range);
test('reconciled immutable commission and tips separate',()=>{const a=calc();assert.equal(a.afterCommission,70000);assert.equal(a.tips,5000);assert.equal(a.revenueChange,25);assert.equal(a.ticketChange,0);assert.equal(a.team[0].afterCommission,70000);assert.equal(a.services[0].share,100)});
test('unknown commission prevents residual calculation',()=>{const a=calc({...staff,summary:[{...staff.summary[0],unknown_count:1}]});assert.equal(a.afterCommission,null);assert.equal(a.commissionKnown,30000);assert.equal(a.team[0].afterCommission,null);assert.ok(a.insights.some(i=>i.id==='missing-commission'))});
test('mismatch or missing source not treated as zero',()=>{assert.equal(calc({...staff,total:9}).commissionKnown,null);assert.equal(calc(null).afterCommission,null);assert.equal(calc({...staff,summary:[{...staff.summary[0],commission_minor:100001}]}).afterCommission,null)});
test('store cost coverage and negative gross margin separate',()=>{const a=calc(staff,{delivered_cost_known_units:4,delivered_cost_unknown_units:2,delivered_known_cost_minor:9000,delivered_known_gross_margin_minor:-2000});assert.equal(a.store.knownGrossMargin,-2000);assert.equal(a.store.complete,false);assert.equal(a.afterCommission,70000)});
test('service reconciliation and empty denominators',()=>{assert.equal(calc(staff,null,current,[]).serviceConsistent,false);const a=financialIntelligence({estimated_revenue_cents:0,completed_count:0,capacity_minutes:0,booked_minutes:0},{estimated_revenue_cents:0,completed_count:0},[],[],{total:0,summary:[]},null,range);assert.equal(a.ticket,null);assert.equal(a.occupancy,null);assert.equal(a.revenueChange,null);assert.equal(a.afterCommission,0)});
test('duplicates rejected',()=>{assert.throws(()=>calc(staff,null,current,[services[0],services[0]]))});

test('invalid monetary totals and impossible per-person unknown counts fail closed',()=>{assert.equal(calc(staff,null,{...current,estimated_revenue_cents:null},[{...services[0],estimated_revenue_cents:null}]).serviceConsistent,false);assert.equal(calc({total:10,summary:[{...staff.summary[0],completed_count:5,unknown_count:6},{barber_id:'other',completed_count:5,unknown_count:0,commission_minor:0,tip_minor:0}]}).afterCommission,null)});
