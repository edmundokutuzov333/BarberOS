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
  ['Optional public shop catalogue submits server-validated atomic orders when enabled', () => {
    const booking = read('src/pages/BookingWizard.tsx');
    const catalog = read('src/features/public-shop/catalog.ts');
    const step = read('src/features/public-shop/CatalogueStep.tsx');
    assert.match(booking, /usePublicShopCatalog\(slug\)/);
    assert.match(booking, /const customerStep = shopStepAvailable \? 7 : 6/);
    assert.match(booking, /const showShopStep = shopStepAvailable && effectiveStep === 6/);
    assert.match(booking, /shopLines\.map\(\(line\) => \(\{/);
    assert.match(catalog, /supabase\.rpc\('get_public_shop_catalog'/);
    assert.match(catalog, /VITE_SHOP_PUBLIC_CATALOG_ENABLED === 'true'/);
    assert.match(catalog, /PUBLIC_SHOP_CATALOG_INVALID_RESPONSE/);
    assert.match(step, /public-shop-search/);
    assert.match(step, /Indisponível neste momento/);
    assert.match(step, /Continuar sem produtos/);
    assert.match(step, /Subtotal dos produtos/);
    assert.match(booking, /p_shop_items: shopItems/);
    assert.match(booking, /fulfilmentMode/);
    assert.match(booking, /bookingAttemptFingerprint\.current !== requestFingerprint/);
    assert.match(step, /onFulfilmentModeChange/);
    assert.match(booking, /Pode seleccionar até 20 variantes diferentes/);
    const submitStart = booking.indexOf('const result = await bookMutation.mutateAsync');
    const submitEnd = booking.indexOf('rememberLocalBooking(', submitStart);
    assert.ok(submitStart >= 0 && submitEnd > submitStart, 'The existing booking submission boundary must remain intact');
    assert.doesNotMatch(booking.slice(submitStart, submitEnd), /unit_price_snapshot|line_total_snapshot|p_price|subtotal_minor/);
  }],
  ['Phase 4 binds product orders atomically to the booking and exposes the persisted summary by manage token', () => {
    const booking = read('src/pages/BookingWizard.tsx');
    const api = read('src/features/booking/api.ts');
    const tokenApi = read('src/features/appointments/token-api.ts');
    const manage = read('src/pages/AppointmentManage.tsx');
    const edge = read('../supabase/functions/booking-create/index.ts');
    const gateway = read('../supabase/functions/token-gateway/index.ts');
    assert.match(booking, /p_shop_items: shopItems/);
    assert.match(booking, /bookingAttemptFingerprint\.current !== requestFingerprint/);
    assert.match(api, /p_shop_items: input\.p_shop_items \?\? \[\]/);
    assert.match(api, /shop_order\?: ShopOrderSummary/);
    assert.match(edge, /book_appointment_with_shop_order_idempotent/);
    assert.match(edge, /p_request_hash: requestHash/);
    assert.match(edge, /select\("response,request_hash"\)/);
    assert.match(edge, /cached\.request_hash !== requestHash/);
    assert.match(edge, /rpc\("book_appointment_with_shop_order_idempotent"/);
    assert.match(edge, /if \(shopItems.length > 0\)/);
    assert.match(edge, /\.select\("response,request_hash"\)/);
    assert.match(tokenApi, /invokeTokenGateway<unknown>\('shop_order\.get'/);
    assert.match(gateway, /get_shop_order_by_manage_token/);
    assert.match(manage, /data-testid="appointment-shop-order"/);
    assert.match(manage, /Subtotal dos produtos/);
  }],
  ['Public shop keeps the full description while reducing the hero LCP candidate', () => {
    const source = read('src/pages/PublicBarbershop.tsx');
    assert.match(source, /max-w-xl line-clamp-1/);
    assert.match(source, /data-testid="public-shop-description"/);
    assert.match(source, /Sobre a barbearia/);
  }],
  ['Public booking allows optional email without overstating automatic delivery', () => {
    const source = read('src/pages/BookingWizard.tsx');
    assert.match(source, /if \(email && !validEmail\(email\)\)/);
    const emailStart = source.indexOf('label="Email (opcional)"');
    assert.notEqual(emailStart, -1);
    const fieldStart = source.lastIndexOf('<Field', emailStart);
    const fieldEnd = source.indexOf('/>', emailStart);
    assert.ok(fieldStart >= 0 && fieldEnd > emailStart);
    assert.doesNotMatch(source.slice(fieldStart, fieldEnd), /\brequired\b/);
    assert.match(source, /guarde o link de gestão apresentado no ecrã/i);
  }],
  ['Production booking fails closed when Turnstile is not configured', () => {
    const source = read('src/pages/BookingWizard.tsx');
    assert.match(source, /VITE_BOOKING_TURNSTILE_REQUIRED === 'true' \|\| import\.meta\.env\.PROD/);
    assert.match(source, /A verificação de segurança não está configurada\. As marcações estão temporariamente bloqueadas\./);
    assert.match(source, /\(\(!turnstileRequired && !turnstileSiteKey\) \|\| Boolean\(turnstileSiteKey && turnstileToken\)\)/);
  }],
  ['Appointments page is wired to the real agenda contract', () => {
    const source = read('src/pages/app/Marcacoes.tsx');
    assert.match(source, /useAgendaAppointments\(/);
    assert.match(source, /useAppointmentAction\(/);
    assert.match(source, /marcacoes-search-input/);
    assert.match(source, /marcacoes-status-select/);
    assert.match(source, /marcacao-confirm-/);
    assert.match(source, /marcacao-cancel-/);
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

  ['Platform admin routes are isolated behind the dedicated admin guard', () => {
    const app = read('src/App.tsx');
    assert.match(app, /<Route element={<RequireAdmin \/>}>[\s\S]*?<Route path="\/admin" element={<AdminShell \/>}>/);
    for (const route of ['barbearias', 'utilizadores', 'planos', 'pagamentos', 'suporte', 'metricas']) {
      assert.match(app, new RegExp('path="' + route + '"'));
    }
  }],
  ['Platform barbershop listing uses the privileged RPC and opens management details', () => {
    const page = read('src/pages/admin/AdminBarbearias.tsx');
    const api = read('src/features/admin/api.ts');
    assert.match(page, /useAdminShops\(/);
    assert.doesNotMatch(page, /supabase\.from\(['"]barbershops['"]\)/);
    assert.match(page, /admin-shop-row-/);
    assert.match(page, /\/admin\/barbearias\/['"]?\s*\+\s*shop\.id/);
    assert.match(page, /<Pager/);
    assert.match(page, /aria-label="Filtrar barbearias por estado"/);
    assert.match(api, /'admin_list_barbershops'/);
  }],
  ['Platform admin write operations are routed through database RPC contracts', () => {
    const api = read('src/features/admin/api.ts');
    for (const rpc of [
      'admin_get_overview',
      'admin_list_barbershops',
      'admin_get_barbershop',
      'admin_set_barbershop_status',
      'admin_assign_barbershop_plan',
      'admin_list_users',
      'admin_list_plans',
      'admin_update_plan',
      'admin_list_payments',
      'admin_list_support_tickets',
      'admin_create_support_ticket',
      'admin_update_support_ticket',
      'admin_get_activity',
      'admin_get_metrics',
    ]) {
      assert.ok(api.includes(rpc), 'Missing admin RPC contract: ' + rpc);
    }
  }],
  ['Administrative credential recovery is server-side and audited', () => {
    const page = read('src/pages/admin/AdminUtilizadores.tsx');
    const api = read('src/features/admin/api.ts');
    const edge = read('../supabase/functions/admin-credential-manager/index.ts');
    assert.match(api, /functions\.invoke\('admin-credential-manager'/);
    assert.match(page, /temporaryPassword/);
    assert.match(page, /Histórico de acessos/);
    assert.match(edge, /is_platform_admin/);
    assert.match(edge, /Cache-Control|cache-control/);
    assert.match(edge, /platform_access_events/);
  }],
  ['Admin payments remain read-only and rely on the protected payment listing RPC', () => {
    const page = read('src/pages/admin/AdminPagamentos.tsx');
    const api = read('src/features/admin/api.ts');
    assert.match(page, /useAdminPayments\(/);
    assert.match(page, /requires_refund/);
    assert.doesNotMatch(page, /supabase\.from\(|supabase\.rpc\(/);
    assert.match(api, /'admin_list_payments'/);
  }],
  ['Admin plan and support screens expose mutations with visible failure states', () => {
    const plans = read('src/pages/admin/AdminPlanos.tsx');
    const support = read('src/pages/admin/AdminSuporte.tsx');
    const api = read('src/features/admin/api.ts');
    assert.match(plans, /useUpdateAdminPlan\(/);
    assert.match(plans, /mutation\.error/);
    assert.match(plans, /selected\.assigned_shops > 0/);
    assert.match(plans, /disabled=\{selected\.assigned_shops > 0\}/);
    assert.match(support, /useCreateAdminSupport\(/);
    assert.match(support, /useUpdateAdminSupport\(/);
    assert.match(support, /create\.error/);
    assert.match(support, /update\.error/);
    assert.match(api, /'admin_update_plan'/);
    assert.match(api, /'admin_update_support_ticket'/);
  }],

  ['Admin shell identifies the administrator and provides an explicit sign-out action', () => {
    const shell = read('src/components/layout/AdminShell.tsx');
    assert.match(shell, /useAuth\(/);
    assert.match(shell, /admin-sign-out/);
    assert.match(shell, /signOut\(\)/);
    assert.match(shell, /Voltar à barbearia/);
  }],
  ['Tenant administrators can discover platform administration without exposing it to other roles', () => {
    const sidebar = read('src/components/layout/Sidebar.tsx');
    assert.match(sidebar, /profile\?\.is_platform_admin === true/);
    assert.match(sidebar, /nav-platform-admin/);
    assert.match(sidebar, /to="\/admin"/);
  }],
  ['Shop detail prevents selecting an inactive plan and safely handles failed writes', () => {
    const detail = read('src/pages/admin/AdminBarbeariaDetalhe.tsx');
    const api = read('src/features/admin/api.ts');
    assert.match(detail, /plan\.is_active \|\| plan\.id === q\.data\?\.plan\?\.id/);
    assert.match(detail, /Keep the mutation error in the page/);
    assert.match(api, /invalidateQueries\(\{queryKey:\['admin','metrics'\]\}\)/);
  }],

  ['Global admin entry preserves the requested route through login and blocks tenant-only accounts explicitly', () => {
    const guard = read('src/components/layout/AppShell.tsx');
    const login = read('src/pages/auth/Entrar.tsx');
    assert.match(guard, /if \(!user\) return <Navigate to="\/entrar" state=\{\{ from: returnTo \}\} replace \/>/);
    assert.match(guard, /profile\?\.is_platform_admin !== true/);
    assert.match(guard, /platform-admin-access-denied/);
    assert.match(guard, /platform-admin-switch-account/);
    assert.doesNotMatch(guard, /if \(!profile\?\.is_platform_admin\) return <Navigate to="\/app" replace \/>/);
    assert.match(login, /nav\(loc\.state\?\.from \?\? '\/app', \{ replace: true \}\)/);
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
