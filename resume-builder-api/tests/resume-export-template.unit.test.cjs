const assert = require('node:assert/strict');
const test = require('node:test');
const puppeteer = require('puppeteer-core');
const { ResumeService } = require('../dist/resume/resume.service.js');

function createInMemoryPrisma(templateId = 'modern') {
  const state = {
    user: {
      id: 'user-1',
      plan: 'PRO',
      atsScansUsed: 0,
      atsScansLimit: 300,
      pdfExportsUsed: 0,
      pdfExportsLimit: 200,
      resumesLimit: 100,
      aiTokensUsed: 0,
      aiTokensLimit: 120000,
      usagePeriodStart: new Date('2026-01-01T00:00:00.000Z'),
      usagePeriodEnd: new Date('2099-01-01T00:00:00.000Z'),
      stripeCurrentPeriodEnd: null,
    },
    resume: {
      id: 'resume-1',
      userId: 'user-1',
      title: 'Principal Engineer Resume',
      templateId,
      contact: {
        fullName: 'Jane Export',
        email: 'jane.export@example.com',
        phone: '9999999999',
        location: 'Pune, IN',
      },
      summary: 'Technical Lead with 11 years of experience delivering frontend-heavy enterprise applications.',
      skills: ['React', 'TypeScript', 'Node.js', 'AWS', 'CI/CD', 'Redis'],
      experience: [
        {
          company: 'Acme Corp',
          role: 'Engineering Lead',
          startDate: '2021-01',
          endDate: 'Present',
          highlights: [
            'Built reusable template rendering pipelines for resume exports.',
            'Improved release speed by 40 percent with automated CI workflows.',
          ],
        },
      ],
      education: [
        {
          institution: 'State University',
          degree: 'B.Tech',
          startDate: '2010-01',
          endDate: '2014-01',
          details: ['Graduated with distinction'],
        },
      ],
      projects: [
        {
          name: 'Resume Export Service',
          role: 'Owner',
          startDate: '2025-01',
          endDate: '2026-01',
          highlights: ['Implemented template-aware server-side PDF generation'],
        },
      ],
      certifications: [
        {
          name: 'AWS Solutions Architect',
          issuer: 'Amazon',
          date: '2024-05',
          details: ['Professional'],
        },
      ],
    },
  };

  return {
    user: {
      findUnique: async ({ where }) => (where.id === state.user.id ? { ...state.user } : null),
      update: async ({ where, data }) => {
        if (where.id !== state.user.id) throw new Error('user not found');
        state.user = { ...state.user, ...data };
        return { ...state.user };
      },
    },
    resume: {
      findFirst: async ({ where }) => {
        if (where.id === state.resume.id && where.userId === state.resume.userId) {
          return { ...state.resume };
        }
        return null;
      },
      update: async ({ where, data }) => {
        if (where.id !== state.resume.id) throw new Error('resume not found');
        state.resume = { ...state.resume, ...data };
        return { ...state.resume };
      },
    },
    __getState: () => state,
  };
}

async function withCapturedPdfHtml(run) {
  let capturedHtml = '';
  const originalLaunch = puppeteer.launch;
  const originalDefaultLaunch = puppeteer.default?.launch;
  const mockLaunch = async () => ({
    newPage: async () => ({
      setContent: async (html) => {
        capturedHtml = String(html || '');
      },
      pdf: async () => Buffer.from(capturedHtml, 'utf8'),
    }),
    close: async () => {},
  });
  puppeteer.launch = mockLaunch;
  if (puppeteer.default) {
    puppeteer.default.launch = mockLaunch;
  }
  try {
    await run(() => capturedHtml);
  } finally {
    puppeteer.launch = originalLaunch;
    if (puppeteer.default && originalDefaultLaunch) {
      puppeteer.default.launch = originalDefaultLaunch;
    }
  }
}

test('generatePdf uses selected template markup and includes user resume data', async () => {
  const prisma = createInMemoryPrisma('modern');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  await withCapturedPdfHtml(async () => {
    const pdfBuffer = await service.generatePdf('user-1', 'resume-1');
    assert.ok(Buffer.isBuffer(pdfBuffer));
    const rendered = pdfBuffer.toString('utf8');
    assert.match(rendered, /Principal Engineer Resume/);
    assert.match(rendered, /jane\.export@example\.com/);
    assert.match(rendered, /data-template-id="modern"/);
    assert.match(rendered, /data-render-context="export"/);
    assert.match(rendered, /TEMPLATE_FINGERPRINT:modern/);
    assert.match(rendered, /Engineering Lead \| Acme Corp/);
    assert.match(rendered, /Jan 2021 - Present/);
    assert.equal(prisma.__getState().user.pdfExportsUsed, 1);
  });
});

