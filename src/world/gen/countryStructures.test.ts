import { describe, expect, it, vi } from 'vitest';
import { CHUNK_SIZE, WORLD_HEIGHT, type BlockArray } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { mountainFrame } from './biome';
import { featuresNearChunk, writeFeatureBlocks } from './countryFeatureBlocks';
import { featureSitesInRect, featureSitesTouching, type FeatureSite } from './countryFeatures';
import { LAYER } from './columnLayout';
import { regionRect } from './region';
import { terrainFor } from './terrain';

// ?structures=1 の つもりで 試す（既定の 世界の ふるまいは countryMountain.test.ts などが 見る）
vi.mock('./countryStructures', async (orig) => ({ ...(await orig<typeof import('./countryStructures')>()), STRUCTURES_ON: true }));

const seed = 20261012;
const T = terrainFor(seed);

/** 山の点（種類ごと）を 先頭から n こ */
function mountains(kind: string, n: number): { px: number; pz: number }[] {
  const out: { px: number; pz: number }[] = [];
  for (let fz = -12; fz <= 12 && out.length < n; fz++) {
    for (let fx = -12; fx <= 12 && out.length < n; fx++) {
      const m = mountainFrame(seed, fx, fz).mountain;
      if (m && m.kind === kind && !out.some((o) => o.px === m.px && o.pz === m.pz)) out.push({ px: m.px, pz: m.pz });
    }
  }
  return out;
}

const sitesAround = (m: { px: number; pz: number }, types: string[]): FeatureSite[] =>
  featureSitesTouching(seed, m.px - 160, m.pz - 160, m.px + 160, m.pz + 160).filter((s) => types.includes(s.type));

