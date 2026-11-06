import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEA_Y } from '../../contracts';
import { CHUNK_FORMAT_VERSION } from '../../save/chunkCodec';
import { BLOCK_IDS_V1 } from '../../save/blockIdsV1';
import { SAVE_GEN, SAVE_VERSION } from '../../save/SaveManager';
import { generateChunk } from '../gen/chunk';
import { sectionToArray } from '../sections';
import { BLOCK_INDEX, BLOCK_TYPES } from './blockTypes';
import { isDeepWater, isWater, isWaterIndex, waterAmount, waterId, waveOffset } from './water';

/**
 * WATER-1（docs/design/WATER-1.md）の ユニット: AC1（番号）・AC2（判定と 置きかえ）・AC16（ゆらめきの 純関数）。
 * 実装の まえに 書いた テスト（`water.ts` が まだ 無いので 落ちるのが 正しい）。
 */

/** WATER-1 の まえの ブロックの 並び（147 こ）。番号は これを かえない（うしろに 足す だけ）。BLOCK_TYPES から 作らない */
const BEFORE_WATER1: readonly string[] = [
  'air', 'grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'water', 'bedrock', 'furnace', 'kawara', 'brick', 'torch',
  'start_torch', 'tansu', 'farmland', 'farmland_wet', 'crop_onion', 'crop_tomato', 'crop_pumpkin', 'crop_eggplant', 'wild_onion', 'wild_tomato',
  'wild_pumpkin', 'wild_eggplant', 'kakashi', 'kakashi_head', 'saku', 'sprinkler', 'snow', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o',
  'flower_p', 'bamboo', 'susuki', 'kusa', 'nobana', 'nukunuku', 'toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box', 'nukunuku_e',
  'nukunuku_s', 'nukunuku_se', 'geyser_dirt', 'lantern', 'futon', 'haniwa', 'futon_s', 'futon_w', 'futon_n', 'futon_foot_e', 'futon_foot_s',
  'futon_foot_w', 'futon_foot_n', 'nendo', 'sekkaiseki', 'shikkui', 'hotaruishi', 'kin_ore', 'suisho_ore', 'diamond_ore', 'chalk_mark',
  'chalk_mark_up_e', 'chalk_mark_up_s', 'chalk_mark_up_w', 'chalk_mark_n_e', 'chalk_mark_n_w', 'chalk_mark_s_e', 'chalk_mark_s_w', 'chalk_mark_e_n',
  'chalk_mark_e_s', 'chalk_mark_w_n', 'chalk_mark_w_s', 'house_floor', 'house_wall', 'house_roof', 'shoji', 'house_door', 'house_door_top',
  'house_door_open', 'house_door_open_top', 'tansu_w', 'tansu_n', 'tansu_e', 'furnace_w', 'furnace_n', 'furnace_e', 'chair', 'chair_w', 'chair_n',
  'chair_e', 'shelf', 'shelf_w', 'shelf_n', 'shelf_e', 'andon', 'andon_w', 'andon_n', 'andon_e', 'stool', 'stool_w', 'stool_n', 'stool_e',
  'round_table', 'round_table_w', 'round_table_n', 'round_table_e', 'table', 'table_w', 'table_n', 'table_e', 'table_2', 'table_2_w', 'table_2_n',
  'table_2_e', 'ofuro', 'ofuro_w', 'ofuro_n', 'ofuro_e', 'ofuro_2', 'ofuro_2_w', 'ofuro_2_n', 'ofuro_2_e', 'long_table', 'long_table_w',
  'long_table_n', 'long_table_e', 'long_table_2', 'long_table_2_w', 'long_table_2_n', 'long_table_2_e', 'long_table_3', 'long_table_3_w',
  'long_table_3_n', 'long_table_3_e', 'katame_tsuchi', 'ashiba_x', 'ashiba_z', 'ashiba_deck_x', 'ashiba_deck_z', 'ashiba_flag',
];

/** 量 1 の 水の 番号 W0 = 足す ときの 種類の 数 以上で いちばん 小さい 8 の 倍数（§4.6。今 147 → 152） */
const W0 = Math.ceil(BEFORE_WATER1.length / 8) * 8;
const WATER_IDS = ['water_1', 'water_2', 'water_3', 'water_4', 'water_5', 'water_6', 'water_7'] as const;
/** 量 n（1〜7）の id。BlockId に 無い うちは ここで 型が 落ちる（赤） */
const idOf = (n: number) => WATER_IDS[n - 1];

