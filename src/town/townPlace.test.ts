import { afterEach, describe, expect, it } from 'vitest';
import { CHUNK_SIZE, SEA_Y } from '../contracts';
import { BLOCK_INDEX, BLOCK_TYPES, isOpaqueIndex } from '../world/blocks/blockTypes';
import { generateChunk } from '../world/gen/chunk';
import { LAYER } from '../world/gen/columnLayout';
import { terrainFor } from '../world/gen/terrain';
import { GEN_CONFIG } from '../world/gen/config';
import { startFeaturesOf } from '../world/gen/features';
import { sectionToArray } from '../world/sections';
import { chooseTown } from './townPlace';
import { TownPlan, type TownRecord } from './townPlan';
import { activateTown, deactivateTown } from './townState';
import { TOWN } from './townTuning';

/**
 * AC7〔1B-1〕街の 置き場所・形・安全の はんい。AC46〔1B-1〕門が 見える（スタートの 目の 高さから gate.top までの 線が すけない ブロックを 通らない）。
 * 数は ぜんぶ townTuning の 表。シード 100 こ（1〜100）。
 */
const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const N = TOWN.size;

afterEach(() => deactivateTown());

const recs = new Map<number, TownRecord | null>();
function recOf(seed: number): TownRecord | null {
  if (!recs.has(seed)) recs.set(seed, chooseTown(seed));
  return recs.get(seed)!;
}

describe('AC7 置き場所', () => {
  it('同じ シードで 2 回 作ると 同じ（記録も info も）', () => {
    for (const seed of [1, 7, 42]) {
      const a = chooseTown(seed);
      const b = chooseTown(seed);
      expect(a).toEqual(b);
      expect(a).not.toBeNull();
      expect(new TownPlan(a!).info()).toEqual(new TownPlan(b!).info());
    }
  });

  it('シード 100 こ ぜんぶ 置ける（街の まん中が スタートから searchMax マス 以内）', { timeout: 600_000 }, () => {
    for (const seed of SEEDS) {
      const rec = recOf(seed);
      expect(rec, `シード ${seed}`).not.toBeNull();
      const sp = terrainFor(seed).spawn();
      const c = new TownPlan(rec!).info().center;
      expect(Math.hypot(c.x - sp.x, c.z - sp.z), `シード ${seed}`).toBeLessThanOrEqual(TOWN.searchMax);
    }
  });

  it('bounds は 100×100・safe は 116×116・門は スタートから 16〜28・門の 向きと 街→スタートの ずれは 45 度 以内・ふちは 16 マス 以上', () => {
    let nearGate = 0;
    for (const seed of SEEDS) {
      const rec = recOf(seed)!;
      const info = new TownPlan(rec).info();
      const sp = terrainFor(seed).spawn();
      expect(info.bounds.max.x - info.bounds.min.x + 1).toBe(N);
      expect(info.bounds.max.z - info.bounds.min.z + 1).toBe(N);
      expect(info.safe.max.x - info.safe.min.x + 1).toBe(N + 2 * TOWN.safeMargin);
      expect(info.safe.max.z - info.safe.min.z + 1).toBe(N + 2 * TOWN.safeMargin);
      const d = Math.hypot(info.gate.pos.x - (sp.x + 0.5), info.gate.pos.z - (sp.z + 0.5));
      if (d >= TOWN.gateDist.min && d <= TOWN.gateDist.max) nearGate++;
      // 向き: 門の 正面の ベクトルと、街の まん中 → スタート
      const f = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] }[info.facing];
      const vx = sp.x + 0.5 - info.center.x;
      const vz = sp.z + 0.5 - info.center.z;
      const ang = (Math.acos((f[0]! * vx + f[1]! * vz) / Math.hypot(vx, vz)) * 180) / Math.PI;
      expect(ang, `シード ${seed} の 向き`).toBeLessThanOrEqual(TOWN.facingDegMax);
      const ex = Math.max(info.bounds.min.x - sp.x, 0, sp.x - info.bounds.max.x);
      const ez = Math.max(info.bounds.min.z - sp.z, 0, sp.z - info.bounds.max.z);
      expect(Math.hypot(ex, ez), `シード ${seed} の ふち`).toBeGreaterThanOrEqual(TOWN.edgeFromStartMin);
      // さいしょの 建築士さん（スタートから 6〜10 マス）と 重ならない
      expect(Math.hypot(ex, ez)).toBeGreaterThan(10);
    }
    // 100 こ ぜんぶ 門が 16〜28（水・山で 合わない ときだけ 遠くへ 広げる。今の 100 こは ぜんぶ 合う）
    expect(nearGate).toBe(SEEDS.length);
  });

  it('水に かかる わりあいが 表の 上限 以下（うみ・いけに かかる 所は つちで うめる）。ひろばの まん中は 陸', () => {
    const maxFrac = TOWN.wetSteps[TOWN.wetSteps.length - 1]!;
    for (const seed of SEEDS.slice(0, 40)) {
      const rec = recOf(seed)!;
      const T = terrainFor(seed);
      let wet = 0;
      let n = 0;
      for (let z = rec.z0; z < rec.z0 + N; z += 3) {
        for (let x = rec.x0; x < rec.x0 + N; x += 3) {
          n++;
          if (T.height(x, z) <= SEA_Y + 1 || T.map.pondAt(x, z) !== null) wet++;
        }
      }
      expect(wet / n, `シード ${seed}`).toBeLessThanOrEqual(maxFrac + 0.02);
      // 街の 地面は 海面より 高い（うめた あとも 水の 上）
      expect(rec.groundY, `シード ${seed}`).toBeGreaterThan(SEA_Y + 1);
    }
  });

  it('lots が 3 つ・12×12・重ならず 街の 中・用水路と 重ならない。fountain は ひろばの まん中 ±2・plaza は 立てる マス', () => {
    const rec = recOf(1)!;
    const plan = new TownPlan(rec);
    const info = plan.info();
    expect(info.lots.length).toBe(TOWN.lots.count);
    const water = new Set([...info.canal.water, ...info.canal.walk].map((p) => `${p.x},${p.z}`));
    for (const [i, lot] of info.lots.entries()) {
      expect(lot.max.x - lot.min.x + 1).toBe(TOWN.lots.size);
      expect(lot.max.z - lot.min.z + 1).toBe(TOWN.lots.size);
      expect(lot.min.x >= info.bounds.min.x && lot.max.x <= info.bounds.max.x && lot.min.z >= info.bounds.min.z && lot.max.z <= info.bounds.max.z).toBe(true);
      for (let z = lot.min.z; z <= lot.max.z; z++) for (let x = lot.min.x; x <= lot.max.x; x++) expect(water.has(`${x},${z}`)).toBe(false);
      for (const o of info.lots.slice(i + 1)) expect(lot.max.x < o.min.x || o.max.x < lot.min.x || lot.max.z < o.min.z || o.max.z < lot.min.z).toBe(true);
    }
    const mx = (info.bounds.min.x + info.bounds.max.x + 1) / 2;
    const mz = (info.bounds.min.z + info.bounds.max.z + 1) / 2;
    const fx = (info.fountain.min.x + info.fountain.max.x + 1) / 2;
    const fz = (info.fountain.min.z + info.fountain.max.z + 1) / 2;
    expect(Math.abs(fx - mx)).toBeLessThanOrEqual(2);
    expect(Math.abs(fz - mz)).toBeLessThanOrEqual(2);
    // plaza: 立てる マス（足もとが かたく 上 2 マスが 空気）
    activateTown(1, rec, { x: terrainFor(1).spawn().x, z: terrainFor(1).spawn().z });
    const at = blockReader(1);
    const px = Math.floor(info.plaza.x);
    const pz = Math.floor(info.plaza.z);
    expect(BLOCK_TYPES[at(px, info.groundY, pz)]!.solid).toBe(true);
    expect(at(px, info.groundY + 1, pz)).toBe(BLOCK_INDEX.air);
    expect(at(px, info.groundY + 2, pz)).toBe(BLOCK_INDEX.air);
    expect(info.plaza.y).toBe(info.groundY + 1);
  });
});

