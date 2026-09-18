import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const tests = [
  ['Booking Wizard uses six-step flow and backend contracts', () => {
    const source = read('src/pages/BookingWizard.tsx');
    assert.match(source, /STEP_LABELS = \['Serviço', 'Corte', 'Barbeiro', 'Data', 'Hora', 'Dados'\]/);
    assert.match(source, /useAvailableDays\(/);
    assert.match(source, /useAvailableSlots\(/);
    assert.match(source, /useBookAppointment\(/);
    assert.match(source, /SLOT_TAKEN/);
    assert.match(source, /booking-summary/);
    assert.match(source, /searchParams\.get\('service'\)/);
  }],
  ['Agenda is wired to realtime, schedule and appointment actions', () => {
    const source = read('src/pages/app/Agenda.tsx');
    assert.match(source, /useAgendaRealtime\(/);
    assert.match(source, /useAgendaAppointments\(/);
    assert.match(source, /useAgendaSchedule\(/);
    assert.match(source, /useAppointmentAction\(/);
    assert.match(source, /useOperatorReschedule\(/);
    assert.match(source, /onDrop=/);
    assert.match(source, /agenda-realtime-status/);
    assert.match(source, /agenda-appointment-/);
    assert.match(source, /Confirmar/);
    assert.match(source, /Concluir atendimento/);
    assert.match(source, /Marcar falta/);
  }],
  ['Forms expose validation and accessible associations', () => {
    const source = read('src/components/ui/Field.tsx');
    assert.match(source, /htmlFor=/);
    assert.match(source, /aria-invalid=/);
    assert.match(source, /aria-describedby=/);
    assert.match(source, /aria-errormessage=/);
    const booking = read('src/pages/BookingWizard.tsx');
    assert.match(booking, /validMozPhone/);
    assert.match(booking, /validEmail/);
    assert.match(booking, /2 a 120 caracteres/);
  }],
  ['Permission layer remains centralized', () => {
    const source = read('src/lib/permissions.ts');
    assert.match(source, /SHOP_ROLES/);
    assert.match(source, /MANAGEMENT_ROLES/);
    assert.match(source, /canAccessAppRoute/);
    assert.match(source, /canManageTeam/);
    assert.match(source, /canConfigurePayments/);
  }],
];

let failed = 0;
for (const [name, run] of tests) {
  try {
    run();
    console.log('PASS', name);
  } catch (error) {
    failed++;
    console.error('FAIL', name, error);
  }
}

console.log('Phase 23 page contracts: ' + (tests.length - failed) + '/' + tests.length + ' passed.');
if (failed) process.exitCode = 1;
