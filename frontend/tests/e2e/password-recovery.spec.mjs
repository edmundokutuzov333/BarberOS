import { test, expect } from '@playwright/test';

// Exercise the actual App router, AuthProvider, SDK and recovery form. Only the
// external HTTP boundary is controlled. No production account/password is used.
const userId = '11111111-1111-4111-8111-111111111111';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'recovery@example.com', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
const password = 'RecoveryFixture2026';

async function account(page, { signedIn = true, forced = true } = {}) {
  const state = { calls: [], failCompletion: false, tenantQueries: 0 };
  if (signedIn) await page.addInitScript(({ user }) => {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const encode = value => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expiry, role: 'authenticated' })}.fixture`;
    localStorage.setItem('sb-alseiinjzwjdiwtvkdzy-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: expiry, token_type: 'bearer', user }));
  }, { user });
  await page.route('https://*.supabase.co/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() : null;
    state.calls.push({ path, method: request.method(), action: body?.action });
    const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/rest/v1/profiles') return json([{ id: userId, full_name: 'Recovery fixture', phone: null, avatar_url: null, is_platform_admin: false, created_at: user.created_at, password_change_required: forced }]);
    if (path === '/rest/v1/barbershop_members') { state.tenantQueries++; return json([]); }
    if (path === '/functions/v1/admin-credential-manager') {
      expect(body).toEqual({ action: 'complete_password_change', new_password: password });
      return state.failCompletion ? json({ ok: false, error: 'ACCOUNT_STATE_UNAVAILABLE', message: 'Não foi possível verificar a conta. Tente novamente.' }, 503) : json({ ok: true });
    }
    if (path === '/auth/v1/user' && request.method() === 'PUT') {
      expect(body.password).toBe(password);
      return json(user);
    }
    if (path === '/auth/v1/user') return json(user);
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204 });
    return route.abort('blockedbyclient');
  });
  return state;
}

async function fillPassword(page) {
  await page.getByTestId('new-password-input').fill(password);
  await page.getByTestId('confirm-password-input').fill(password);
}

test('direct recovery entry loads the signed-in profile without tenant dependencies', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = await account(page);
  await page.goto('/alterar-palavra-passe');
  await expect(page.getByTestId('mandatory-password-change')).toBeVisible();
  await expect(page.locator('input[type=password]')).toHaveCount(2);
  await expect(page.getByText('A verificar a conta…')).toHaveCount(0);
  expect(state.tenantQueries).toBe(0);
  expect(errors).toEqual([]);
});

test('recovery without a session returns to login', async ({ page }) => {
  await account(page, { signedIn: false });
  await page.goto('/alterar-palavra-passe');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByTestId('login-page')).toBeVisible();
});

test('forced completion uses the privileged own-password action then signs out', async ({ page }) => {
  const state = await account(page);
  await page.goto('/alterar-palavra-passe');
  await fillPassword(page);
  await page.getByTestId('save-new-password-btn').click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect(state.calls.filter(x => x.action === 'complete_password_change')).toHaveLength(1);
  expect(state.calls.filter(x => x.path === '/auth/v1/logout')).toHaveLength(1);
  expect(state.calls.filter(x => x.path === '/auth/v1/user' && x.method === 'PUT')).toHaveLength(0);
});

test('completion failure preserves the draft and session, then allows retry', async ({ page }) => {
  const state = await account(page);
  state.failCompletion = true;
  await page.goto('/alterar-palavra-passe');
  await fillPassword(page);
  await page.getByTestId('save-new-password-btn').click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível verificar a conta. Tente novamente.');
  await expect(page.getByTestId('new-password-input')).toHaveValue(password);
  expect(state.calls.filter(x => x.path === '/auth/v1/logout')).toHaveLength(0);
  state.failCompletion = false;
  await page.getByTestId('save-new-password-btn').click();
  await expect(page).toHaveURL(/\/entrar$/);
});

test('weak or mismatched passwords never reach a mutation endpoint', async ({ page }) => {
  const state = await account(page);
  await page.goto('/alterar-palavra-passe');
  await page.getByTestId('new-password-input').fill('lowercasepassword');
  await page.getByTestId('confirm-password-input').fill('lowercasepassword');
  await page.getByTestId('save-new-password-btn').click();
  await expect(page.getByRole('alert')).toContainText('Inclua letras maiúsculas');
  await page.getByTestId('new-password-input').fill(password);
  await page.getByTestId('confirm-password-input').fill('DifferentPassword2026');
  await page.getByTestId('save-new-password-btn').click();
  await expect(page.getByRole('alert')).toContainText('não coincidem');
  expect(state.calls.filter(x => x.method !== 'GET')).toHaveLength(0);
});

test('ordinary recovery updates only the authenticated user through Auth', async ({ page }) => {
  const state = await account(page, { forced: false });
  await page.goto('/alterar-palavra-passe');
  await fillPassword(page);
  await page.getByTestId('save-new-password-btn').click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect(state.calls.filter(x => x.path === '/auth/v1/user' && x.method === 'PUT')).toHaveLength(1);
  expect(state.calls.filter(x => x.action === 'complete_password_change')).toHaveLength(0);
});
