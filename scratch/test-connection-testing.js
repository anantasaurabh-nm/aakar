const assert = require('assert');

async function main() {
  console.log('=== Testing Connection Testing & Provider Capabilities ===\n');

  // 1. Authenticate
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@doers-os.internal', password: 'Password123!' }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login should succeed');
  const cookieHeader = loginRes.headers.get('set-cookie');
  const token = cookieHeader.match(/doers_session=([^;]+)/)[1];
  const headers = { 'Content-Type': 'application/json', 'Cookie': `doers_session=${token}` };

  // 2. Fetch connections
  const dataRes = await fetch('http://localhost:4000/api/data/connectors/connection', { headers });
  assert.strictEqual(dataRes.status, 200);
  const data = await dataRes.json();
  console.log(`✓ Retrieved ${data.items.length} configured connections.`);

  const trello = data.items.find((c) => c.provider === 'trello');
  assert(trello, 'Trello connection should exist in seed data');
  console.log(`Found Trello connection: ${trello.name} (${trello.id})`);

  // 3. Test ID-based connection test (as triggered by DataTable row action or RecordView toolbar)
  console.log('\n--- 1. Testing saved connection via POST /api/actions/connectors/:id/test ---');
  const testRes1 = await fetch(`http://localhost:4000/api/actions/connectors/${trello.id}/test`, {
    method: 'POST',
    headers,
  });
  assert(testRes1.status === 200 || testRes1.status === 201, `Status should be 200/201, got ${testRes1.status}`);
  const result1 = await testRes1.json();
  console.log('Result 1 (saved connection):', result1);
  assert(typeof result1.success === 'boolean', 'Result should have success boolean');
  assert(typeof result1.message === 'string', 'Result should have message string');
  assert(typeof result1.latencyMs === 'number', 'Result should record latency in ms');

  // 4. Test live credentials test via POST /api/actions/connectors/test (with ID + form edits)
  console.log('\n--- 2. Testing live credentials with ID via POST /api/actions/connectors/test ---');
  const testRes2 = await fetch('http://localhost:4000/api/actions/connectors/test', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: trello.id,
      provider: 'trello',
      trello_apiKey: 'trel••••••••3456', // masked bullet string should preserve decrypted key
    }),
  });
  assert(testRes2.status === 200 || testRes2.status === 201);
  const result2 = await testRes2.json();
  console.log('Result 2 (with ID & masked preserve):', result2);
  assert(typeof result2.success === 'boolean');
  assert(typeof result2.latencyMs === 'number');

  // 5. Test live credentials without ID (New Connection wizard testing)
  console.log('\n--- 3. Testing new connection live credentials without ID ---');
  const testRes3 = await fetch('http://localhost:4000/api/actions/connectors/test', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: 'custom',
      baseUrl: 'https://httpbin.org/status/200',
    }),
  });
  assert(testRes3.status === 200 || testRes3.status === 201);
  const result3 = await testRes3.json();
  console.log('Result 3 (New custom connection live probe):', result3);
  assert(typeof result3.success === 'boolean');

  // 6. Verify Form endpoint returns updated Diagnostic Test Status & Last Probed At
  console.log('\n--- 4. Verifying Form endpoint returns Diagnostic Test Status & timestamp ---');
  const formRes = await fetch(`http://localhost:4000/api/ui/views/connectors/connection/form?id=${trello.id}`, { headers });
  assert.strictEqual(formRes.status, 200);
  const form = await formRes.json();
  console.log('Form Operational Status group fields:');
  const statusGroup = form.config.layout.groups.find((g) => g.id === 'status_group');
  console.log('Fields in status_group:', statusGroup?.fields);
  assert(statusGroup?.fields.includes('lastTestedStatus'), 'Should include lastTestedStatus');
  assert(statusGroup?.fields.includes('lastTestedAt'), 'Should include lastTestedAt');

  console.log('Record values for operational health:');
  console.log('  status:', form.record.status);
  console.log('  lastTestedStatus:', form.record.lastTestedStatus);
  console.log('  lastTestedAt:', form.record.lastTestedAt);
  assert(form.record.lastTestedStatus, 'lastTestedStatus should be set on record');

  console.log('\nForm toolbar actions:');
  console.log(form.toolbar);
  const testAction = form.toolbar?.find((t) => t.id === 'test');
  assert(testAction, 'Form toolbar should contain test action');
  assert.strictEqual(testAction.action.target, 'connectors.connection.test');

  console.log('\n======================================================');
  console.log('🎉 CONNECTION TESTING & PROVIDER ARCHITECTURE VERIFIED! 🎉');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
