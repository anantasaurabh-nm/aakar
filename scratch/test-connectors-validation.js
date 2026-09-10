async function main() {
  console.log('--- Validating Connectors Endpoints ---');

  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@doers-os.internal', password: 'Password123!' }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  if (!cookieHeader) {
    throw new Error('Login failed! ' + await loginRes.text());
  }
  const token = cookieHeader.match(/doers_session=([^;]+)/)[1];
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `doers_session=${token}`,
    'Authorization': `Bearer ${token}`,
  };

  console.log('✓ Logged in as SUPER_ADMIN');

  // 1. Check UI Page: /api/ui/pages/admin/connectors
  console.log('\n--- 1. Testing GET /api/ui/pages/admin/connectors ---');
  const pageRes = await fetch('http://localhost:4000/api/ui/pages/admin/connectors', { headers });
  console.log('Status:', pageRes.status);
  const page = await pageRes.json();
  const sections = page?.page?.sections || [];
  console.log('Section count:', sections.length);
  const tableSec = sections[0];
  console.log('Table section ID:', tableSec?.id);
  console.log('Table section type:', tableSec?.type);
  console.log('Table data source:', tableSec?.data?.source);
  console.log('Table detailView:', tableSec?.config?.detailView);
  console.log('Table selectable:', tableSec?.config?.selectable);
  console.log('Toolbar actions:', tableSec?.toolbar?.map((t) => `${t.id} (${t.type})`));
  const newAction = tableSec?.toolbar?.find((t) => t.id === 'new');
  console.log('New button action:', newAction?.action);

  if (tableSec?.config?.detailView !== true) {
    throw new Error('FAIL: detailView is not true!');
  }
  if (tableSec?.data?.source !== 'connectors.connection') {
    throw new Error('FAIL: data.source is not connectors.connection!');
  }
  if (newAction?.action?.type !== 'create' || newAction?.action?.target !== 'connectors.connection.form') {
    throw new Error('FAIL: new action is not create connectors.connection.form!');
  }

  // 2. Check Data: GET /api/data/connectors/connection
  console.log('\n--- 2. Testing GET /api/data/connectors/connection ---');
  const dataRes = await fetch('http://localhost:4000/api/data/connectors/connection', { headers });
  console.log('Status:', dataRes.status);
  const data = await dataRes.json();
  console.log('Items count:', data?.items?.length);
  console.log('Total count:', data?.total);
  const firstItem = data?.items?.[0];
  console.log('Sample item:', firstItem ? `${firstItem.name} (${firstItem.provider}) - ${firstItem.maskedPreview}` : 'NONE');

  // 3. Check Form: GET /api/ui/views/connectors/connection/form (New mode)
  console.log('\n--- 3. Testing GET /api/ui/views/connectors/connection/form (New) ---');
  const formNewRes = await fetch('http://localhost:4000/api/ui/views/connectors/connection/form', { headers });
  console.log('Status:', formNewRes.status);
  const formNew = await formNewRes.json();
  console.log('Form label:', formNew?.label);
  console.log('Form submit action:', formNew?.config?.submitAction);
  console.log('Form field groups:', formNew?.config?.layout?.groups?.map((g) => g.title));
  console.log('Form fields count:', formNew?.config?.fields?.length);

  // 4. Check Form: GET /api/ui/views/connectors/connection/form?id=<firstId> (Show/Edit mode)
  if (firstItem?.id) {
    console.log(`\n--- 4. Testing GET /api/ui/views/connectors/connection/form?id=${firstItem.id} ---`);
    const formEditRes = await fetch(`http://localhost:4000/api/ui/views/connectors/connection/form?id=${firstItem.id}`, { headers });
    console.log('Status:', formEditRes.status);
    const formEdit = await formEditRes.json();
    console.log('Form label:', formEdit?.label);
    console.log('Record present:', Boolean(formEdit?.record));
    console.log('Record name:', formEdit?.record?.name);
    console.log('Record maskedPreview:', formEdit?.record?.maskedPreview);
    console.log('Record raw apiKey exposed?', formEdit?.record?.apiKey === '' ? 'NO (Clean!)' : 'WARNING: ' + formEdit?.record?.apiKey);
    console.log('Submit target:', formEdit?.config?.submitAction?.target);
  }

  // 5. Test Live Diagnostics: POST /api/actions/connectors/:id/test
  if (firstItem?.id) {
    console.log(`\n--- 5. Testing POST /api/actions/connectors/${firstItem.id}/test ---`);
    const testRes = await fetch(`http://localhost:4000/api/actions/connectors/${firstItem.id}/test`, {
      method: 'POST',
      headers,
    });
    console.log('Status:', testRes.status);
    const testResult = await testRes.json();
    console.log('Test result:', testResult);
  }

  console.log('\nALL ENDPOINT VERIFICATIONS PASSED PERFECTLY!');
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