test('export CSS does not pin .ats-item to a single page (blank-space regression)', async () => {
  // Founder smoke 2026-06: a multi-bullet experience item with
  // page-break-inside: avoid pushed the WHOLE block to page 2 when it
  // didn't fit at the bottom of page 1, leaving a visible blank band.
  // The fix removes the avoid on .ats-item and instead keeps the
  // heading glued to its first bullet via break-after: avoid on h3.
  const prisma = createInMemoryPrisma('classic');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  assert.doesNotMatch(rendered.html, /\.ats-section\s*\{[^}]*page-break-inside:\s*avoid;/i);
  assert.doesNotMatch(rendered.html, /\.ats-item\s*\{[^}]*page-break-inside:\s*avoid;/i);
  assert.match(rendered.html, /\.ats-item\s+h3\s*\{[^}]*break-after:\s*avoid;/i);
  assert.match(rendered.html, /overflow-wrap:\s*anywhere/i);
  assert.match(rendered.html, /word-break:\s*break-word/i);
  assert.doesNotMatch(rendered.html, /\.ats-template\s*\{[^}]*display:\s*grid/i);
  assert.doesNotMatch(rendered.html, /\.ats-template\s*\{[^}]*columns\s*:/i);
});

test("export CSS leads font stack with 'Inter' and never falls back to a serif", async () => {
  // Founder smoke 2026-06: downloaded PDFs used Arial as fallback,
  // which renders heavier than the on-screen preview. Standardise on
  // Inter (the same stack the preview uses) with system-ui + Linux
  // sans-serif fallbacks so headless Chrome on Render never silently
  // picks a serif font.
  const prisma = createInMemoryPrisma('classic');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  assert.match(rendered.html, /font-family:\s*'Inter',\s*system-ui/);
  assert.match(rendered.html, /'Liberation Sans'|'DejaVu Sans'/);
  assert.match(rendered.html, /sans-serif;/);
  // Ensure no actual serif family slipped into the stack — match on
  // bare " serif" (not "sans-serif") at end of font-family declaration.
  assert.doesNotMatch(rendered.html, /font-family:[^;]*(?:^|[\s,])serif\s*;/i);
});

test('apply template update persists and export uses the persisted templateId', async () => {
  const prisma = createInMemoryPrisma('classic');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  await service.update('user-1', 'resume-1', { templateId: 'modern' });
  assert.equal(prisma.__getState().resume.templateId, 'modern');

  await withCapturedPdfHtml(async () => {
    const pdfBuffer = await service.generatePdf('user-1', 'resume-1');
    const rendered = pdfBuffer.toString('utf8');
    assert.match(rendered, /data-template-id="modern"/);
    assert.match(rendered, /TEMPLATE_FINGERPRINT:modern/);
    assert.match(rendered, /class="ats-template ats-template--modern"/);
  });
});

test('legacy executive templateId aliases cleanly to classic', async () => {
  // Founder smoke 2026-06: 'Classic ATS' and 'Executive Impact' were
  // visually identical (h1 21->24px, h2 letter-spacing 0.08->0.12em,
  // company joiner). Executive was retired and the id aliased to
  // classic so any saved resume / share link keeps rendering instead
  // of breaking.
  const prisma = createInMemoryPrisma('executive');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  await withCapturedPdfHtml(async () => {
    const pdfBuffer = await service.generatePdf('user-1', 'resume-1');
    const rendered = pdfBuffer.toString('utf8');
    assert.match(rendered, /data-template-id="classic"/);
    assert.match(rendered, /TEMPLATE_FINGERPRINT:classic/);
    assert.doesNotMatch(rendered, /data-template-id="executive"/);
    assert.doesNotMatch(rendered, /ats-template--executive/);
  });
});

test('classic export uses uppercased ATS section names', async () => {
  const prisma = createInMemoryPrisma('classic');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  assert.match(rendered.html, /<h2>SUMMARY<\/h2>/);
  assert.match(rendered.html, /<h2>SKILLS<\/h2>/);
  assert.match(rendered.html, /<h2>EXPERIENCE<\/h2>/);
  assert.doesNotMatch(rendered.html, /EXECUTIVE SUMMARY/i);
  assert.doesNotMatch(rendered.html, /CORE CAPABILITIES/i);
});

