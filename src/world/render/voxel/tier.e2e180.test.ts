import { describe, expect, it } from 'vitest';
import * as tier from './tier';
import { BOX_OUTER, DEFAULT_MICRO_R, MICRO_RADII, nextTier, normalizeMicroR, type Tier } from './tier';

/**
 * #180（docs/tickets/E2E-180.md）: 小ブロックの半径に「0 = 小ブロックなし（近くも箱の段）」を足す。
 * 実装の前に書いたテスト（落ちるのが正しい）。
 *
 * 決まり（ゲーム側）:
 *  - `normalizeMicroR(0)` は 0 のまま。F4 の切りかえ（MICRO_RADII）は 今のまま 16 → 24 → 28。
 *  - 半径 0 の `nextTier` は micro を返さない（近くも 箱の段。箱の外側 48 の前後と LOD は 今のまま）。
 *  - はじめの半径は `decideMicroR(search, envDefault)`（tier.ts に作って export する。main.ts が `location.search` と
 *    `import.meta.env.VITE_MICRO_DEFAULT` を渡す。影の decideShadowStart と同じ形）:
 *      URL の `?microR=0|16|24|28` が いちばん強い（環境変数より強い。`?microR=0` も 0 として受けつける）
 *      > 環境変数 `off` なら 0（E2E のサーバー）> なし・ほかの値なら 28（2026-10-18 から）。
 */

describe('#180 normalizeMicroR(0) と 切りかえ', () => {
  it('normalizeMicroR(0) は 0 のまま', () => {
    expect(normalizeMicroR(0)).toBe(0);
  });

  it('16 / 24 / 28 とほかの数の直しかたは 今のまま（0 を足しても かわらない）', () => {
    expect(normalizeMicroR(16)).toBe(16);
    expect(normalizeMicroR(24)).toBe(24);
    expect(normalizeMicroR(32)).toBe(28);
    expect(normalizeMicroR(10)).toBe(16);
    expect(normalizeMicroR(21)).toBe(24);
    expect(normalizeMicroR(1000)).toBe(28);
  });

  it('F4 の切りかえは 16 → 24 → 28。ふつうに遊ぶときの既定は 28', () => {
    expect([...MICRO_RADII]).toEqual([16, 24, 28]);
    expect(DEFAULT_MICRO_R).toBe(28);
  });
});

describe('#180 nextTier: 半径 0 は 小ブロックなし（近くも箱の段）', () => {
  const prevs: (Tier | null)[] = [null, 'micro', 'box', 'lod'];

  it('どの距離でも どのいまの段からでも micro にならない', () => {
    const got = new Set<Tier>();
    for (const prev of prevs) for (let d = 0; d <= 120; d += 0.5) got.add(nextTier(d, prev, 0));
    expect([...got].sort()).toEqual(['box', 'lod']);
  });

  it('プレイヤーのいる列（距離 0）も 近くの列も 箱の段', () => {
    for (const prev of prevs) {
      expect(nextTier(0, prev, 0), `prev=${prev} d=0`).toBe('box');
      expect(nextTier(1, prev, 0), `prev=${prev} d=1`).toBe('box');
      expect(nextTier(16, prev, 0), `prev=${prev} d=16`).toBe('box');
      expect(nextTier(32, prev, 0), `prev=${prev} d=32`).toBe('box');
    }
  });

  it('箱の外側（48）の前後と LOD は 今のまま（出るのは 48+2、入るのは 48−2）', () => {
    expect(nextTier(BOX_OUTER, null, 0)).toBe('box');
    expect(nextTier(BOX_OUTER + 0.1, null, 0)).toBe('lod');
    expect(nextTier(50, 'box', 0)).toBe('box');
    expect(nextTier(50.01, 'box', 0)).toBe('lod');
    expect(nextTier(46, 'lod', 0)).toBe('box');
    expect(nextTier(46.01, 'lod', 0)).toBe('lod');
  });

  it('半径 16 / 24 / 28 の段の決めかたは かわらない（近くは micro）', () => {
    for (const r of MICRO_RADII) {
      expect(nextTier(0, null, r)).toBe('micro');
      expect(nextTier(r, null, r)).toBe('micro');
      expect(nextTier(r + 0.1, null, r)).toBe('box');
    }
  });
});

describe('#180 decideMicroR: はじめの小ブロックの半径の決め方', () => {
  type Decide = (search: string, envDefault: string | undefined) => number;
  const decide: Decide = (search, envDefault) => {
    const f = (tier as unknown as { decideMicroR?: Decide }).decideMicroR;
    if (typeof f !== 'function') {
      throw new Error('decideMicroR(search, envDefault) を src/world/render/voxel/tier.ts に作って export する（まだ作っていない。#180）');
    }
    return f(search, envDefault);
  };

  it('環境変数も URL もなければ 28', () => {
    expect(decide('', undefined)).toBe(28);
    expect(decide('?nosave=1', undefined)).toBe(28);
  });

  it('環境変数 VITE_MICRO_DEFAULT=off なら 0（E2E のサーバー）', () => {
    expect(decide('', 'off')).toBe(0);
    expect(decide('?nosave=1', 'off')).toBe(0);
  });

  it('環境変数が off 以外（on・空・ほかの値）なら 28', () => {
    expect(decide('', 'on')).toBe(28);
    expect(decide('', '')).toBe(28);
    expect(decide('?nosave=1', 'foo')).toBe(28);
  });

  it('URL の ?microR=16|24|28 は 環境変数より強い', () => {
    expect(decide('?microR=16', 'off')).toBe(16);
    expect(decide('?microR=24', 'off')).toBe(24);
    expect(decide('?microR=32', 'off')).toBe(28);
    expect(decide('?nosave=1&microR=32', 'off')).toBe(28);
    expect(decide('?microR=16', undefined)).toBe(16);
    expect(decide('?microR=24&nosave=1', undefined)).toBe(24);
  });

  it('?microR=0 は 0 として受けつける（環境変数がなくても・on でも）', () => {
    expect(decide('?microR=0', undefined)).toBe(0);
    expect(decide('?microR=0', 'on')).toBe(0);
    expect(decide('?microR=0', 'off')).toBe(0);
    expect(decide('?nosave=1&microR=0', undefined)).toBe(0);
  });

  it('数でない ?microR は 無いのと同じ（環境変数・既定に従う）', () => {
    expect(decide('?microR=abc', undefined)).toBe(28);
    expect(decide('?microR=abc', 'off')).toBe(0);
  });

  // 台帳 E2E-180 の指摘 2: 空の ?microR=（Number('') は 0 になるので ?microR=0 と取りちがえやすい）は 無いのと同じ
  it('空の ?microR= は 無いのと同じ（0 と取りちがえない）', () => {
    expect(decide('?microR=', undefined)).toBe(28);
    expect(decide('?microR=', 'off')).toBe(0);
    expect(decide('?microR=&nosave=1', undefined)).toBe(28);
    expect(decide('?nosave=1&microR=', 'off')).toBe(0);
    expect(decide('?microR=%20', undefined)).toBe(28);
  });

  // 許されない数は 近い許される値に直して返す（normalizeMicroR と同じ。renderer も同じ直しをする）。負の数は 無いのと同じ
  it('許されない数は 近い許される値に直す。負の数は 無いのと同じ', () => {
    expect(decide('?microR=20', undefined)).toBe(16);
    expect(decide('?microR=21', 'off')).toBe(24);
    expect(decide('?microR=1000', 'off')).toBe(28);
    expect(decide('?microR=-1', undefined)).toBe(28);
    expect(decide('?microR=-1', 'off')).toBe(0);
  });
});
