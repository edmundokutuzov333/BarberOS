import { useMemo, useState } from 'react';
import {
  BarChart3, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Clock3, Download, RefreshCw, Scissors, TrendingUp, UserCheck, UserPlus, UserX,
} from 'lucide-react';
import { Page } from '@/components/layout/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/States';
import { useShop } from '@/lib/shop';
import { formatMT, fmt, nowTz, humanError } from '@/lib/utils';
import { useReportData, type ReportBarberRow, type ReportDailyRow, type ReportHaircutRow, type ReportRange, type ReportServiceRow } from '@/features/reports/api';

type ViewKey = 'overview' | 'daily' | 'services' | 'haircuts' | 'barbers';

const todayKey = () => fmt(nowTz(), 'yyyy-MM-dd');

function shiftDate(value: string, days: number) {
  const d = new Date(value + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function initialRange(): ReportRange {
  const today = todayKey();
  return { from: shiftDate(today, -6), to: today };
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const body = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function percent(value: number) {
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(Number(value || 0)) + '%';
}

function num(value: number) {
  return new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function RangeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={active
        ? 'px-3.5 py-2 rounded-full bg-accent-soft text-accent-ink text-sm font-medium'
        : 'px-3.5 py-2 rounded-full text-ink-mid hover:text-ink-hi hover:bg-white/5 text-sm'}
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value, detail, icon: Icon }: {
  label: string; value: string; detail?: string; icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="t-label text-ink-mid">{label}</p>
        <Icon size={16} className="text-accent-soft opacity-80" aria-hidden />
      </div>
      <p className="text-2xl sm:text-3xl font-medium text-ink-hi mt-3 tracking-tight">{value}</p>
      {detail && <p className="t-label text-ink-lo mt-1">{detail}</p>}
    </Panel>
  );
}

function OccupancyBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="t-label text-ink-mid">Ocupação</span>
        <span className="t-label text-ink-hi">{percent(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden" aria-hidden>
        <div className="h-full rounded-full bg-accent-soft" style={{ width: width + '%' }} />
      </div>
    </div>
  );
}

function Overview({ summary }: { summary: ReturnType<typeof Object.assign> & any }) {
  return (
    <>
      <section className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard label="Marcações" value={num(summary.appointment_count)} detail={summary.from_date + ' → ' + summary.to_date} icon={CalendarDays} />
        <MetricCard label="Concluídas" value={num(summary.completed_count)} detail={summary.appointment_count ? percent((summary.completed_count / summary.appointment_count) * 100) + ' do volume' : 'Sem marcações'} icon={CheckCircle2} />
        <MetricCard label="Ocupação" value={percent(summary.occupancy_percent)} detail={num(summary.booked_minutes) + ' min reservados'} icon={Clock3} />
        <MetricCard label="Receita estimada" value={formatMT(Number(summary.estimated_revenue_cents))} detail="Serviços concluídos" icon={TrendingUp} />
        <MetricCard label="Sinais pagos" value={formatMT(Number(summary.paid_deposit_cents))} detail={summary.refunded_deposit_cents ? formatMT(Number(summary.refunded_deposit_cents)) + ' devolvidos' : 'Sem devoluções no período'} icon={BarChart3} />
        <MetricCard label="Novos clientes" value={num(summary.new_customers_count)} detail={summary.average_completed_ticket_cents ? formatMT(Number(summary.average_completed_ticket_cents)) + ' ticket médio concluído' : 'Sem vendas concluídas'} icon={UserPlus} />
      </section>

      <section className="grid lg:grid-cols-2 gap-3 mt-3">
        <Panel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="t-card text-ink-hi">Estado das marcações</p>
              <p className="t-label text-ink-lo mt-1">Distribuição no período seleccionado</p>
            </div>
            <BarChart3 size={17} className="text-accent-soft" aria-hidden />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
            <Stat label="Pendentes" value={summary.pending_count} />
            <Stat label="Confirmadas" value={summary.confirmed_count} />
            <Stat label="Em curso" value={summary.in_progress_count} />
            <Stat label="Canceladas" value={summary.cancelled_count} />
            <Stat label="Faltas" value={summary.no_show_count} />
            <Stat label="Concluídas" value={summary.completed_count} />
          </div>
        </Panel>
        <Panel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="t-card text-ink-hi">Capacidade</p>
              <p className="t-label text-ink-lo mt-1">Horário configurado, após blocos</p>
            </div>
            <Clock3 size={17} className="text-accent-soft" aria-hidden />
          </div>
          <div className="mt-6">
            <OccupancyBar value={summary.occupancy_percent} />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Stat label="Capacidade" value={summary.capacity_minutes + ' min'} />
            <Stat label="Tempo reservado" value={summary.booked_minutes + ' min'} />
          </div>
        </Panel>
      </section>

      <p className="t-label text-ink-lo mt-4">Receita estimada corresponde ao valor dos serviços com atendimento concluído. Não substitui contabilidade financeira.</p>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/5 p-3">
      <p className="t-label text-ink-lo">{label}</p>
      <p className="t-card text-ink-hi mt-1">{num(Number(value))}</p>
    </div>
  );
}

function DailyView({ rows }: { rows: ReportDailyRow[] }) {
  const maxRevenue = Math.max(1, ...rows.map((row) => Number(row.estimated_revenue_cents)));
  const maxAppointments = Math.max(1, ...rows.map((row) => Number(row.appointment_count)));
  return (
    <Panel className="p-0 overflow-hidden">
      <div className="p-5 border-b border-white/5">
        <p className="t-card text-ink-hi">Desempenho diário</p>
        <p className="t-label text-ink-lo mt-1">Marcações e receita estimada por dia</p>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="Sem dias no período" body="Escolha outro intervalo." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[760px]">
            <thead><tr className="border-b border-white/5">
              {['Data','Marcações','Concluídas','Canceladas','Faltas','Ocupação','Receita estimada'].map((h) => <th key={h} className="t-label text-ink-lo font-medium px-5 py-3">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.report_date} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-4"><p className="text-sm text-ink-hi">{fmt(row.report_date + 'T12:00:00Z', 'dd MMM')}</p></td>
                  <td className="px-5 py-4 text-sm text-ink-hi">{row.appointment_count}</td>
                  <td className="px-5 py-4 text-sm text-ink-mid">{row.completed_count}</td>
                  <td className="px-5 py-4 text-sm text-ink-mid">{row.cancelled_count}</td>
                  <td className="px-5 py-4 text-sm text-ink-mid">{row.no_show_count}</td>
                  <td className="px-5 py-4 min-w-40"><OccupancyBar value={Number(row.occupancy_percent)} /></td>
                  <td className="px-5 py-4 text-sm text-ink-hi">{formatMT(Number(row.estimated_revenue_cents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="sr-only">Escalas visuais internas: {maxAppointments} marcações e {maxRevenue} cêntimos de receita máxima no período.</div>
    </Panel>
  );
}

function ServiceTable({ rows }: { rows: ReportServiceRow[] }) {
  return (
    <ReportTable
      title="Desempenho por serviço"
      subtitle="Volume, conclusão, sinais e receita estimada"
      icon={Scissors}
      headers={['Serviço','Marcações','Concluídas','Faltas','Reservado','Receita estimada','Ticket médio']}
      rows={rows.map((row) => [
        row.service_name,row.appointment_count,row.completed_count,row.no_show_count,
        num(Number(row.booked_minutes)) + ' min',formatMT(Number(row.estimated_revenue_cents)),
        formatMT(Number(row.average_completed_ticket_cents)),
      ])}
      emptyTitle="Sem serviços no período"
      emptyBody="Não existem marcações associadas aos serviços neste intervalo."
    />
  );
}

function HaircutTable({ rows }: { rows: ReportHaircutRow[] }) {
  return (
    <ReportTable
      title="Desempenho por corte"
      subtitle="Cortes associados às marcações concluídas e agendadas"
      icon={Scissors}
      headers={['Corte','Marcações','Concluídas','Canceladas','Faltas','Reservado','Receita estimada']}
      rows={rows.map((row) => [
        row.haircut_name,row.appointment_count,row.completed_count,row.cancelled_count,row.no_show_count,
        num(Number(row.booked_minutes)) + ' min',formatMT(Number(row.estimated_revenue_cents)),
      ])}
      emptyTitle="Sem cortes no período"
      emptyBody="Não existem cortes associados às marcações deste intervalo."
    />
  );
}

function BarberTable({ rows }: { rows: ReportBarberRow[] }) {
  return (
    <Panel className="p-0 overflow-hidden">
      <div className="p-5 border-b border-white/5">
        <p className="t-card text-ink-hi">Desempenho por barbeiro</p>
        <p className="t-label text-ink-lo mt-1">Ocupação, atendimento e receita estimada</p>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="Sem barbeiros no período" body="Não existem dados operacionais para este intervalo." /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[940px]">
            <thead><tr className="border-b border-white/5">
              {['Barbeiro','Marcações','Concluídas','Faltas','Ocupação','Receita','Avaliação'].map((h) => <th key={h} className="t-label text-ink-lo font-medium px-5 py-3">{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.barber_id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-4"><p className="text-sm text-ink-hi font-medium">{row.barber_name}</p></td>
                  <td className="px-5 py-4 text-sm text-ink-hi">{row.appointment_count}</td>
                  <td className="px-5 py-4 text-sm text-ink-mid">{row.completed_count}</td>
                  <td className="px-5 py-4 text-sm text-ink-mid">{row.no_show_count}</td>
                  <td className="px-5 py-4 min-w-44"><OccupancyBar value={Number(row.occupancy_percent)} /></td>
                  <td className="px-5 py-4 text-sm text-ink-hi">{formatMT(Number(row.estimated_revenue_cents))}</td>
                  <td className="px-5 py-4"><div className="flex items-center gap-2"><UserCheck size={14} className="text-accent-soft" aria-hidden /><span className="text-sm text-ink-hi">{Number(row.rating_avg).toFixed(2)}</span><span className="t-label text-ink-lo">({row.rating_count})</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ReportTable({ title, subtitle, icon: Icon, headers, rows, emptyTitle, emptyBody }: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  headers: string[];
  rows: Array<Array<unknown>>;
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <Panel className="p-0 overflow-hidden">
      <div className="p-5 border-b border-white/5 flex items-center gap-3">
        <Icon size={17} className="text-accent-soft" aria-hidden />
        <div><p className="t-card text-ink-hi">{title}</p><p className="t-label text-ink-lo mt-1">{subtitle}</p></div>
      </div>
      {rows.length===0 ? <div className="p-6"><EmptyState title={emptyTitle} body={emptyBody} /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[860px]">
            <thead><tr className="border-b border-white/5">
              {headers.map((header) => <th key={header} className="t-label text-ink-lo font-medium px-5 py-3">{header}</th>)}
            </tr></thead>
            <tbody>{rows.map((row,index) => <tr key={index} className="border-b border-white/5 last:border-0">
              {row.map((value,cellIndex) => <td key={cellIndex} className="px-5 py-4 text-sm text-ink-mid">{String(value)}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export default function Relatorios() {
  const { shop, role } = useShop();
  const [range, setRange] = useState<ReportRange>(initialRange);
  const [fromInput, setFromInput] = useState(range.from);
  const [toInput, setToInput] = useState(range.to);
  const [view, setView] = useState<ViewKey>('overview');

  const report = useReportData(shop?.id, range);
  const activePreset = useMemo(() => {
    const today = todayKey();
    if (range.from===today && range.to===today) return 'today';
    if (range.from===shiftDate(today,-6) && range.to===today) return 'week';
    if (range.from===today.slice(0,7)+'-01' && range.to===today) return 'month';
    return null;
  }, [range]);

  const applyPreset = (preset: 'today'|'week'|'month') => {
    const today=todayKey();
    const next = preset==='today' ? {from:today,to:today}
      : preset==='week' ? {from:shiftDate(today,-6),to:today}
      : {from:today.slice(0,7)+'-01',to:today};
    setRange(next); setFromInput(next.from); setToInput(next.to);
  };

  const applyCustom = () => {
    if (fromInput && toInput && fromInput<=toInput) setRange({from:fromInput,to:toInput});
  };

  const exportCurrent = () => {
    if (!report.data || view==='overview') return;
    const stamp=range.from+'_'+range.to;
    if (view==='daily') downloadCsv('barberos-relatorio-diario-'+stamp+'.csv',
      ['Data','Marcações','Concluídas','Canceladas','Faltas','Pendentes','Confirmadas','Em curso','Minutos reservados','Minutos de capacidade','Ocupação','Receita estimada','Sinais pagos'],
      report.data.daily.map((r)=>[r.report_date,r.appointment_count,r.completed_count,r.cancelled_count,r.no_show_count,r.pending_count,r.confirmed_count,r.in_progress_count,r.booked_minutes,r.capacity_minutes,r.occupancy_percent,formatMT(Number(r.estimated_revenue_cents)),formatMT(Number(r.paid_deposit_cents))]));
    if (view==='services') downloadCsv('barberos-relatorio-servicos-'+stamp+'.csv',
      ['Serviço','Marcações','Concluídas','Canceladas','Faltas','Minutos reservados','Receita estimada','Sinais pagos','Ticket médio concluído'],
      report.data.services.map((r)=>[r.service_name,r.appointment_count,r.completed_count,r.cancelled_count,r.no_show_count,r.booked_minutes,formatMT(Number(r.estimated_revenue_cents)),formatMT(Number(r.paid_deposit_cents)),formatMT(Number(r.average_completed_ticket_cents))]));
    if (view==='haircuts') downloadCsv('barberos-relatorio-cortes-'+stamp+'.csv',
      ['Corte','Marcações','Concluídas','Canceladas','Faltas','Minutos reservados','Receita estimada'],
      report.data.haircuts.map((r)=>[r.haircut_name,r.appointment_count,r.completed_count,r.cancelled_count,r.no_show_count,r.booked_minutes,formatMT(Number(r.estimated_revenue_cents))]));
    if (view==='barbers') downloadCsv('barberos-relatorio-barbeiros-'+stamp+'.csv',
      ['Barbeiro','Marcações','Concluídas','Canceladas','Faltas','Minutos reservados','Capacidade','Ocupação','Receita estimada','Avaliação','Nº avaliações'],
      report.data.barbers.map((r)=>[r.barber_name,r.appointment_count,r.completed_count,r.cancelled_count,r.no_show_count,r.booked_minutes,r.capacity_minutes,r.occupancy_percent,formatMT(Number(r.estimated_revenue_cents)),Number(r.rating_avg).toFixed(2),r.rating_count]));
  };

  const currentTitle = view==='overview' ? 'Resumo'
    : view==='daily' ? 'Dia a dia'
    : view==='services' ? 'Serviços'
    : view==='haircuts' ? 'Cortes'
    : 'Barbeiros';

  return (
    <Page
      testId="reports-page"
      title="Relatórios"
      subtitle={role==='barber' ? 'Acompanhe o seu desempenho operacional.' : 'Entenda o movimento da barbearia sem transformar o sistema numa aplicação de contabilidade.'}
      actions={
        <div className="flex items-center gap-2">
          {view!=='overview' && <Button variant="secondary" size="sm" onClick={exportCurrent} disabled={!report.data}><Download size={14} />Exportar CSV</Button>}
          <Button variant="secondary" size="sm" onClick={()=>void report.refetch()} disabled={report.isFetching}><RefreshCw size={14} className={report.isFetching ? 'animate-spin' : ''} />Actualizar</Button>
        </div>
      }
    >
      <Panel className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 w-fit">
            <RangeButton active={activePreset==='today'} onClick={()=>applyPreset('today')}>Hoje</RangeButton>
            <RangeButton active={activePreset==='week'} onClick={()=>applyPreset('week')}>Semana</RangeButton>
            <RangeButton active={activePreset==='month'} onClick={()=>applyPreset('month')}>Mês</RangeButton>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <label className="flex items-center gap-2">
              <span className="t-label text-ink-mid whitespace-nowrap">De</span>
              <input aria-label="Data inicial do relatório" type="date" value={fromInput} max={toInput} onChange={(e)=>setFromInput(e.target.value)} className="field !py-2.5" />
            </label>
            <label className="flex items-center gap-2">
              <span className="t-label text-ink-mid whitespace-nowrap">Até</span>
              <input aria-label="Data final do relatório" type="date" value={toInput} min={fromInput} onChange={(e)=>setToInput(e.target.value)} className="field !py-2.5" />
            </label>
            <Button size="sm" onClick={applyCustom} disabled={!fromInput || !toInput || fromInput>toInput}><ChevronDown size={14} />Aplicar</Button>
          </div>
        </div>
      </Panel>

      <Panel className="mb-5 p-1 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max" role="tablist" aria-label="Visões dos relatórios">
          {([
            ['overview','Resumo'],['daily','Dia a dia'],['services','Serviços'],['haircuts','Cortes'],['barbers','Barbeiros'],
          ] as Array<[ViewKey,string]>).map(([key,label])=>(
            <button key={key} type="button" role="tab" aria-selected={view===key} onClick={()=>setView(key)}
              className={view===key ? 'px-4 py-2.5 rounded-2xl bg-accent-soft text-accent-ink text-sm font-medium' : 'px-4 py-2.5 rounded-2xl text-ink-mid hover:text-ink-hi hover:bg-white/5 text-sm'}>
              {label}
            </button>
          ))}
        </div>
      </Panel>

      {report.isLoading && <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-56" /><Skeleton className="h-56" /></div>}
      {report.error && !report.isLoading && <ErrorState message={humanError(report.error)} onRetry={()=>void report.refetch()} />}
      {report.data && view==='overview' && <Overview summary={report.data.summary as any} />}
      {report.data && view==='daily' && <DailyView rows={report.data.daily} />}
      {report.data && view==='services' && <ServiceTable rows={report.data.services} />}
      {report.data && view==='haircuts' && <HaircutTable rows={report.data.haircuts} />}
      {report.data && view==='barbers' && <BarberTable rows={report.data.barbers} />}
      {report.data && !report.isLoading && <p className="sr-only">Visão activa: {currentTitle}.</p>}
    </Page>
  );
}
