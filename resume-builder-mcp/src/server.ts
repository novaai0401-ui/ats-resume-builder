import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiError, PocketResumeClient } from './api-client.js';
import { resumeSectionFields } from './resume-fields.js';

/**
 * R-040 — CallbackCV MCP server.
 *
 * The strategic frame (PRODUCT_STRATEGY §3.1): when an agent applies
 * to jobs on a user's behalf it needs a resume source of truth, a
 * tailoring function, and an application log. If CallbackCV is the
 * MCP server it calls, every agent-driven application still feeds the
 * Outcome Graph — agents become a distribution channel, not a threat.
 *
 * Twelve tools, deliberately mirroring what a human can do in the UI:
 *   open_in_callbackcv — the link that ends every conversation
 *   create_resume      — build a NEW resume from structured fields
 *   update_resume      — edit an existing one
 *   get_download_link  — where the PDF is downloaded (never the file itself)
 *   list_resumes       — find the user's resumes
 *   get_resume         — full structured resume JSON
 *   list_versions      — snapshots (tailored variants live here)
 *   propose_tailoring  — JD → proposed changes, saves NOTHING
 *   apply_tailoring    — save what the USER approved as a NEW version
 *   get_resume_version — read one version, so it can be reviewed
 *   log_application    — write to the Jobs tracker WITH versionId
 *   get_outcome_stats  — which version actually gets replies
 *
 * The authoritative list is TOOL_CONTRACT in tests/server.test.mjs, which
 * drives a real client over an in-memory transport (R-104). Add a tool
 * there first; this comment is prose, the test is the contract.
 *
 * Everything delegates to the REST API with the user's own token, so
 * plan gates / AI-token quotas / rate limits apply identically to
 * agents and humans. Tool descriptions tell the agent to attach the
 * version id when logging an application — that link IS the moat.
 */

/**
 * Numbers present in the rewritten text that the original did not contain.
 *
 * A tailoring rewrite may legitimately reword a claim; inventing a metric
 * is different in kind, because the user is the one who has to defend it
 * in an interview. Deliberately crude — it flags for confirmation rather
 * than blocking, and a false positive costs one question.
 */
export function newNumbers(before: string, after: string): string[] {
  const numeric = /\d+(?:[.,]\d+)*%?/g;
  const had = new Set(String(before || '').match(numeric) || []);
  const added = new Set<string>();
  for (const token of String(after || '').match(numeric) || []) {
    if (!had.has(token)) added.add(token);
  }
  return [...added];
}

