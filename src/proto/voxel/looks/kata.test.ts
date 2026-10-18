/**
 * #202 ブロックの「型」のユニットテスト（タスク票 docs/tickets/PERF-3.md の受け入れ基準 1〜4・7）。
 * 前提にした口（いまの試作にある物。developer はこの名前・型のまま作る）:
 *  - kata.ts: KATA_TABLE, KATA_UNDER ('@under'), decideKata(search: string): KataTable
 *  - index.ts: setKataTable(t), kataOf(kind): number, fillBlockLookKata(kind,bx,by,bz,exposed,unique,out,under?),
 *    kataCacheSize(): number（とっておいた型の数）, kataStats: number[]（[毎回計算, 型なしの種類, 型, 地下の型] の数え）
 * 基準 3 の「ふつうの形の 1 つ」は、型の出力が「ある位置の fillBlockLook」と同じことで見る
 * （候補の位置 = 原点まわりの格子 ＋ 遠い位置 (-50040..-49960, -7, 0)。型を遠い位置の形で作る試作の約束）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from '../../../world/blocks/blockTypes';
import '../meshVoxel';
import { KATA_TABLE, KATA_UNDER, decideKata } from './kata';
import {
  ALL_FACES,
  FACE_BIT,
  LOOK_N,
  LOOK_VOLUME,
  fillBlockLook,
  fillBlockLookKata,
  kataCacheSize,
  kataOf,
  setCurrentLook,
  setKataTable,
} from './index';

const indexOf = (id: string): number => BLOCK_TYPES.findIndex((t) => t.id === id);

/** 決定どおりの表（基準 1） */
const EXPECTED: Record<string, number> = {
  leaves: 4, matsu_leaves: 4, momiji_leaves: 4,
  log: 3, bamboo: 3,
  grass: 4, dirt: 4, sand: 4, snow: 4, bedrock: 4,
  stone: 8, coal_ore: 8, iron_ore: 8,
  [KATA_UNDER]: 8,
};

function boundaryEmpty(out: Uint8Array, face: number): number {
  let n = 0;
  for (let y = 0; y < LOOK_N; y++) for (let z = 0; z < LOOK_N; z++) for (let x = 0; x < LOOK_N; x++) {
    const on = [y === 8, y === 0, x === 8, x === 0, z === 8, z === 0][face];
    if (on && out[(y * 9 + z) * 9 + x] === 0) n++;
  }
  return n;
}

const key = (a: Uint8Array): string => Array.from(a).join(',');

/** 位置の見本（原点まわり） */
function samples(): [number, number, number][] {
  const r: [number, number, number][] = [];
  for (let x = -6; x < 10; x++) for (let z = -6; z < 10; z++) for (const y of [-3, 4, 40]) r.push([x * 3 + (z & 1), y, z * 2 + (x & 1)]);
  return r;
}

beforeEach(() => {
  setCurrentLook('gotsugotsu');
  setKataTable(decideKata(''));
});

describe('基準 1: 型の表は決定どおり', () => {
  it('KATA_TABLE は 決定どおり（地下 @under 8 を含む）', () => {
    expect({ ...KATA_TABLE }).toEqual(EXPECTED);
  });

  it('表の種類は kataOf が 表の数を返す。表に無い種類は 0（型を使わない）', () => {
    for (const t of BLOCK_TYPES) {
      expect(kataOf(indexOf(t.id)), t.id).toBe(t.id in EXPECTED ? EXPECTED[t.id] : 0);
    }
    expect(kataOf(indexOf('water'))).toBe(0);
    expect(kataOf(indexOf('brick'))).toBe(0);
  });

  it('表に無い種類は 型を使わず fillBlockLook と同じ（型は作らない）', () => {
    const a = new Uint8Array(LOOK_VOLUME);
    const b = new Uint8Array(LOOK_VOLUME);
    const k = indexOf('brick');
    for (let i = 0; i < 20; i++) {
      fillBlockLookKata(k, i * 5, 3, i, ALL_FACES, false, a);
      fillBlockLook(k, i * 5, 3, i, ALL_FACES, b);
      expect(key(a)).toBe(key(b));
    }
    expect(kataCacheSize()).toBe(0);
  });
});

