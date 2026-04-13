/**
 * Phase 2 Tests: Layout Detection, Deduplication Engine, Feature Flags,
 * Enhanced Section Normalizer
 */
'use strict';

const assert = require('node:assert');
const {
  detectLayout,
  deinterleaveColumns,
} = require('../dist/layout-detector.js');

const {
  deduplicateExact,
  deduplicateFuzzy,
  deduplicateSubset,
  deduplicateSkillsSemantic,
  deduplicateCrossSection,
  deduplicateExperience,
  runDeduplicationPipeline,
  stringSimilarity,
} = require('../dist/deduplication-engine.js');

const {
  getExtractionConfig,
  setExtractionConfig,
  resetExtractionConfig,
} = require('../dist/extraction-config.js');

const { normalizeHeading } = require('../dist/section-normalizer.js');
const { parseResumeText, mapParsedResume } = require('../dist/index.js');

// ═══════════════════════════════════════════════════════════════════════
// Layout Detector Tests
// ═══════════════════════════════════════════════════════════════════════

// 1) Single-column resume detected correctly
{
  const text = `
John Doe
john.doe@email.com | 555-1234

Professional Summary
Experienced software engineer with 8 years of expertise.

Work Experience
Senior Engineer at TechCo | Jan 2020 - Present
- Led team of 5 engineers
- Delivered key platform features

Education
BS Computer Science, MIT, 2015
`;
  const layout = detectLayout(text);
  assert.equal(layout.type, 'single-column');
  assert.ok(layout.confidence >= 0.5);
  assert.equal(layout.columns, 1);
  console.log('  [1] Single-column layout detection passed');
}

// 2) Two-column resume detected via large whitespace gaps
{
  const text = `
John Doe                              Skills
john@email.com                        JavaScript
                                      TypeScript
Work Experience                       React
Senior Engineer                       Node.js
TechCo | 2020 - Present              Python
- Led platform team                   AWS
- Built microservices                 Docker

Education                             Certifications
BS CS, MIT 2015                       AWS Solutions Architect
`;
  const layout = detectLayout(text);
  assert.ok(layout.type === 'two-column' || layout.type === 'hybrid',
    `Expected two-column or hybrid, got ${layout.type}`);
  assert.ok(layout.columns >= 2);
  console.log('  [2] Two-column layout detection passed');
}

// 3) Position-based layout detection
{
  const hints = [
    // Left column
    { text: 'John Doe', x: 50, y: 50, width: 200 },
    { text: 'Work Experience', x: 50, y: 100 },
    { text: 'Senior Engineer', x: 50, y: 130 },
    { text: 'TechCo', x: 50, y: 150 },
    { text: 'Led team', x: 50, y: 170 },
    { text: 'Built features', x: 50, y: 190 },
    // Right column
    { text: 'Skills', x: 400, y: 100 },
    { text: 'JavaScript', x: 400, y: 130 },
    { text: 'TypeScript', x: 400, y: 150 },
    { text: 'React', x: 400, y: 170 },
    { text: 'Node.js', x: 400, y: 190 },
    { text: 'Python', x: 400, y: 210 },
  ];
  const layout = detectLayout('', hints);
  assert.equal(layout.type, 'two-column');
  assert.equal(layout.columns, 2);
  assert.ok(layout.confidence >= 0.8);
  console.log('  [3] Position-based layout detection passed');
}

