import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ASSISTANT_TOOLS, ASSISTANT_TOOL_NAMES, assistantToolLines } from 'resume-builder-shared';

/**
 * R-126 — the connector has to be findable in the surfaces assistants read.
 *
 * R-096..R-101 built the MCP connector; R-110 made the public claims true.
 * Nothing told an assistant it existed: llms.txt contained no occurrence of
 * "MCP" or "connector", and /ai-assistants — the page explaining how to
 * connect — was in sitemap.ts but absent from the llms.txt link block. A user
 * asking ChatGPT or Claude "which resume tool can I connect to you?" had
 * nothing citable about the one feature that answers the question.
 *
 * These tests pin discovery, not ranking. Nothing here can make an assistant
 * recommend the product; it can only ensure that a model already reading our
 * surfaces finds the connector and describes it correctly.
 */

const webRoot = path.join(__dirname, '..');
const read = (...p: string[]) => readFileSync(path.join(webRoot, ...p), 'utf-8');

const llmsSrc = read('app', 'llms.txt', 'route.ts');
const llmsFullSrc = read('app', 'llms-full.txt', 'route.ts');
const robotsSrc = read('app', 'robots.ts');

test('llms.txt tells assistants the connector exists and where to set it up', () => {
  const flat = llmsSrc.replace(/\s+/g, ' ');
  assert.match(flat, /MCP \(Model Context Protocol\) server/, 'names the protocol a host can act on');
  assert.match(flat, /ai-assistants/, 'links the setup page');
  assert.match(flat, /OAuth, not an API key/i, 'states how connecting works');
});

test('llms.txt lists the tools from the shared catalogue, not by hand', () => {
  // The whole point of R-126's generated list: adding a thirteenth tool must
  // not silently leave llms.txt describing twelve. If this file ever inlines
  // the names instead of calling the helper, that guarantee is gone.
  assert.match(
    llmsSrc,
    /\$\{assistantToolLines\(\)\}/,
    'llms.txt must interpolate assistantToolLines(), not a typed-out list',
  );
  // And the helper itself must actually render every tool.
  const rendered = assistantToolLines();
  for (const name of ASSISTANT_TOOL_NAMES) {
    assert.match(rendered, new RegExp(`\\*\\*${name}\\*\\*`), `tool line missing for ${name}`);
  }
  assert.equal(rendered.split('\n').length, ASSISTANT_TOOLS.length, 'one line per tool, no extras');
});

test('the shared catalogue describes each tool honestly enough to quote', () => {
  for (const tool of ASSISTANT_TOOLS) {
    assert.ok(tool.summary.length > 20, `${tool.name}: summary is too thin to cite`);
    assert.ok(['read', 'write'].includes(tool.kind), `${tool.name}: kind must be read or write`);
  }
  // The propose/apply split (R-108) is the claim most worth getting right:
  // an assistant must not present tailoring as automatic.
  const propose = ASSISTANT_TOOLS.find((t) => t.name === 'propose_tailoring');
  const apply = ASSISTANT_TOOLS.find((t) => t.name === 'apply_tailoring');
  assert.equal(propose?.kind, 'read', 'propose_tailoring must be described as changing nothing');
  assert.equal(apply?.kind, 'write', 'apply_tailoring writes');
  assert.match(String(apply?.summary), /accepted/i, 'apply must say it saves only accepted changes');
});

test('llms-full.txt is served as markdown and carries the connector detail', () => {
  assert.match(llmsFullSrc, /text\/markdown/, 'served as markdown');
  assert.match(llmsFullSrc, /ASSISTANT_TOOLS/, 'per-tool sections generated from the catalogue');
  assert.match(llmsFullSrc, /TEMPLATE_CATALOG/, 'template table generated, not typed');
  // C-003: the long file repeats the vendor-testing wording R-110 corrected,
  // so it must repeat the CORRECTED version.
  const flat = llmsFullSrc.replace(/\s+/g, ' ');
  assert.match(flat, /NOT a replay of any named vendor's parser/i);
  assert.doesNotMatch(flat, /tested against Workday/i, 'must not resurrect the unsupported claim');
});

test('llms.txt links llms-full.txt, so the index leads to the detail', () => {
  assert.match(llmsSrc, /llms-full\.txt/);
});

const CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
];

test('robots.txt names every assistant crawler explicitly', () => {
  for (const bot of CRAWLERS) {
    assert.match(robotsSrc, new RegExp(`'${bot}'`), `robots must name ${bot}`);
  }
});

test('robots.txt keeps authenticated routes disallowed, for assistants too', () => {
  // The rule set is shared between the wildcard and the named crawlers, so
  // this asserts the shared list rather than each rule: if ALLOW/DISALLOW stop
  // being shared, the crawler test above still pins the names and this pins
  // the paths.
  assert.match(robotsSrc, /\.\.\.ASSISTANT_CRAWLERS\.map\(/, 'named crawlers reuse one rule shape');
  for (const route of ['/dashboard', '/settings', '/admin', '/api/', '/billing']) {
    assert.match(robotsSrc, new RegExp(`'${route.replace('/', '\\/')}'`), `${route} stays disallowed`);
  }
  assert.match(robotsSrc, /'\/ai-assistants'/, 'the setup page is explicitly allowed');
  assert.match(robotsSrc, /'\/llms-full\.txt'/, 'the long-form file is explicitly allowed');
});