describe('基準 2: 切りかえ（?kata=）', () => {
  it('既定（?kata なし）は この表', () => {
    expect({ ...decideKata('') }).toEqual(EXPECTED);
    expect({ ...decideKata('?look=gotsugotsu') }).toEqual(EXPECTED);
  });

  it('?kata=off は 型なし（毎回計算）', () => {
    const t = decideKata('?kata=off');
    expect(Object.values(t).filter((n) => n > 0)).toEqual([]);
    setKataTable(t);
    for (const id of Object.keys(EXPECTED)) if (id !== KATA_UNDER) expect(kataOf(indexOf(id)), id).toBe(0);
    const a = new Uint8Array(LOOK_VOLUME);
    const b = new Uint8Array(LOOK_VOLUME);
    fillBlockLookKata(indexOf('stone'), 4, 5, 6, ALL_FACES, false, a);
    fillBlockLook(indexOf('stone'), 4, 5, 6, ALL_FACES, b);
    expect(key(a)).toBe(key(b));
    expect(kataCacheSize()).toBe(0);
  });

  for (const n of [4, 8, 16]) {
    it(`?kata=${n} は 表にある種類ぜんぶ ${n} 通り。表に無い種類は 0`, () => {
      setKataTable(decideKata(`?kata=${n}`));
      for (const id of Object.keys(EXPECTED)) if (id !== KATA_UNDER) expect(kataOf(indexOf(id)), id).toBe(n);
      expect(kataOf(indexOf('water'))).toBe(0);
    });
  }

  it('&kataUnder=K で 地下の数を上書き（?kata の指定があっても）', () => {
    expect(decideKata('?kataUnder=3')[KATA_UNDER]).toBe(3);
    expect(decideKata('?kataUnder=0')[KATA_UNDER]).toBe(0);
    expect(decideKata('?kata=4&kataUnder=16')[KATA_UNDER]).toBe(16);
    expect(decideKata('?kata=4&kataUnder=16')['stone']).toBe(4);
    expect(decideKata('?kataUnder=3')['stone']).toBe(8);
  });
});

describe('基準 3: 型の出力は 位置で決まり、ふつうの形の 1 つ。ちがう出力は K 通り以下', () => {
  const kinds = Object.keys(EXPECTED).filter((id) => id !== KATA_UNDER);
  const faceSets = [ALL_FACES, 1, 1 | 4 | 16, ALL_FACES & ~FACE_BIT[1], 2 | 8];

  it('同じ（種類・見える面・位置）からは いつも同じ 729 マス', () => {
    const a = new Uint8Array(LOOK_VOLUME);
    const b = new Uint8Array(LOOK_VOLUME);
    for (const id of kinds) for (const [x, y, z] of samples().slice(0, 40)) {
      fillBlockLookKata(indexOf(id), x, y, z, ALL_FACES, false, a);
      fillBlockLookKata(indexOf(id), x, y, z, ALL_FACES, false, b);
      expect(key(a), id).toBe(key(b));
    }
  });

  it('（種類・見える面）ごとの ちがう出力は 表の数以下。1 通りでは ない', () => {
    const out = new Uint8Array(LOOK_VOLUME);
    for (const id of kinds) for (const e of faceSets) {
      const seen = new Set<string>();
      for (const [x, y, z] of samples()) {
        fillBlockLookKata(indexOf(id), x, y, z, e, false, out);
        seen.add(key(out));
      }
      expect(seen.size, `${id} e=${e}`).toBeLessThanOrEqual(EXPECTED[id]);
      if (id === 'stone' && e === ALL_FACES) expect(seen.size, 'stone は ばらつく').toBeGreaterThan(1);
    }
  });

  it('地下（under=true）の出力も 地下の数（8）以下で、位置で決まる', () => {
    const out = new Uint8Array(LOOK_VOLUME);
    const again = new Uint8Array(LOOK_VOLUME);
    for (const id of ['stone', 'dirt', 'coal_ore']) {
      const seen = new Set<string>();
      for (const [x, y, z] of samples()) {
        fillBlockLookKata(indexOf(id), x, y, z, ALL_FACES, false, out, true);
        fillBlockLookKata(indexOf(id), x, y, z, ALL_FACES, false, again, true);
        expect(key(out)).toBe(key(again));
        seen.add(key(out));
      }
      expect(seen.size, id).toBeLessThanOrEqual(8);
      expect(seen.size, id).toBeGreaterThan(1);
    }
    // ?kataUnder=3 なら 3 通り以下
    setKataTable(decideKata('?kataUnder=3'));
    const seen = new Set<string>();
    for (const [x, y, z] of samples()) {
      fillBlockLookKata(indexOf('stone'), x, y, z, ALL_FACES, false, out, true);
      seen.add(key(out));
    }
    expect(seen.size).toBeLessThanOrEqual(3);
  });

  it('どの出力も「ある位置の fillBlockLook」と同じ（ふつうの形の 1 つ）', () => {
    const pool: [number, number, number][] = samples();
    for (let x = -50040; x < -49960; x++) pool.push([x, -7, 0]);
    const out = new Uint8Array(LOOK_VOLUME);
    const ref = new Uint8Array(LOOK_VOLUME);
    for (const id of ['stone', 'leaves', 'log', 'grass']) for (const e of [ALL_FACES, 1]) {
      const normal = new Set<string>();
      for (const [x, y, z] of pool) {
        fillBlockLook(indexOf(id), x, y, z, e, ref);
        normal.add(key(ref));
      }
      for (const [x, y, z] of samples().slice(0, 60)) {
        fillBlockLookKata(indexOf(id), x, y, z, e, false, out);
        expect(normal.has(key(out)), `${id} e=${e}`).toBe(true);
      }
    }
  });

  it('unique=true（水のそば）は 型を使わず fillBlockLook と同じ', () => {
    const a = new Uint8Array(LOOK_VOLUME);
    const b = new Uint8Array(LOOK_VOLUME);
    for (const [x, y, z] of samples().slice(0, 40)) {
      fillBlockLookKata(indexOf('stone'), x, y, z, ALL_FACES, true, a);
      fillBlockLook(indexOf('stone'), x, y, z, ALL_FACES, b);
      expect(key(a)).toBe(key(b));
    }
  });
});

