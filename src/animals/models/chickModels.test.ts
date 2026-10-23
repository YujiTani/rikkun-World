import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHICKEN_BONES, CHICKEN_SCALE, COL } from './chickenSpec';
import {
  CHICK_COL,
  CHICK_SCALE,
  CHICK_TRI_LIMIT,
  MACHO_ADULT_RATIO,
  MACHO_ADULT_TRI_LIMIT,
  MACHO_CHICK_SCALE,
  MACHO_CHICK_TRI_LIMIT,
} from './chickSpec';
import { MODEL_SCALE, getAnimalModel, modelKindOf, type AnimalModelKind } from './chickenModel';
import type { BuiltModel } from './voxelMesh';

const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const rgbLin = (hex: number) => [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];

/** その 色の 頂点 の 位置の はんい（なければ null） */
function colorBox(m: BuiltModel, hex: number, minAbsX = 0): THREE.Box3 | null {
  const col = m.geo.getAttribute('color');
  const pos = m.geo.getAttribute('position');
  const t = rgbLin(hex);
  const b = new THREE.Box3();
  let n = 0;
  for (let i = 0; i < col.count; i++) {
    if (Math.abs(pos.getX(i)) >= minAbsX && Math.abs(t[0] - col.getX(i)) + Math.abs(t[1] - col.getY(i)) + Math.abs(t[2] - col.getZ(i)) < 0.01) {
      b.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
      n++;
    }
  }
  return n > 0 ? b : null;
}
const heightOf = (kind: AnimalModelKind, mark = true) => {
  const bb = getAnimalModel(kind, mark).geo.boundingBox!;
  return (bb.max.y - bb.min.y) * MODEL_SCALE[kind];
};

