import { describe, it, expect } from 'vitest';
import { pageUrl } from './review.mjs';

describe('pageUrl', () => {
  it('percent-encodes spaces and URL-significant characters per segment', () => {
    expect(pageUrl('/c/review/b', "/c/candidates/b/a #1?/it's 100%/0.png"))
      .toBe('../../candidates/b/a%20%231%3F/it\'s%20100%25/0.png');
  });
});
