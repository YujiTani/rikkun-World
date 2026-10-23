import { describe, expect, it } from 'vitest';
import type { AnimalState } from '../../contracts';
import { boneIndex, createPose, poseChicken, type PoseInput } from './chickenPose';
import { CHICKEN_SCALE } from './chickenSpec';
import { MODEL_SCALE, type AnimalModelKind } from './chickenModel';

const posed = (kind: AnimalModelKind, o: Partial<PoseInput>) => {
  const p = createPose(MODEL_SCALE[kind]);
  poseChicken(p, { state: 'idle', stateTicks: 0, headRelYaw: 0, motion: 1, kind, ...o }, MODEL_SCALE[kind]);
  return p;
};
const rotZ = (p: ReturnType<typeof createPose>, bone: Parameters<typeof boneIndex>[0]) => p.rot[boneIndex(bone) * 3 + 2];

describe('LIVE-2 うごき（DESIGN 16.12・LIVE-2 §3.5）', () => {
  it('かえる: ピキッ 20（小さく ぷるぷる）→ ぽんっ 20（とび出す・行きすぎて もどる）→ ぷるぷる 20 → 60 で 元の 大きさ', () => {
    const k = 'chick';
    const K = MODEL_SCALE[k];
    const a = posed(k, { state: 'hatch', hatchT: 5 / 60 });
    expect(a.scale[0]).toBeCloseTo(0.55 * K, 5); // から の 中 は 小さい
    // ぷるぷる: 体が ゆれる（0 では ゆれない・3 で ゆれる）
    expect(Math.abs(rotZ(posed(k, { state: 'hatch', hatchT: 0 }), 'body'))).toBeLessThan(1e-6);
    expect(Math.abs(rotZ(posed(k, { state: 'hatch', hatchT: 15 / 60 }), 'body'))).toBeGreaterThan(1);
    // ぽんっ: 空中 に 出る（rigY）。20 と 40 では 地面
    const mid = posed(k, { state: 'hatch', hatchT: 30 / 60 });
    expect(mid.rigY).toBeGreaterThan(0.1);
    expect(posed(k, { state: 'hatch', hatchT: 20 / 60 }).rigY).toBeCloseTo(0, 5);
    expect(posed(k, { state: 'hatch', hatchT: 40 / 60 }).rigY).toBeCloseTo(0, 5);
    // 40 で ほぼ 元の 大きさ、行きすぎは 1.1 倍 以内
    for (let t = 20; t <= 40; t++) expect(posed(k, { state: 'hatch', hatchT: t / 60 }).scale[1]).toBeLessThan(K * 1.4);
    expect(posed(k, { state: 'hatch', hatchT: 40 / 60 }).scale[0]).toBeGreaterThan(K * 0.9);
    // 60 で 元の 形
    const end = posed(k, { state: 'hatch', hatchT: 1 });
    expect(end.scale[0]).toBeCloseTo(K, 3);
    expect(Math.abs(rotZ(end, 'body'))).toBeLessThan(0.01);
  });

  it('かえる は stateTicks でも 動く（hatchT が ない とき）', () => {
    const a = posed('chick', { state: 'hatch', stateTicks: 30 });
    expect(a.rigY).toBeGreaterThan(0.1);
  });

  it('マッチョ は 80 ステップ: 60 のあと 力こぶ の ポーズ で うで を 15° あげて とめる', () => {
    const k = 'machoChick';
    const at60 = posed(k, { state: 'hatch', hatchT: 60 / 80 });
    const at80 = posed(k, { state: 'hatch', hatchT: 1 });
    // マッチョ の うで は 上へ たつ ので 「あげる」は 外へ ひらく（右 は −z まわり）
    expect(rotZ(at60, 'wingR')).toBeCloseTo(0, 3);
    expect(rotZ(at80, 'wingR')).toBeLessThan(-14);
    expect(rotZ(at80, 'wingL')).toBeGreaterThan(14);
    // ふつう の ひよこ は 60 で おわり（その あと は 何も しない）
    expect(posed('chick', { state: 'hatch', hatchT: 1 }).scale[0]).toBeCloseTo(MODEL_SCALE.chick, 3);
    expect(rotZ(posed('chick', { state: 'hatch', hatchT: 1 }), 'wingR')).toBeCloseTo(0, 3);
  });

  it('大人 に なる: ぷるぷる 20 → 光 20（ふくらむ）→ 30 で 大人 の 形 → ばさっ（羽を ひろげる）→ 60 で 元の 形', () => {
    const chick = 'chick';
    const shiver = posed(chick, { state: 'grow', growT: 10 / 60 });
    expect(Math.abs(rotZ(shiver, 'body'))).toBeGreaterThan(0.5);
    const puff = posed(chick, { state: 'grow', growT: 29 / 60 });
    expect(puff.scale[0] / MODEL_SCALE.chick).toBeGreaterThan(1.2);
    // 大人 の 形 に かわった 直後 は ひよこ の 見た目の 大きさ に そろう（つなぎめ が とばない）
    const first = posed('chicken', { state: 'grow', growT: 30 / 60, growFromScale: MODEL_SCALE.chick });
    expect(first.scale[0]).toBeCloseTo(MODEL_SCALE.chick * 1.25, 2);
    // ばさっ: 羽 が ひろがる（右 は +z まわり）。60 で 元
    const flap = posed('chicken', { state: 'grow', growT: 42 / 60, growFromScale: MODEL_SCALE.chick });
    expect(rotZ(flap, 'wingR')).toBeGreaterThan(40);
    expect(rotZ(flap, 'wingL')).toBeLessThan(-40);
    const end = posed('chicken', { state: 'grow', growT: 1, growFromScale: MODEL_SCALE.chick });
    expect(end.scale[0]).toBeCloseTo(CHICKEN_SCALE, 3);
    expect(Math.abs(rotZ(end, 'wingR'))).toBeLessThan(0.5);
    // マッチョ の 大人 は うで を ひらく 向きが 逆
    const mFlap = posed('macho', { state: 'grow', growT: 42 / 60, growFromScale: MODEL_SCALE.machoChick });
    expect(rotZ(mFlap, 'wingR')).toBeLessThan(-10);
    expect(posed('macho', { state: 'grow', growT: 1, growFromScale: MODEL_SCALE.machoChick }).scale[0]).toBeCloseTo(MODEL_SCALE.macho, 3);
  });

  it('ねる: 10 ステップ で すわって（たて に つぶれ）目を とじる。そのあと ゆっくり いき', () => {
    for (const k of ['chicken', 'chick', 'machoChick', 'macho'] as const) {
      const K = MODEL_SCALE[k];
      const z = posed(k, { state: 'sleep', stateTicks: 0 });
      expect(z.scale[1]).toBeCloseTo(K, 5);
      const s = posed(k, { state: 'sleep', stateTicks: 30 });
      expect(s.scale[1] / K).toBeLessThan(0.82); // すわる
      expect(s.scale[0] / K).toBeGreaterThan(1.08);
      expect(s.sc[boneIndex('eyes') * 3 + 1]).toBeLessThan(0.4); // 目を とじる（0.9 だけ ほそめる）
    }
    // いき: 30 と 52 で 高さ が ちがう（うごきの 強さ 0 でも のこる）
    const a = posed('chick', { state: 'sleep', stateTicks: 30, motion: 0 }).scale[1];
    const b = posed('chick', { state: 'sleep', stateTicks: 52, motion: 0 }).scale[1];
    expect(Math.abs(a - b)).toBeGreaterThan(1e-4);
  });

  it('コロン: 前 に 1 回 まわって（体 −360°）起きる。0 と 1 で 元の 形。うごきの 強さ 0 でも まわる', () => {
    const k = 'chick';
    const body = (r: number, motion = 1) => posed(k, { state: 'idle', rollT: r, motion }).rot[boneIndex('body') * 3];
    expect(Math.abs(body(0))).toBeLessThan(1e-6);
    expect(body(0.5)).toBeCloseTo(-180, 0);
    expect(body(0.999)).toBeLessThan(-355);
    expect(body(0.5, 0)).toBeCloseTo(-180, 0);
    expect(posed(k, { state: 'idle', rollT: 1 }).rot[boneIndex('body') * 3]).toBe(0); // おわれば なし
    expect(posed(k, { state: 'idle', rollT: -1 }).rot[boneIndex('body') * 3]).toBe(0);
    // とぶ 高さ は 小さい（ひよこ は 0.62 倍）
    expect(posed(k, { state: 'idle', rollT: 0.5 }).rigY).toBeLessThan(0.05);
  });

  it('ひよこ: つつく の かがみ・頭の うごき は 体と 頭 に のこる（首・とさか の 骨は 形に 無いので 描く 側が とばす）', () => {
    const p = posed('chick', { state: 'eat', stateTicks: 12 });
    expect(p.rot[boneIndex('body') * 3]).toBeLessThan(-10);
    expect(p.rot[boneIndex('head') * 3]).toBeLessThan(-10);
    expect(Array.from(p.off).every(Number.isFinite)).toBe(true);
  });

  it('ひよこ の ジャンプ・とぶ 高さ は 0.62 倍（大人 0.4 → 約 0.25）', () => {
    const adult = posed('chicken', { state: 'cheer', stateTicks: 9 }).rigY;
    const chick = posed('chick', { state: 'cheer', stateTicks: 9 }).rigY;
    expect(adult).toBeGreaterThan(0.3);
    expect(chick / adult).toBeCloseTo(MODEL_SCALE.chick / CHICKEN_SCALE, 3);
  });

  it('マッチョ の パタパタ・よろこぶ は うでが 外・上へ ひらく（大人 の 羽 と 逆 まわり）', () => {
    const fl = (k: AnimalModelKind) => posed(k, { state: 'idle', fluttering: true, flutterT: 2 });
    expect(rotZ(fl('chick'), 'wingR')).toBeGreaterThan(60);
    expect(rotZ(fl('machoChick'), 'wingR')).toBeLessThan(-60);
    expect(rotZ(fl('machoChick'), 'wingL')).toBeGreaterThan(60);
  });

  it('どの 形・どの 状態・どの コマ でも 数は 有限（NaN なし）', () => {
    const states: AnimalState[] = ['appear', 'wander', 'rest', 'look', 'eat', 'pet', 'lay', 'cheer', 'follow', 'idle', 'full', 'carried', 'putDown', 'sleep', 'hatch', 'grow'];
    for (const kind of ['chicken', 'chick', 'machoChick', 'macho'] as const) {
      for (const state of states) {
        for (let t = 0; t <= 90; t += 3) {
          for (const motion of [0, 1]) {
            const p = posed(kind, { state, stateTicks: t, hatchT: t / 80, growT: t / 60, rollT: t / 90, growFromScale: 0.62, motion });
            expect([...p.off, ...p.rot, ...p.sc, ...p.scale, p.rigY].every(Number.isFinite), `${kind} ${state} ${t}`).toBe(true);
          }
        }
      }
    }
  });
});