describe('LIVE-2 ひよこ・マッチョ の 形（DESIGN 16.12・16.13・16.17）', () => {
  it('三角形（リボン つき）: ひよこ 336 ≤ 360、マッチョひよこ 412 ≤ 440、マッチョにわとり 854 ≤ 900', () => {
    const a = getAnimalModel('chick', true).tris;
    const b = getAnimalModel('machoChick', true).tris;
    const c = getAnimalModel('macho', true).tris;
    expect(a).toBeLessThanOrEqual(CHICK_TRI_LIMIT);
    expect(b).toBeLessThanOrEqual(MACHO_CHICK_TRI_LIMIT);
    expect(c).toBeLessThanOrEqual(MACHO_ADULT_TRI_LIMIT);
    // 試作で はかった 数（DESIGN 16.12・16.13: ひよこ 276→336・マッチョひよこ 352→412・マッチョ 798→854）と 同じ
    expect([a, b, c]).toEqual([336, 412, 854]);
    expect([getAnimalModel('chick', false).tris, getAnimalModel('machoChick', false).tris, getAnimalModel('macho', false).tris]).toEqual([276, 352, 798]);
    // しるし なし は それ より 少ない
    for (const k of ['chick', 'machoChick', 'macho'] as const) expect(getAnimalModel(k, false).tris).toBeLessThan(getAnimalModel(k, true).tris);
  });

  it('いちばん 多い とき（ふつう 26 ＋ マッチョ 大人 3）の 三角形 の ふえ が 20,000 以下（DESIGN 16.17）', () => {
    const n = getAnimalModel('chicken', true);
    const m = getAnimalModel('macho', true);
    expect(26 * n.tris + 3 * m.tris + n.hullTris).toBeLessThanOrEqual(20000);
  });

  it('1 わ 1 メッシュ: 頂点は 骨 1 本 だけ（重み 1）・骨の 名前 は 大人 の にわとり と そろう', () => {
    for (const k of ['chick', 'machoChick', 'macho'] as const) {
      for (const mark of [false, true]) {
        const m = getAnimalModel(k, mark);
        const skin = m.geo.getAttribute('skinIndex');
        const wt = m.geo.getAttribute('skinWeight');
        for (let i = 0; i < skin.count; i++) {
          expect(skin.getX(i)).toBeLessThan(m.names.length);
          expect(wt.getX(i)).toBe(1);
        }
        for (const n of m.names) expect(CHICKEN_BONES as readonly string[]).toContain(n);
        expect(new Set(m.names).size).toBe(m.names.length);
      }
    }
  });

  it('ひよこ: 首・とさか・しっぽ が 無い（大人 の 影と はっきり ちがう）。体・足・頭・目・羽・リボン は ある', () => {
    const names = getAnimalModel('chick', true).names;
    for (const n of ['neck', 'comb', 'tail', 'brow']) expect(names).not.toContain(n);
    for (const n of ['body', 'legL', 'legR', 'head', 'eyes', 'wingL', 'wingR', 'mark']) expect(names).toContain(n);
    expect(getAnimalModel('chick', false).names).not.toContain('mark');
  });

  it('マッチョ: 太い まゆ（brow）が ある。大人 の マッチョ は 首・とさか・しっぽ も ある。ふつう の ひよこ に まゆ は 無い', () => {
    expect(getAnimalModel('machoChick', true).names).toContain('brow');
    const m = getAnimalModel('macho', true).names;
    for (const n of ['neck', 'comb', 'tail', 'brow', 'wingL', 'wingR']) expect(m).toContain(n);
    expect(getAnimalModel('chick', true).names).not.toContain('brow');
    expect(getAnimalModel('chicken', true).names).not.toContain('brow');
  });

  it('ひよこ の 高さ 約 0.35（ねぐせ まで）。マッチョひよこ は 0.72 倍 で 約 0.40 以上', () => {
    const h = heightOf('chick');
    expect(h).toBeGreaterThan(0.3);
    expect(h).toBeLessThan(0.4);
    expect(CHICK_SCALE).toBe(0.62);
    expect(MACHO_CHICK_SCALE).toBe(0.72);
    // マッチョひよこ は うでを 上へ 立てる ので ふつう より 高い（見た目）
    expect(heightOf('machoChick')).toBeGreaterThan(h);
  });

  it('マッチョ の 大人 の 倍率 は ふつう の 1.15 倍（体の 当たり は A の ものさし）', () => {
    expect(MACHO_ADULT_RATIO).toBe(1.15);
    expect(MODEL_SCALE.macho / MODEL_SCALE.chicken).toBeCloseTo(1.15, 6);
    expect(MODEL_SCALE.chicken).toBe(CHICKEN_SCALE);
    // 体（クリーム色以外）の 高さ は 1.15 倍。うでの 高さ は のぞく ので とさかの 先（赤）で はかる
    const comb = (k: AnimalModelKind) => colorBox(getAnimalModel(k, true), COL.red)!;
    const top = (k: AnimalModelKind) => comb(k).max.y * MODEL_SCALE[k];
    expect(top('macho') / top('chicken')).toBeCloseTo(1.15, 2);
  });

  it('マッチョ の うで: 両がわ に 上へ たつ（影で「U」）。肩 より 上に こぶし が 出る', () => {
    for (const k of ['machoChick', 'macho'] as const) {
      const m = getAnimalModel(k, false);
      const arm = k === 'machoChick' ? CHICK_COL.bodyD : COL.cream;
      const box = colorBox(m, arm)!;
      expect(box, k).not.toBeNull();
      const body = colorBox(m, k === 'machoChick' ? CHICK_COL.body : COL.W)!;
      // うでが 体より 横へ 出る・体の 上の ほうまで のびる
      expect(box.max.x, k).toBeGreaterThan(body.max.x);
      expect(box.min.x, k).toBeLessThan(body.min.x);
    }
    // ひよこ の 影 を 比べる: マッチョひよこ の うでの 頂点 は ふつう の 羽 より ずっと 高い
    const normalWing = colorBox(getAnimalModel('chick', false), CHICK_COL.bodyD, 0.12)!;
    const flex = colorBox(getAnimalModel('machoChick', false), CHICK_COL.bodyD, 0.12)!;
    expect(flex.max.y).toBeGreaterThan(normalWing.max.y + 0.05);
  });

  it('ひよこ の 色: たまご色（体）・こい たまご色（ねぐせ・羽）・だいだい（くちばし・足）・目。大人 の 白 は 使わない', () => {
    const m = getAnimalModel('chick', false);
    expect(colorBox(m, CHICK_COL.body)).not.toBeNull();
    expect(colorBox(m, CHICK_COL.bodyD)).not.toBeNull();
    expect(colorBox(m, CHICK_COL.beak)).not.toBeNull();
    expect(colorBox(m, COL.eye)).not.toBeNull();
    expect(colorBox(m, COL.W)).toBeNull();
    expect(colorBox(m, COL.red)).toBeNull(); // とさか の 赤 なし
  });

  it('なかまの しるし（リボン）: 大人 と 同じ 藍（同じ 子 と 分かる）', () => {
    for (const k of ['chick', 'machoChick', 'macho'] as const) {
      expect(colorBox(getAnimalModel(k, true), COL.ribbon), k).not.toBeNull();
      expect(colorBox(getAnimalModel(k, false), COL.ribbon), k).toBeNull();
    }
  });

  it('目は ふつう の まま（つり目・白目 に しない）: 目 の 色 は 目 と まゆ だけ に つかう', () => {
    for (const k of ['chick', 'machoChick', 'macho'] as const) expect(colorBox(getAnimalModel(k, true), COL.eye), k).not.toBeNull();
  });

  it('形の 選び方: stage と breed から。なければ ふつう の 大人', () => {
    expect(modelKindOf(undefined, undefined)).toBe('chicken');
    expect(modelKindOf('adult', 'normal')).toBe('chicken');
    expect(modelKindOf('chick', 'normal')).toBe('chick');
    expect(modelKindOf('chick', 'macho')).toBe('machoChick');
    expect(modelKindOf('adult', 'macho')).toBe('macho');
  });

  it('同じ 形を 何回 よんでも 同じ もの（1 回 だけ 作る）', () => {
    for (const k of ['chicken', 'chick', 'machoChick', 'macho'] as const) expect(getAnimalModel(k, true)).toBe(getAnimalModel(k, true));
  });
});
