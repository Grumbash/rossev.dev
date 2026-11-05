// A recruiter who downloads Gleb's CV can call him: the phone number is in the PDF contact strip.
// Scrapers and LLM datasets that read the page or /llms.txt don't get it: no visible number,
// no tel: link, no JSON-LD telephone, no line in llms.txt.
// Checks the built output, not the source.
import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PROFILE } from '../src/data/profile';
import { buildSite } from './fixtures/build';

// Bun 1.3 rejects a per-hook timeout; the build in beforeAll needs more than the 5s default.
setDefaultTimeout(120_000);

const spaced = PROFILE.phone;
const digits = PROFILE.phone.replace(/\s/g, '');

let home = '';
let llms = '';
let pdf = '';

beforeAll(() => {
  buildSite();
  home = readFileSync('dist/index.html', 'utf8');
  llms = readFileSync('dist/llms.txt', 'utf8');
  // The PDF is written with uncompressed text streams, so its strings are readable as latin1.
  pdf = readFileSync('dist/gleb-rosev-cv.pdf', 'latin1');
});

describe('the phone number lives only in the CV PDF', () => {
  test('the home page has no phone number, tel: link or JSON-LD telephone', () => {
    expect(home).not.toContain(digits);
    expect(home).not.toContain(spaced);
    expect(home).not.toMatch(/href="tel:/);
    expect(home).not.toMatch(/"telephone"/);
  });

  test('llms.txt has no phone number', () => {
    expect(llms).not.toContain(digits);
    expect(llms).not.toContain(spaced);
    expect(llms).not.toMatch(/\*\*Phone\*\*/);
  });

  test('the CV PDF still carries it', () => {
    expect(pdf).toContain(spaced);
  });
});