describe('AC1 番号（§4.6）', () => {
  it('WATER-1 の まえの 147 この 番号は かわらない。BLOCK_IDS_V1（版 1 の 31 こ）の 番号も 同じ', () => {
    expect(BEFORE_WATER1).toHaveLength(147);
    expect(BLOCK_TYPES.slice(0, BEFORE_WATER1.length).map((t) => t.id)).toEqual(BEFORE_WATER1);
    expect(BLOCK_TYPES.slice(0, BLOCK_IDS_V1.length).map((t) => t.id)).toEqual([...BLOCK_IDS_V1]);
    expect(BLOCK_INDEX.water).toBe(9);
  });

  it('water_1 の 番号は 8 の 倍数（W0）。water_n は W0 + (n − 1)。(番号 & 7) + 1 = 量。waterAmount と waterId が もどせる', () => {
    expect(BLOCK_INDEX[idOf(1)] % 8).toBe(0);
    expect(BLOCK_INDEX[idOf(1)]).toBe(W0);
    for (let n = 1; n <= 7; n++) {
      const idx = BLOCK_INDEX[idOf(n)];
      expect(idx, `water_${n} の 番号`).toBe(W0 + n - 1);
      expect((idx & 7) + 1, `(番号 & 7) + 1 = ${n}`).toBe(n);
      expect(idx >> 3, '量 1〜7 は 同じ 組（番号 >> 3）').toBe(W0 >> 3);
      expect(BLOCK_TYPES[idx].id).toBe(idOf(n));
      expect(waterAmount(idOf(n)), `waterAmount('water_${n}')`).toBe(n);
      expect(waterAmount(idx), `waterAmount(${idx})`).toBe(n);
      expect(waterId(n)).toBe(idOf(n));
    }
    expect(waterId(8)).toBe('water');
    expect(waterId(0)).toBe('air');
    expect(waterAmount('water')).toBe(8);
    expect(waterAmount(BLOCK_INDEX.water)).toBe(8);
    expect(waterAmount('air')).toBe(0);
    expect(waterAmount(0)).toBe(0);
    expect(waterAmount('stone')).toBe(0);
    expect(waterAmount('outside')).toBe(0);
    expect(waterAmount(-1)).toBe(0);
  });

  it('予約: W0 までの 空き（今 147〜151）と W0 + 7（今 159）は reserved_<番号>。固くない・こわれない・名前 くうき。のこりは 次の ブロックが W0 + 8 から', () => {
    const reserved = [...Array.from({ length: W0 - BEFORE_WATER1.length }, (_, i) => BEFORE_WATER1.length + i), W0 + 7];
    expect(reserved.length).toBeGreaterThan(0);
    for (const i of reserved) {
      const t = BLOCK_TYPES[i];
      expect(t.id, `${i} 番`).toBe(`reserved_${i}`);
      expect(t.solid).toBe(false);
      expect(t.breakable).toBe(false);
      expect(t.name).toBe('くうき');
    }
    expect(BLOCK_TYPES.length, '次の ブロックは W0 + 8 から').toBeGreaterThanOrEqual(W0 + 8);
    expect(BLOCK_TYPES.length, '番号は 255 まで（Uint8）').toBeLessThanOrEqual(256);
  });

  it('量 1〜7 の 種類: 名前 みず・固くない・こわれない', () => {
    for (let n = 1; n <= 7; n++) {
      const t = BLOCK_TYPES[BLOCK_INDEX[idOf(n)]];
      expect(t).toMatchObject({ id: idOf(n), name: 'みず', solid: false, breakable: false });
    }
  });

  it('生成した 列 4 つ（海を ふくむ）に 予約の 番号は 0 こ。量 1〜7 の 水も 0 こ（生成の 水は 量 8）', () => {
    const bad = new Set<number>([...Array.from({ length: W0 - BEFORE_WATER1.length }, (_, i) => BEFORE_WATER1.length + i), W0 + 7]);
    for (let n = 1; n <= 7; n++) bad.add(W0 + n - 1);
    let seaCells = 0;
    for (const [cx, cz] of [[-8, -8], [-7, -8], [-8, -7], [-7, -7]]) {
      for (const s of generateChunk(7, cx, cz).sections) {
        const a = sectionToArray(s);
        for (let i = 0; i < a.length; i++) {
          expect(bad.has(a[i]), `列 (${cx},${cz}) に 番号 ${a[i]}`).toBe(false);
          if (a[i] === BLOCK_INDEX.water) seaCells++;
        }
      }
    }
    expect(seaCells, '海の 列を えらべている').toBeGreaterThan(0);
    expect(SEA_Y).toBeGreaterThan(0);
  });

  it('保存の 版は かえない（SAVE_GEN・SAVE_VERSION・列の 形の 版）', () => {
    expect(SAVE_GEN).toBe(4);
    expect(SAVE_VERSION).toBe(1);
    expect(CHUNK_FORMAT_VERSION).toBe(2);
  });
});

