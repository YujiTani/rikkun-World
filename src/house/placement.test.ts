import { describe, expect, it } from 'vitest';
import { terrainAt } from '../world/gen/terrain';
import { SEA_Y } from '../contracts';
import {
  REGION_SIZE,
  firstCandidates,
  landColumn,
  placeFirst,
  placeInRegion,
  regionHasArchitect,
  regionIndex,
  regionRoll,
  spotCandidates,
} from './placement';

/** HOUSE-1A AC1・AC2: 建築士さんの 置き方（シードで 決まる 純粋な 関数） */

const SPAWN = { x: 64, z: 64 };
const SEEDS = [20261012, 1, 2, 3, 99];

describe('AC1 最初の 1 人: スタートから 横 6〜10 マス・北がわ・同じ シードなら 同じ 座標', () => {
  it('候補は ぜんぶ スタートからの XZ の 直線きょりが 6〜10（マスの まん中どうし）', () => {
    for (const seed of SEEDS) {
      const c = firstCandidates(seed, SPAWN);
      expect(c.length).toBeGreaterThan(20);
      for (const p of c) {
        const d = Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z);
        expect(d, `${seed}: (${p.x}, ${p.z})`).toBeGreaterThanOrEqual(6);
        expect(d, `${seed}: (${p.x}, ${p.z})`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('同じ 候補が 2 つ ない・同じ シードで 2 回 作ると 同じ 並び', () => {
    for (const seed of SEEDS) {
      const a = firstCandidates(seed, SPAWN);
      expect(new Set(a.map((p) => `${p.x},${p.z}`)).size).toBe(a.length);
      expect(firstCandidates(seed, SPAWN)).toEqual(a);
    }
  });

  it('先頭は スタートの 画面から 見える 北がわ（向き 0° から 40° 以内）。シードごとに ばらける', () => {
    const heads = new Set<string>();
    for (const seed of [...SEEDS, 7, 8, 9, 10, 11, 12]) {
      const p = firstCandidates(seed, SPAWN)[0]!;
      const deg = (Math.atan2(p.x - SPAWN.x, -(p.z - SPAWN.z)) * 180) / Math.PI;
      expect(Math.abs(deg), `${seed}`).toBeLessThanOrEqual(40);
      heads.add(`${p.x},${p.z}`);
    }
    expect(heads.size).toBeGreaterThan(3);
  });

  it('placeFirst: 立てる 最初の 候補を えらぶ。立てない 所は とばして 次へ。ぜんぶ だめなら null', () => {
    const all = firstCandidates(1, SPAWN);
    expect(placeFirst(1, SPAWN, () => true)).toEqual(all[0]);
    const skip = new Set([`${all[0]!.x},${all[0]!.z}`, `${all[1]!.x},${all[1]!.z}`]);
    expect(placeFirst(1, SPAWN, (x, z) => !skip.has(`${x},${z}`))).toEqual(all[2]);
    expect(placeFirst(1, SPAWN, () => false)).toBeNull();
  });

  it('本物の 地形でも 最初の 1 人は 水の 上に ならない（ふだんの シード）', () => {
    for (const seed of SEEDS) {
      const p = placeFirst(seed, SPAWN, (x, z) => landColumn(seed, x, z));
      expect(p, `${seed}`).not.toBeNull();
      expect(terrainAt(seed, p!.x, p!.z).sea).toBe(false);
    }
  });
});

describe('AC2 ほかの 建築士さん: 192×192 の 区画に 0 か 1 人・3 つに 1 つ・スタートの 区画は 出ない・水の 上には いない', () => {
  it('区画の 番号: 192 ごと（負の 座標でも 切りさげ）', () => {
    expect(REGION_SIZE).toBe(192);
    expect(regionIndex(0)).toBe(0);
    expect(regionIndex(191)).toBe(0);
    expect(regionIndex(192)).toBe(1);
    expect(regionIndex(-1)).toBe(-1);
    expect(regionIndex(-192)).toBe(-1);
    expect(regionIndex(-193)).toBe(-2);
  });

  it('1,000 区画で 出る 区画の わりあいは 1/3 ± 0.05（いくつかの シード）', () => {
    for (const seed of SEEDS) {
      let hit = 0;
      let n = 0;
      for (let rz = -16; rz < 16; rz++) {
        for (let rx = -16; rx < 16; rx++) {
          n++;
          if (regionRoll(seed, rx, rz)) hit++;
        }
      }
      expect(n).toBeGreaterThanOrEqual(1000);
      expect(Math.abs(hit / n - 1 / 3), `${seed}: ${hit}/${n}`).toBeLessThanOrEqual(0.05);
    }
  });

  it('同じ シードなら 同じ（くじも 候補も）・シードが ちがえば ちがう', () => {
    for (const seed of SEEDS) {
      for (let rz = -3; rz <= 3; rz++) {
        for (let rx = -3; rx <= 3; rx++) {
          expect(regionRoll(seed, rx, rz)).toBe(regionRoll(seed, rx, rz));
          expect(spotCandidates(seed, rx, rz)).toEqual(spotCandidates(seed, rx, rz));
        }
      }
    }
    let diff = 0;
    for (let rz = -8; rz < 8; rz++) for (let rx = -8; rx < 8; rx++) if (regionRoll(1, rx, rz) !== regionRoll(2, rx, rz)) diff++;
    expect(diff).toBeGreaterThan(20);
  });

  it('候補は その 区画の 中（ふちから 内がわ）にある', () => {
    for (const seed of SEEDS) {
      for (const [rx, rz] of [[0, 0], [1, 0], [-1, -1], [3, -2], [-5, 4]] as const) {
        const c = spotCandidates(seed, rx, rz);
        expect(c.length).toBeGreaterThanOrEqual(8);
        for (const p of c) {
          expect(regionIndex(p.x)).toBe(rx);
          expect(regionIndex(p.z)).toBe(rz);
          expect(p.x - rx * REGION_SIZE).toBeGreaterThanOrEqual(8);
          expect(p.x - rx * REGION_SIZE).toBeLessThanOrEqual(REGION_SIZE - 8);
        }
      }
    }
  });

  it('スタートの 区画には 最初の 1 人だけ（ほかの 建築士さんは 出ない）', () => {
    for (const seed of SEEDS) {
      const start = { rx: regionIndex(SPAWN.x), rz: regionIndex(SPAWN.z) };
      expect(regionHasArchitect(seed, start.rx, start.rz, SPAWN)).toBe(false);
      // スタートの 区画いがいは くじの とおり
      for (const [rx, rz] of [[1, 0], [0, 1], [-1, 0], [2, 2]] as const) {
        expect(regionHasArchitect(seed, rx, rz, SPAWN)).toBe(regionRoll(seed, rx, rz));
      }
    }
  });

  it('placeInRegion: 立てる 最初の 候補。水の 上には おかない（本物の 地形で 1,000 区画ぜんぶ）', () => {
    const seed = 20261012;
    let placed = 0;
    for (let rz = -16; rz < 16; rz++) {
      for (let rx = -16; rx < 16; rx++) {
        const p = placeInRegion(seed, rx, rz, (x, z) => landColumn(seed, x, z));
        if (!p) continue;
        placed++;
        const t = terrainAt(seed, p.x, p.z);
        expect(t.sea, `(${p.x}, ${p.z})`).toBe(false);
        expect(t.h, `(${p.x}, ${p.z})`).toBeGreaterThanOrEqual(SEA_Y + 2);
      }
    }
    expect(placed).toBeGreaterThan(300);
  });

  it('placeInRegion: 立てる 所が 1 つも なければ null（0 人）', () => {
    expect(placeInRegion(1, 0, 0, () => false)).toBeNull();
  });
});
