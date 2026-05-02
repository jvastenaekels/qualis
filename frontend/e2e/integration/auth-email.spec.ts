import { test, expect } from '@playwright/test';

test('signup → verify email → login works', async ({ page, request }) => {
  const email = `e2e-verify-${Date.now()}@example.com`;
  const password = 'TestPass123!';

  // Gate: only proceed when the debug endpoint is available (ENVIRONMENT=test).
  // In development or production the endpoint returns 404 and we skip gracefully.
  const envProbe = await request.get('/api/test/debug/last-email');
  if (envProbe.status() !== 200) {
    test.skip(true, 'Test backend missing /api/test/debug/last-email — verification E2E unavailable');
    return;
  }

  // Sign up via the API directly (UI signup is covered by other specs).
  const signup = await request.post('/api/register', {
    data: { email, password },
  });
  expect(signup.status()).toBe(201);
  const signupBody = await signup.json();

  // If email verification is not active in this env (SMTP unset, so
  // email_verification_active=False), the account is immediately active.
  // The verification flow cannot be exercised — skip rather than fail.
  if (signupBody.requires_email_verification === false) {
    test.skip(true, 'Verification not active in this env (SMTP unset) — flow not exercisable');
    return;
  }

  // Login must be blocked for an unverified account.
  const blockedLogin = await request.post('/api/token', {
    form: { username: email, password },
  });
  expect(blockedLogin.status()).toBe(403);

  // Fetch the verification link from the test-only debug endpoint.
  const lastEmail = await request.get('/api/test/debug/last-email');
  expect(lastEmail.status()).toBe(200);
  const body = (await lastEmail.json()).body as string;
  const linkMatch = body.match(/href="([^"]+\/verify-email[^"]+)"/);
  expect(linkMatch).not.toBeNull();
  const verifyUrl = linkMatch![1];

  // Visit the verification link in the browser.
  await page.goto(verifyUrl);
  await expect(page.getByText(/verified/i)).toBeVisible({ timeout: 5000 });

  // Login must now succeed.
  const okLogin = await request.post('/api/token', {
    form: { username: email, password },
  });
  expect(okLogin.status()).toBe(200);
});
