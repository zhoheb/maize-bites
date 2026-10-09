import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from './html.js';

describe('decodeHtmlEntities', () => {
  it.each([
    ['Art &amp; Architecture', 'Art & Architecture'],
    ['&lt;b&gt;&quot;hi&quot;&lt;/b&gt;', '<b>"hi"</b>'],
    ['it&#39;s &#x2014; ok', "it's — ok"],
    ['caf&eacute;', 'caf&eacute;'],
    ['&amp;amp;', '&amp;'],
    ['no entities', 'no entities'],
  ])('%j → %j', (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected);
  });
});