// 4) Hybrid layout detected (full-width header + two-column body)
{
  const hints = [
    // Full-width header
    { text: 'John Doe - Software Engineer', x: 50, y: 20, width: 500 },
    { text: 'john@email.com | 555-1234', x: 50, y: 40, width: 500 },
    // Left column
    { text: 'Work Experience', x: 50, y: 100 },
    { text: 'Senior Engineer', x: 50, y: 130 },
    { text: 'TechCo', x: 50, y: 150 },
    { text: 'Led team', x: 50, y: 170 },
    { text: 'Built features', x: 50, y: 190 },
    { text: 'Education', x: 50, y: 220 },
    // Right column
    { text: 'Skills', x: 400, y: 100 },
    { text: 'JavaScript', x: 400, y: 130 },
    { text: 'React', x: 400, y: 150 },
    { text: 'Node.js', x: 400, y: 170 },
  ];
  const layout = detectLayout('', hints);
  assert.equal(layout.type, 'hybrid');
  assert.ok(layout.confidence >= 0.7);
  console.log('  [4] Hybrid layout detection passed');
}

// ═══════════════════════════════════════════════════════════════════════
// Deduplication Engine Tests
// ═══════════════════════════════════════════════════════════════════════

// 5) Exact deduplication
{
  const input = ['JavaScript', 'TypeScript', 'javascript', 'React', 'react', 'Python'];
  const result = deduplicateExact(input);
  assert.equal(result.length, 4);
  assert.deepEqual(result, ['JavaScript', 'TypeScript', 'React', 'Python']);
  console.log('  [5] Exact deduplication passed');
}

// 6) Fuzzy deduplication
{
  resetExtractionConfig();
  const input = ['JavaScript', 'JavaScrip', 'TypeScript', 'Typscript', 'React', 'Python'];
  const result = deduplicateFuzzy(input, 0.8);
  // "JavaScrip" is similar to "JavaScript" — should keep longer one
  assert.ok(result.includes('JavaScript'));
  assert.ok(!result.includes('JavaScrip'));
  assert.ok(result.includes('TypeScript'));
  assert.ok(result.includes('React'));
  assert.ok(result.includes('Python'));
  console.log('  [6] Fuzzy deduplication passed');
}

// 7) String similarity calculation
{
  assert.equal(stringSimilarity('hello', 'hello'), 1);
  assert.equal(stringSimilarity('Hello', 'hello'), 1); // case insensitive
  assert.ok(stringSimilarity('JavaScript', 'JavaScrip') > 0.8);
  assert.ok(stringSimilarity('React', 'Angular') < 0.5);
  assert.ok(stringSimilarity('Senior Engineer', 'Junior Engineer') < 0.9);
  console.log('  [7] String similarity passed');
}

// 8) Subset deduplication
{
  resetExtractionConfig();
  const input = [
    'Led team of engineers to deliver platform',
    'Led team of engineers to deliver platform features across 4 product lines',
    'Improved release reliability by 27%',
  ];
  const result = deduplicateSubset(input, 20);
  assert.equal(result.length, 2);
  assert.ok(result.some((r) => r.includes('4 product lines')));
  assert.ok(result.some((r) => r.includes('27%')));
  console.log('  [8] Subset deduplication passed');
}

// 9) Semantic skill deduplication
{
  const input = ['Node.js', 'NodeJS', 'React', 'React.js', 'Python', 'AWS', 'Amazon Web Services'];
  const result = deduplicateSkillsSemantic(input);
  assert.ok(result.includes('Node.js'));
  assert.ok(!result.includes('NodeJS'));
  assert.ok(result.includes('React'));
  assert.ok(!result.includes('React.js'));
  assert.ok(result.includes('AWS'));
  assert.ok(!result.includes('Amazon Web Services'));
  console.log('  [9] Semantic skill deduplication passed');
}

// 10) Cross-section deduplication
{
  resetExtractionConfig();
  const primary = ['Built microservices architecture', 'Deployed to AWS', 'Used React for frontend'];
  const secondary = ['Built microservices architecture', 'Team leadership', 'Code review'];
  const result = deduplicateCrossSection(primary, secondary);
  assert.equal(result.length, 2);
  assert.ok(!result.some((r) => r.includes('microservices')));
  assert.ok(result.includes('Team leadership'));
  assert.ok(result.includes('Code review'));
  console.log('  [10] Cross-section deduplication passed');
}

