/**
 * R-126 — the canonical list of what the CallbackCV MCP connector can do,
 * in one place, so every surface that describes it says the same thing.
 *
 * Three consumers, three different needs, one source:
 *   - `llms.txt` / `llms-full.txt` quote it to assistants (web);
 *   - the MCP test suite asserts the live server registers exactly this set
 *     (`resume-builder-mcp/tests/server.test.mjs`);
 *   - humans read it in the README and on /ai-assistants.
 *
 * The MCP server cannot import this at RUNTIME — it ships to npm as a
 * standalone binary whose only dependencies are the SDK and zod, so a
 * workspace import would break `npx`. Same constraint, and same solution, as
 * the schema mirror documented in `schema-parity.test.mjs`: the server owns
 * its own registrations and a test keeps them in lockstep with this list.
 *
 * R-110 generated the template facts in llms.txt from TEMPLATE_CATALOG for
 * exactly this reason — a hand-typed list rots on the next change, and the
 * surface that rots is the one assistants quote verbatim.
 */

export type AssistantToolKind = 'read' | 'write';

export interface AssistantTool {
  /** Tool name as registered with the MCP server. */
  readonly name: string;
  /** Read-only, or does it change the user's data? Mirrors the MCP annotation. */
  readonly kind: AssistantToolKind;
  /** One line, plain English, no marketing. Quoted directly into llms.txt. */
  readonly summary: string;
}

export const ASSISTANT_TOOLS: readonly AssistantTool[] = [
  { name: 'list_resumes', kind: 'read', summary: 'List the resumes in the signed-in account.' },
  { name: 'get_resume', kind: 'read', summary: 'Read one resume in full, as structured fields.' },
  { name: 'create_resume', kind: 'write', summary: 'Create a resume from a title and summary.' },
  { name: 'update_resume', kind: 'write', summary: 'Update fields on an existing resume.' },
  {
    name: 'propose_tailoring',
    kind: 'read',
    summary:
      'Given a job description, propose rewrites — and flag every new number or skill the rewrite introduces, so the user confirms it is true before it is applied. Proposes only; changes nothing.',
  },
  {
    name: 'apply_tailoring',
    kind: 'write',
    summary:
      'Apply only the proposed changes the user accepted, saving them as a new labelled version.',
  },
  { name: 'list_versions', kind: 'read', summary: 'List saved versions of a resume.' },
  { name: 'get_resume_version', kind: 'read', summary: 'Read the exact content of one saved version.' },
  {
    name: 'get_download_link',
    kind: 'read',
    summary:
      'Get a link that downloads a specific version — the tailored one the user approved, not whatever is live.',
  },
  {
    name: 'log_application',
    kind: 'write',
    summary:
      'Log a job application against the resume version that was actually sent, which is what makes the callback stats real.',
  },
  {
    name: 'get_outcome_stats',
    kind: 'read',
    summary: 'Report observed reply / interview / offer rates per resume version.',
  },
  {
    name: 'open_in_callbackcv',
    kind: 'read',
    summary:
      'Return a deep link into the CallbackCV editor, for when the user wants to finish the job in the app.',
  },
];

/** Tool names only, sorted — for set comparisons in tests. */
export const ASSISTANT_TOOL_NAMES: readonly string[] = ASSISTANT_TOOLS.map((t) => t.name)
  .slice()
  .sort();

/** `- **name** (read): summary` lines, for the markdown surfaces. */
export function assistantToolLines(): string {
  return ASSISTANT_TOOLS.map((t) => `- **${t.name}** (${t.kind}): ${t.summary}`).join('\n');
}
