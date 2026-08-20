import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApiError, PocketResumeClient } from './api-client.js';

/**
 * R-040 — CallbackCV MCP server.
 *
 * The strategic frame (PRODUCT_STRATEGY §3.1): when an agent applies
 * to jobs on a user's behalf it needs a resume source of truth, a
 * tailoring function, and an application log. If CallbackCV is the
 * MCP server it calls, every agent-driven application still feeds the
 * Outcome Graph — agents become a distribution channel, not a threat.
 *
 * Six tools, deliberately mirroring what a human can do in the UI:
 *   list_resumes       — find the user's resumes
 *   get_resume         — full structured resume JSON
 *   list_versions      — snapshots (tailored variants live here)
 *   tailor_resume      — JD → NEW ResumeVersion (C-007 attribution!)
 *   log_application    — write to the Jobs tracker WITH versionId
 *   get_outcome_stats  — which version actually gets replies
 *
 * Everything delegates to the REST API with the user's own token, so
 * plan gates / AI-token quotas / rate limits apply identically to
 * agents and humans. Tool descriptions tell the agent to attach the
 * version id when logging an application — that link IS the moat.
 */

export function buildServer(client: PocketResumeClient): McpServer {
  const server = new McpServer({
    name: 'callbackcv',
    version: '0.3.1',
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
  const UTM = '?utm_source=' + encodeURIComponent(String(process.env.MCP_UTM_SOURCE || 'ai-assistant'));


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
      const base = webBase();
      const url = resumeId
        ? base + '/resume?resumeId=' + encodeURIComponent(resumeId) + UTM
        : base + '/resume/start' + UTM;
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
      'this once. summary must be at least 20 characters. Returns the new',
      'resumeId — use it with update_resume, tailor_resume and',
      'get_download_link.',
    ].join(' '),
    {
      title: z.string().min(2).describe('Document title, e.g. "Senior Frontend Engineer Resume"'),
      summary: z.string().min(20).describe('Professional summary, 2-3 sentences with at least one measurable result'),
      contact: z
        .object({
          fullName: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          location: z.string().optional(),
          links: z.array(z.string()).optional(),
        })
        .optional(),
      skills: z.array(z.string()).optional(),
      experience: z
        .array(
          z.object({
            role: z.string(),
            company: z.string(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            highlights: z.array(z.string()).optional().describe('Outcome bullets — include numbers'),
          }),
        )
        .optional(),
      education: z
        .array(
          z.object({
            degree: z.string(),
            institution: z.string(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          }),
        )
        .optional(),
      achievements: z.array(z.string()).optional(),
      templateId: z.string().optional().describe('Template id, e.g. "classic" (default), "modern", "skills-first"'),
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
      'Update fields on an existing resume (summary, skills, experience,',
      'education, achievements, title, templateId). Send ONLY the fields to',
      'change — arrays REPLACE the whole section, so read the resume first',
      'with get_resume and send the full corrected array.',
    ].join(' '),
    {
      resumeId: z.string(),
      title: z.string().min(2).optional(),
      summary: z.string().min(20).optional(),
      skills: z.array(z.string()).optional(),
      experience: z
        .array(
          z.object({
            role: z.string(),
            company: z.string(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            highlights: z.array(z.string()).optional(),
          }),
        )
        .optional(),
      education: z
        .array(
          z.object({
            degree: z.string(),
            institution: z.string(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          }),
        )
        .optional(),
      achievements: z.array(z.string()).optional(),
      templateId: z.string().optional(),
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
      'is true.',
    ].join(' '),
    { resumeId: z.string() },
    { title: 'Get the PDF download link', readOnlyHint: true, openWorldHint: false },
    async ({ resumeId }) => {
      try {
        const webUrl = webBase();
        const cfg = await client.downloadChargeConfig();
        return ok({
          url: webUrl + '/resume/template' + UTM + '&resumeId=' + encodeURIComponent(resumeId),
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

  server.tool(
    'tailor_resume',
    [
      'Tailor a resume to a job description. Two-phase under the hood:',
      'the AI proposes per-bullet rewrites, this tool applies ALL proposed',
      'changes and saves them as a NEW resume version labelled with the',
      'company + role. The live resume is NOT modified. Returns the new',
      'versionId — ALWAYS pass it to log_application when you apply to',
      'this job, so reply rates can be attributed to this exact variant.',
      'Costs AI tokens from the user\'s monthly quota.',
    ].join(' '),
    {
      resumeId: z.string(),
      jdText: z.string().min(80).describe('The full job description text'),
      company: z.string().optional().describe('Company name for the version label'),
      role: z.string().optional().describe('Role title for the version label'),
    },
    { title: 'Tailor resume to a JD', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ resumeId, jdText, company, role }) => {
      try {
        const proposal = await client.tailorPropose(resumeId, jdText);
        const changeCount =
          (proposal.summary ? 1 : 0) + proposal.bullets.length + proposal.skillsToAdd.length;
        if (changeCount === 0) {
          return ok({
            tailored: false,
            reason: 'The resume already matches this JD well — no changes proposed.',
          });
        }
        const applied = await client.tailorApply(resumeId, {
          jdCompany: company,
          jdRole: role,
          summary: proposal.summary ? proposal.summary.after : null,
          bullets: proposal.bullets,
          skillsToAdd: proposal.skillsToAdd,
          applyToLive: false,
        });
        return ok({
          tailored: true,
          versionId: applied.version.id,
          versionLabel: applied.version.label,
          changesApplied: {
            summaryRewritten: Boolean(proposal.summary),
            bulletsRewritten: applied.appliedBullets,
            skillsAdded: proposal.skillsToAdd,
          },
          next: 'Pass versionId as resumeVersionId when calling log_application for this job.',
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