// 11) Experience deduplication preserves different roles at same company
{
  resetExtractionConfig();
  const entries = [
    { company: 'TechCo', role: 'Senior Engineer', startDate: 'Jan 2022', endDate: 'Present', highlights: ['Led team'] },
    { company: 'TechCo', role: 'Junior Engineer', startDate: 'Jan 2020', endDate: 'Dec 2021', highlights: ['Built features'] },
    { company: 'Other Corp', role: 'Developer', startDate: '2018', endDate: '2019', highlights: ['Wrote code'] },
  ];
  const result = deduplicateExperience(entries);
  assert.equal(result.length, 3, 'Different roles at same company should not be merged');
  console.log('  [11] Experience dedup preserves promotions passed');
}

// 12) Experience deduplication merges true duplicates
{
  resetExtractionConfig();
  const entries = [
    { company: 'TechCo Inc', role: 'Senior Engineer', startDate: 'Jan 2022', endDate: 'Present', highlights: ['Led team', 'Built platform'] },
    { company: 'TechCo Inc.', role: 'Senior Engineer', startDate: 'Jan 2022', endDate: 'Present', highlights: ['Led team', 'Deployed services'] },
  ];
  const result = deduplicateExperience(entries);
  assert.equal(result.length, 1);
  assert.ok(result[0].highlights.length >= 2); // Merged highlights
  console.log('  [12] Experience dedup merges true duplicates passed');
}

// 13) Full pipeline deduplication
{
  resetExtractionConfig();
  const input = {
    skills: ['JavaScript', 'javascript', 'Node.js', 'NodeJS', 'React', 'React.js', 'Python', 'AWS', 'Amazon Web Services'],
    experience: [
      { company: 'TechCo', role: 'Engineer', startDate: '2020', endDate: 'Present', highlights: ['Built features'] },
    ],
  };
  const result = runDeduplicationPipeline(input);
  // Should deduplicate: javascript, NodeJS, React.js, Amazon Web Services
  assert.ok(result.skills.length <= 5);
  assert.ok(result.skills.includes('JavaScript'));
  assert.ok(!result.skills.includes('javascript'));
  console.log('  [13] Full dedup pipeline passed');
}

// ═══════════════════════════════════════════════════════════════════════
// Feature Flags Tests
// ═══════════════════════════════════════════════════════════════════════

// 14) Default config values
{
  resetExtractionConfig();
  const config = getExtractionConfig();
  assert.equal(config.layoutDetection, true);
  assert.equal(config.enhancedDedup, true);
  assert.equal(config.fuzzyDedup, true);
  assert.equal(config.fuzzySimilarityThreshold, 0.85);
  assert.equal(config.summaryCharLimit, 600);
  console.log('  [14] Default config values passed');
}

// 15) Config override
{
  resetExtractionConfig();
  setExtractionConfig({ fuzzyDedup: false, maxSkills: 30 });
  const config = getExtractionConfig();
  assert.equal(config.fuzzyDedup, false);
  assert.equal(config.maxSkills, 30);
  assert.equal(config.enhancedDedup, true); // unchanged
  resetExtractionConfig();
  console.log('  [15] Config override passed');
}

// 16) Disabling dedup via feature flag
{
  resetExtractionConfig();
  setExtractionConfig({ enhancedDedup: false, fuzzyDedup: false, subsetDedup: false, crossSectionDedup: false });
  const entries = [
    { company: 'TechCo', role: 'Engineer', startDate: '2020', endDate: 'Present', highlights: ['Built features'] },
    { company: 'TechCo', role: 'Engineer', startDate: '2020', endDate: 'Present', highlights: ['Built features'] },
  ];
  const result = deduplicateExperience(entries);
  assert.equal(result.length, 2, 'With dedup disabled, duplicates should be preserved');
  resetExtractionConfig();
  console.log('  [16] Feature flag disable dedup passed');
}

