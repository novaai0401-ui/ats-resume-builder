'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { QuantumService } = require('../dist/quantum/quantum.service.js');
const { QuantumController } = require('../dist/quantum/quantum.controller.js');

test('QuantumService.listIndustries returns every catalog industry with roles', () => {
  const service = new QuantumService();
  const result = service.listIndustries();
  assert.ok(Array.isArray(result));
  assert.ok(result.length >= 8, 'expected at least 8 industries');
  for (const industry of result) {
    assert.equal(typeof industry.id, 'string');
    assert.equal(typeof industry.label, 'string');
    assert.ok(Array.isArray(industry.roles));
    assert.ok(industry.roles.length > 0, `${industry.id} should expose roles`);
  }
});

test('QuantumService.recommend returns ranked recommendations for a valid request', () => {
  const service = new QuantumService();
  const result = service.recommend({
    industryId: 'it',
    roleId: 'frontend-engineer',
    currentSkills: ['HTML', 'CSS'],
    limit: 5,
  });
  assert.equal(result.role, 'Frontend Engineer');
  assert.equal(result.recommendations.length, 5);
  // sorted descending
  for (let i = 1; i < result.recommendations.length; i++) {
    assert.ok(
      result.recommendations[i - 1].probability >= result.recommendations[i].probability,
      'recommendations must be sorted by descending probability'
    );
  }
});

test('QuantumController.listIndustries wraps service response in {items}', () => {
  const fake = {
    listIndustries() {
      return [{ id: 'it', label: 'IT', tagline: 't', roles: [] }];
    },
    recommend() {
      throw new Error('should not be called');
    },
  };
  const controller = new QuantumController(fake);
  const res = controller.listIndustries();
  assert.deepEqual(res, { items: [{ id: 'it', label: 'IT', tagline: 't', roles: [] }] });
});

test('QuantumController.recommend rejects bodies missing required fields', () => {
  const controller = new QuantumController(new QuantumService());
  assert.throws(() => controller.recommend(null), /Request body is required/);
  assert.throws(() => controller.recommend({}), /industryId is required/);
  assert.throws(() => controller.recommend({ industryId: 'it' }), /roleId is required/);
  assert.throws(() => controller.recommend({ industryId: 'it', roleId: 'x' }), /currentSkills/);
  assert.throws(
    () => controller.recommend({ industryId: 'it', roleId: 'x', currentSkills: 'not-an-array' }),
    /currentSkills/
  );
});

test('QuantumController.recommend translates engine errors into BadRequest', () => {
  const controller = new QuantumController(new QuantumService());
  assert.throws(
    () =>
      controller.recommend({
        industryId: 'not-a-real-industry',
        roleId: 'x',
        currentSkills: [],
      }),
    /Unknown industry/
  );
});

test('QuantumController.recommend succeeds end-to-end for a valid request', () => {
  const controller = new QuantumController(new QuantumService());
  const res = controller.recommend({
    industryId: 'healthcare',
    roleId: 'physician',
    currentSkills: ['Patient Care', 'Diagnosis'],
    limit: 4,
  });
  assert.equal(res.role, 'Physician / Doctor');
  assert.equal(res.recommendations.length, 4);
  assert.ok(res.readiness >= 0 && res.readiness <= 1);
});

test('QuantumController.recommend caps currentSkills at 200 entries', () => {
  const controller = new QuantumController(new QuantumService());
  const tooMany = Array.from({ length: 201 }, (_, i) => `skill-${i}`);
  assert.throws(() =>
    controller.recommend({
      industryId: 'it',
      roleId: 'frontend-engineer',
      currentSkills: tooMany,
    }), /too large/);
});
