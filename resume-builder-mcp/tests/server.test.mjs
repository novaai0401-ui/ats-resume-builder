import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from '../dist/server.js';
import { PocketResumeClient } from '../dist/api-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The tool set is the MCP's public contract with every AI host (Claude,
// ChatGPT). Renaming or dropping one silently breaks users' configs, so pin
// the exact names. Kept as a source assertion so it needs no live API.
const EXPECTED_TOOLS = [
  'list_resumes',
  'get_resume',
  'list_versions',
  'tailor_resume',
  'log_application',
  'get_outcome_stats',
];

test('server source registers exactly the documented tool set', () => {
  const src = readFileSync(path.join(__dirname, '..', 'src', 'server.ts'), 'utf-8');
  const registered = [...src.matchAll(/server\.tool\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    registered.sort(),
    [...EXPECTED_TOOLS].sort(),
    'The registered MCP tools must match the README + connector docs exactly',
  );
});

test('buildServer constructs without a live API (smoke)', () => {
  const client = new PocketResumeClient({ baseUrl: 'https://example.invalid', token: 'test-token' });
  const server = buildServer(client);
  assert.ok(server, 'buildServer should return an McpServer instance');
  assert.equal(typeof server.connect, 'function', 'server exposes an MCP connect()');
});