// ═══════════════════════════════════════════════════════════════════════
// Enhanced Section Normalizer Tests
// ═══════════════════════════════════════════════════════════════════════

// 17) New summary heading variants
{
  assert.equal(normalizeHeading('Professional Profile'), 'summary');
  assert.equal(normalizeHeading('Career Profile'), 'summary');
  assert.equal(normalizeHeading('Overview'), 'summary');
  assert.equal(normalizeHeading('Professional Overview'), 'summary');
  assert.equal(normalizeHeading('Qualifications Summary'), 'summary');
  console.log('  [17] New summary heading variants passed');
}

// 18) New skills heading variants
{
  assert.equal(normalizeHeading('Professional Skills'), 'skills');
  assert.equal(normalizeHeading('IT Skills'), 'skills');
  assert.equal(normalizeHeading('Programming Skills'), 'skills');
  assert.equal(normalizeHeading('Tech Stack'), 'skills');
  assert.equal(normalizeHeading('Tools'), 'skills');
  assert.equal(normalizeHeading('Frameworks'), 'skills');
  assert.equal(normalizeHeading('Core Strengths'), 'skills');
  console.log('  [18] New skills heading variants passed');
}

// 19) New experience heading variants
{
  assert.equal(normalizeHeading('Internships'), 'experience');
  assert.equal(normalizeHeading('Positions Held'), 'experience');
  assert.equal(normalizeHeading('Professional History'), 'experience');
  assert.equal(normalizeHeading('Job History'), 'experience');
  console.log('  [19] New experience heading variants passed');
}

// 20) New education heading variants
{
  assert.equal(normalizeHeading('Educational Background'), 'education');
  assert.equal(normalizeHeading('Degrees'), 'education');
  assert.equal(normalizeHeading('Academic Credentials'), 'education');
  assert.equal(normalizeHeading('Academic Experience'), 'education');
  console.log('  [20] New education heading variants passed');
}

// 21) New projects heading variants
{
  assert.equal(normalizeHeading('Personal Projects'), 'projects');
  assert.equal(normalizeHeading('Portfolio'), 'projects');
  assert.equal(normalizeHeading('Open Source'), 'projects');
  assert.equal(normalizeHeading('Publications'), 'projects');
  assert.equal(normalizeHeading('Honors And Awards'), 'projects');
  console.log('  [21] New projects heading variants passed');
}

// 22) New certifications heading variants
{
  assert.equal(normalizeHeading('Professional Development'), 'certifications');
  assert.equal(normalizeHeading('Credentials'), 'certifications');
  assert.equal(normalizeHeading('Accreditations'), 'certifications');
  assert.equal(normalizeHeading('Certifications And Training'), 'certifications');
  console.log('  [22] New certifications heading variants passed');
}

// ═══════════════════════════════════════════════════════════════════════
// End-to-End Integration Tests
// ═══════════════════════════════════════════════════════════════════════

// 23) Full extraction with dedup — duplicate skills removed
{
  resetExtractionConfig();
  const parsed = parseResumeText(`
John Smith
john@email.com

Professional Skills
JavaScript, TypeScript, React, Node.js, NodeJS, React.js, Python, AWS

Work Experience
Senior Engineer at TechCorp | Jan 2022 - Present
- Built scalable microservices
- Implemented CI/CD pipelines
Junior Engineer at TechCorp | Jan 2020 - Dec 2021
- Wrote unit tests
- Code reviews

Education
BS Computer Science, Stanford University, 2019
`);
  const mapped = mapParsedResume(parsed);

  // Skills should be deduped (NodeJS → Node.js, React.js → React)
  const skillsLower = mapped.skills.map((s) => s.toLowerCase());
  const nodeCount = skillsLower.filter((s) => s === 'node.js' || s === 'nodejs').length;
  assert.ok(nodeCount <= 1, 'Node.js/NodeJS should be deduped');

  const reactCount = skillsLower.filter((s) => s === 'react' || s === 'react.js').length;
  assert.ok(reactCount <= 1, 'React/React.js should be deduped');

  // Both roles at TechCorp should be preserved (different roles)
  assert.ok(mapped.experience.length >= 2, 'Both roles at TechCorp should be preserved');
  console.log('  [23] Full extraction with dedup passed');
}

