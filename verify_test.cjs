const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const errs = [];

  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('ERR: ' + m.text()); });

  await p.goto('http://localhost:5176?devMode=1');
  await p.waitForTimeout(2000);
  console.log('LOAD ERRORS:', errs.join('\n') || 'none'); errs.length = 0;

  const sidebar = p.locator('aside.sidebar').first();

  // Open obras
  await sidebar.hover(); await p.waitForTimeout(300);
  await p.locator('button[title="Obras"], button:has-text("Obras")').first().click();
  await p.waitForTimeout(1500);

  // Click first obra
  const card = p.locator('.obra-card').first();
  const row  = p.locator('tbody tr').first();
  if (await card.count() > 0) await card.click();
  else await row.click();
  await p.waitForTimeout(2000);
  console.log('OBRA DETAIL ERRORS:', errs.join('\n') || 'none'); errs.length = 0;

  // --- Test 1: Visão Geral — no "Ver cronograma completo" button ---
  console.log('\n=== VISÃO GERAL ===');
  const verCronoBtn = await p.locator('button:has-text("Ver cronograma completo")').count();
  console.log('Botão "Ver cronograma completo" presente:', verCronoBtn, '(esperado: 0)');

  // --- Test 2: Fotos tab ---
  console.log('\n=== FOTOS ===');
  await p.locator('.tab:has-text("Fotos")').click();
  await p.waitForTimeout(1000);
  console.log('FOTOS ERRORS:', errs.join('\n') || 'none'); errs.length = 0;
  const semTitulo = await p.locator('text=Registro fotográfico').count();
  console.log('Título "Registro fotográfico" presente:', semTitulo, '(esperado: 0)');
  const badge = await p.locator('text=/\\d+ foto/').count();
  console.log('Badge contador de fotos presente:', badge, '(esperado: >= 1)');
  const uploadBtn = await p.locator('button:has-text("Upload")').count();
  console.log('Botão Upload presente:', uploadBtn, '(esperado: 1)');
  const filtroData = await p.locator('input[type="date"]').count();
  console.log('Filtro de Data presente:', filtroData, '(esperado: 0)');

  // --- Test 3: Cronograma tab — Lista view ---
  console.log('\n=== CRONOGRAMA TAB ===');
  await p.locator('.tab:has-text("Cronograma")').click();
  await p.waitForTimeout(800);
  console.log('CRONOGRAMA ERRORS:', errs.join('\n') || 'none'); errs.length = 0;

  const ganttChip = p.locator('.chip:has-text("Gantt")').first();
  const listaChip = p.locator('.chip:has-text("Lista")').first();
  const ganttActive = await ganttChip.getAttribute('class');
  console.log('Chip Gantt classes:', ganttActive, '(deve conter "active")');

  await listaChip.click();
  await p.waitForTimeout(500);
  const listaActive = await listaChip.getAttribute('class');
  console.log('Chip Lista classes após clique:', listaActive, '(deve conter "active")');
  const tabelaRows = await p.locator('table tbody tr').count();
  console.log('Linhas na tabela Lista:', tabelaRows, '(esperado: > 0)');
  console.log('LISTA ERRORS:', errs.join('\n') || 'none'); errs.length = 0;

  // Switch to another tab and back — verify Lista persists
  await p.locator('.tab:has-text("Visão geral")').click();
  await p.waitForTimeout(400);
  await p.locator('.tab:has-text("Cronograma")').click();
  await p.waitForTimeout(500);
  const listaStillActive = await p.locator('.chip:has-text("Lista")').first().getAttribute('class');
  console.log('Chip Lista após trocar aba e voltar:', listaStillActive, '(deve conter "active")');

  await b.close();
})().catch(e => console.error('Fatal:', e.message));
