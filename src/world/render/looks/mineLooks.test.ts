import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from '../../blocks/blockTypes';
import { createPalette } from './common';
import { createMineKinds } from './mineLooks';
import type { KindSpec } from './types';
import {
  ALL_FACES,
  FACE_BIT,
  GRAIN_BODY,
  GRAIN_FIRST,
  LOOK_N,
  LOOK_VOLUME,
  currentLook,
  fillBlockLook,
  grainList,
  grainMapOf,
  setCurrentLook,
} from './index';
import '../voxel/sectionConsts'; // initLooks（番号 → id）

/**
 * MINE-1B（#349）の 見た目の 形: 鉱石 B「とびだす つぶ」・ブロック A（07-mine.md 20.2・20.5）。
 * `mineLooks.fixture.json` = アート担当の 見本の プログラム（docs/art/mine-1/proto/*.py.txt の grain_block・rock_shape）が
 * 同じ 場所（bx, by, bz）・同じ 見える面（e）で 出した 9×9×9。値 = 0 空・1 地の 石・2 以上 = 材料（見本の mats の 並び）。
 * こちらの 形が 見本と 1 マスも ちがわない ことを 確かめる。
 */

interface Sample {
  p: [number, number, number];
  e: number;
  g: string;
}
const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('./mineLooks.fixture.json', import.meta.url)), 'utf8')) as Record<string, Sample[]>;

/** 見本の 材料の 色（k = 2 から）と 地の 石の 色 */
const GRAIN_KINDS: Record<string, { id: string; mats: string[]; body: string; glow?: number[] }> = {
  coal: { id: 'coal_ore', mats: ['#5E5869', '#3A3442', '#2B2632'], body: '#928B80' },
  iron: { id: 'iron_ore', mats: ['#CC8452', '#A85E38', '#82462A'], body: '#928B80' },
  gold: { id: 'kin_ore', mats: ['#FFF0B4', '#EBB840', '#C98A1E'], body: '#928B80' },
  crystal: { id: 'suisho_ore', mats: ['#E0F7FC', '#8CDAF2', '#55A6D2'], body: '#928B80' },
  hotaru: { id: 'hotaruishi', mats: ['#EEF8B2', '#C9E56E', '#93BD52'], body: '#5E6672', glow: [1, 0.85, 0.55] },
  diamond: { id: 'diamond_ore', mats: ['#FBFDFF', '#E3E8F8', '#AEB6DE', '#7880B8', '#FFD3EA', '#FFF1B0'], body: '#928B80' },
};
const BLOCKS = { nendo: 'nendo', sekkaiseki: 'sekkaiseki' } as const;

const indexOf = (id: string): number => BLOCK_TYPES.findIndex((t) => t.id === id);
const hexOfIn = (palette: Uint8Array, idx: number): string => '#' + [0, 1, 2].map((i) => palette[idx * 3 + i]!.toString(16).padStart(2, '0')).join('').toUpperCase();
const hexOf = (idx: number): string => hexOfIn(currentLook().palette, idx);

/** 見本と くらべる 用: 型を とっておかない 形（場所の まま）を 自前の パレットで 作る */
const own = (() => {
  const pal = createPalette();
  const kinds = createMineKinds(pal.P, pal.P('#928B80'), false);
  return { palette: pal.rgb(), kinds: { coal_ore: kinds.coal_ore, iron_ore: kinds.iron_ore, ...kinds.extra } as Record<string, KindSpec> };
})();

/** こちらの 形を 見本と 同じ 数え方〔0 空・1 地・2〜 材料〕の 文字に する（色で 引く） */
function asProto(id: string, bx: number, by: number, bz: number, e: number): string {
  const spec = GRAIN_KINDS[Object.keys(GRAIN_KINDS).find((k) => GRAIN_KINDS[k]!.id === id)!]!;
  const out = new Uint8Array(LOOK_VOLUME);
  own.kinds[id]!.fill(bx, by, bz, e, out);
  return Array.from(out)
    .map((v) => (v === 0 ? '0' : hexOfIn(own.palette, v) === spec.body ? '1' : String(spec.mats.indexOf(hexOfIn(own.palette, v)) + 2)))
    .join('');
}

beforeAll(() => {
  setCurrentLook('gotsugotsu');
});

describe('B「とびだす つぶ」: 見本の プログラムと 1 マスも ちがわない', () => {
  for (const [name, spec] of Object.entries(GRAIN_KINDS)) {
    it(`${spec.id}（${name}）: 見える面ごとの がら・みぞ・地の ほり方が 見本と 同じ`, () => {
      for (const s of FIXTURE[name]!) {
        const got = asProto(spec.id, s.p[0], s.p[1], s.p[2], s.e);
        expect(got.includes('NaN') || got.includes('1.'), 'しらない 色').toBe(false);
        expect(got, `${spec.id} ${JSON.stringify(s.p)} e=${s.e}`).toBe(s.g);
      }
    });
  }
});

describe('A: ねんど（つちと 同じ 4・2・5）・せっかいせき（いしと 同じ 6・3・7）', () => {
  for (const name of Object.keys(BLOCKS) as (keyof typeof BLOCKS)[]) {
    it(`${name}: あな〔0〕の 場所が 見本と 同じ`, () => {
      for (const s of FIXTURE[name]!) {
        const out = new Uint8Array(LOOK_VOLUME);
        own.kinds[name]!.fill(s.p[0], s.p[1], s.p[2], s.e, out);
        const got = Array.from(out).map((v) => (v === 0 ? '0' : '1')).join('');
        expect(got, `${name} ${JSON.stringify(s.p)} e=${s.e}`).toBe(s.g);
      }
    });
  }
});