describe('山の上の 目じるし（?structures=1）', () => {
  it('てんぐの やま: お堂が あり、石段が あれば とりいは 石段の 下（お堂より ひくい）。かいだん・とうろうの 古い 物は 出ない', () => {
    const ms = mountains('tengu', 6);
    expect(ms.length).toBeGreaterThan(0);
    let withAll = 0;
    for (const m of ms) {
      const all = featureSitesTouching(seed, m.px - 160, m.pz - 160, m.px + 160, m.pz + 160);
      expect(all.some((s) => s.type === 'kaidan' && Math.abs(s.x - m.px) < 120 && Math.abs(s.z - m.pz) < 120), '古い かいだん').toBe(false);
      const odou = all.find((s) => s.type === 'odou' && Math.abs(s.x - m.px) < 20 && Math.abs(s.z - m.pz) < 20);
      if (!odou) continue;
      const ishidan = all.find((s) => s.type === 'ishidan' && Math.abs(s.x - m.px) < 30);
      const torii = all.find((s) => s.type === 'torii' && ishidan && Math.abs(s.x - ishidan.x) < 120);
      if (ishidan && torii) {
        withAll++;
        expect(torii.y, 'とりいは お堂より 下').toBeLessThan(odou.y);
        expect(ishidan.path?.length ?? 0).toBeGreaterThan(0);
      }
    }
    expect(withAll, 'お堂・石段・とりいが ぜんぶ ある 山').toBeGreaterThanOrEqual(1);
  });

  it('もみじやま: あずまやが 頂上の ちかく、とりいが あずまやより 下の 広場に ある（山が ある 限り）', () => {
    const ms = mountains('momiji', 6);
    expect(ms.length).toBeGreaterThan(0);
    let az = 0;
    let tor = 0;
    for (const m of ms) {
      const s = sitesAround(m, ['azumaya', 'torii']).filter((q) => Math.abs(q.x - m.px) < 60 && Math.abs(q.z - m.pz) < 60);
      const a = s.find((q) => q.type === 'azumaya');
      const t = s.find((q) => q.type === 'torii');
      if (a) az++;
      if (t) tor++;
      if (a && t) expect(t.y).toBeLessThanOrEqual(a.y);
    }
    expect(az).toBeGreaterThanOrEqual(1);
    expect(tor).toBeGreaterThanOrEqual(1);
  });

  it('ゆきやまには 置かない。いわやまには 石の 目じるし（石ぞう・いしの とりい）だけ', () => {
    for (const m of mountains('yuki', 3)) expect(sitesAround(m, ['odou', 'torii', 'azumaya', 'ishidan', 'sekizou', 'hokora', 'ido', 'yagura', 'ojizou', 'ishi_torii'])).toEqual([]);
    let zou = 0;
    let tor = 0;
    for (const m of mountains('iwayama', 8)) {
      const s = sitesAround(m, ['odou', 'torii', 'azumaya', 'ishidan', 'sekizou', 'ishi_torii']);
      expect(s.filter((q) => ['odou', 'torii', 'azumaya', 'ishidan'].includes(q.type)), 'いわやま').toEqual([]);
      expect(s.filter((q) => q.type === 'sekizou').length, '1 つの 山に 0〜1').toBeLessThanOrEqual(1);
      zou += s.filter((q) => q.type === 'sekizou').length;
      tor += s.filter((q) => q.type === 'ishi_torii').length;
    }
    expect(zou).toBeGreaterThanOrEqual(1);
    expect(tor).toBeGreaterThanOrEqual(1);
  });

  it('石ぞうは かべの 前（うしろの 地面が 高い）に 立つ。おじぞうさんは 石段の わき・やぐらは お堂の ちかく・ほこら・いどは もみじやま', () => {
    let wall = 0;
    for (const m of mountains('iwayama', 8)) {
      for (const z of sitesAround(m, ['sekizou'])) {
        const higher = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => T.height(z.x + dx! * 6, z.z + dz! * 6) >= z.y + 2);
        expect(higher, '石ぞうの うしろは かべ').toBe(true);
        wall++;
      }
    }
    expect(wall).toBeGreaterThanOrEqual(1);
    let jizou = 0;
    let yagura = 0;
    for (const m of mountains('tengu', 8)) {
      const all = sitesAround(m, ['odou', 'ishidan', 'ojizou', 'yagura', 'ido']);
      const odou = all.find((q) => q.type === 'odou');
      const st = all.find((q) => q.type === 'ishidan');
      if (!odou) continue;
      for (const j of all.filter((q) => q.type === 'ojizou')) {
        jizou++;
        expect(st, '石段が ある').toBeDefined();
        expect(Math.min(...st!.path!.map((p) => Math.max(Math.abs(p.x - j.x), Math.abs(p.z - j.z)))), '石段の わき').toBeLessThanOrEqual(12);
      }
      for (const y of all.filter((q) => q.type === 'yagura')) {
        yagura++;
        expect(Math.max(Math.abs(y.x - odou.x), Math.abs(y.z - odou.z))).toBeLessThanOrEqual(18);
      }
    }
    expect(jizou).toBeGreaterThanOrEqual(1);
    expect(yagura).toBeGreaterThanOrEqual(1);
    let hokora = 0;
    for (const m of mountains('momiji', 8)) hokora += sitesAround(m, ['hokora']).length;
    expect(hokora).toBeGreaterThanOrEqual(1);
  });

  it('はじまりの 範囲（regionRect）には 置かない・どの ブロックも 世界の 高さの 中', () => {
    const r = regionRect(seed);
    for (const kind of ['tengu', 'momiji', 'iwayama']) {
      for (const m of mountains(kind, 6)) {
        for (const s of sitesAround(m, ['odou', 'torii', 'azumaya', 'ishidan', 'yagura', 'ido', 'ojizou', 'hokora', 'sekizou', 'ishi_torii'])) {
          expect(s.foot[2] < r.x0 || s.foot[0] >= r.x1 || s.foot[3] < r.z0 || s.foot[1] >= r.z1, `${s.type} が 範囲に かかる`).toBe(true);
          for (const b of s.blocks) expect(b.y >= 1 && b.y < WORLD_HEIGHT).toBe(true);
        }
      }
    }
  });

  it('チャンクを またいでも 切れない: 足もとが かかる どの チャンクにも 置く 物が 渡り、各チャンクは 自分の ぶんだけ 書いて 全部 そろう。作る 順に 関係ない', () => {
    const m = mountains('tengu', 6).find((q) => sitesAround(q, ['odou']).length > 0)!;
    const sites = sitesAround(m, ['odou', 'ishidan', 'torii']);
    expect(sites.length).toBeGreaterThan(0);
    const chunks = new Set<string>();
    for (const s of sites) for (const b of s.blocks) chunks.add(`${b.x >> 4},${b.z >> 4}`);
    expect(chunks.size, '2 つ 以上の チャンクに またがる').toBeGreaterThan(1);
    const order = [...chunks].reverse(); // ふつうと 逆の 順で 作る
    const built = new Map<string, BlockArray>();
    for (const k of order) {
      const [cx, cz] = k.split(',').map(Number) as [number, number];
      const out: BlockArray = new Uint16Array(WORLD_HEIGHT * LAYER);
      writeFeatureBlocks(out, featuresNearChunk(seed, cx * CHUNK_SIZE, cz * CHUNK_SIZE), cx * CHUNK_SIZE, cz * CHUNK_SIZE);
      built.set(k, out);
    }
    // 同じ マスに 2 つの 物が かさなる 時は あとの 物が かつ ので、あとから 書いた 順（site の 並び）で 最後の 1 つを 期待する
    const want = new Map<string, number>();
    for (const s of featureSitesTouching(seed, m.px - 160, m.pz - 160, m.px + 160, m.pz + 160)) {
      for (const b of s.blocks) if (b.y >= 1 && b.y < WORLD_HEIGHT) want.set(`${b.x},${b.y},${b.z}`, BLOCK_INDEX[b.id]);
    }
    let checked = 0;
    for (const s of sites) {
      for (const b of s.blocks) {
        const out = built.get(`${b.x >> 4},${b.z >> 4}`)!;
        const got = out[b.y * LAYER + (b.z & 15) * CHUNK_SIZE + (b.x & 15)];
        expect(got, `${b.x},${b.y},${b.z}`).toBe(want.get(`${b.x},${b.y},${b.z}`));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('同じ シードなら 場所も ブロックも 同じ', () => {
    const m = mountains('momiji', 1)[0]!;
    const a = featureSitesInRect(seed, m.px - 60, m.pz - 60, m.px + 60, m.pz + 60);
    const b = featureSitesInRect(seed, m.px - 60, m.pz - 60, m.px + 60, m.pz + 60);
    expect(a.map((s) => s.blocks.length)).toEqual(b.map((s) => s.blocks.length));
    expect(T.seed).toBe(seed);
  });
});
