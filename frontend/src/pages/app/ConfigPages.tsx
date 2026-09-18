import { Page } from '@/components/layout/Page';
import { Panel } from '@/components/ui/States';
import { ServicesEditor } from '@/components/config/ServicesEditor';
import { HaircutsEditor } from '@/components/config/HaircutsEditor';
import { BarbersEditor } from '@/components/config/BarbersEditor';
import { HoursEditor, BlocksEditor } from '@/components/config/HoursEditor';
import { ScheduleOverridesEditor } from '@/components/config/ScheduleOverridesEditor';

export function ServicosPage() {
  return (
    <Page testId="servicos-page" title="Serviços" subtitle="O que a barbearia faz, com duração e preço. Arrasta para ordenar.">
      <Panel><ServicesEditor /></Panel>
    </Page>
  );
}

export function CortesPage() {
  return (
    <Page testId="cortes-page" title="Catálogo de cortes" subtitle="Fotos 3:4 que o cliente toca para marcar. É o atalho mais usado.">
      <Panel><HaircutsEditor /></Panel>
    </Page>
  );
}

export function BarbeirosPage() {
  return (
    <Page testId="barbeiros-page" title="Barbeiros" subtitle="Equipa, serviços que cada um faz e conta ligada.">
      <Panel><BarbersEditor /></Panel>
    </Page>
  );
}

export function HorariosPage() {
  return (
    <Page testId="horarios-page" title="Horários" subtitle="Horário base da barbearia, excepções por barbeiro e bloqueios.">
      <div className="space-y-4">
        <Panel title="Horário semanal"><HoursEditor /></Panel>
        <ScheduleOverridesEditor />
        <BlocksEditor />
      </div>
    </Page>
  );
}
