import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CITY_MULTIPLIERS,
  SALARY_CITIES,
  SALARY_ROLES,
  formatInr,
  getSalaryBand,
} from '../src/lib/salary-bands';

test('SALARY_ROLES exposes a non-empty role catalog', () => {
  assert.ok(SALARY_ROLES.length >= 6);
  assert.ok(SALARY_ROLES.includes('Frontend Engineer'));
  assert.ok(SALARY_ROLES.includes('AI / ML Engineer'));
});

test('SALARY_CITIES covers the major Indian metros', () => {
  for (const city of ['Bangalore', 'Mumbai', 'Hyderabad', 'Delhi NCR', 'Pune', 'Remote (India)']) {
    assert.ok(SALARY_CITIES.includes(city), `expected city ${city} in catalog`);
  }
});

test('Bangalore is the multiplier baseline of 1.0', () => {
  assert.equal(CITY_MULTIPLIERS['Bangalore'], 1.0);
});

test('tier-2 cities are cheaper than the Bangalore baseline', () => {
  assert.ok(CITY_MULTIPLIERS['Kolkata'] < 1.0);
  assert.ok(CITY_MULTIPLIERS['Ahmedabad'] < 1.0);
  assert.ok(CITY_MULTIPLIERS['Chennai'] < 1.0);
});

test('getSalaryBand returns ordered percentiles for a known combo', () => {
  const band = getSalaryBand('Frontend Engineer', 'Mid', 'Bangalore');
  assert.ok(band, 'band should exist for Frontend Engineer / Mid / Bangalore');
  assert.ok(band!.p25 < band!.median);
  assert.ok(band!.median < band!.p75);
  assert.equal(band!.currency, 'INR');
  assert.match(band!.disclaimer, /indicative/i);
});

test('getSalaryBand applies the city multiplier (Kolkata < Bangalore)', () => {
  const blr = getSalaryBand('Frontend Engineer', 'Mid', 'Bangalore');
  const kol = getSalaryBand('Frontend Engineer', 'Mid', 'Kolkata');
  assert.ok(blr && kol);
  assert.ok(kol!.median < blr!.median, 'Kolkata median should be lower than Bangalore');
  // Multiplier is 0.75 — allow ±10% rounding slack.
  const ratio = kol!.median / blr!.median;
  assert.ok(ratio > 0.65 && ratio < 0.85, `expected ratio near 0.75, got ${ratio}`);
});

test('getSalaryBand returns null for an unknown role', () => {
  // Caller should render "we don't have data for this role yet".
  assert.equal(getSalaryBand('Astronaut', 'Senior', 'Bangalore'), null);
});

test('getSalaryBand soft-falls-back for an unknown city', () => {
  // Unknown city → use Bangalore baseline (multiplier 1.0). Better
  // than returning null and breaking the UI.
  const band = getSalaryBand('Backend Engineer', 'Senior', 'Atlantis');
  assert.ok(band);
  const blr = getSalaryBand('Backend Engineer', 'Senior', 'Bangalore');
  assert.equal(band!.median, blr!.median);
});

test('formatInr renders crore for amounts >= 1Cr', () => {
  assert.equal(formatInr(15000000), '₹1.50 Cr');
});

test('formatInr renders lakh for amounts >= 1L', () => {
  assert.equal(formatInr(2500000), '₹25.0 L');
  assert.equal(formatInr(500000), '₹5.0 L');
});

test('formatInr handles zero and bad input safely', () => {
  assert.equal(formatInr(0), '—');
  assert.equal(formatInr(NaN), '—');
  assert.equal(formatInr(-1), '—');
});

test('numbers round to readable units (multiples of 10,000)', () => {
  // The rounding step is /10000 → round → ×10000, so any returned
  // value should be evenly divisible by 10,000.
  for (const role of SALARY_ROLES) {
    for (const level of ['Fresher', 'Mid', 'Senior'] as const) {
      for (const city of SALARY_CITIES) {
        const band = getSalaryBand(role, level, city);
        if (!band) continue;
        for (const v of [band.p25, band.median, band.p75]) {
          assert.equal(v % 10000, 0, `${role}/${level}/${city} value ${v} not multiple of 10K`);
        }
      }
    }
  }
});
