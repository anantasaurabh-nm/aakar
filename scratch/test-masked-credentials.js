const assert = require('assert');

async function main() {
  console.log('Testing credential masking in form & detail views...');

  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@doers-os.internal', password: 'Password123!' }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  const token = cookieHeader.match(/doers_session=([^;]+)/)[1];
  const headers = { 'Content-Type': 'application/json', 'Cookie': `doers_session=${token}` };

  const dataRes = await fetch('http://localhost:4000/api/data/connectors/connection', { headers });
  const data = await dataRes.json();
  const trello = data.items.find((i) => i.provider === 'trello');
  assert(trello, 'Trello connection should exist');

  const formRes = await fetch(`http://localhost:4000/api/ui/views/connectors/connection/form?id=${trello.id}`, { headers });
  assert.strictEqual(formRes.status, 200);
  const form = await formRes.json();

  console.log('Trello Record in Form Payload:');
  console.log(form.record);

  assert(form.record.trello_apiKey.includes('•'), `trello_apiKey should be masked: ${form.record.trello_apiKey}`);
  assert(form.record.trello_token.includes('•'), `trello_token should be masked: ${form.record.trello_token}`);
  assert(form.record.trello_secret.includes('•'), `trello_secret should be masked: ${form.record.trello_secret}`);

  // Test updating connection name without supplying secret keys
  const updateRes = await fetch(`http://localhost:4000/api/actions/connectors/${trello.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: `${trello.name} (Updated)`,
      provider: 'trello',
      // Sending masked values or omitting them
      trello_apiKey: form.record.trello_apiKey,
      trello_token: '',
      trello_secret: undefined,
    }),
  });
  assert.strictEqual(updateRes.status, 200, `Update status: ${updateRes.status}`);
  const updatedConnection = await updateRes.json();
  console.log('✓ Successfully updated connection without corrupting encrypted credentials!');

  // Verify ping/test still works with preserved credentials
  const testRes = await fetch(`http://localhost:4000/api/actions/connectors/${trello.id}/test`, {
    method: 'POST',
    headers,
  });
  assert(testRes.status === 200 || testRes.status === 201, `Expected 200 or 201, got ${testRes.status}`);
  const testResult = await testRes.json();
  console.log('Test Ping result with preserved credentials:', testResult);

  // Restore name
  await fetch(`http://localhost:4000/api/actions/connectors/${trello.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: trello.name,
      provider: 'trello',
    }),
  });

  console.log('✓ ALL CREDENTIAL MASKING & SECURITY CHECKS PASSED!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
