import assert from 'node:assert/strict';
import test from 'node:test';
import { CreateResumeSchema, UpdateResumeSchema } from 'resume-builder-shared';
import {
  ContactFields, ExperienceFields, EducationFields,
  ProjectFields, CertificationFields, LicenseFields, PublicationFields,
} from '../dist/resume-fields.js';

/**
 * R-107 — the MCP cannot import the shared schemas at RUNTIME: it ships to
 * npm as a standalone binary whose only dependencies are the SDK and zod,
 * so a workspace import would break `npx @tekivex/callbackcv-mcp`. The
 * shapes are therefore mirrored in src/resume-fields.ts, and this test is
 * what keeps the mirror honest — it imports the real shared schemas (a dev
 * dependency) and fails the moment the two disagree.
 *
 * The defect this prevents: tool schemas declared startDate, endDate and
 * highlights OPTIONAL while the API required all three, so an assistant
 * that sent exactly what the tool asked for got a 400 it could not have
 * predicted or recovered from.
 */

/**
 * The two packages ship DIFFERENT zod majors (the MCP pins zod 3 for its
 * standalone npm build; the shared package is on zod 4), so `instanceof`
 * and `_def` internals do not cross the boundary. These helpers use only
 * the public surface both versions agree on: `.shape`, `.isOptional()`,
 * `.element` and `.unwrap()`.
 */

/** Field names a Zod object requires (i.e. rejects when absent). */
function requiredKeys(schema) {
  return Object.entries(shapeOf(schema))
    .filter(([, field]) => !field.isOptional())
    .map(([name]) => name)
    .sort();
}

function shapeOf(schema) {
  const shape = schema.shape;
  assert.ok(shape, 'expected a Zod object schema');
  return typeof shape === 'function' ? shape() : shape;
}

/** Unwrap optional()/nullish()/refine() wrappers to reach an array element. */
function elementOf(schema, key) {
  let field = shapeOf(schema)[key];
  assert.ok(field, `the shared schema still has a "${key}" field`);
  for (let i = 0; i < 8; i += 1) {
    if (field.shape) return field;
    if (field.element) { field = field.element; continue; }
    if (typeof field.unwrap === 'function') { field = field.unwrap(); continue; }
    if (typeof field.innerType === 'function') { field = field.innerType(); continue; }
    if (field._def?.innerType) { field = field._def.innerType; continue; }
    if (field._def?.schema) { field = field._def.schema; continue; }
    break;
  }
  assert.ok(field?.shape, `could not reach the object schema behind "${key}"`);
  return field;
}

const SECTIONS = [
  ['contact', ContactFields],
  ['experience', ExperienceFields],
  ['education', EducationFields],
  ['projects', ProjectFields],
  ['certifications', CertificationFields],
  ['licenses', LicenseFields],
  ['publications', PublicationFields],
];

for (const [key, mcpSchema] of SECTIONS) {
  test(`${key}: the MCP requires exactly what the API requires`, () => {
    const apiSchema = elementOf(CreateResumeSchema, key);
    assert.deepEqual(
      requiredKeys(mcpSchema),
      requiredKeys(apiSchema),
      `MCP and API disagree on required ${key} fields — an assistant sending what the tool asks for would be rejected`,
    );
  });

  test(`${key}: the MCP accepts no field the API would drop`, () => {
    const apiKeys = Object.keys(shapeOf(elementOf(CreateResumeSchema, key)));
    for (const field of Object.keys(shapeOf(mcpSchema))) {
      assert.ok(apiKeys.includes(field), `the MCP advertises ${key}.${field}, which the API does not accept`);
    }
  });
}

test('a minimal experience entry is accepted or rejected identically by both', () => {
  // The exact payload from the original review: company + role only.
  const thin = { company: 'Acme Corp', role: 'Engineer' };
  assert.equal(ExperienceFields.safeParse(thin).success, false, 'the MCP now rejects it up front…');
  assert.equal(
    elementOf(CreateResumeSchema, 'experience').safeParse(thin).success,
    false,
    '…exactly as the API always did',
  );

  const complete = {
    company: 'Acme Corp', role: 'Engineer',
    startDate: 'Jan 2022', endDate: 'Present', highlights: ['Shipped billing v2'],
  };
  assert.equal(ExperienceFields.safeParse(complete).success, true);
  assert.equal(elementOf(CreateResumeSchema, 'experience').safeParse(complete).success, true);
});

test('update_resume can change every section create_resume can set', () => {
  // update used to omit contact entirely, so a typo in an email address
  // could not be fixed through an assistant at all.
  const createKeys = Object.keys(shapeOf(CreateResumeSchema));
  const updateKeys = Object.keys(shapeOf(UpdateResumeSchema));
  for (const key of ['contact', 'languages', 'projects', 'certifications', 'licenses', 'publications']) {
    assert.ok(createKeys.includes(key) && updateKeys.includes(key), `${key} is settable on both sides`);
  }
});