test('switching template changes exported renderer output markers', async () => {
  const prisma = createInMemoryPrisma('modern');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  await withCapturedPdfHtml(async () => {
    const pdfBuffer = await service.generatePdf('user-1', 'resume-1');
    const rendered = pdfBuffer.toString('utf8');
    assert.match(rendered, /TEMPLATE_FINGERPRINT:modern/);
    assert.match(rendered, /<h2>Summary<\/h2>/);
  });

  await service.update('user-1', 'resume-1', { templateId: 'graduate' });

  await withCapturedPdfHtml(async () => {
    const pdfBuffer = await service.generatePdf('user-1', 'resume-1');
    const rendered = pdfBuffer.toString('utf8');
    assert.match(rendered, /TEMPLATE_FINGERPRINT:graduate/);
    assert.match(rendered, /<h2>Projects<\/h2>/);
    assert.ok(rendered.indexOf('<h2>Experience</h2>') < rendered.indexOf('<h2>Projects</h2>'));
  });
});

test('export uses explicit template override before persisted templateId', async () => {
  const prisma = createInMemoryPrisma('classic');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  await withCapturedPdfHtml(async () => {
    const pdfBuffer = await service.generatePdf('user-1', 'resume-1', 'technical');
    const rendered = pdfBuffer.toString('utf8');
    assert.match(rendered, /data-template-id="technical"/);
    assert.match(rendered, /TEMPLATE_FINGERPRINT:technical/);
    assert.doesNotMatch(rendered, /TEMPLATE_FINGERPRINT:classic/);
  });
});

test('debugExportHtml returns fingerprint and css bundle markers for persisted template', async () => {
  const prisma = createInMemoryPrisma('technical');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  assert.equal(rendered.templateId, 'technical');
  assert.match(rendered.fingerprint, /TEMPLATE_FINGERPRINT:technical/);
  assert.match(rendered.cssBundle, /inline:ats-template-css-v\d+/);
  assert.match(rendered.html, /data-template-id="technical"/);
  assert.match(rendered.html, /data-css-bundle="inline:ats-template-css-v\d+"/);
});

test('debugExportHtml fingerprint changes when template switches', async () => {
  const prisma = createInMemoryPrisma('modern');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  const before = await service.debugExportHtml('user-1', 'resume-1');
  assert.match(before.html, /TEMPLATE_FINGERPRINT:modern/);
  assert.match(before.html, /data-template-id="modern"/);

  await service.update('user-1', 'resume-1', { templateId: 'classic' });

  const after = await service.debugExportHtml('user-1', 'resume-1');
  assert.match(after.html, /TEMPLATE_FINGERPRINT:classic/);
  assert.match(after.html, /data-template-id="classic"/);
  assert.notEqual(before.fingerprint, after.fingerprint);
});

// ---------------------------------------------------------------------------
// Accent Header export — must match the React component used in the live
// preview (components/templates/AccentHeader.tsx). The bug was that the
// PDF export used a different "ats-template--accent-header" structure with
// plain-text skills and no header band, so the downloaded resume looked
// like Classic ATS instead of the styled template the user picked.
// ---------------------------------------------------------------------------

test('accent-header export emits the same nb-accent-header markup as the React preview', async () => {
  const prisma = createInMemoryPrisma('accent-header');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });

  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  const html = rendered.html;

  // Same root class + block names as components/templates/AccentHeader.tsx.
  assert.match(html, /<article class="nb-accent-header">/);
  assert.match(html, /<header class="nb-accent-header__band">/);
  assert.match(html, /class="nb-accent-header__name"/);
  // Skills must render as chips, not a comma-separated paragraph.
  assert.match(html, /class="nb-accent-header__skills-wrap"/);
  assert.match(html, /class="nb-accent-header__skill-pill"/);
  // Experience must render as timeline items with the dot indicator.
  assert.match(html, /class="nb-accent-header__item-dot"/);
  // About Me label (not "Summary") for accent-header.
  assert.match(html, /About Me/);
  // The accent-band CSS rule must be carried in the export bundle so
  // puppeteer renders the colored band.
  assert.match(html, /\.nb-accent-header__band\s*\{[^}]*linear-gradient/);
  // The chip CSS must be present too — the band without chips would
  // still look wrong.
  assert.match(html, /\.nb-accent-header__skill-pill\s*\{[^}]*border-radius/);
  // The skills the test fixture provided must appear verbatim as chip
  // text — proves the data path works.
  assert.match(html, /React<\/span>/);
  assert.match(html, /TypeScript<\/span>/);
});