describe('基準 4: 型の出力も 見えない面の外がわは つまっている', () => {
  it('はっぱ以外の 表の種類（地下の型も）で、見えない面の外がわに すきまが無い', () => {
    const out = new Uint8Array(LOOK_VOLUME);
    const kinds = Object.keys(EXPECTED).filter((id) => id !== KATA_UNDER && !id.includes('leaves'));
    for (const under of [false, true]) for (const id of kinds) for (let h = 0; h < 12; h++) for (let face = 0; face < 6; face++) {
      fillBlockLookKata(indexOf(id), h * 7, 3, h * 3, ALL_FACES & ~FACE_BIT[face], false, out, under);
      expect(boundaryEmpty(out, face), `${id} under=${under} face ${face}`).toBe(0);
    }
    fillBlockLookKata(indexOf('stone'), 1, 1, 1, 0, false, out);
    expect(out.every((v) => v !== 0)).toBe(true);
  });
});

describe('基準 7: 見た目を切りかえると とっておいた型は捨てる', () => {
  it('setCurrentLook で kataCacheSize が 0 にもどる', () => {
    const out = new Uint8Array(LOOK_VOLUME);
    for (const [x, y, z] of samples().slice(0, 60)) fillBlockLookKata(indexOf('stone'), x, y, z, ALL_FACES, false, out);
    expect(kataCacheSize()).toBeGreaterThan(0);
    setCurrentLook('gotsugotsu');
    expect(kataCacheSize()).toBe(0);
    setCurrentLook('placeholder');
    fillBlockLookKata(indexOf('stone'), 1, 2, 3, ALL_FACES, false, out);
    const n = kataCacheSize();
    expect(n).toBeGreaterThan(0);
    setCurrentLook('gotsugotsu');
    expect(kataCacheSize()).toBe(0);
  });

  it('切りかえたあとの出力は 新しい見た目の物（古い型が残らない）', () => {
    const a = new Uint8Array(LOOK_VOLUME);
    const b = new Uint8Array(LOOK_VOLUME);
    setCurrentLook('placeholder');
    fillBlockLookKata(indexOf('stone'), 1, 2, 3, ALL_FACES, false, a);
    setCurrentLook('gotsugotsu');
    fillBlockLookKata(indexOf('stone'), 1, 2, 3, ALL_FACES, false, b);
    setKataTable(decideKata('?kata=off'));
    fillBlockLook(indexOf('stone'), 1, 2, 3, ALL_FACES, a);
    // 型の出力は ふつうの形の 1 つ。placeholder の型が 残っていたら gotsugotsu の候補に入らない
    const pool = new Set<string>();
    const ref = new Uint8Array(LOOK_VOLUME);
    for (let x = -50040; x < -49960; x++) { fillBlockLook(indexOf('stone'), x, -7, 0, ALL_FACES, ref); pool.add(key(ref)); }
    for (const [x, y, z] of samples()) { fillBlockLook(indexOf('stone'), x, y, z, ALL_FACES, ref); pool.add(key(ref)); }
    expect(pool.has(key(b))).toBe(true);
  });
});