export function buildServer(client: PocketResumeClient): McpServer {
  const server = new McpServer({
    name: 'callbackcv',
    version: '0.4.0',
  });

  const ok = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  });
  const fail = (err: unknown) => {
    const msg =
      err instanceof ApiError
        ? err.status === 401
          ? 'CallbackCV token is invalid or expired. Mint a new one in Settings → API access and update POCKET_RESUME_TOKEN.'
          : err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      content: [{ type: 'text' as const, text: `Error: ${msg}` }],
      isError: true,
    };
  };


  const webBase = () =>
    String(process.env.PUBLIC_WEB_URL || 'https://callbackcv.tekivex.com').replace(/\/+$/, '');
  // Which assistant platform sent the user — measurable acquisition.
  const utmSource = String(process.env.MCP_UTM_SOURCE || 'ai-assistant');

  /**
   * R-107 — build every outbound link with URL/searchParams.
   *
   * UTM used to be the literal string '?utm_source=…' concatenated onto
   * whatever came before it. On a path that already carried a query
   * (`/resume?resumeId=X`) that produced `?resumeId=X?utm_source=…`: the
   * resume id parsed as "X?utm_source=ai-assistant", so the editor could
   * not find the resume AND the acquisition tag was lost. Concatenation
   * cannot express "add a parameter"; this can.
   */
  const webUrl = (path: string, params: Record<string, string | undefined> = {}) => {
    const url = new URL(path, webBase() + '/');
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
    url.searchParams.set('utm_source', utmSource);
    return url.toString();
  };


  /**
   * The funnel model (founder decision): the assistant platform is a DISCOVERY
   * surface, CallbackCV is where resumes get built. Tools may draft a shell
   * remotely, but every flow is expected to END with a link into the app —
   * that is what this tool exists for, and why other tools' "next" fields
   * point here. Links carry utm_source so acquisition per platform is
   * measurable in analytics.
   */
  server.tool(
    'open_in_callbackcv',
    [
      'Get the CallbackCV link to send the user to. Call this at the END of',
      'any resume conversation: with a resumeId it links straight into the',
      'editor for that resume; without one it links to the guided start flow.',
      'ALWAYS show the returned url to the user as the next step — building,',
      'previewing templates and downloading all happen in CallbackCV.',
    ].join(' '),
    {
      resumeId: z.string().optional().describe('Editor deep-link when set; guided start flow when omitted'),
    },
    { title: 'Open in CallbackCV', readOnlyHint: true, openWorldHint: false },
    async ({ resumeId }) => {
      const url = resumeId
        ? webUrl('/resume', { resumeId })
        : webUrl('/resume/start');
      return ok({
        url,
        say: resumeId
          ? 'Your resume is ready in CallbackCV — open the link to polish, pick a template and download.'
          : 'CallbackCV will walk you through building an ATS-safe resume — open the link to start.',
      });
    },
  );

  /**
   * The build tools below are what makes "type in ChatGPT/Claude and your
   * resume gets built" real: before them this server could only read, tailor
   * and track resumes that already existed. All three go through the same API
   * with the same user identity, so every gate (validation, quotas, payment)
   * holds over MCP exactly as on the web — external platforms get no side
   * doors by construction.
   */
  server.tool(
    'create_resume',
    [
      'Create a NEW resume in the user\'s CallbackCV account from structured',
      'fields. Gather the user\'s details conversationally first, then call',
      'this once. summary must be at least 20 characters. Every experience',
      'entry needs startDate, endDate and at least one highlight, and every',
      'education entry needs both dates — ask the user for anything missing',
      'rather than guessing, since an invented date is a fabricated fact on',
      'a hiring document. Returns the new resumeId — use it with',
      'update_resume, tailor_resume and get_download_link.',
    ].join(' '),
    {
      title: z.string().min(2).describe('Document title, e.g. "Senior Frontend Engineer Resume"'),
      summary: z.string().min(20).describe('Professional summary, 2-3 sentences with at least one measurable result'),
      ...resumeSectionFields,
    },
    { title: 'Create a resume', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async (input) => {
      try {
        const created = await client.createResume(input as Record<string, unknown>);
        return ok({
          created: true,
          resumeId: created.id,
          title: created.title,
          next:
            'Now call open_in_callbackcv with this resumeId and give the user ' +
            'the link — polishing, template choice and download happen in the app.',
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'update_resume',
    [
      'Update fields on an existing resume — summary, contact, skills,',
      'languages, experience, education, projects, certifications, licenses,',
      'publications, achievements, title or templateId. Send ONLY the fields',
      'to change: arrays REPLACE the whole section, so read the resume first',
      'with get_resume and send the full corrected array. The same required',
      'fields apply as when creating.',
    ].join(' '),
    {
      resumeId: z.string(),
      title: z.string().min(2).optional(),
      summary: z.string().min(20).optional(),
      ...resumeSectionFields,
    },
    { title: 'Update a resume', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ resumeId, ...patch }) => {
      try {
        await client.updateResume(resumeId, patch as Record<string, unknown>);
        return ok({ updated: true, resumeId, changedFields: Object.keys(patch) });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'get_download_link',
    [
      'Get the link where the user downloads this resume as a PDF, plus',
      'whether a one-time payment applies. This tool NEVER returns the file',
      'itself: the download happens in the CallbackCV app, where the payment',
      'gate for free users is enforced server-side — paid plans download',
      'clean and free. Tell the user the price honestly when paymentRequired',
      'is true. IMPORTANT: if the user tailored the resume for this job,',
      'pass the versionId tailor_resume returned — otherwise they download',
      'the original, not the version they just reviewed.',
    ].join(' '),
    {
      resumeId: z.string(),
      versionId: z
        .string()
        .optional()
        .describe('Download this exact saved version (from tailor_resume or list_versions) instead of the live resume'),
    },
    { title: 'Get the PDF download link', readOnlyHint: true, openWorldHint: false },
    async ({ resumeId, versionId }) => {
      try {
        const cfg = await client.downloadChargeConfig();
        return ok({
          // R-108: the link now carries the version. Without it, a user
          // could tailor to a job, log the application against the
          // tailored version, and download the ORIGINAL — so the outcome
          // graph recorded a reply against a document the employer never
          // saw, which is the C-007 attribution link breaking silently.
          url: webUrl('/resume/template', { resumeId, versionId }),
          downloading: versionId ? 'the tailored version you selected' : 'the live resume',
          paymentRequired: cfg.enabled,
          note: cfg.enabled
            ? 'A one-time charge (Rs 49 in India / ~$0.99 elsewhere) applies at download; CallbackCV Plus includes downloads.'
            : 'Included in the user\'s plan — the download is free and un-watermarked.',
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  /**
   * R-108 — read one saved version so the user can actually REVIEW a
   * tailored resume before sending it. Previously an assistant could list
   * versions and log applications against them, but never see what one
   * contained: "review before you send" was not a thing a connector could
   * do, which is precisely why auto-accepting every AI edit was dangerous.
   */
  server.tool(
    'get_resume_version',
    [
      'Get the full content of one saved resume version, so you can show',
      'the user exactly what a tailored variant says BEFORE they download',
      'or apply for the job. Use the versionId from tailor_resume or',
      'list_versions.',
    ].join(' '),
    { resumeId: z.string(), versionId: z.string() },
    { title: 'Read a saved version', readOnlyHint: true, openWorldHint: false },
    async ({ resumeId, versionId }) => {
      try {
        const version = await client.getVersion(resumeId, versionId);
        return ok({
          versionId: version.id,
          label: version.label,
          createdAt: version.createdAt,
          atsScoreSnapshot: version.atsScoreSnapshot,
          resume: version.snapshot,
          next: 'Pass this versionId to get_download_link so the user downloads THIS version, and to log_application so the outcome is attributed to it.',
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'list_resumes',
    'List the user\'s saved resumes (id + title). Start here to find the resumeId other tools need.',
    {},
    { title: 'List resumes', readOnlyHint: true, openWorldHint: false },
    async () => {
      try {
        return ok(await client.listResumes());
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'get_resume',
    'Get the full structured resume (contact, summary, skills, experience, education, projects, achievements, certifications, languages) as JSON.',
    { resumeId: z.string().describe('Resume id from list_resumes') },
    { title: 'Get resume', readOnlyHint: true, openWorldHint: false },
    async ({ resumeId }) => {
      try {
        return ok(await client.getResume(resumeId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'list_versions',
    'List the saved snapshots/versions of a resume. Tailored variants created by tailor_resume appear here, labelled "Tailored: <role> @ <company>".',
    { resumeId: z.string() },
    { title: 'List resume versions', readOnlyHint: true, openWorldHint: false },
    async ({ resumeId }) => {
      try {
        return ok(await client.listVersions(resumeId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  /**
   * R-108 — tailoring is now PROPOSE then APPLY, two tools.
   *
   * `tailor_resume` used to call propose and then immediately apply every
   * single change the model suggested, with no human in between. The
   * prompt tells the AI not to invent facts, and a prompt is a request,
   * not a guarantee — so an invented metric or an unearned skill went
   * straight into a saved version. That version is what log_application
   * attributes outcomes to and what the user sends to an employer, which
   * makes "the AI made it up" a claim on their resume, under their name.
   *
   * Splitting the tools puts the user back in the loop by construction
   * rather than by instruction: `apply_tailoring` can only apply what it
   * is explicitly handed, and the proposal flags anything that adds a
   * skill or a number the resume did not already contain.
   */
  server.tool(
    'propose_tailoring',
    [
      'Propose (do NOT apply) rewrites tailoring a resume to a job',
      'description. Returns numbered changes for the user to review.',
      'SHOW the user the proposed changes — especially anything listed in',
      'needsConfirmation, which adds a skill or a number the resume did',
      'not already contain — and get their approval BEFORE calling',
      'apply_tailoring. Costs AI tokens from the user\'s monthly quota.',
    ].join(' '),
    {
      resumeId: z.string(),
      jdText: z.string().min(80).describe('The full job description text'),
    },
    { title: 'Propose tailoring changes', readOnlyHint: true, openWorldHint: false },
    async ({ resumeId, jdText }) => {
      try {
        const [proposal, resume] = await Promise.all([
          client.tailorPropose(resumeId, jdText),
          client.getResume(resumeId),
        ]);
        const changeCount =
          (proposal.summary ? 1 : 0) + proposal.bullets.length + proposal.skillsToAdd.length;
        if (changeCount === 0) {
          return ok({
            changes: [],
            reason: 'The resume already matches this JD well — no changes proposed.',
          });
        }

        const existingSkills = new Set(
          (Array.isArray(resume.skills) ? (resume.skills as string[]) : []).map((s) => s.toLowerCase()),
        );
        const needsConfirmation: Array<{ id: string; kind: string; detail: string }> = [];

        if (proposal.summary && newNumbers(proposal.summary.before, proposal.summary.after).length > 0) {
          needsConfirmation.push({
            id: 'summary',
            kind: 'new-number',
            detail: `The rewritten summary introduces ${newNumbers(proposal.summary.before, proposal.summary.after).join(', ')}, which the original did not claim. Confirm with the user that these are true.`,
          });
        }
        proposal.bullets.forEach((bullet, index) => {
          const added = newNumbers(bullet.before, bullet.after);
          if (added.length > 0) {
            needsConfirmation.push({
              id: `bullet:${index}`,
              kind: 'new-number',
              detail: `Bullet ${index} introduces ${added.join(', ')}, which the original did not claim. Confirm with the user that these are true.`,
            });
          }
        });
        for (const skill of proposal.skillsToAdd) {
          if (!existingSkills.has(skill.toLowerCase())) {
            needsConfirmation.push({
              id: `skill:${skill}`,
              kind: 'new-skill',
              detail: `"${skill}" is not currently on the resume. Only add it if the user actually has this skill.`,
            });
          }
        }

        return ok({
          proposal,
          summaryChange: proposal.summary,
          bullets: proposal.bullets.map((b, index) => ({ id: index, ...b })),
          skillsToAdd: proposal.skillsToAdd,
          needsConfirmation,
          next:
            'Show these to the user. Then call apply_tailoring with the SAME proposal object and an accept list naming only what the user approved. Nothing is saved until you do.',
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'apply_tailoring',
    [
      'Save the tailoring changes the USER APPROVED as a new resume',
      'version. Pass back the proposal object from propose_tailoring plus',
      'an accept list naming only the changes the user agreed to — nothing',
      'else is applied. The live resume is NOT modified. Returns the new',
      'versionId: pass it to get_download_link so the user downloads THIS',
      'version, and to log_application so replies are attributed to it.',
    ].join(' '),
    {
      resumeId: z.string(),
      proposal: z
        .object({
          summary: z.object({ before: z.string(), after: z.string() }).nullable().optional(),
          bullets: z.array(
            z.object({
              experienceIndex: z.number(),
              bulletIndex: z.number(),
              before: z.string(),
              after: z.string(),
            }),
          ),
          skillsToAdd: z.array(z.string()),
        })
        .describe('The proposal object returned by propose_tailoring, unchanged'),
      accept: z
        .object({
          summary: z.boolean().optional().describe('true if the user approved the rewritten summary'),
          bulletIds: z.array(z.number()).optional().describe('ids of the bullets the user approved'),
          skills: z.array(z.string()).optional().describe('only the skills the user confirmed they have'),
        })
        .describe('What the user approved. Omitted or empty means nothing is applied.'),
      company: z.string().optional().describe('Company name for the version label'),
      role: z.string().optional().describe('Role title for the version label'),
    },
    { title: 'Apply approved tailoring', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ resumeId, proposal, accept, company, role }) => {
      try {
        const acceptedBulletIds = new Set(accept?.bulletIds ?? []);
        const bullets = proposal.bullets.filter((_, index) => acceptedBulletIds.has(index));
        // Only skills that were BOTH proposed and confirmed. A skill the
        // user named but the proposal never suggested is not ours to add.
        const proposedSkills = new Set(proposal.skillsToAdd.map((s) => s.toLowerCase()));
        const skillsToAdd = (accept?.skills ?? []).filter((s) => proposedSkills.has(s.toLowerCase()));
        const summary = accept?.summary && proposal.summary ? proposal.summary.after : null;

        if (!summary && bullets.length === 0 && skillsToAdd.length === 0) {
          return ok({
            applied: false,
            reason:
              'Nothing was approved, so nothing was saved. Ask the user which changes they want, then call apply_tailoring again.',
          });
        }

        const applied = await client.tailorApply(resumeId, {
          jdCompany: company,
          jdRole: role,
          summary,
          bullets,
          skillsToAdd,
          applyToLive: false,
        });
        return ok({
          applied: true,
          versionId: applied.version.id,
          versionLabel: applied.version.label,
          changesApplied: {
            summaryRewritten: Boolean(summary),
            bulletsRewritten: applied.appliedBullets,
            skillsAdded: skillsToAdd,
            rejectedAsStale: applied.rejectedAsStale,
          },
          next:
            'Pass versionId to get_download_link (so they download THIS version, not the original) and to log_application as resumeVersionId.',
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'log_application',
    [
      'Record a job application in the user\'s tracker. If a tailored',
      'version was used (from tailor_resume), pass its resumeVersionId —',
      'that link is how CallbackCV measures which resume variant',
      'actually gets replies.',
    ].join(' '),
    {
      company: z.string().min(1),
      role: z.string().min(1),
      jdUrl: z.string().optional().describe('Link to the job posting'),
      jdText: z.string().optional(),
      location: z.string().optional(),
      resumeId: z.string().optional(),
      resumeVersionId: z.string().optional().describe('Version id from tailor_resume — ALWAYS set when available'),
      status: z.enum(['wishlist', 'applied']).default('applied'),
      notes: z.string().optional(),
    },
    { title: 'Log a job application', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async (input) => {
      try {
        const created = await client.createJobApplication({
          ...input,
          ...(input.status === 'applied' ? { appliedAt: new Date().toISOString() } : {}),
        });
        return ok({ logged: true, applicationId: created.id, status: created.status });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    'get_outcome_stats',
    'Per-version response/interview/offer rates for a resume — which variant actually gets replies. Use this to pick the best base version before tailoring.',
    { resumeId: z.string() },
    { title: 'Get callback stats', readOnlyHint: true, openWorldHint: false },
    async ({ resumeId }) => {
      try {
        return ok(await client.getOutcomes(resumeId));
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
