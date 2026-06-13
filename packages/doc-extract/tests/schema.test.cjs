const assert = require('node:assert/strict');
const test = require('node:test');
const { toJsonSchema, validateSchema } = require('../dist/index.js');

const invoiceSchema = {
  name: 'invoice',
  fields: [
    { name: 'invoiceNumber', type: 'string', required: true },
    { name: 'total', type: 'number', required: true },
    { name: 'currency', type: 'string', enum: ['USD', 'INR', 'EUR'] },
    {
      name: 'lineItems',
      type: 'object[]',
      fields: [
        { name: 'description', type: 'string' },
        { name: 'amount', type: 'number' },
      ],
    },
  ],
};

test('toJsonSchema wraps every field as {value,confidence,evidence}', () => {
  const js = toJsonSchema(invoiceSchema);
  assert.equal(js.type, 'object');
  const fields = js.properties.fields;
  assert.deepEqual(fields.required, ['invoiceNumber', 'total', 'currency', 'lineItems']);
  const inv = fields.properties.invoiceNumber;
  assert.deepEqual(inv.required, ['value', 'confidence']);
  assert.equal(inv.properties.value.type, 'string');
  assert.equal(inv.properties.confidence.type, 'number');
});

test('toJsonSchema encodes enums and nested object arrays', () => {
  const js = toJsonSchema(invoiceSchema);
  const fields = js.properties.fields.properties;
  assert.deepEqual(fields.currency.properties.value.enum, ['USD', 'INR', 'EUR']);
  const items = fields.lineItems.properties.value;
  assert.equal(items.type, 'array');
  assert.equal(items.items.type, 'object');
  assert.deepEqual(items.items.required, ['description', 'amount']);
});

test('validateSchema accepts a good schema', () => {
  assert.doesNotThrow(() => validateSchema(invoiceSchema));
});

test('validateSchema rejects bad input', () => {
  assert.throws(() => validateSchema({ name: '', fields: [] }), /name is required/);
  assert.throws(() => validateSchema({ name: 'x', fields: [] }), /non-empty array/);
  assert.throws(
    () => validateSchema({ name: 'x', fields: [{ name: 'a', type: 'nope' }] }),
    /invalid type/,
  );
  assert.throws(
    () => validateSchema({ name: 'x', fields: [{ name: 'a', type: 'a', type: 'object' }] }),
    /requires nested/,
  );
  assert.throws(
    () => validateSchema({ name: 'x', fields: [{ name: 'a', type: 'string' }, { name: 'a', type: 'string' }] }),
    /duplicate field/,
  );
});
