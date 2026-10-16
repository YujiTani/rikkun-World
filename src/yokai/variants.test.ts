import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyDollBrightness } from './ai/brightness';
import { createYokai, type YokaiId } from './index';
import { YOKAI_VARIANT_COLORS } from './variants';

/**
 * BAL-G 色ちがい 3 段階（DESIGN 13.1、BALANCE §2.4、AC21 の数の所）。
 * 窓口: `src/yokai/variants.ts` の `YOKAI_VARIANT_COLORS[妖怪][段階 2|3] = { もとの色: 新しい色 }`（段階 1 = 今の色。表に無い）。
 * `applyDollBrightness(model, kind, brightness, stage)` は その表で 色を「差しかえ」る（うすい色の上乗せはやめる）。
 */
const T: Record<YokaiId, Record<2 | 3, Record<number, number>>> = {
  karakasa: {
    2: { 0xe0503a: 0x9aaaff, 0x8b4a2b: 0x4b56b8, 0xf2c14e: 0xe2eaff, 0xa0703c: 0x7a86cc },
    3: { 0xe0503a: 0xffc83d, 0x8b4a2b: 0xff6a3d, 0xf2c14e: 0xfff2b0, 0xa0703c: 0xe89a30 },
  },
  chochin: {
    2: { 0xffb347: 0xbcd2ff, 0xfff2a0: 0xe4eeff, 0xc46a1e: 0x5f7be6, 0x3a3a4a: 0x343d8c },
    3: { 0xffb347: 0xfff05a, 0xfff2a0: 0xfff8c8, 0xc46a1e: 0xff5a3c, 0x3a3a4a: 0xd99a1a },
  },
  nurikabe: {
    2: { 0xa39b8b: 0xb2bce6, 0x8a8273: 0x8e99cc, 0x8e8676: 0x8c97cc, 0x6dbe45: 0xb0ecff, 0x5aa83a: 0x7fd2f2 },
    3: { 0xa39b8b: 0xf2cc6a, 0x8a8273: 0xd9a940, 0x8e8676: 0xddae48, 0x6dbe45: 0xff9a50, 0x5aa83a: 0xff8040 },
  },
  rokurokubi: {
    2: { 0x6f84e8: 0xc29cf2, 0x5b6fd6: 0x9f78e0, 0xf2c14e: 0xe8eeff },
    3: { 0x6f84e8: 0xffc83d, 0x5b6fd6: 0xf0a830, 0xf2c14e: 0xff6a3d },
  },
};
const KINDS = Object.keys(T) as YokaiId[];

function mats(model: ReturnType<typeof createYokai>): THREE.MeshBasicMaterial[] {
  const out = new Set<THREE.MeshBasicMaterial>();
  model.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) out.add(m as THREE.MeshBasicMaterial);
  });
  return [...out];
}
const colorsOf = (model: ReturnType<typeof createYokai>) => new Set(mats(model).filter((m) => !m.map).map((m) => m.color.getHex()));
/** ぬりかべ の もよう（テクスチャ・2 色）に 使われている色。顔の絵は のぞく */
function textureColors(model: ReturnType<typeof createYokai>): Set<number> {
  const s = new Set<number>();
  for (const m of mats(model)) {
    const d = (m.map?.image as { data?: Uint8Array } | undefined)?.data;
    if (!d) continue;
    const own = new Set<number>();
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0) own.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    if (own.size > 2 || own.has(0x222222)) continue; // 顔の絵は のぞく（かべの もようは 2 色）
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]! > 0) s.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
  }
  return s;
}

describe('BAL-G 色の表（DESIGN 13.1）', () => {
  it('YOKAI_VARIANT_COLORS が 表の通り（4 種 × 段階 2・3 × 部品）', () => {
    for (const k of KINDS) for (const st of [2, 3] as const) {
      const got = YOKAI_VARIANT_COLORS[k][st];
      expect(Object.keys(got).length, `${k} 段階${st}`).toBe(Object.keys(T[k][st]).length);
      for (const [from, to] of Object.entries(T[k][st])) expect(got[Number(from)], `${k} 段階${st} ${Number(from).toString(16)}`).toBe(to);
    }
  });
});

