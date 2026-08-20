const assert = require('node:assert/strict');
const test = require('node:test');
const {
  looksLikeLinkedInProfile,
  normalizeLinkedInProfileText,
  dedupeDoubledLine,
} = require('../dist/resume/linkedin-import.js');
const svc = require('../dist/resume/resume.service.js');

// Realistic LinkedIn profile paste: visually-hidden duplicates double every
// entity, employment-type and duration tails, LinkedIn section names.
const LINKEDIN_PASTE = [
  'Priya NairPriya Nair',
  'Senior Software Engineer at Acme CorpSenior Software Engineer at Acme Corp',
  'Bengaluru, Karnataka, India · Contact info',
  '500+ connections',
  'AboutAbout',
  'Engineer with 7 years of experience building distributed systems and mentoring teams.',
  'ExperienceExperience',
  'Senior Software EngineerSenior Software Engineer',
  'Acme Corp · Full-time',
  'Jan 2021 - Present · 3 yrs 6 mos',
  'Bengaluru, Karnataka, India',
  'Led the payments platform serving 2M daily requests; reduced p99 latency by 40%.',
  'Software EngineerSoftware Engineer',
  'Globex Pvt Ltd · Full-time',
  'Jun 2017 - Dec 2020 · 3 yrs 7 mos',
  'Built the onboarding portal used by 40k customers.',
  'EducationEducation',
  'National Institute of TechnologyNational Institute of Technology',
  'B.Tech, Computer Science',
  '2013 - 2017',
  'SkillsSkills',
  'Java · Spring Boot · AWS · Kubernetes',
].join('\n');

// ── Detector ────────────────────────────────────────────────────────────

test('looksLikeLinkedInProfile detects a real paste, not a normal resume', () => {
  assert.equal(looksLikeLinkedInProfile(LINKEDIN_PASTE), true);
  const normalResume = [
    'Jane Doe', 'jane@x.com', 'WORK EXPERIENCE',
    'Senior Engineer', 'Acme Corp (Pune)', '(Jan 2020 - Present)',
    '- Built things that scaled.',
  ].join('\n');
  assert.equal(looksLikeLinkedInProfile(normalResume), false);
});

test('dedupeDoubledLine halves LinkedIn hidden duplicates only', () => {
  assert.equal(dedupeDoubledLine('ExperienceExperience'), 'Experience');
  assert.equal(dedupeDoubledLine('Priya NairPriya Nair'), 'Priya Nair');
  assert.equal(dedupeDoubledLine('Regular sentence stays.'), 'Regular sentence stays.');
});

// ── Normalizer ──────────────────────────────────────────────────────────

test('normalizeLinkedInProfileText produces canonical resume text', () => {
  const out = normalizeLinkedInProfileText(LINKEDIN_PASTE);
  assert.ok(out.includes('SUMMARY'), 'About → SUMMARY');
  assert.ok(out.includes('WORK EXPERIENCE'));
  assert.ok(out.includes('EDUCATION'));
  assert.ok(out.includes('SKILLS'));
  assert.ok(out.includes('(Jan 2021 - Present)'), 'date line parenthesised');
  assert.ok(out.includes('Acme Corp'), 'employment-type tail stripped');
  assert.ok(!/·\s*Full-time/i.test(out), 'no "· Full-time" left');
  assert.ok(!/3 yrs/.test(out), 'no duration tails left');
  assert.ok(!/ExperienceExperience/.test(out), 'no doubled lines left');
  assert.ok(!/500\+ connections/.test(out), 'LinkedIn chrome removed');
});

// ── End-to-end through the real extraction pipeline ─────────────────────

test('a LinkedIn paste extracts a full structured resume', () => {
  const { ResumeService, normalizeUploadText, splitTabularExperienceHeaders } = svc;
  const service = new ResumeService({}, undefined, undefined, undefined, undefined);
  const normalized = normalizeLinkedInProfileText(LINKEDIN_PASTE);
  const r = service['buildStructuredResume'](normalizeUploadText(splitTabularExperienceHeaders(normalized)));
  const p = r.parsedPayload;

  assert.equal(p.contact.fullName, 'Priya Nair');
  assert.equal(p.experience.length, 2);
  assert.match(p.experience[0].role, /Senior Software Engineer/i);
  assert.match(p.experience[0].company, /Acme Corp/i);
  assert.match(String(p.experience[0].endDate), /present/i);
  assert.match(p.experience[1].company, /Globex/i);
  assert.equal(p.education.length >= 1, true);
  assert.ok((p.skills || []).some((s) => /java/i.test(s)));
});