describe('AC2 判定（§4.6）', () => {
  it('isWater: 量 1〜8 で true。air・石・世界の外 は false', () => {
    for (let n = 1; n <= 8; n++) expect(isWater(waterId(n)), `量 ${n}`).toBe(true);
    for (const id of ['air', 'stone', 'torch', 'crop_tomato', 'outside'] as const) expect(isWater(id), id).toBe(false);
    for (let i = 0; i < BLOCK_TYPES.length; i++) {
      const w = BLOCK_TYPES[i].id === 'water' || /^water_[1-7]$/.test(BLOCK_TYPES[i].id);
      expect(isWater(BLOCK_TYPES[i].id), BLOCK_TYPES[i].id).toBe(w);
    }
  });

  it('isDeepWater: 量 3 まで false・量 4 から 8 まで true（waterDeep = 4）。air・石は false', () => {
    for (let n = 1; n <= 3; n++) expect(isDeepWater(waterId(n)), `量 ${n}`).toBe(false);
    for (let n = 4; n <= 8; n++) expect(isDeepWater(waterId(n)), `量 ${n}`).toBe(true);
    expect(isDeepWater('air')).toBe(false);
    expect(isDeepWater('stone')).toBe(false);
    expect(isDeepWater('outside')).toBe(false);
  });

  it('isWaterIndex: 番号で 1〜8。予約・air・世界の外（−1）は false', () => {
    for (let n = 1; n <= 8; n++) expect(isWaterIndex(BLOCK_INDEX[waterId(n)]), `量 ${n}`).toBe(true);
    expect(isWaterIndex(BLOCK_INDEX.air)).toBe(false);
    expect(isWaterIndex(BLOCK_INDEX.stone)).toBe(false);
    expect(isWaterIndex(-1)).toBe(false);
    expect(isWaterIndex(W0 + 7), 'reserved').toBe(false);
    expect(isWaterIndex(W0 - 1), 'reserved').toBe(false);
    for (let i = 0; i < BLOCK_TYPES.length; i++) expect(isWaterIndex(i), BLOCK_TYPES[i].id).toBe(isWater(BLOCK_TYPES[i].id));
  });
});

/** src の ファイル（テスト・試作 proto・テスト用の キット・water.ts は のぞく）を 集める */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'proto' || name === 'node_modules') continue;
      sourceFiles(p, out);
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') && !name.endsWith('TestKit.ts')) {
      if (p.replace(/\\/g, '/').endsWith('src/world/blocks/water.ts')) continue;
      out.push(p);
    }
  }
  return out;
}

// コメントを 消す（行コメントと ブロックコメント）。「:」の あとの // は URL かもしれないので 消さない
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const OLD_JUDGE: ReadonlyArray<readonly [string, RegExp]> = [
  ["=== / !== 'water'", /[!=]==\s*'water'/],
  ["'water' === / !==", /'water'\s*[!=]==/],
  ['=== / !== WATER', /[!=]==\s*WATER\b/],
  ['WATER === / !==', /\bWATER\s*[!=]==/],
  ["new Set の 中の 'water'", /new Set(?:<[^>]*>)?\(\s*\[[^\]]*'water'[^\]]*\]/],
];

