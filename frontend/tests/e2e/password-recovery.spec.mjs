import { test, expect } from '@playwright/test';

// Exercise the actual App router, AuthProvider, SDK and recovery form. Only the
// external HTTP boundary is controlled. No production account/password is used.
const userId = '11111111-1111-4111-8111-111111111111';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'recovery@example.com', app_metadata: {}, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
const password = 'RecoveryFixture2026';

async function account(page, { signedIn = true, forced = true } = {}) {
  const state = { calls: [], failCompletion: false, tenantQueries: 0, profileMode: 'valid', forced, failMemberships: false, failLogout: false, releaseProfile: null };
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
    if (path === '/rest/v1/profiles') {
      if (state.profileMode === 'hang') return new Promise(resolve => {
        state.releaseProfile = () => route.abort('timedout').catch(() => {}).finally(resolve);
      });
      if (state.profileMode === 'unavailable') return json({code:'XX000',message:'Controlled profile failure'},503);
      if (state.profileMode === 'missing') return json([]);
      if (state.profileMode === 'invalid') return json([{id:userId,is_platform_admin:true,password_change_required:'false'}]);
      if (state.profileMode === 'wrong-user') return json([{id:'22222222-2222-4222-8222-222222222222',full_name:'Other account',phone:null,avatar_url:null,is_platform_admin:true,created_at:user.created_at,password_change_required:false}]);
      return json([{ id: userId, full_name: 'Recovery fixture', phone: null, avatar_url: null, is_platform_admin: false, created_at: user.created_at, password_change_required: state.forced }]);
    }
    if (path === '/rest/v1/barbershop_members') {
      state.tenantQueries++;
      return state.failMemberships ? json({code:'XX000',message:'Controlled membership failure'},503) : json([]);
    }
    if (path === '/functions/v1/admin-credential-manager') {
      expect(body).toEqual({ action: 'complete_password_change', new_password: password });
      return state.failCompletion ? json({ ok: false, error: 'ACCOUNT_STATE_UNAVAILABLE', message: 'Não foi possível verificar a conta. Tente novamente.' }, 503) : json({ ok: true });
    }
    if (path === '/auth/v1/user' && request.method() === 'PUT') {
      expect(body.password).toBe(password);
      return json(user);
    }
    if (path === '/auth/v1/user') return json(user);
    if (path === '/auth/v1/logout') return state.failLogout ? json({message:'Controlled logout failure'},503) : route.fulfill({ status: 204 });
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

for (const profileMode of ['unavailable','missing','invalid','wrong-user']) {
  test(`account ${profileMode} fails closed with an explicit retry instead of an endless loader`,async({page})=>{
    const state=await account(page);state.profileMode=profileMode;
    await page.goto('/alterar-palavra-passe');
    await expect(page.getByTestId('account-state-error')).toBeVisible();
    await expect(page.getByTestId('save-new-password-btn')).toHaveCount(0);
    await expect(page.getByText('A verificar a conta…')).toHaveCount(0);
    state.profileMode='valid';await page.getByRole('button',{name:'Tentar de novo'}).click();
    await expect(page.getByTestId('mandatory-password-change')).toBeVisible();
    expect(state.tenantQueries).toBe(0);
    expect(state.calls.filter(c=>c.method!=='GET')).toHaveLength(0);
  });
}

test('private route profile failure never reaches tenant data or the onboarding form',async({page})=>{
  const state=await account(page,{forced:false});state.profileMode='unavailable';
  await page.goto('/app');
  await expect(page.getByTestId('account-state-error')).toBeVisible();
  expect(state.tenantQueries).toBe(0);
  state.profileMode='valid';await page.getByRole('button',{name:'Tentar de novo'}).click();
  await expect(page).toHaveURL(/\/app\/onboarding$/);
  expect(state.tenantQueries).toBeGreaterThan(0);
});

test('admin route rejects invalid profile data before showing administration',async({page})=>{
  const state=await account(page,{forced:false});state.profileMode='wrong-user';
  await page.goto('/admin');
  await expect(page.getByTestId('account-state-error')).toBeVisible();
  await expect(page.getByTestId('platform-admin-access-denied')).toHaveCount(0);
  expect(state.tenantQueries).toBe(0);
  state.profileMode='valid';await page.getByRole('button',{name:'Tentar de novo'}).click();
  await expect(page.getByTestId('platform-admin-access-denied')).toBeVisible();
});

test('membership failure is recoverable and cannot masquerade as an account without a shop',async({page})=>{
  const state=await account(page,{forced:false});state.failMemberships=true;
  await page.goto('/app');
  await expect(page.getByTestId('shop-state-error')).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
  state.failMemberships=false;await page.getByRole('button',{name:'Tentar de novo'}).click();
  await expect(page).toHaveURL(/\/app\/onboarding$/);
});

test('recovery account failure can terminate the session without submitting a password',async({page})=>{
  const state=await account(page);state.profileMode='missing';
  await page.goto('/alterar-palavra-passe');
  await expect(page.getByTestId('account-state-error')).toBeVisible();
  await page.getByRole('button',{name:'Terminar sessão',exact:true}).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect(state.calls.filter(x=>x.path==='/auth/v1/logout')).toHaveLength(1);
  expect(state.calls.filter(x=>x.action==='complete_password_change')).toHaveLength(0);
});

test('background account verification preserves the draft, then enforces a newly required rotation',async({page})=>{
  const state=await account(page,{forced:false});
  await page.goto('/app/onboarding');
  await page.getByTestId('onboarding-name-input').fill('Rascunho preservado');
  const profileCalls=()=>state.calls.filter(c=>c.path==='/rest/v1/profiles').length;
  let before=profileCalls();
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(profileCalls).toBeGreaterThan(before);
  await expect(page.getByTestId('onboarding-name-input')).toHaveValue('Rascunho preservado');
  state.forced=true;before=profileCalls();
  await page.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(profileCalls).toBeGreaterThan(before);
  await expect(page).toHaveURL(/\/alterar-palavra-passe$/);
  await expect(page.getByTestId('mandatory-password-change')).toBeVisible();
  expect(state.calls.filter(c=>c.method!=='GET')).toHaveLength(0);
});

test('logout failure stays blocked, reports the error and allows another explicit attempt',async({page})=>{
  const state=await account(page);state.profileMode='missing';state.failLogout=true;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/alterar-palavra-passe');
  await expect(page.getByTestId('account-state-error')).toBeVisible();
  await page.getByRole('button',{name:'Terminar sessão',exact:true}).click();
  await expect(page.getByTestId('account-state-error')).toContainText('Não foi possível terminar a sessão');
  await expect(page).toHaveURL(/\/alterar-palavra-passe$/);
  state.failLogout=false;await page.getByRole('button',{name:'Terminar sessão',exact:true}).click();
  await expect(page).toHaveURL(/\/entrar$/);
  expect(errors).toEqual([]);
});

test('profile request timeout becomes a retryable state and never leaves a permanent loader',async({page})=>{
  const state=await account(page);state.profileMode='hang';
  try {
    await page.goto('/alterar-palavra-passe');
    await expect(page.getByTestId('account-state-error')).toBeVisible({timeout:15_000});
    await expect(page.getByText('A verificar a conta…')).toHaveCount(0);
    state.profileMode='valid';await state.releaseProfile?.();
    await page.getByRole('button',{name:'Tentar de novo'}).click();
    await expect(page.getByTestId('mandatory-password-change')).toBeVisible();
    expect(state.tenantQueries).toBe(0);
  } finally { await state.releaseProfile?.(); }
});