describe('BAL-G 色ちがいは 色を差しかえる（上乗せではない）', () => {
  for (const k of KINDS) {
    it(`${k}: 段階 1 は 今の色。段階 2・3 は 表の色に 差しかわり、もとの色は 残らず、段階 1 に もどせる`, () => {
      const model = createYokai(k);
      const base = colorsOf(model);
      const baseTex = textureColors(model);
      const all = new Set([...base, ...baseTex]);
      // ちょうちんの どう（明るい）は 攻撃のときだけ 使う色なので 見えなくてよい
      const present = (st: 2 | 3) => Object.entries(T[k][st]).filter(([f]) => all.has(Number(f)));
      expect(present(2).length, `${k} の もとの色が 見つからない`).toBeGreaterThanOrEqual(Object.keys(T[k][2]).length - (k === 'chochin' ? 1 : 0));
      for (const st of [2, 3] as const) {
        applyDollBrightness(model, k, 1, st);
        const now = new Set([...colorsOf(model), ...textureColors(model)]);
        for (const [from, to] of present(st)) {
          expect(now.has(to), `${k} 段階${st}: ${to.toString(16)} が出ない`).toBe(true);
          expect(now.has(Number(from)), `${k} 段階${st}: もとの色 ${Number(from).toString(16)} が残っている`).toBe(false);
        }
      }
      applyDollBrightness(model, k, 1, 1);
      expect(new Set([...colorsOf(model), ...textureColors(model)])).toEqual(all);
    });
  }

  it('表に無い色（顔の絵・した・はだ・かみ・げた・ちょうちんの え）は 3 段階とも 今のまま（テクスチャの色の数は 顔で変わらない）', () => {
    const model = createYokai('rokurokubi');
    const before = mats(model).filter((m) => m.map).map((m) => m.color.getHex());
    applyDollBrightness(model, 'rokurokubi', 1, 3);
    expect(mats(model).filter((m) => m.map).map((m) => m.color.getHex())).toEqual(before);
    const chochin = createYokai('chochin');
    applyDollBrightness(chochin, 'chochin', 1, 3);
    expect(colorsOf(chochin).has(0x6b4226)).toBe(true); // えの色
  });

  it('ぬりかべの もよう（S・D の 2 色）が 作りかわる。段階 3 → 1 でも もどる', () => {
    const model = createYokai('nurikabe');
    expect(textureColors(model)).toEqual(new Set([0xa39b8b, 0x8a8273]));
    applyDollBrightness(model, 'nurikabe', 1, 2);
    expect(textureColors(model)).toEqual(new Set([0xb2bce6, 0x8e99cc]));
    applyDollBrightness(model, 'nurikabe', 1, 3);
    expect(textureColors(model)).toEqual(new Set([0xf2cc6a, 0xd9a940]));
    applyDollBrightness(model, 'nurikabe', 1, 1);
    expect(textureColors(model)).toEqual(new Set([0xa39b8b, 0x8a8273]));
  });

  it('夜の暗さは 差しかえた色に かける（段階 2 のかさ × 0.3）。ちょうちんの どう は 3 段階とも 暗くしない', () => {
    const k = createYokai('karakasa');
    applyDollBrightness(k, 'karakasa', 0.3, 2);
    expect(colorsOf(k).has(new THREE.Color(0x9aaaff).multiplyScalar(0.3).getHex())).toBe(true);
    for (const st of [1, 2, 3] as const) {
      const c = createYokai('chochin');
      applyDollBrightness(c, 'chochin', 0.3, st);
      const now = colorsOf(c);
      const d1 = st === 1 ? 0xffb347 : T.chochin[st][0xffb347]!;
      expect(now.has(d1), `どう 段階${st}`).toBe(true);
      // ほねは 暗くなる
      expect(now.has(st === 1 ? 0xc46a1e : T.chochin[st][0xc46a1e]!)).toBe(false);
    }
  });
});