describe('AC2 置きかえ: 水の 判定を 直書きしない（§4.6 の 置きかえ表）', () => {
  it("src（テスト・proto・TestKit を のぞく）で `[!=]== 'water'` などが water.ts 以外で 0 こ", () => {
    const root = join(process.cwd(), 'src');
    const hits: string[] = [];
    for (const file of sourceFiles(root)) {
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const [label, re] of OLD_JUDGE) {
        const g = new RegExp(re.source, 'g');
        for (const m of text.matchAll(g)) {
          const line = text.slice(0, m.index).split('\n').length;
          hits.push(`${relative(process.cwd(), file)}:${line} [${label}]`);
        }
      }
    }
    expect(hits, '見つかった 所を §4.6 の 表に 沿って isWater / isDeepWater / isWaterIndex に かえる').toEqual([]);
  });
});

describe('AC16 ゆらめき: waveOffset(wx, wz, t) は 純関数（§3）', () => {
  const grid: Array<[number, number]> = [];
  for (let x = -20; x <= 20; x += 1.7) for (let z = -20; z <= 20; z += 2.3) grid.push([x, z]);
  const times = Array.from({ length: 80 }, (_, i) => i * 0.137);

  it('同じ 引数なら いつも 同じ 値（乱数を 使わない）', () => {
    for (const [x, z] of grid) for (const t of times.slice(0, 8)) expect(waveOffset(x, z, t)).toBe(waveOffset(x, z, t));
  });

  it('ずれは 0 〜 waveAmp（下向きに 引く ぶん）。waveAmp は 0.125 未満（量 1 = 1/8 の 水面が 底を こえない）。ゆれて いる（いつも 0 では ない）', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [x, z] of grid) {
      for (const t of times) {
        const o = waveOffset(x, z, t);
        expect(Number.isFinite(o)).toBe(true);
        lo = Math.min(lo, o);
        hi = Math.max(hi, o);
      }
    }
    expect(lo, '下限は 0（水面より 上に 出ない）').toBeGreaterThanOrEqual(0);
    expect(lo, 'ゆれの 谷は ほぼ 0').toBeLessThan(0.002);
    expect(hi, 'waveAmp は 0.125 未満').toBeLessThan(0.125);
    expect(hi, '山は ほぼ waveAmp（0 では ない）').toBeGreaterThan(0.01);
  });

  it('時間で かわる。世界の 場所で かわる', () => {
    expect(new Set(times.map((t) => waveOffset(3, 4, t).toFixed(9))).size).toBeGreaterThan(10);
    expect(new Set(grid.map(([x, z]) => waveOffset(x, z, 1.5).toFixed(9))).size).toBeGreaterThan(10);
  });

  it('つぎめが 切れない: ずれは 世界の 角 (wx, wz) だけで 決まり、連続（となりの マスとの さかい・列（16 マス）の さかいでも とびがない）', () => {
    const borders = [-32, -16, -1, 0, 1, 15, 16, 17, 31, 32, 48];
    for (const b of borders) {
      for (const z of [-5, 0, 7.5, 16, 20.25]) {
        for (const t of [0, 0.9, 2.2]) {
          const here = waveOffset(b, z, t);
          expect(Math.abs(waveOffset(b - 1e-3, z, t) - here), `x = ${b} の 西がわ`).toBeLessThan(0.002);
          expect(Math.abs(waveOffset(b + 1e-3, z, t) - here), `x = ${b} の 東がわ`).toBeLessThan(0.002);
          const there = waveOffset(z, b, t);
          expect(Math.abs(waveOffset(z, b - 1e-3, t) - there), `z = ${b} の 北がわ`).toBeLessThan(0.002);
          expect(Math.abs(waveOffset(z, b + 1e-3, t) - there), `z = ${b} の 南がわ`).toBeLessThan(0.002);
        }
      }
    }
    for (const [x, z] of grid) {
      const a = waveOffset(x, z, 1.1);
      expect(Math.abs(waveOffset(x + 1e-3, z, 1.1) - a)).toBeLessThan(0.002);
      expect(Math.abs(waveOffset(x, z + 1e-3, 1.1) - a)).toBeLessThan(0.002);
    }
  });
});