// ── R-078: reject wrong-page pastes + strip app chrome ──────────────────
const { looksLikeLinkedInFeedDump } = require('../dist/resume/linkedin-import.js');

const FEED_DUMP = [
  'Compose message',
  'You are on the messaging overlay. Press enter to open the list of conversations.',
  'TEKIVEX picture',
  'TEKIVEX',
  'Scrolled to top of feed',
  'Start a post',
  'Promoted',
  'John Doe',
  'Software Engineer at Acme',
].join('\n');

test('a LinkedIn HOME FEED / messaging paste is detected as a feed dump', () => {
  assert.equal(looksLikeLinkedInFeedDump(FEED_DUMP), true);
  // A real profile paste is NOT a feed dump.
  assert.equal(looksLikeLinkedInFeedDump(LINKEDIN_PASTE), false);
});

test('app chrome (nav, messaging overlay, avatar alt-text, feed) is stripped', () => {
  const out = normalizeLinkedInProfileText(FEED_DUMP);
  assert.doesNotMatch(out, /messaging overlay|compose message|scrolled to top of feed|start a post|promoted|picture/i);
});

test('uploading a feed dump is rejected with actionable guidance (no phantom jobs)', async () => {
  const { ResumeService } = svc;
  const service = new ResumeService({}, undefined, undefined, undefined, undefined);
  // Drive the real upload entry point with a .txt buffer of the feed dump.
  const file = { originalname: 'linkedin-profile.txt', mimetype: 'text/plain', size: FEED_DUMP.length, buffer: Buffer.from(FEED_DUMP, 'utf8') };
  await assert.rejects(
    () => service.parseResumeUpload(file, { mode: 'extract-and-map' }),
    (err) => {
      const msg = JSON.stringify(err?.response || err?.message || err);
      assert.match(msg, /home feed|profile page/i);
      return true;
    },
  );
});

test('the real profile paste still extracts cleanly after the chrome expansion', () => {
  const { ResumeService, normalizeUploadText, splitTabularExperienceHeaders } = svc;
  const service = new ResumeService({}, undefined, undefined, undefined, undefined);
  const normalized = normalizeLinkedInProfileText(LINKEDIN_PASTE);
  const r = service['buildStructuredResume'](normalizeUploadText(splitTabularExperienceHeaders(normalized)));
  assert.equal(r.parsedPayload.experience.length, 2);
});

// ── Markdown-flavoured LinkedIn paste (copy-as-markdown / reader tools) ──
// Every line arrives as a [text](url) link; the URL says what the line IS
// (/company/ = grouped employer, position/ = role lines, skill-associations
// = the "+N skills" overlay). Fixture deliberately uses a DIFFERENT person
// and country than the founder's report: the parsing is structural, not
// tuned to one profile.
const MD_PASTE = [
  'Directrice adjointe at Banque Lumière, leading platform engineering across Europe.',
  '',
  'Experience',
  '[Banque Lumière](https://www.linkedin.com/company/98765/)',
  '[Full-time · 4 yrs 2 mos](https://www.linkedin.com/company/98765/)',
  '* [Engineering Manager](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/111/)',
  '[Mar 2022 - Present · 3 yrs 6 mos](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/111/)',
  '[Lyon, Auvergne-Rhône-Alpes, France · Hybrid](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/111/)',
  '• Scaled the payments platform team from 4 to 15 engineers.… more',
  '[ Leadership, Kubernetes and +12 skills](https://www.linkedin.com/in/amelie-dupont/overlay/111/skill-associations-details/)',
  '* [Staff Engineer](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/222/)',
  '[Jan 2021 - Mar 2022 · 1 yr 3 mos](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/222/)',
  '• Designed the multi-region ledger service.',
  '[Senior Developer](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/333/)',
  '[Maple Analytics · Full-time](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/333/)',
  '[Feb 2017 - Dec 2020 · 3 yrs 11 mos](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/333/)',
  '[Greater Toronto Area, Canada · Remote](https://www.linkedin.com/in/amelie-dupont/edit/forms/position/333/)',
  '• Built the reporting pipeline used by 200 clients.',
  '',
  'Education',
  'Université de Lyon logo',
  'Université de Lyon',
  'Master of Science - MSc, Computer Science',
  '2012 – 2017',
  'Grade: 16/20',
].join('\n');

