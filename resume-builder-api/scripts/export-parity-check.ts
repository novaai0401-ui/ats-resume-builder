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
// (exit moved to the end of the file so later sections actually run)

/* ---------------------------------------------------------------------------
   nb-visual family: same proof for the designer templates. One shared
   renderer serves all four, so a break here is a break in all of them.
   --------------------------------------------------------------------------- */
const VISUAL_IDS = ['sidebar-elegant', 'icon-accent', 'banner-modern', 'initials-classic', 'photo-banner', 'timeline-pro', 'elegant-serif', 'bold-header'];
const VISUAL_RESUME: any = {
  ...RESUME,
  contact: { ...RESUME.contact, links: ['linkedin.com/in/x'] },
  accentColor: '#7c2d5e',
};

let visualFailures = 0;
for (const id of VISUAL_IDS) {
  const { html, cssIncluded } = renderResumeTemplateHtml({
    templateId: id,
    resumeData: VISUAL_RESUME,
    mode: 'export',
  });
  const problems: string[] = [];
  if (!html.includes(`nb-visual--${id}`)) problems.push('missing variant class');
  if (html.includes('ats-template--classic')) problems.push('fell back to classic');
  if (!cssIncluded || !html.includes('.nb-visual ')) problems.push('nb-visual CSS not inlined');
  if (!html.includes('Work History')) problems.push('experience section missing');
  // The accent swatch must reach the PDF, or the four designs all render in
  // the default teal regardless of what the user picked.
  if (!html.includes('--rb-accent: #7c2d5e')) problems.push('accent variable not injected');
  if (id === 'initials-classic' && !/nb-visual__initials[^>]*>TP</.test(html)) problems.push('initials missing');
  if (problems.length) {
    visualFailures++;
    console.log(`FAIL ${id}`);
    for (const p of problems) console.log('    - ' + p);
  } else {
    console.log(`ok   ${id.padEnd(18)} (visual)`);
  }
}
console.log(
  visualFailures
    ? `\n${visualFailures}/${VISUAL_IDS.length} visual templates FAILED`
    : `all ${VISUAL_IDS.length} visual templates export correctly, with CSS + accent`,
);
if (visualFailures) process.exit(1);

// (exit is at the very end of the file — code after an exit never runs,
// which has now bitten this script twice)

/* photo-banner's PHOTO path: the loop above ran it with no photo, which only
   proves the monogram fallback. One more render with a real (tiny) data-URI
   asserts the img actually reaches the PDF markup. */
{
  const TINY_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const { html } = renderResumeTemplateHtml({
    templateId: 'photo-banner',
    resumeData: { ...VISUAL_RESUME, photoUrl: TINY_PNG },
    mode: 'export',
  });
  const hasImg = html.includes('nb-visual__photo') && html.includes(TINY_PNG);
  // Scope to the ELEMENT: the inlined <style> also contains the .nb-visual__initials
  // RULE, so a bare substring test always matches (same lesson as the headerBar check).
  const hasMonogram = /<span class="nb-visual__initials"/.test(html);
  if (!hasImg || hasMonogram) {
    console.log(`FAIL photo-banner (photo path): img=${hasImg} monogramStillShown=${hasMonogram}`);
    process.exit(1);
  }
  console.log('ok   photo-banner       (photo path: img rendered, monogram suppressed)');
}


/* Hero identity: the PERSON leads, the document title is the subtitle, and the
   same string never renders twice — a real exported PDF showed the long doc
   title in 26px type and again beneath it. */
{
  const { html } = renderResumeTemplateHtml({
    templateId: 'sidebar-elegant',
    resumeData: { ...VISUAL_RESUME, title: 'Tech Lead / AVP - Full Stack' },
    mode: 'export',
  });
  const nameOk = /nb-visual__name">Test Person</.test(html);
  const roleOk = html.includes('nb-visual__role">Tech Lead / AVP - Full Stack');
  if (!nameOk || !roleOk) {
    console.log();
    process.exit(1);
  }
  console.log('ok   hero identity      (person name leads, title is the subtitle)');
}

/* Pagination doctrine guard: no MAIN-COLUMN section/item container may carry
   break-inside: avoid in the export CSS. A container taller than one page
   gets pushed wholesale to the next page by Chromium instead of splitting —
   the reported symptom was Work History jumping to page 2 and leaving page 1
   blank after the summary (nb-visual family, all 8 templates at once). */
{
  const { html } = renderResumeTemplateHtml({
    templateId: 'sidebar-elegant',
    resumeData: VISUAL_RESUME,
    mode: 'export',
  });
  // Pull each offending selector's declaration block out of the inlined CSS.
  const growable = ['.nb-visual__block', '.nb-visual__item', '.nb-sidebar-bold__content-section', '.nb-sidebar-bold__exp-item', '.ats-section', '.ats-item'];
  const bad: string[] = [];
  for (const sel of growable) {
    const re = new RegExp(sel.replace(/[.\\]/g, '\\$&') + '\\s*\\{[^}]*\\}', 'g');
    for (const rule of html.match(re) || []) {
      if (/break-inside\s*:\s*avoid/.test(rule)) bad.push(sel);
    }
  }
  if (bad.length) {
    console.log(`FAIL pagination doctrine: break-inside: avoid on growable container(s): ${[...new Set(bad)].join(', ')}`);
    process.exit(1);
  }
  console.log('ok   pagination         (no break-inside: avoid on growable main-column containers)');
}

process.exit(failures + visualFailures ? 1 : 0);