// 24) Resume with "Professional Profile" heading extracts summary
{
  resetExtractionConfig();
  const parsed = parseResumeText(`
Jane Adams
jane@email.com

Professional Profile
Dedicated project manager with 10 years of experience leading cross-functional teams.

Core Strengths
Agile, Scrum, JIRA, Confluence, Leadership

Positions Held
Senior Project Manager at GlobalTech | 2019 - Present
- Managed portfolio of 12 projects

Educational Background
MBA, Harvard Business School, 2018
`);
  const mapped = mapParsedResume(parsed);
  assert.ok(mapped.summary.includes('project manager'));
  assert.ok(mapped.skills.some((s) => s.toLowerCase().includes('agile')));
  assert.ok(mapped.experience.length >= 1);
  assert.ok(mapped.education.length >= 1);
  console.log('  [24] Alternative heading format extraction passed');
}

// 25) Resume with internship heading
{
  resetExtractionConfig();
  const parsed = parseResumeText(`
Alex Chen
alex@university.edu

Career Objective
Computer science graduate seeking software development roles.

Programming Skills
Java, Python, C++, Git

Internships
Software Intern at Google | Jun 2023 - Aug 2023
- Built data pipeline reducing latency by 40%
QA Intern at Microsoft | Jun 2022 - Aug 2022
- Automated 200+ test cases

Degrees
BS Computer Science, UC Berkeley, 2023
`);
  const mapped = mapParsedResume(parsed);
  assert.ok(mapped.summary.includes('graduate') || mapped.summary.includes('seeking'));
  assert.ok(mapped.experience.length >= 1, 'Internships should map to experience');
  assert.ok(mapped.education.length >= 1);
  console.log('  [25] Internship heading extraction passed');
}

// 26) Layout detection integrated into full pipeline
{
  resetExtractionConfig();
  // Standard single-column resume — layout detection should not change results
  const parsed = parseResumeText(`
Sam Wilson
sam@email.com

Professional Summary
Full-stack developer with 5 years of experience.

Technical Skills
React, Node.js, PostgreSQL, Docker

Work Experience
Developer at StartupXYZ | 2021 - Present
- Architected new payment system
Developer at AgencyCo | 2019 - 2021
- Built 15+ client websites

Education
BS CS, Stanford, 2019
`);
  const mapped = mapParsedResume(parsed);
  assert.ok(mapped.experience.length >= 2);
  assert.ok(mapped.skills.length >= 3);
  assert.ok(mapped.education.length >= 1);
  console.log('  [26] Layout detection integration passed');
}

// 27) Dedup handles highlights within experience entries
{
  resetExtractionConfig();
  const parsed = parseResumeText(`
Pat Lee
pat@email.com

Work Experience
Senior Developer at DataCo | 2020 - Present
- Designed microservices architecture reducing latency by 50%
- Designed microservices architecture
- Improved system reliability to 99.9% uptime
- Improved system reliability to 99.9% uptime
- Led migration from monolith to microservices
`);
  const mapped = mapParsedResume(parsed);
  const highlights = mapped.experience[0]?.highlights || [];
  // Exact duplicate "Improved system reliability" should be removed
  const reliabilityCount = highlights.filter((h) => h.includes('reliability')).length;
  assert.equal(reliabilityCount, 1, 'Duplicate highlights should be deduped');
  console.log('  [27] Highlight deduplication passed');
}

// ═══════════════════════════════════════════════════════════════════════

resetExtractionConfig();
console.log('Phase 2 layout-dedup tests passed');
