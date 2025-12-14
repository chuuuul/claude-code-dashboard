#!/usr/bin/env node
/**
 * Smoke Test - Verifies the server starts and responds correctly
 * Run: npm run test:smoke
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 3099; // Use different port to avoid conflicts
const TIMEOUT = 30000;

async function waitForServer(port, maxWait = TIMEOUT) {
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

async function runTests(port) {
  const tests = [];

  // Test 1: Health check
  tests.push({
    name: 'Health endpoint returns healthy',
    run: async () => {
      return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/health`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const json = JSON.parse(data);
            if (json.status === 'healthy') {
              resolve('OK');
            } else {
              reject(new Error(`Unhealthy: ${JSON.stringify(json)}`));
            }
          });
        }).on('error', reject);
      });
    }
  });

  // Test 2: Database check
  tests.push({
    name: 'Database is connected',
    run: async () => {
      return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/health`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const json = JSON.parse(data);
            if (json.checks?.database === 'ok') {
              resolve('OK');
            } else {
              reject(new Error(`Database not OK: ${json.checks?.database}`));
            }
          });
        }).on('error', reject);
      });
    }
  });

  // Test 3: 404 for unknown routes
  tests.push({
    name: 'Returns 404 for unknown routes',
    run: async () => {
      return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/unknown-route-12345`, (res) => {
          if (res.statusCode === 404) {
            resolve('OK');
          } else {
            reject(new Error(`Expected 404, got ${res.statusCode}`));
          }
        }).on('error', reject);
      });
    }
  });

  // Run tests
  let passed = 0;
  let failed = 0;

  console.log('\n🧪 Running smoke tests...\n');

  for (const test of tests) {
    try {
      await test.run();
      console.log(`  ✅ ${test.name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${test.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

async function main() {
  console.log('🚀 Starting smoke test...');

  // Setup environment
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'test',
    JWT_SECRET: 'smoke-test-secret',
    ADMIN_PASSWORD: 'SmokeTest123!',
    ALLOWED_PROJECT_ROOTS: '/tmp',
    ALLOWED_FILE_ROOTS: '/tmp',
    DB_PATH: ':memory:'
  };

  // Start server
  const serverPath = path.join(__dirname, '..', 'server', 'app.js');
  const server = spawn('node', [serverPath], {
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let serverOutput = '';
  server.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  server.stderr.on('data', (data) => {
    serverOutput += data.toString();
  });

  // Wait for server to start
  console.log(`⏳ Waiting for server on port ${PORT}...`);
  const started = await waitForServer(PORT);

  if (!started) {
    console.error('❌ Server failed to start');
    console.error('Server output:', serverOutput);
    server.kill();
    process.exit(1);
  }

  console.log('✅ Server started');

  // Run tests
  const success = await runTests(PORT);

  // Cleanup
  server.kill();

  process.exit(success ? 0 : 1);
}

main().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
