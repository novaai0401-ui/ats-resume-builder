import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../dist/server.js';
import { PocketResumeClient } from '../dist/api-client.js';

/**
 * R-104 — the MCP tool set is this product's public contract with every AI
 * host (Claude, ChatGPT). These tests drive the REAL server over an
 * in-memory transport and assert what a connector actually receives:
 * tool names, annotations and input schemas.
 *
 * They deliberately do NOT grep src/server.ts. The suite this replaced
 * counted `readOnlyHint:` occurrences in the source and asserted "6 tools"
 * while ten were registered — a source-text assertion cannot notice a tool
 * that was added, and it went unnoticed because no CI job ran it.
 */

/**
 * The contract. Adding a tool means adding a row HERE first — the counts
 * below are derived from this table, never hardcoded, so a new tool cannot
 * pass by accident.
 *
 * `required` lists the input fields a connector MUST send. It is asserted
 * against the schema the server actually publishes; where that disagrees
 * with what the API accepts, the fix belongs in R-107, not here.
 */
const TOOL_CONTRACT = {
  open_in_callbackcv: { readOnly: true, required: [] },
  create_resume: { readOnly: false, required: ['title', 'summary'] },
  update_resume: { readOnly: false, required: ['resumeId'] },
  get_download_link: { readOnly: true, required: ['resumeId'] },
  list_resumes: { readOnly: true, required: [] },
  get_resume: { readOnly: true, required: ['resumeId'] },
  list_versions: { readOnly: true, required: ['resumeId'] },
  tailor_resume: { readOnly: false, required: ['resumeId', 'jdText'] },
  log_application: { readOnly: false, required: ['company', 'role'] },
  get_outcome_stats: { readOnly: true, required: ['resumeId'] },
};

/** Boot the real server against a stub API and return a connected client. */
async function connect(apiStub = {}) {
  const client = Object.assign(
    new PocketResumeClient({ baseUrl: 'https://example.invalid', token: 'test-token' }),
    apiStub,
  );
  const server = buildServer(client);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);
  return mcp;
}

async function listTools() {
  const mcp = await connect();
  const { tools } = await mcp.listTools();
  await mcp.close();
  return tools;
}

test('the server publishes exactly the contracted tool set', async () => {
  const tools = await listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    Object.keys(TOOL_CONTRACT).sort(),
    'Registered MCP tools must match TOOL_CONTRACT, the README and the connector docs',
  );
});

test('every tool carries review-grade annotations (directory requirement)', async () => {
  const tools = await listTools();
  for (const tool of tools) {
    const expected = TOOL_CONTRACT[tool.name];
    const ann = tool.annotations || {};
    assert.ok(ann.title, `${tool.name} declares a human-readable title`);
    assert.equal(
      ann.readOnlyHint,
      expected.readOnly,
      `${tool.name} declares readOnlyHint: ${expected.readOnly}`,
    );
    if (!expected.readOnly) {
      assert.equal(
        ann.destructiveHint,
        false,
        `${tool.name} writes additively and must not be marked destructive`,
      );
    }
  }
  // Derived from the table, so a new tool changes this without an edit here.
  const readOnly = Object.values(TOOL_CONTRACT).filter((t) => t.readOnly).length;
  assert.equal(tools.filter((t) => t.annotations?.readOnlyHint === true).length, readOnly);
});

test('every tool describes itself to the model', async () => {
  const tools = await listTools();
  for (const tool of tools) {
    assert.ok(
      typeof tool.description === 'string' && tool.description.length > 40,
      `${tool.name} needs a description an assistant can select on`,
    );
  }
});

test('published input schemas require the fields the contract says they do', async () => {
  const tools = await listTools();
  for (const tool of tools) {
    const expected = TOOL_CONTRACT[tool.name];
    const required = tool.inputSchema?.required || [];
    assert.deepEqual(
      [...required].sort(),
      [...expected.required].sort(),
      `${tool.name} publishes the required inputs a connector must send`,
    );
  }
});

