/**
 * Build a Word (.docx) document from a structured resume.
 *
 * We deliberately render from the structured fields (title, contact,
 * summary, skills, experience, education, projects, certifications)
 * rather than from the styled HTML used for PDF. Reasons:
 *   • DOCX text reads better through ATS parsers than DOCX-embedded
 *     HTML — recruiters' ATS pipelines can extract the plain section
 *     headings reliably.
 *   • The file stays ~10–30 KB (vs hundreds of KB if we embedded
 *     fonts and images).
 *   • Re-implementing template visuals in DOCX would be a maintenance
 *     burden — every CSS change in the web template would need a
 *     mirror change here.
 *
 * The output is intentionally clean and ATS-safe: single column, one
 * heading style, bullets via the bullet-list numbering, no tables.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';

type ResumeLike = {
  title?: string | null;
  summary?: string | null;
  skills?: string[] | null;
  technicalSkills?: string[] | null;
  softSkills?: string[] | null;
  languages?: string[] | null;
  contact?: {
    fullName?: string;
    email?: string;
    phone?: string;
    location?: string;
    links?: string[];
  } | null;
  experience?: Array<{
    company?: string;
    role?: string;
    startDate?: string;
    endDate?: string;
    highlights?: string[];
  }> | null;
  education?: Array<{
    institution?: string;
    degree?: string;
    startDate?: string;
    endDate?: string;
    details?: string[];
  }> | null;
  projects?: Array<{
    name?: string;
    role?: string;
    highlights?: string[];
  }> | null;
  certifications?: Array<{
    name?: string;
    issuer?: string;
    date?: string;
  }> | null;
};

const FONT = 'Calibri';

function txt(text: string, opts: { bold?: boolean; size?: number; italic?: boolean } = {}): TextRun {
  return new TextRun({
    text,
    bold: opts.bold,
    italics: opts.italic,
    size: opts.size ?? 22, // 11pt (size is in half-points)
    font: FONT,
  });
}

function heading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { color: '888888', size: 6, space: 1, style: 'single' } },
    children: [txt(text.toUpperCase(), { bold: true, size: 24 })],
  });
}

function paragraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [txt(text)],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [txt(text)],
  });
}

function dateRange(start?: string, end?: string): string {
  const s = (start || '').trim();
  const e = (end || '').trim();
  if (!s && !e) return '';
  if (!e || /present/i.test(e)) return `${s} – Present`;
  return `${s} – ${e}`;
}

export async function renderResumeDocx(resume: ResumeLike): Promise<Buffer> {
  const children: Paragraph[] = [];
  const fullName = resume.contact?.fullName || resume.title || 'Resume';

  // Header — name centered, contact line below.
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [txt(fullName, { bold: true, size: 32 })],
    }),
  );

  const contactBits = [
    resume.contact?.email,
    resume.contact?.phone,
    resume.contact?.location,
    ...(resume.contact?.links ?? []),
  ].filter((s): s is string => Boolean(s && s.trim()));
  if (contactBits.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [txt(contactBits.join('  ·  '))],
      }),
    );
  }

  // Summary
  if (resume.summary && resume.summary.trim()) {
    children.push(heading('Summary'));
    children.push(paragraph(resume.summary.trim()));
  }

  // Skills (collapsing technical/soft/languages into one ATS-friendly block)
  const skillBuckets: Array<[string, string[] | null | undefined]> = [
    ['Skills', resume.skills],
    ['Technical Skills', resume.technicalSkills],
    ['Soft Skills', resume.softSkills],
    ['Languages', resume.languages],
  ];
  const presentSkillBuckets = skillBuckets.filter(([, items]) => items && items.length > 0);
  if (presentSkillBuckets.length) {
    children.push(heading('Skills'));
    for (const [label, items] of presentSkillBuckets) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [txt(`${label}: `, { bold: true }), txt((items ?? []).join(', '))],
        }),
      );
    }
  }

  // Experience
  if (resume.experience && resume.experience.length > 0) {
    children.push(heading('Experience'));
    for (const exp of resume.experience) {
      const role = (exp.role || '').trim();
      const company = (exp.company || '').trim();
      const dates = dateRange(exp.startDate, exp.endDate);
      const titleLine = [role, company].filter(Boolean).join(' · ');
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            txt(titleLine, { bold: true }),
            ...(dates ? [txt(`    ${dates}`, { italic: true })] : []),
          ],
        }),
      );
      for (const h of exp.highlights ?? []) {
        if (h && h.trim()) children.push(bullet(h.trim()));
      }
    }
  }

  // Education
  if (resume.education && resume.education.length > 0) {
    children.push(heading('Education'));
    for (const edu of resume.education) {
      const degree = (edu.degree || '').trim();
      const institution = (edu.institution || '').trim();
      const dates = dateRange(edu.startDate, edu.endDate);
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: [
            txt([degree, institution].filter(Boolean).join(' · '), { bold: true }),
            ...(dates ? [txt(`    ${dates}`, { italic: true })] : []),
          ],
        }),
      );
      for (const d of edu.details ?? []) {
        if (d && d.trim()) children.push(bullet(d.trim()));
      }
    }
  }

  // Projects
  if (resume.projects && resume.projects.length > 0) {
    children.push(heading('Projects'));
    for (const proj of resume.projects) {
      const name = (proj.name || '').trim();
      const role = (proj.role || '').trim();
      children.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: [txt([name, role].filter(Boolean).join(' · '), { bold: true })],
        }),
      );
      for (const h of proj.highlights ?? []) {
        if (h && h.trim()) children.push(bullet(h.trim()));
      }
    }
  }

  // Certifications
  if (resume.certifications && resume.certifications.length > 0) {
    children.push(heading('Certifications'));
    for (const cert of resume.certifications) {
      const name = (cert.name || '').trim();
      const issuer = (cert.issuer || '').trim();
      const date = (cert.date || '').trim();
      const line = [name, issuer, date].filter(Boolean).join(' · ');
      children.push(paragraph(line));
    }
  }

  // R-077 — profession-specific sections (licensure, publications/patents).
  const licenses = Array.isArray((resume as { licenses?: Array<Record<string, string>> }).licenses)
    ? ((resume as { licenses?: Array<Record<string, string>> }).licenses as Array<Record<string, string>>)
    : [];
  if (licenses.length > 0) {
    children.push(heading('Licenses & Registrations'));
    for (const lic of licenses) {
      const line = [
        (lic.name || '').trim(),
        (lic.authority || '').trim(),
        lic.licenseNumber ? `License No.: ${String(lic.licenseNumber).trim()}` : '',
        (lic.region || '').trim(),
        lic.validTill ? `Valid till ${String(lic.validTill).trim()}` : '',
      ].filter(Boolean).join(' · ');
      children.push(paragraph(line));
    }
  }
  const publications = Array.isArray((resume as { publications?: Array<Record<string, string>> }).publications)
    ? ((resume as { publications?: Array<Record<string, string>> }).publications as Array<Record<string, string>>)
    : [];
  if (publications.length > 0) {
    children.push(heading('Publications & Patents'));
    for (const pub of publications) {
      const line = [
        (pub.title || '').trim(),
        (pub.venue || '').trim(),
        (pub.year || '').trim(),
        pub.type === 'patent' ? '[Patent]' : '',
      ].filter(Boolean).join(' · ');
      children.push(paragraph(line));
    }
  }

  const doc = new Document({
    creator: 'CallbackCV',
    title: fullName,
    styles: {
      default: {
        document: { run: { font: FONT } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 }, // 0.5"
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc) as Promise<Buffer>;
}

/**
 * Slugify the user's name (or fall back to the resume title / id) so
 * the Content-Disposition filename is human-readable. Strips path
 * separators and other characters that confuse iOS / Android downloads.
 */
export function buildResumeFileName(
  resume: ResumeLike,
  fallbackId: string,
  ext: 'pdf' | 'docx',
): string {
  // "<full name>_<role>" reads as "seema-shaikh_technical-lead" which
  // is what users want when they're tracking applications across
  // multiple roles. Falls back to title or "resume-{id}" only when
  // both name and role are empty.
  const fullName = (resume.contact?.fullName || '').trim();
  const role = (resume.experience?.[0]?.role || '').trim();
  const candidate = [fullName, role].filter(Boolean).join('_') || resume.title || '';
  const slug = candidate
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 64);
  const base = slug || `resume-${fallbackId}`;
  return `${base}.${ext}`;
}
