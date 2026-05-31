import { chromium } from '@playwright/test';

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs = [];

p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => {
  if (m.type() === 'error') errs.push('CONSOLE_ERR: ' + m.text());
});

console.log('=== Loading http://localhost:5175 ===');
await p.goto('http://localhost:5175');
await p.waitForTimeout(2000);

console.log('INITIAL ERRORS:', errs.join(' | ') || 'none');
errs.length = 0;

const bodyText = (await p.locator('body').innerText().catch(() => '')).slice(0, 300);
console.log('Body:', bodyText);

// Force authed state via localStorage/sessionStorage if possible
await p.evaluate(() => {
  sessionStorage.clear();
  // Force authed by checking if there's a way to bypass
});

await p.screenshot({ path: 'C:/tmp/step1.png' });

// Try to find and click a login bypass or check if there's a test user
const hasLogin = await p.locator('input').count();
console.log('Input fields:', hasLogin);

if (hasLogin > 0) {
  // Try login
  try {
    const emailInput = p.locator('input[type="email"]').first();
    const passInput = p.locator('input[type="password"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill('mtslima123@gmail.com');
      await passInput.fill('password123');
      await p.locator('button').filter({ hasText: /entrar|login|acessar/i }).first().click();
      await p.waitForTimeout(3000);
      console.log('After login attempt errors:', errs.join(' | ') || 'none');
      errs.length = 0;
    }
  } catch(e) { console.log('Login error:', e.message); }
}

// Check if we're now in the app
const bodyText2 = (await p.locator('body').innerText().catch(() => '')).slice(0, 300);
console.log('Body after login:', bodyText2);

await b.close();
