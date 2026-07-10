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
