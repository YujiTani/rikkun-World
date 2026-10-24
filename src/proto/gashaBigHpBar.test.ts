import { describe, expect, it } from 'vitest';
import { SKULL_D_SRC } from './gashaBigHpBar';
import { TUNE } from './gashaBigTuning';
import { readFileSync } from 'node:fs';

describe('体力バー D 案', () => {
  it('既定は D', () => expect(TUNE.hit.barStyle).toBe('D'));
  it('どくろの 絵は public に あって 128 × 128 の PNG（相対パスで 読む）', () => {
    expect(SKULL_D_SRC.startsWith('/')).toBe(false);
    const b = readFileSync(`public/${SKULL_D_SRC}`);
    expect(b.readUInt32BE(16)).toBe(128);
    expect(b.readUInt32BE(20)).toBe(128);
  });
});
