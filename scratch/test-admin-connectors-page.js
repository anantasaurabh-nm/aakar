const assert = require('assert');
const { validateSDUIResponse, isInvalidSection } = require('@erp/shared-contracts');

async function main() {
  console.log('Testing GET /api/ui/pages/admin/connectors ...');

  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@doers-os.internal', password: 'Password123!' }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  const token = cookieHeader.match(/doers_session=([^;]+)/)[1];
  const headers = { 'Content-Type': 'application/json', 'Cookie': `doers_session=${token}` };

  const res = await fetch('http://localhost:4000/api/ui/pages/admin/connectors', { headers });
  assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);

  const rawJson = await res.json();
  console.log('Page Title:', rawJson?.page?.title);
  console.log('Page Sections count:', rawJson?.page?.sections?.length);

  // Run the EXACT validator that the frontend uses
  const validationResult = validateSDUIResponse(rawJson);
  assert.strictEqual(validationResult.ok, true, `validateSDUIResponse failed: ${validationResult.ok ? '' : validationResult.reason}`);
  console.log('✓ validateSDUIResponse returned ok: true!');

  const page = validationResult.page;
  for (const s of page.page.sections) {
    if (isInvalidSection(s)) {
      console.error(`✕ Section "${s.id}" (${s.label}) is INVALID! Reason: ${s.reason}`);
      process.exit(1);
    } else {
      console.log(`✓ Section "${s.id}" (${s.label}) is 100% VALID!`);
      console.log(`  type: ${s.type}`);
      console.log(`  columns: ${s.config.columns.map(c => c.key).join(', ')}`);
      console.log(`  rowActions: ${s.config.rowActions.map(a => a.id).join(', ')}`);
    }
  }

  // Also test the data source
  console.log('\nTesting data source GET /api/data/connectors/connection ...');
  const dataRes = await fetch('http://localhost:4000/api/data/connectors/connection', { headers });
  assert.strictEqual(dataRes.status, 200);
  const data = await dataRes.json();
  console.log(`✓ Data source returned ${data?.items?.length ?? 0} connections!`);

  console.log('\n======================================================');
  console.log('🎉 /admin/connectors IS 100% VALID AND OPERATIONAL! 🎉');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