/** 世界の ブロックを 読む（列を その つど 作って おぼえる） */
function blockReader(seed: number): (x: number, y: number, z: number) => number {
  const cols = new Map<string, Uint16Array>();
  return (x, y, z) => {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = `${cx},${cz}`;
    let col = cols.get(key);
    if (!col) {
      const c = generateChunk(seed, cx, cz);
      col = new Uint16Array(LAYER * c.sections.length * CHUNK_SIZE);
      c.sections.forEach((s, i) => col!.set(sectionToArray(s), i * LAYER * CHUNK_SIZE));
      cols.set(key, col);
    }
    return col[y * LAYER + (z - cz * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE)]!;
  };
}

describe('AC46 門が 見える', () => {
  it('スタートの 目の 高さ（地面 ＋1.6）から gate.top までの 線が すけない ブロックを 1 つも 通らない（シード 100 こ）', () => {
    for (const seed of SEEDS) {
      const rec = recOf(seed)!;
      const T = terrainFor(seed);
      const sp = T.spawn();
      const plan = activateTown(seed, rec, { x: sp.x, z: sp.z });
      const at = blockReader(seed);
      const top = plan.info().gate.top;
      const ex = sp.x + 0.5;
      const ez = sp.z + 0.5;
      const ey = sp.h + 1 + 1.6;
      const len = Math.hypot(top.x - ex, top.z - ez);
      const steps = Math.ceil(len * 4);
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = ex + (top.x - ex) * t;
        const z = ez + (top.z - ez) * t;
        const y = ey + (top.y - ey) * t;
        const b = at(Math.floor(x), Math.floor(y), Math.floor(z));
        expect(isOpaqueIndex(b), `シード ${seed}: (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) に ${BLOCK_TYPES[b]!.id}`).toBe(false);
      }
      deactivateTown();
    }
  }, 120_000);
});

describe('はじまりの木・岩山を 街が 消さない（voxB-terrain AC14）', () => {
  it.each([GEN_CONFIG.defaultSeed, 1, 2, 3, 4, 5, ...SEEDS.slice(0, 20)])('シード %i: 街の はんい（ふちの 地ならしを ふくむ）は はじまりの木の 列と 岩山の 円に かからない', (seed) => {
    const rec = recOf(seed);
    expect(rec).not.toBeNull();
    const f = startFeaturesOf(seed);
    const m = TOWN.keepMargin;
    const x0 = rec!.x0 - m, z0 = rec!.z0 - m, x1 = rec!.x0 + N - 1 + m, z1 = rec!.z0 + N - 1 + m;
    expect(f.trees).toHaveLength(3);
    for (const t of f.trees) expect(t.x >= x0 && t.x <= x1 && t.z >= z0 && t.z <= z1, `木 (${t.x}, ${t.z})`).toBe(false);
    const r = f.rock;
    expect(r.cx + r.r >= x0 && r.cx - r.r <= x1 && r.cz + r.r >= z0 && r.cz - r.r <= z1, '岩山').toBe(false);
  });
});
