/**
 * Pure, DOM-free mapping between form-field descriptors and the flat
 * AutofillProfile shape returned by `GET /me/autofill-profile`.
 *
 * Kept free of any `document`/`window` reference so it is unit-testable
 * under `node --test`. `content/autofill.js` is the thin DOM adapter that
 * builds descriptors and applies the values these functions return.
 *
 * Profile keys (flat):
 *   firstName, lastName, fullName, email, phone, location, city, state,
 *   country, linkedinUrl, websiteUrl, currentTitle, currentCompany,
 *   school, degree, skills[], summary
 */

/**
 * Keyword rules, ordered by specificity. The FIRST rule whose `match`
 * predicate returns true wins, so more specific rules (e.g. "first name",
 * "linkedin") must precede broader ones (e.g. "name").
 *
 * `any` = matches if the haystack contains any of these substrings.
 * `all` = every listed substring must be present (used to disambiguate,
 *          e.g. current + company).
 * `not` = disqualifiers (used to keep generic "name" off "company name").
 */
const RULES = [
  // Autocomplete-token fast paths are handled separately; these are the
  // heuristic keyword rules against the combined text haystack.
  { key: 'email', any: ['email', 'e-mail'] },
  { key: 'phone', any: ['phone', 'mobile', 'tel', 'telephone', 'contact number'] },

  { key: 'linkedinUrl', any: ['linkedin'] },
  { key: 'websiteUrl', any: ['website', 'portfolio', 'personal site', 'personal url', 'blog', 'github'] },

  { key: 'firstName', any: ['first name', 'firstname', 'given name', 'first_name', 'fname'] },
  { key: 'lastName', any: ['last name', 'lastname', 'family name', 'surname', 'last_name', 'lname'] },
  { key: 'fullName', any: ['full name', 'fullname', 'your name', 'full_name', 'candidate name', 'legal name'] },

  { key: 'currentCompany', all: [['current', 'present', 'employer'], ['company', 'employer', 'organization', 'organisation']] },
  { key: 'currentCompany', any: ['current company', 'current employer', 'present company'] },
  { key: 'currentTitle', any: ['current title', 'current role', 'job title', 'current position', 'present title'] },

  { key: 'school', any: ['school', 'university', 'college', 'institution', 'alma mater'] },
  { key: 'degree', any: ['degree', 'qualification', 'major', 'field of study'] },

  { key: 'city', any: ['city', 'town'] },
  { key: 'state', any: ['state', 'province', 'region'] },
  { key: 'country', any: ['country'] },
  { key: 'location', any: ['location', 'address', 'where are you based', 'current location'] },

  { key: 'summary', any: ['summary', 'about you', 'about yourself', 'bio', 'cover letter', 'tell us about'] },

  // Broad fallback for a bare "name" field — but never a company/school name.
  { key: 'fullName', any: ['name'], not: ['company', 'employer', 'organization', 'organisation', 'school', 'university', 'college', 'file', 'user', 'nick'] },
];

/**
 * Direct HTML autocomplete-token → profile key map (highest confidence).
 * https://developer.mozilla.org/docs/Web/HTML/Attributes/autocomplete
 */
const AUTOCOMPLETE_MAP = {
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'given-name': 'firstName',
  'family-name': 'lastName',
  name: 'fullName',
  organization: 'currentCompany',
  'organization-title': 'currentTitle',
  url: 'websiteUrl',
  'address-level2': 'city',
  'address-level1': 'state',
  country: 'country',
  'country-name': 'country',
  'street-address': 'location',
};

function norm(s) {
  return String(s || '').toLowerCase().trim();
}

function haystackFrom(descriptor) {
  const { name, id, ariaLabel, labelText } = descriptor || {};
  return [name, id, ariaLabel, labelText].map(norm).filter(Boolean).join(' | ');
}

/**
 * Given a field descriptor, return the AutofillProfile key it maps to,
 * or null when nothing matches confidently.
 *
 * @param {{autocomplete?:string,name?:string,id?:string,ariaLabel?:string,labelText?:string,type?:string}} descriptor
 * @returns {string|null}
 */
function fieldKeyForElement(descriptor) {
  if (!descriptor) return null;

  const type = norm(descriptor.type);
  // Never map unsafe or non-text inputs.
  if (['password', 'file', 'hidden', 'checkbox', 'radio', 'submit', 'button', 'image', 'reset', 'range', 'color'].includes(type)) {
    return null;
  }

  // 1. Highest confidence: a recognised autocomplete token.
  const ac = norm(descriptor.autocomplete);
  if (ac) {
    // autocomplete can be space-separated sections e.g. "section-x email".
    for (const token of ac.split(/\s+/)) {
      if (AUTOCOMPLETE_MAP[token]) return AUTOCOMPLETE_MAP[token];
    }
  }

  // 2. Keyword heuristics over name/id/aria-label/label text.
  const hay = haystackFrom(descriptor);
  if (!hay) return null;

  for (const rule of RULES) {
    if (rule.not && rule.not.some((n) => hay.includes(n))) continue;
    if (rule.any && rule.any.some((a) => hay.includes(a))) return rule.key;
    if (rule.all && rule.all.every((group) => group.some((g) => hay.includes(g)))) return rule.key;
  }

  return null;
}

/**
 * Resolve the string value to fill for a given profile key. Returns an
 * empty string when the profile has nothing usable (caller should skip).
 *
 * @param {object} profile AutofillProfile
 * @param {string} key
 * @returns {string}
 */
function fillValueForKey(profile, key) {
  if (!profile || !key) return '';
  const v = profile[key];
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', '); // e.g. skills[]
  return String(v).trim();
}

/**
 * This file intentionally uses NO `import`/`export` keywords so it is valid
 * BOTH as a classic MV3 content script (Chrome loads it in the isolated
 * world before `autofill.js`) AND as an ES module under `node --test`
 * (a module with zero export statements is legal ESM). Both consumers read
 * the API off `globalThis.CallbackCVFieldMap`.
 */
globalThis.CallbackCVFieldMap = { fieldKeyForElement, fillValueForKey, AUTOCOMPLETE_MAP };