describe('形の 決まり（looks.test.ts と 同じ）を 鉱石・ブロック 8 つ ぜんぶが まもる', () => {
  const ids = [...Object.values(GRAIN_KINDS).map((k) => k.id), 'nendo', 'sekkaiseki'];
  const boundaryEmpty = (out: Uint8Array, face: number): number => {
    let n = 0;
    for (let y = 0; y < LOOK_N; y++)
      for (let z = 0; z < LOOK_N; z++)
        for (let x = 0; x < LOOK_N; x++) {
          const on = [y === 8, y === 0, x === 8, x === 0, z === 8, z === 0][face];
          if (on && out[(y * 9 + z) * 9 + x] === 0) n++;
        }
    return n;
  };

  it('見えない 面〔となりに くっつく 面〕の 外側は ぜんぶ つまっている・見える 面が 無ければ ぜんぶ 中身', () => {
    const out = new Uint8Array(LOOK_VOLUME);
    for (const id of ids) {
      for (let h = 0; h < 6; h++) {
        for (let face = 0; face < 6; face++) {
          fillBlockLook(indexOf(id), h * 7, 3, h * 3, ALL_FACES & ~FACE_BIT[face]!, out);
          expect(boundaryEmpty(out, face), `${id} 面 ${face}`).toBe(0);
        }
      }
      fillBlockLook(indexOf(id), 1, 1, 1, 0, out);
      expect(out.every((v) => v !== 0), `${id} 見える面なし`).toBe(true);
      fillBlockLook(indexOf(id), 5, 6, 7, ALL_FACES, out);
      expect(out.every((v) => v !== 0), `${id} 3D テクスチャ〔ALL_FACES〕は 穴なし`).toBe(true);
    }
  });

  it('同じ 入力から いつも 同じ 形。場所が ちがうと かわる〔型の 数の 範囲で〕', () => {
    const a = new Uint8Array(LOOK_VOLUME);
    const b = new Uint8Array(LOOK_VOLUME);
    for (const id of ids) {
      fillBlockLook(indexOf(id), 3, 4, 5, 1, a);
      fillBlockLook(indexOf(id), 3, 4, 5, 1, b);
      expect(Array.from(a), id).toEqual(Array.from(b));
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        fillBlockLook(indexOf(id), i * 5, 4, i * 3, 1, b);
        seen.add(b.join(''));
      }
      expect(seen.size, `${id} の 型〔場所で えらぶ〕`).toBeGreaterThan(1);
    }
  });
});

describe('つぶの 色の 表（格子の 値・シェーダーの 色）', () => {
  it('つぶの ある 種類は 鉱石 6 つ。ふつうの 種類には ない', () => {
    const withGrain = BLOCK_TYPES.map((t, i) => (grainMapOf(i) ? t.id : null)).filter((x) => x !== null);
    expect(withGrain.sort()).toEqual(['coal_ore', 'diamond_ore', 'hotaruishi', 'iron_ore', 'kin_ore', 'suisho_ore']);
    expect(grainMapOf(indexOf('stone'))).toBeUndefined();
    expect(grainMapOf(indexOf('nendo'))).toBeUndefined();
  });

  it('色番号 → 格子の 値: 空 0・地の 石 GRAIN_BODY・つぶ GRAIN_FIRST から 通し番号〔ブロックの 番号の 順〕', () => {
    const find = (hex: string): number => {
      for (let i = 1; i < currentLook().palette.length / 3; i++) if (hexOf(i) === hex) return i;
      return -1;
    };
    let next = GRAIN_FIRST;
    for (const spec of Object.values(GRAIN_KINDS).sort((a, b) => indexOf(a.id) - indexOf(b.id))) {
      const m = grainMapOf(indexOf(spec.id))!;
      expect(m[0], `${spec.id} 空`).toBe(0);
      if (spec.id === 'hotaruishi') {
        expect(m[find(spec.body)], 'ほたるいしの 地は 自分の 色〔つぶの 1 つ〕').toBe(next++);
      } else {
        expect(m[find(spec.body)], `${spec.id} 地の 石`).toBe(GRAIN_BODY);
      }
      for (const hex of spec.mats) expect(m[find(hex)], `${spec.id} ${hex}`).toBe(next++);
    }
    expect(next - GRAIN_FIRST, '通しの 数').toBe(grainList().length);
  });

  it('シェーダーの 色: 見本の 色〔sRGB〕のまま。光るのは ほたるいしの 3 色だけ〔1.0・0.85・0.55〕。ダイヤは 光らない', () => {
    const list = grainList();
    const lit = list.filter((g) => g.glow > 0).map((g) => g.glow);
    expect(lit.sort()).toEqual([0.55, 0.85, 1]);
    const hexes = list.map((g) => '#' + [g.r, g.g, g.b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase());
    for (const spec of Object.values(GRAIN_KINDS)) for (const hex of spec.mats) expect(hexes, spec.id).toContain(hex);
    for (const hex of GRAIN_KINDS.diamond!.mats) {
      const g = list[hexes.indexOf(hex)]!;
      expect(g.glow, `ダイヤ ${hex}`).toBe(0);
    }
  });

  it('つぶの 色は 地の 石〔ふつうの 石の 色〕と かさならない', () => {
    for (const spec of Object.values(GRAIN_KINDS)) {
      const hexes = new Set(spec.mats);
      expect(hexes.has(spec.body), `${spec.id}`).toBe(false);
    }
    expect(grainList().length).toBeLessThanOrEqual(30);
  });
});
