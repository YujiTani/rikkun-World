import { describe, expect, it } from 'vitest';
import { SEA_Y } from '../../contracts';
import { mountainFrame } from './biome';
import { featuresInRect } from './countryFeatures';
import { terrainFor } from './terrain';

/**
 * 既定（新しい 山 v2・目じるし）の 世界で、山の 物（#187 区切り 2）が ちゃんと 出る:
 * すいしょう（いわやま）・おおもみじ と おちば（もみじやま）・ゆきだるま（ゆきやま）は どの 山にも ある。
 * てんぐの やまは お堂が 置ける 山は お堂（と やぐら・いど）、置けない 山（頂上が 急）だけ とうろう（重ねない）。
 */

const seed = 20261012;
const PER_KIND = 8;

type Kind = 'iwayama' | 'tengu' | 'momiji' | 'yuki';
const types = new Map<Kind, Set<string>[]>();

function mountainsOf(kind: Kind): { px: number; pz: number }[] {
  const T = terrainFor(seed);
  const out: { px: number; pz: number }[] = [];
  for (let fz = -9; fz <= 9; fz++) {
    for (let fx = -9; fx <= 9; fx++) {
      const m = mountainFrame(seed, fx, fz).mountain;
      if (m && m.kind === kind && T.height(m.px, m.pz) >= SEA_Y) out.push({ px: m.px, pz: m.pz });
    }
  }
  return out.slice(0, PER_KIND);
}

function typesOfMountains(kind: Kind): Set<string>[] {
  let r = types.get(kind);
  if (!r) {
    r = mountainsOf(kind).map((m) => new Set(featuresInRect(seed, m.px - 150, m.pz - 150, m.px + 150, m.pz + 150).map((f) => f.type as string)));
    types.set(kind, r);
  }
  return r;
}

describe('山 v2（既定）の 山の物', () => {
  it('どの 山にも: いわやま = すいしょう、もみじやま = おおもみじ、ゆきやま = ゆきだるま', () => {
    for (const [kind, type] of [['iwayama', 'suisho'], ['momiji', 'oomomiji'], ['yuki', 'yukidaruma']] as const) {
      const list = typesOfMountains(kind);
      expect(list.length, `${kind} の 山の 数`).toBeGreaterThan(0);
      for (const s of list) expect(s.has(type), `${kind} に ${type}`).toBe(true);
    }
  });

  it('てんぐの やま: お堂か とうろうの どちらか 1 つだけ（お堂が ある 山に とうろう・かいだんを 重ねない）', () => {
    const list = typesOfMountains('tengu');
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      expect(s.has('odou') !== s.has('touro'), `お堂 ${s.has('odou')} とうろう ${s.has('touro')}`).toBe(true);
      if (s.has('odou')) expect(s.has('kaidan')).toBe(false);
    }
  });

  it('いわやま・もみじやまの 目じるし（いしの とりい・ほこら）も 出る', () => {
    expect(typesOfMountains('iwayama').some((s) => s.has('ishi_torii'))).toBe(true);
    expect(typesOfMountains('momiji').some((s) => s.has('hokora'))).toBe(true);
  });
});
