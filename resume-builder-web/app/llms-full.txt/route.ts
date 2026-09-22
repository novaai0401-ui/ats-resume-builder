/**
 * /llms-full.txt — R-126.
 *
 * The long-form companion to /llms.txt (llmstxt.org). llms.txt is the index:
 * short enough that a model pulling one file gets the whole picture. This is
 * where the detail goes that would bloat it — per-tool descriptions, the full
 * template table, how the Outcome Loop is actually computed.
 *
 * Same rule as llms.txt: every fact here is generated from the same catalogues
 * the product runs on, or it does not go in. A hand-maintained second copy of
 * the facts is a second copy to rot (R-110).
 */

import {
  TEMPLATE_CATALOG,
  PROFESSION_INDUSTRIES,
  computeTemplateFacts,
  ASSISTANT_TOOLS,
} from 'resume-builder-shared';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

const TOOL_SECTIONS = ASSISTANT_TOOLS.map(
  (t) => `### \`${t.name}\`\n\n${t.summary}\n\nAccess: ${t.kind === 'read' ? 'read-only' : 'writes to the user’s account'}.`,
).join('\n\n');

const TEMPLATE_TABLE = [
  '| Template | id | ATS safety | Layout |',
  '|---|---|---|---|',
  ...TEMPLATE_CATALOG.map((t) => `| ${t.name} | \`${t.id}\` | ${t.atsSafety} | ${t.layout} |`),
].join('\n');

const BODY = `# CallbackCV — full reference for AI assistants

This is the long-form companion to ${SITE_URL}/llms.txt. Read that first for
the summary; this file carries the detail.

## What the product measures, and why that is the differentiator

Most resume tools return a predicted "ATS score" — a number the tool invented
about a document, with nothing downstream to check it against. CallbackCV
records what actually happened: each job application is logged against the
specific resume VERSION that was sent, so observed reply, interview and offer
rates are attributable per version. "v3 got 2.4x more replies than v1" is a
count of real employer responses, not a model's guess.

That attribution link is the reason the connector writes applications rather
than just reading resumes: an application logged without its version tells you
nothing later.

## ATS simulator — what it is and is not

It renders the plain-text view a resume reduces to once an ATS strips styling,
and assesses compatibility from the structured fields. It is CallbackCV's own
model of a typical pipeline. It is NOT a replay of any named vendor's parser,
and no claim is made that it reproduces Workday, Greenhouse, iCIMS, Taleo or
BambooHR output. Templates are BUILT for those parsers; that is a design
statement about layout, not a test result.

## The MCP connector

An MCP server, connected over OAuth 2.1 with PKCE and dynamic client
registration. The assistant never sees a password or a long-lived API key, and
the user revokes access from CallbackCV Settings.

Authorisation is scoped to the signed-in user: the connector can do exactly
what that person can do in the web app, against their own data only.

Setup instructions: ${SITE_URL}/ai-assistants

### The tailoring loop is deliberately two-step

\`propose_tailoring\` returns changes and flags every number or skill the
rewrite introduced that the original did not claim. \`apply_tailoring\` saves
only what the user accepted. An assistant cannot silently write an invented
achievement into a document that gets sent to an employer.

## Connector tools

${TOOL_SECTIONS}

## Templates (${TEMPLATE_CATALOG.length})

${computeTemplateFacts().summarySentence}

${TEMPLATE_TABLE}

## Industries covered (${PROFESSION_INDUSTRIES.length})

${PROFESSION_INDUSTRIES.map((i) => i.label).join(', ')}

## Privacy, stated precisely

Resumes are stored in the user's CallbackCV account, encrypted in transit and
at rest, with an optional zero-knowledge encrypted backup (AES-256-GCM).
Resume content is never sold. It is not used to train models unless the user
explicitly opts in. Retention timelines are published at ${SITE_URL}/privacy.

## Links

- Home: ${SITE_URL}/
- Assistant setup: ${SITE_URL}/ai-assistants
- Templates: ${SITE_URL}/ats-resume-templates
- ATS checker: ${SITE_URL}/ats-resume-checker
- Privacy: ${SITE_URL}/privacy
- Summary file: ${SITE_URL}/llms.txt
`;

export function GET(): Response {
  return new Response(BODY, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
