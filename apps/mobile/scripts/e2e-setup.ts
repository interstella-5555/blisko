#!/usr/bin/env bun
/**
 * E2E Test Setup Script
 * Creates a test user and outputs session data for Maestro tests
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_EMAIL = 'e2e-test@meetapp.test';
const TEST_PASSWORD = 'testpassword123';

async function main() {
  console.log('Creating test user...');

  const response = await fetch(`${API_URL}/test/create-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Failed to create test user:', error);
    process.exit(1);
  }

  const data = await response.json();
  console.log('Test user created/retrieved:', data.user.email);
  console.log('User ID:', data.user.id);
  console.log('Access Token:', data.session.access_token.substring(0, 50) + '...');

  // Output for use in tests
  console.log('\n--- E2E Test Credentials ---');
  console.log(`EMAIL=${TEST_EMAIL}`);
  console.log(`PASSWORD=${TEST_PASSWORD}`);
  console.log(`USER_ID=${data.user.id}`);
  console.log(`ACCESS_TOKEN=${data.session.access_token}`);
}

main().catch(console.error);
