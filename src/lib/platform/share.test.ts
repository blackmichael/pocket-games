import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shareResult } from './share.js';

const shareData = { title: 'Kings — Pocket Games', text: 'puzzle result', url: 'https://example.com/games/kings/?seed=test&v=1' };
let clipboard: string;
beforeEach(() => { clipboard = 'existing clipboard contents'; });
afterEach(() => vi.unstubAllGlobals());

function browser(share: () => Promise<void>) {
  vi.stubGlobal('navigator', {
    share,
    clipboard: { writeText: async (text: string) => { clipboard = text; } }
  });
}

describe('native result sharing', () => {
  it('does not overwrite the clipboard when the native sheet completes', async () => {
    browser(async () => {});
    expect(await shareResult(shareData)).toBe('shared');
    expect(clipboard).toBe('existing clipboard contents');
  });

  it('does not copy or report failure when the native sheet is dismissed', async () => {
    browser(async () => { throw new DOMException('Dismissed', 'AbortError'); });
    expect(await shareResult(shareData)).toBe('cancelled');
    expect(clipboard).toBe('existing clipboard contents');
  });

  it('falls back to copying when native sharing is denied rather than dismissed', async () => {
    browser(async () => { throw new DOMException('Denied', 'NotAllowedError'); });
    expect(await shareResult(shareData)).toBe('copied');
    expect(clipboard).toBe('puzzle result\n\nhttps://example.com/games/kings/?seed=test&v=1');
  });
});
