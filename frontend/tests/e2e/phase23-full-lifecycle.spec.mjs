import { test, expect } from '@playwright/test';

const required = [
  'BARBEROS_E2E_FULL',
  'BARBEROS_E2E_EMAIL',
  'BARBEROS_E2E_PASSWORD',
  'BARBEROS_E2E_FULL_RESET_URL',
];

test.describe('BarberOS Phase 23 full lifecycle', () => {
  test.skip(
    process.env.BARBEROS_E2E_FULL !== '1' ||
      !process.env.BARBEROS_E2E_EMAIL ||
      !process.env.BARBEROS_E2E_PASSWORD ||
      !process.env.BARBEROS_E2E_FULL_RESET_URL,
    'Full lifecycle requires a dedicated, resettable E2E environment.',
  );

  test.describe.configure({ mode: 'serial' });

  const unique = 'p23-' + Date.now().toString(36);
  const shopName = 'BarberOS QA ' + unique;
  const shopSlug = unique;
  const customerPhone = '84' + Math.floor(1000000 + Math.random() * 8999999).toString();

  test('register -> onboarding -> public page -> booking -> agenda -> CRM -> completion', async ({ page }) => {
    await page.goto('/registar');

    await page.getByLabel('O teu nome').fill('BarberOS QA Owner');
    await page.getByLabel('Telemóvel').fill(customerPhone);
    await page.getByLabel('Email').fill(process.env.BARBEROS_E2E_EMAIL!);
    await page.getByLabel('Palavra-passe').fill(process.env.BARBEROS_E2E_PASSWORD!);
    await page.getByTestId('register-submit-btn').click();

    if (await page.getByTestId('register-check-email').isVisible().catch(() => false)) {
      throw new Error('E2E_EMAIL_CONFIRMATION_REQUIRED');
    }

    await expect(page).toHaveURL(/\/app\/onboarding/);

    await page.getByTestId('onboarding-name-input').fill(shopName);
    await page.getByTestId('onboarding-slug-input').fill(shopSlug);
    await page.getByTestId('onboarding-submit-btn').click();
    await expect(page).toHaveURL(/\/app\/onboarding/);

    await page.getByTestId('profile-name-input').fill(shopName);
    await page.getByTestId('profile-save-btn').click();

    await page.getByTestId('theme-lilac').click().catch(() => page.getByTestId(/^theme-/).nth(1).click());
    await page.getByTestId('theme-save-btn').click();

    await page.getByTestId('service-add-btn').click();
    await page.getByTestId('service-name-input').fill('Corte QA');
    await page.getByTestId('service-price-input').fill('500');
    await page.getByTestId('service-duration-input').fill('30');
    await page.getByTestId('service-save-btn').click();
    await expect(page.getByText('Corte QA')).toBeVisible();

    await page.getByTestId('haircut-add-btn').click();
    await page.getByTestId('haircut-name-input').fill('Low fade QA');
    await page.getByTestId('haircut-price-input').fill('500');
    await page.getByTestId('haircut-duration-input').fill('30');
    await page.getByTestId('haircut-save-btn').click();

    await page.getByTestId('barber-add-btn').click();
    await page.getByTestId('barber-name-input').fill('Nelson QA');
    await page.getByTestId('barber-years-input').fill('5');
    await page.getByTestId('barber-save-btn').click();

    await page.getByTestId('hours-save-btn').click();

    await page.getByTestId('link-done-btn').click();
    await expect(page).toHaveURL(/\/app(?:\?|$|\/)/);

    await page.goto('/barbearia/' + shopSlug);
    await expect(page).toHaveURL(new RegExp('/barbearia/' + shopSlug));
    await expect(page.getByText(shopName)).toBeVisible();
    await page.getByRole('link', { name: /Marcar/i }).first().click();

    await page.getByRole('button', { name: /Corte QA/i }).click();
    await page.getByTestId('booking-haircut-any').click();
    await page.getByTestId('booking-barber-any').click();

    const dateOptions = page.locator('[role="option"]:not([aria-disabled="true"])');
    await dateOptions.last().click();

    const timeOptions = page.locator('[role="option"]');
    await expect(timeOptions.first()).toBeVisible();
    await timeOptions.first().click();

    await page.getByLabel('Nome').fill('Cliente QA ' + unique);
    await page.getByLabel('Telefone').fill('86' + customerPhone.slice(2));
    await page.getByRole('button', { name: /Confirmar marcação/i }).click();

    await expect(page).toHaveURL(/\/marcacao\/[0-9a-f-]+$/);

    await page.goto('/app/agenda');
    await expect(page.getByTestId(/agenda-appointment-/).first()).toBeVisible();

    const appointment = page.getByTestId(/agenda-appointment-/).first();
    const confirm = appointment.getByRole('button', { name: 'Confirmar' });
    if (await confirm.count()) await confirm.click();

    const start = appointment.getByRole('button', { name: 'Iniciar atendimento' });
    if (await start.count()) await start.click();

    await expect(appointment.getByRole('button', { name: 'Concluir atendimento' })).toBeVisible();
    await appointment.getByRole('button', { name: 'Concluir atendimento' }).click();

    await page.goto('/app/clientes');
    await expect(page.getByText('Cliente QA ' + unique)).toBeVisible();
    await page.getByText('Cliente QA ' + unique).click();
    await expect(page.getByTestId('customer-detail-page')).toBeVisible();
    await expect(page.getByText('1')).toBeVisible();
  });

  test('review request surface is reachable from the completed appointment flow', async ({ page }) => {
    test.skip(true, 'Review notification timing is controlled by the dedicated environment and is verified by the database notification suite.');
  });

  test.afterAll(async () => {
    const resetUrl = process.env.BARBEROS_E2E_FULL_RESET_URL!;
    const response = await page.request.post(resetUrl, {
      headers: {
        'content-type': 'application/json',
        'x-barberos-e2e-reset': process.env.BARBEROS_E2E_PASSWORD!,
      },
      data: { slug: shopSlug },
    });
    expect(response.ok()).toBeTruthy();
  });
});
