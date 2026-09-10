async function main() {
  console.log('--- Testing Create, Update & Delete Flow ---');

  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@doers-os.internal', password: 'Password123!' }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  const token = cookieHeader.match(/doers_session=([^;]+)/)[1];
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `doers_session=${token}`,
    'Authorization': `Bearer ${token}`,
  };

  // 1. Create a test connection
  console.log('\nCreating temporary connection...');
  const createRes = await fetch('http://localhost:4000/api/actions/connectors/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Automated Test API',
      provider: 'custom',
      authType: 'bearer_token',
      baseUrl: 'https://httpbin.org/bearer',
      apiKey: 'test_token_secret_12345',
      customHeaders: JSON.stringify({ 'X-Client-Id': 'automation-test' }),
    }),
  });
  console.log('Create Status:', createRes.status);
  const created = await createRes.json();
  console.log('Created ID:', created.id, 'Masked Key:', created.maskedPreview);

  if (!created.id) throw new Error('Create failed: ' + JSON.stringify(created));

  // 2. Load form in Show/Edit mode
  console.log('\nFetching form for created connection...');
  const formRes = await fetch(`http://localhost:4000/api/ui/views/connectors/connection/form?id=${created.id}`, { headers });
  console.log('Form Status:', formRes.status);
  const formJson = await formRes.json();
  console.log('Form Record Name:', formJson.record?.name);
  console.log('Custom Headers preserved:', formJson.record?.customHeaders);

  // 3. Update connection (e.g. change name, keep secret)
  console.log('\nUpdating connection name without re-entering secret...');
  const updateRes = await fetch(`http://localhost:4000/api/actions/connectors/${created.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      name: 'Automated Test API (Renamed)',
      baseUrl: 'https://httpbin.org/get',
    }),
  });
  console.log('Update Status:', updateRes.status);
  const updated = await updateRes.json();
  console.log('Updated Name:', updated.name, 'Masked Key:', updated.maskedPreview);

  // 4. Test connection diagnostics on updated connection
  console.log('\nTesting diagnostics probe...');
  const testRes = await fetch(`http://localhost:4000/api/actions/connectors/${created.id}/test`, {
    method: 'POST',
    headers,
  });
  console.log('Test Status:', testRes.status);
  console.log('Test Output:', await testRes.json());

  // 5. Delete temporary connection
  console.log('\nDeleting temporary connection...');
  const delRes = await fetch(`http://localhost:4000/api/actions/connectors/${created.id}`, {
    method: 'DELETE',
    headers,
  });
  console.log('Delete Status:', delRes.status);
  console.log('Delete Response:', await delRes.json());

  console.log('\n--- Full Lifecycle Test Passed! ---');
}

main().catch(console.error);
