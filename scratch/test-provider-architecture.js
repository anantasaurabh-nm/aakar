const assert = require('assert');

async function main() {
  console.log('=== Test: Provider-First Connectors Architecture ===\n');

  // 1. Authenticate as admin
  console.log('Step 1: Logging in as admin@doers-os.internal...');
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@doers-os.internal', password: 'Password123!' }),
  });

  const cookieHeader = loginRes.headers.get('set-cookie');
  if (!cookieHeader) {
    console.error('Login failed! Response:', await loginRes.text());
    process.exit(1);
  }
  const tokenMatch = cookieHeader.match(/doers_session=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : '';
  const headers = {
    'Content-Type': 'application/json',
    'Cookie': `doers_session=${token}`,
  };
  console.log('✓ Logged in successfully.\n');

  // 2. Fetch connection form schema
  console.log('Step 2: Fetching /api/ui/views/connectors/connection/form ...');
  const formRes = await fetch('http://localhost:4000/api/ui/views/connectors/connection/form', { headers });
  assert.strictEqual(formRes.status, 200, `Expected 200, got ${formRes.status}`);

  const formData = await formRes.json();
  const formConfig = formData?.config;
  assert.ok(formConfig, 'Expected form config in response');
  assert.ok(formConfig.fields, 'Expected fields in form config');

  const providerField = formConfig.fields.find((f) => f.name === 'provider');
  assert.ok(providerField, 'Expected provider dropdown field');
  const providerValues = providerField.options.map((o) => o.value);
  console.log('Registered providers in form dropdown:', providerValues);
  assert.ok(providerValues.includes('trello'), 'Expected trello provider');
  assert.ok(providerValues.includes('stripe'), 'Expected stripe provider');
  assert.ok(providerValues.includes('github'), 'Expected github provider');
  assert.ok(providerValues.includes('slack'), 'Expected slack provider');
  assert.ok(providerValues.includes('openai'), 'Expected openai provider');
  assert.ok(providerValues.includes('custom'), 'Expected custom provider');

  // Verify Trello fields exist with showWhen
  const trelloKeyField = formConfig.fields.find((f) => f.name === 'trello_apiKey');
  const trelloTokenField = formConfig.fields.find((f) => f.name === 'trello_token');
  const trelloSecretField = formConfig.fields.find((f) => f.name === 'trello_secret');
  assert.ok(trelloKeyField, 'Expected trello_apiKey field');
  assert.ok(trelloTokenField, 'Expected trello_token field');
  assert.ok(trelloSecretField, 'Expected trello_secret field');
  assert.deepStrictEqual(trelloKeyField.showWhen, { field: 'provider', operator: 'eq', value: 'trello' });
  console.log('✓ Form schema includes all provider-specific fields with declarative showWhen rules.\n');

  // 3. Create a Trello Connection
  console.log('Step 3: Creating Trello Connection...');
  const createTrelloRes = await fetch('http://localhost:4000/api/actions/connectors/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Main Trello Workspace ${Date.now()}`,
      provider: 'trello',
      trello_apiKey: 'trellokey1234567890abcdef123456',
      trello_token: 'trellotoken1234567890abcdef1234567890abcdef1234567890abcdef1234',
      trello_secret: 'trellowebhooksecret_xyz',
    }),
  });
  console.log('Create Trello Status:', createTrelloRes.status);
  const createdTrello = await createTrelloRes.json();
  assert.strictEqual(createTrelloRes.status, 201, `Failed to create Trello: ${JSON.stringify(createdTrello)}`);
  assert.ok(createdTrello.id, 'Expected connection ID');
  assert.strictEqual(createdTrello.provider, 'trello');
  console.log('✓ Created Trello connection! ID:', createdTrello.id);
  console.log('  Masked Preview:', createdTrello.maskedPreview);
  console.log('  Base URL:', createdTrello.baseUrl);
  assert.ok(createdTrello.maskedPreview.includes('Key:'), 'Expected Key in masked preview');
  assert.ok(createdTrello.maskedPreview.includes('Token:'), 'Expected Token in masked preview');

  // 4. Create a Stripe Connection
  console.log('\nStep 4: Creating Stripe Connection...');
  const createStripeRes = await fetch('http://localhost:4000/api/actions/connectors/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Stripe Store ${Date.now()}`,
      provider: 'stripe',
      stripe_secretKey: 'sk_test_placeholder_mock_key_123456789',
    }),
  });
  console.log('Create Stripe Status:', createStripeRes.status);
  const createdStripe = await createStripeRes.json();
  assert.strictEqual(createStripeRes.status, 201, `Failed to create Stripe: ${JSON.stringify(createdStripe)}`);
  console.log('✓ Created Stripe connection! ID:', createdStripe.id);
  console.log('  Masked Preview:', createdStripe.maskedPreview);
  assert.ok(createdStripe.maskedPreview.startsWith('sk_'), 'Expected sk_ prefix in masked preview');

  // 5. Create a Custom REST Connection
  console.log('\nStep 5: Creating Custom REST Connection...');
  const createCustomRes = await fetch('http://localhost:4000/api/actions/connectors/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Internal Microservice ${Date.now()}`,
      provider: 'custom',
      custom_baseUrl: 'https://api.internal.example.com',
      custom_authHeader: 'X-Service-Token',
      custom_authSecret: 'super-secret-service-token-123',
      custom_customHeaders: JSON.stringify({ 'X-Environment': 'production' }),
    }),
  });
  console.log('Create Custom Status:', createCustomRes.status);
  const createdCustom = await createCustomRes.json();
  assert.strictEqual(createCustomRes.status, 201, `Failed to create Custom: ${JSON.stringify(createdCustom)}`);
  console.log('✓ Created Custom connection! ID:', createdCustom.id);
  console.log('  Masked Preview:', createdCustom.maskedPreview);

  // 6. Test Diagnostic Probe
  console.log('\nStep 6: Testing diagnostic test endpoint on created connection...');
  const testRes = await fetch(`http://localhost:4000/api/actions/connectors/${createdCustom.id}/test`, {
    method: 'POST',
    headers,
  });
  console.log('Test Probe Status:', testRes.status);
  const testData = await testRes.json();
  console.log('Test Result:', testData);
  assert.ok(testData.message, 'Expected test message in response');

  // 7. Validation test: Missing required fields
  console.log('\nStep 7: Testing validation rejects missing required fields...');
  const failRes = await fetch('http://localhost:4000/api/actions/connectors/create', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: `Invalid Trello ${Date.now()}`,
      provider: 'trello',
      trello_apiKey: '', // missing
      trello_token: '',
    }),
  });
  assert.strictEqual(failRes.status, 400, `Expected 400, got ${failRes.status}`);
  const failData = await failRes.json();
  console.log('✓ Properly rejected missing fields with 400 Bad Request:', failData.message);

  console.log('\n=============================================');
  console.log('🎉 ALL PROVIDER ARCHITECTURE TESTS PASSED! 🎉');
  console.log('=============================================');
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