test('get_download_link returns a URL that parses, carrying resumeId and utm_source', async () => {
  const mcp = await connect({ downloadChargeConfig: async () => ({ enabled: false }) });
  const res = await mcp.callTool({ name: 'get_download_link', arguments: { resumeId: 'abc123' } });
  await mcp.close();

  assert.equal(res.isError, undefined, 'a valid call must not return an error result');
  const payload = JSON.parse(res.content[0].text);
  const url = new URL(payload.url);
  assert.equal(url.searchParams.get('resumeId'), 'abc123', 'the resume id survives round-tripping');
  assert.ok(url.searchParams.get('utm_source'), 'the acquisition tag is a real query parameter');
});

test('R-107: open_in_callbackcv returns a URL that parses correctly', async () => {
  // The defect: UTM was the literal string '?utm_source=…' concatenated
  // onto a path that already carried a query, producing
  // `/resume?resumeId=abc123?utm_source=ai-assistant` — the resume id
  // parsed as "abc123?utm_source=ai-assistant" and the tag was lost.
  const mcp = await connect();
  const res = await mcp.callTool({ name: 'open_in_callbackcv', arguments: { resumeId: 'abc123' } });
  await mcp.close();

  const url = new URL(JSON.parse(res.content[0].text).url);
  assert.equal(url.searchParams.get('resumeId'), 'abc123', 'the resume id must round-trip exactly');
  assert.equal(url.searchParams.get('utm_source'), 'ai-assistant', 'and the acquisition tag must survive');
  assert.equal(url.pathname, '/resume');
});

test('R-107: the no-resume link is well-formed too', async () => {
  const mcp = await connect();
  const res = await mcp.callTool({ name: 'open_in_callbackcv', arguments: {} });
  await mcp.close();

  const url = new URL(JSON.parse(res.content[0].text).url);
  assert.equal(url.pathname, '/resume/start');
  assert.equal(url.searchParams.get('utm_source'), 'ai-assistant');
});

test('R-107: resume ids needing escaping survive the round trip', async () => {
  const mcp = await connect();
  const tricky = 'a b&c=d?e';
  const res = await mcp.callTool({ name: 'open_in_callbackcv', arguments: { resumeId: tricky } });
  await mcp.close();

  const url = new URL(JSON.parse(res.content[0].text).url);
  assert.equal(url.searchParams.get('resumeId'), tricky, 'searchParams escapes what concatenation would corrupt');
  assert.equal(url.searchParams.get('utm_source'), 'ai-assistant');
});

test('R-107: create_resume advertises the fields the API actually requires', async () => {
  const tools = await listTools();
  const create = tools.find((t) => t.name === 'create_resume');
  const experience = create.inputSchema.properties.experience.items;
  assert.deepEqual(
    [...(experience.required || [])].sort(),
    ['company', 'endDate', 'highlights', 'role', 'startDate'],
    'an assistant must be told about startDate/endDate/highlights before it is rejected for them',
  );

  // The sections that used to be unreachable through an assistant.
  for (const section of ['projects', 'certifications', 'languages', 'licenses', 'publications']) {
    assert.ok(create.inputSchema.properties[section], `create_resume can set ${section}`);
  }
});

test('R-107: update_resume can fix contact details', async () => {
  const tools = await listTools();
  const update = tools.find((t) => t.name === 'update_resume');
  // Without this, a typo in an email address could not be corrected
  // through an assistant at all.
  assert.ok(update.inputSchema.properties.contact, 'contact is editable');
  for (const section of ['projects', 'certifications', 'languages', 'licenses', 'publications']) {
    assert.ok(update.inputSchema.properties[section], `update_resume can change ${section}`);
  }
});

test('API failures surface as MCP errors, not as silently empty results', async () => {
  const mcp = await connect({
    downloadChargeConfig: async () => {
      throw new Error('upstream exploded');
    },
  });
  const res = await mcp.callTool({ name: 'get_download_link', arguments: { resumeId: 'abc123' } });
  await mcp.close();

  assert.equal(res.isError, true, 'the assistant must be told the call failed');
  assert.match(res.content[0].text, /upstream exploded/);
});
