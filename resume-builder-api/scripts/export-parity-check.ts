/**
 * Exercise the REAL export renderer for every preset template.
 *
 * The parity test in the web package asserts against the API source text; this
 * runs the actual function the PDF pipeline calls, so it proves the exported
 * HTML carries the right template class, the right headings, in the right
 * order, and the export CSS — rather than proving the source merely looks right.
 */
import { renderResumeTemplateHtml } from '../src/resume/resume.service';
import {
  PRESET_TEMPLATE_IDS,
  templatePreset,
  resolveSectionOrder,
  getAtsSectionTitle,
} from 'resume-builder-shared';

const RESUME: any = {
  title: 'Senior Engineer',
  contact: { fullName: 'Test Person', email: 't@example.com', phone: '555-0100', location: 'Pune' },
  summary: 'A summary line.',
  skills: ['React', 'TypeScript'],
  technicalSkills: ['React'],
  softSkills: ['Leadership'],
  languages: ['English', 'Hindi'],
  experience: [
    { company: 'Citi', role: 'AVP', startDate: 'Dec 2022', endDate: 'Present', highlights: ['Did a thing.'] },
  ],
  education: [{ institution: 'Uni', degree: 'BE', startDate: '2010', endDate: '2014', details: [] }],
  projects: [{ name: 'Proj', highlights: ['Built it.'] }],
  achievements: ['Won an award'],
  certifications: [{ name: 'AWS' }],
};

function decode(s: string) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

let failures = 0;
for (const id of PRESET_TEMPLATE_IDS) {
  const { html, cssIncluded } = renderResumeTemplateHtml({
    templateId: id,
    resumeData: RESUME,
    mode: 'export',
  });

  const problems: string[] = [];

  // 1. Did it render THIS template, or silently fall back to classic?
  if (!html.includes(`ats-template--${id}`)) problems.push('missing its own template class');
  if (html.includes('ats-template--classic')) problems.push('fell back to classic');

  // 2. Is the stylesheet actually in the document?
  if (!cssIncluded) problems.push('cssIncluded=false');
  if (!html.includes('.ats-template {')) problems.push('export CSS not inlined');

  // 3. Headings and their order, versus what the preset asks for.
  const preset = templatePreset(id)!;
  const rendered = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => decode(m[1]));
  const labels: Record<string, string> = (preset.labels || {}) as any;
  const expected = resolveSectionOrder(undefined, preset.defaultBody as any)
    .map((k) => {
      const l = labels[k] ?? getAtsSectionTitle(k as any);
      return preset.uppercaseHeadings ? l.toUpperCase() : l;
    })
    .filter((h) => rendered.includes(h));

  if (JSON.stringify(rendered) !== JSON.stringify(expected)) {
    problems.push(`heading order\n      got:  ${rendered.join(' > ')}\n      want: ${expected.join(' > ')}`);
  }

  // 4. The header treatment the preset declares.
  // Scope to the rendered element: the inlined <style> also contains the
  // .ats-template__header--bar RULE, so a document-wide search always matches.
  const bar = /<header class="[^"]*ats-template__header--bar/.test(html);
  if (bar !== Boolean(preset.headerBar)) problems.push(`headerBar=${bar}, preset says ${Boolean(preset.headerBar)}`);

  if (problems.length) {
    failures++;
    console.log(`FAIL ${id}`);
    for (const p of problems) console.log('    - ' + p);
  } else {
    console.log(`ok   ${id.padEnd(18)} ${rendered.join(' > ')}`);
  }
}

console.log(
  failures
    ? `\n${failures}/${PRESET_TEMPLATE_IDS.length} FAILED`
    : `\nall ${PRESET_TEMPLATE_IDS.length} preset templates export correctly, with CSS`,
);
process.exit(failures ? 1 : 0);