test('accent-header alias "accent-band" resolves to the same nb-accent-header markup', async () => {
  // The export normalizer treats accent-band and visual as aliases for
  // accent-header (so people who picked an older variant don't get a
  // different look). Verify the alias path emits the same HTML.
  const prisma = createInMemoryPrisma('accent-band');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });
  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  assert.equal(rendered.templateId, 'accent-header');
  assert.match(rendered.html, /<article class="nb-accent-header">/);
});

// ---------------------------------------------------------------------------
// Duplicate-skills regression: visual templates used to render soft skills
// twice — once in the main skills section (because allSkills() merges all
// three buckets and that was used as the fallback when techSkills was
// empty) and once in their own dedicated soft-skills row.
// ---------------------------------------------------------------------------

function createInMemoryPrismaWithSoftSkills(templateId) {
  const base = createInMemoryPrisma(templateId);
  const state = base.__getState();
  state.resume.skills = ['React', 'TypeScript', 'Collaboration', 'Communication'];
  state.resume.technicalSkills = [];
  state.resume.softSkills = ['Collaboration', 'Communication'];
  state.resume.contact.softSkills = ['Collaboration', 'Communication'];
  state.resume.contact.technicalSkills = [];
  return base;
}

test('accent-header export does not render soft skills twice', async () => {
  const prisma = createInMemoryPrismaWithSoftSkills('accent-header');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });
  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  const html = rendered.html;
  const collaborationChips = (html.match(/>Collaboration</g) || []).length;
  const communicationChips = (html.match(/>Communication</g) || []).length;
  assert.equal(collaborationChips, 1, `Collaboration appears ${collaborationChips} times, expected 1`);
  assert.equal(communicationChips, 1, `Communication appears ${communicationChips} times, expected 1`);
  assert.equal((html.match(/>React</g) || []).length, 1);
  assert.equal((html.match(/>TypeScript</g) || []).length, 1);
});

test('sidebar-bold export does not render soft skills twice', async () => {
  const prisma = createInMemoryPrismaWithSoftSkills('sidebar-bold');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });
  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  const html = rendered.html;
  const collaboration = (html.match(/<li class="nb-sidebar-bold__skill-item">Collaboration</g) || []).length;
  const communication = (html.match(/<li class="nb-sidebar-bold__skill-item">Communication</g) || []).length;
  assert.equal(collaboration, 1);
  assert.equal(communication, 1);
});

test('sidebar-bold export emits nb-sidebar-bold markup matching the React preview', async () => {
  const prisma = createInMemoryPrisma('sidebar-bold');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });
  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  const html = rendered.html;
  assert.match(html, /<article class="nb-sidebar-bold">/);
  assert.match(html, /<aside class="nb-sidebar-bold__sidebar">/);
  assert.match(html, /<main class="nb-sidebar-bold__main">/);
  assert.match(html, /class="nb-sidebar-bold__content-title">Profile</);
  assert.match(html, /\.nb-sidebar-bold__sidebar\s*\{[^}]*background:\s*#1a2e4a/);
});

// ---------------------------------------------------------------------------
// Achievements — dedicated section renders in the PDF export.
// ---------------------------------------------------------------------------

function createInMemoryPrismaWithAchievements(templateId) {
  const base = createInMemoryPrisma(templateId);
  const state = base.__getState();
  state.resume.achievements = [
    'Won the Rising Star award twice for high-impact delivery',
    'Spearheaded the Speedboat Project, shipping the MVP 2 weeks early',
  ];
  return base;
}

test('classic export renders an Achievements section with the statements', async () => {
  const prisma = createInMemoryPrismaWithAchievements('classic');
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });
  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  const html = rendered.html;
  assert.match(html, /ACHIEVEMENTS|Achievements/);
  assert.match(html, /Rising Star award twice/);
  assert.match(html, /Speedboat Project/);
});

test('export omits the Achievements section entirely when there are none', async () => {
  const prisma = createInMemoryPrisma('classic'); // no achievements in fixture
  const service = new ResumeService(prisma, {
    isPaymentFeatureEnabled: async () => false,
    isRateLimitEnabled: async () => false,
  });
  const rendered = await service.debugExportHtml('user-1', 'resume-1');
  // No empty "Achievements" heading should appear.
  assert.doesNotMatch(rendered.html, />\s*ACHIEVEMENTS\s*</);
});