test('markdown paste: link URLs classify lines; roles pair with their grouped company', () => {
  assert.equal(looksLikeLinkedInProfile(MD_PASTE), true);
  const out = normalizeLinkedInProfileText(MD_PASTE);
  const lines = out.split('\n');

  // Grouped roles are re-paired with the /company/ anchor.
  const emIdx = lines.indexOf('Engineering Manager');
  assert.ok(emIdx >= 0, 'role survives');
  assert.equal(lines[emIdx + 1], 'Banque Lumière', 'grouped role gets its company on the next line');
  const seIdx = lines.indexOf('Staff Engineer');
  assert.equal(lines[seIdx + 1], 'Banque Lumière', 'second grouped role too');

  // Ungrouped entry keeps its own company line.
  const sdIdx = lines.indexOf('Senior Developer');
  assert.equal(lines[sdIdx + 1], 'Maple Analytics');

  // Dates parenthesised; durations gone.
  assert.ok(out.includes('(Mar 2022 - Present)'));
  assert.ok(!/yrs?|mos\b/.test(out), 'no duration fragments');

  // Locations (France AND Canada — structural, not a country list) dropped.
  assert.ok(!out.includes('Auvergne'), 'French location dropped');
  assert.ok(!out.includes('Toronto'), 'Canadian location dropped');

  // LinkedIn overlays and alt-text never survive.
  assert.ok(!/\+12 skills/.test(out), 'skill-association overlay dropped');
  assert.ok(!/logo/.test(out), 'image alt-text dropped');
  assert.ok(!/Grade:/.test(out), 'grade footer dropped');
  assert.ok(!lines.includes('Full-time'), 'bare employment type never becomes a company');

  // Real content is intact.
  assert.ok(out.includes('• Scaled the payments platform team from 4 to 15 engineers.'));
  assert.ok(!/…\s*more/.test(out), 'truncation marker stripped');
  assert.ok(out.includes('Université de Lyon'));
});

test('markdown paste extracts structured experience end-to-end', () => {
  const { ResumeService, normalizeUploadText, splitTabularExperienceHeaders } = svc;
  const service = new ResumeService({}, undefined, undefined, undefined, undefined);
  const normalized = normalizeLinkedInProfileText(MD_PASTE);
  const r = service['buildStructuredResume'](normalizeUploadText(splitTabularExperienceHeaders(normalized)));
  const p = r.parsedPayload;

  const roles = p.experience.map((e) => e.role);
  assert.ok(roles.includes('Engineering Manager'), `roles: ${roles.join(' | ')}`);
  const em = p.experience.find((e) => e.role === 'Engineering Manager');
  assert.equal(em.company, 'Banque Lumière');
  // No experience entry may have a location, employment type, or skill
  // overlay as its company — the founder's screenshots showed all three.
  for (const e of p.experience) {
    assert.ok(!/full-?time/i.test(e.company || ''), `employment type as company: ${e.company}`);
    assert.ok(!/\+\d+ skills/.test(e.company || ''), `skills overlay as company: ${e.company}`);
    assert.ok(!/(France|Canada|Area)$/i.test(e.company || ''), `location as company: ${e.company}`);
    for (const h of e.highlights || []) {
      assert.ok(!/(France|Canada|Area)$/i.test(h), `location as bullet: ${h}`);
    }
  }
});

test('a paste with NO name never crowns a job title as fullName; accented names survive', () => {
  const { ResumeService, normalizeUploadText, splitTabularExperienceHeaders } = svc;
  const service = new ResumeService({}, undefined, undefined, undefined, undefined);
  const run = (t) => service['buildStructuredResume'](normalizeUploadText(splitTabularExperienceHeaders(normalizeLinkedInProfileText(t)))).parsedPayload;

  // MD_PASTE carries no person name at all → better an empty header the user
  // fills than "Assistant Vice President" as their name (founder screenshot).
  const anon = run(MD_PASTE);
  const anonName = anon.contact?.fullName || '';
  assert.ok(!/manager|engineer|consultant|president|developer/i.test(anonName), `role title as name: ${anonName}`);

  // A real name — accented or not, role-word surname or not — is kept.
  assert.equal(run('Amélie Dupont\namelie@example.com\n\n' + MD_PASTE).contact.fullName, 'Amélie Dupont');
  assert.equal(run('Sarah Baker\nsarah@example.com\n\n' + MD_PASTE).contact.fullName, 'Sarah Baker');
});
