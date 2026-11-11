import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId } from '../contracts';
import { dugItemOf } from '../dig/dugItems';
import { doorInfo } from '../world/blocks/houseBlocks';
import { doorIndex, windowCells } from './editor/model';
import { HEIGHT, WINDOW_Y } from './editor/tuning';
import { houseShape, recordHouse } from './shape';
import { ALL_KINDS, LIGHT_KINDS, PART_FORMS, PARTS, STYLES, kindsOfForm } from './recipes/kinds';
import { allKindsOf, houseBox, kindBlocks, kindItem, lookBp, withKind, type LookPart } from './recipes/lookKit';
import type { HouseBook } from './book';

/**
 * HOUSE-2B AC11（仕様 3.3 版 §2.4・§4.2・§6.2）: 建てた 家が せっけいず どおり（えらんだ しゅるい〔案 こみ〕の ブロック。案を まぜた せっけいずでも）・てつの と・なしの 家・ほると その しゅるいの アイテム。
 * ブロックの id・アイテムの id は テストに 書かない（lookKit の kindBlocks・kindItem に 聞く。名前は src/house/recipes/lookKit.ts の「2B の 約束」）。
 * 夜の 湧きは lookDark.test.ts、アイテムの 登録は src/content/items/houseLooks.test.ts。
 */

const LOOK_PARTS: readonly LookPart[] = [...PARTS, 'light'];
type Shape = ReturnType<typeof houseShape>;
const idsOf = (s: Shape): Set<string> => new Set(s.cells.map((c) => c.id));
const cellAt = (s: Shape, x: number, y: number, z: number): string => s.cells.find((c) => c.x === x && c.y === y && c.z === z)!.id;
const sig = (s: Shape): string => JSON.stringify(s.cells.map((c) => [c.x, c.y, c.z, c.id]));
/** ふつうの 試し 家（よこ 7・たて 7・窓 2。かざり・窓・戸の かざりが つく 余裕が ある） */
const BASE = { w: 7 as const, d: 7 as const, windows: 2 };
/** その 家に ある なかまの ブロックが 1 つでも あるか */
const has = (s: Shape, blocks: readonly string[]): boolean => blocks.some((b) => idsOf(s).has(b));
const DEFAULT: Record<LookPart, string> = { roof: 'flat', wall: 'ki', window: 'shoji', door: 'ie', deco: '', light: 'lantern' };

describe('AC11: しゅるいごとの ブロック（kindBlocks）の きまり', () => {
  it('なし いがいの しゅるいは ブロックが 1 つ 以上・かべの なし は 柱の ブロック・やね と まどの なし は []', () => {
    for (const part of LOOK_PARTS) {
      for (const kind of allKindsOf(part)) {
        const b = kindBlocks(part, kind);
        if (kind === 'none' && part !== 'wall') expect(b, `${part}-${kind}`).toEqual([]);
        else expect(b.length, `${part}-${kind} の ブロック`).toBeGreaterThan(0);
      }
    }
  });

  it('同じ ばしょの しゅるい どうしで ブロックが 1 つも 重ならない（ほると その しゅるいの アイテムに なる ため）', () => {
    for (const part of LOOK_PARTS) {
      const seen = new Map<string, string>();
      for (const kind of allKindsOf(part)) {
        for (const b of kindBlocks(part, kind)) {
          expect(seen.get(b), `${part}: ${b} が ${seen.get(b)} と ${kind} で 重なる`).toBeUndefined();
          seen.set(b, kind);
        }
      }
    }
  });
});

describe('AC11: 建てた 家は えらんだ しゅるいの ブロックで できて いる', () => {
  for (const part of LOOK_PARTS) {
    it(`${part}: しゅるいを 1 つずつ かえた 家に その しゅるいの ブロックが ある・いつもの 物の 家とは 形が ちがう`, () => {
      const base = houseShape(lookBp(BASE));
      for (const kind of allKindsOf(part)) {
        if (kind === 'none') continue;
        const s = houseShape(withKind(part, kind, BASE));
        expect(has(s, kindBlocks(part, kind)), `${part}-${kind}: ブロックが 建って いる`).toBe(true);
        if (kind !== DEFAULT[part]) expect(sig(s), `${part}-${kind}: いつもの 物と 同じ 形に なって いる`).not.toBe(sig(base));
      }
    });
  }

  it('同じ 形の 3 案は 3 つとも ちがう 形（やね・かべ・まど・と・かざり）', () => {
    for (const part of PARTS) {
      for (const form of PART_FORMS[part]) {
        const kinds = kindsOfForm(form);
        if (kinds.length < STYLES.length) continue; // しゃちほこ は 案が ない
        const sigs = kinds.map((k) => sig(houseShape(withKind(part, k, BASE))));
        expect(new Set(sigs).size, `${part}-${form}: 3 案の 形`).toBe(kinds.length);
      }
    }
  });

  it('案を まぜた せっけいず: ばしょごとに ちがう 案を えらんで も、えらんだ しゅるいの ブロックだけで できて いる（床と 家具は のぞく）', () => {
    const pickKind = (part: LookPart, n: number): string => {
      if (part === 'light') return LIGHT_KINDS[LIGHT_KINDS.length - 1]!;
      const form = PART_FORMS[part][0]!;
      return kindsOfForm(form)[n % STYLES.length]!;
    };
    // 3 つの まぜ方（ばしょごとに 案を ずらす）
    for (let shift = 0; shift < STYLES.length; shift++) {
      const roof = pickKind('roof', shift);
      const wall = pickKind('wall', shift + 1);
      const win = pickKind('window', shift + 2);
      const door = pickKind('door', shift + 1);
      const decos = PART_FORMS.deco.map((f, i) => (f === 'shachi' ? 'shachi' : kindsOfForm(f)[(shift + i) % STYLES.length]!));
      const light = pickKind('light', 0);
      const bp = lookBp({ ...BASE, roof: roof as never, wall: wall as never, windowKind: win as never, door: door as never, deco: decos as never, light: light as never });
      const s = houseShape(bp);
      const chosen: Array<[LookPart, string]> = [['roof', roof], ['wall', wall], ['window', win], ['door', door], ['light', light], ...decos.map((k): [LookPart, string] => ['deco', k])];
      const allowed = new Set<string>(['air', 'house_floor']);
      for (const [p, k] of chosen) {
        const b = kindBlocks(p, k);
        expect(has(s, b), `まぜ ${shift}: ${p}-${k} が 建って いる`).toBe(true);
        for (const x of b) allowed.add(x);
      }
      const leaks = [...idsOf(s)].filter((i) => !allowed.has(i));
      expect(leaks, `まぜ ${shift}: えらんで いない ブロックが まじって いる`).toEqual([]);
    }
  });
});

describe('AC11: てつの と の 家も 戸が houses() に のる', () => {
  for (const kind of ALL_KINDS.door) {
    it(`door-${kind}: 戸の 下と 上が 戸の ブロック（しまって いる）・戸の 場所は 形から・記録に のる・ほると その しゅるいの アイテム 1 こ`, () => {
      const bp = lookBp({ ...BASE, door: kind as never });
      const s = houseShape(bp);
      const dx = 1 + doorIndex(bp);
      const dz = bp.d + 2 - 1;
      expect(s.door, '戸の 下の マス').toEqual({ x: dx, y: HEIGHT.floor, z: dz });
      const low = cellAt(s, dx, HEIGHT.floor, dz);
      const up = cellAt(s, dx, HEIGHT.floor + 1, dz);
      expect(doorInfo(low), `下: ${low}`).toEqual({ top: false, open: false });
      expect(doorInfo(up), `上: ${up}`).toEqual({ top: true, open: false });
      const blocks = kindBlocks('door', kind);
      expect(blocks, '戸の ブロック').toEqual(expect.arrayContaining([low, up]));
      // 家の 記録
      const got: { door?: { x: number; y: number; z: number } } = {};
      const book = { add: (r: { door: { x: number; y: number; z: number } }) => ((got.door = r.door), r) } as unknown as Pick<HouseBook, 'add'>;
      const at = { x: 100, y: 20, z: 200 };
      recordHouse(book, bp, 1, at);
      expect(got.door, '記録の 戸').toEqual({ x: at.x + dx, y: at.y + HEIGHT.floor, z: at.z + dz });
      // ほる
      const item = kindItem('door', kind);
      expect(item, 'ほると 手に 入る アイテム').not.toBeNull();
      for (const b of [low, up]) expect(dugItemOf(b as BlockId), `${b} を ほる`).toBe(item as ItemId);
    });
  }
});

describe('AC11: ほると その しゅるいの アイテム 1 こ（ぜんぶの しゅるい。ブロックの 向き・半分ちがいも）', () => {
  it('ブロックごとに dugItemOf が kindItem と 同じ・しゅるいごとに 別の アイテム', () => {
    for (const part of LOOK_PARTS) {
      const items = new Map<string, string>();
      for (const kind of allKindsOf(part)) {
        const item = kindItem(part, kind);
        if (kind === 'none') {
          // やね・まどの なしは アイテムなし。かべの なし（柱）は 柱の ブロックを ほった とき 手に 入る 物が あれば その アイテム（なくても よい）
          if (part !== 'wall') expect(item, `${part}-none`).toBeNull();
          else if (item !== null) for (const b of kindBlocks(part, kind)) expect(dugItemOf(b), `柱 ${b}`).toBe(item);
          continue;
        }
        expect(item, `${part}-${kind}`).not.toBeNull();
        for (const b of kindBlocks(part, kind)) expect(dugItemOf(b), `${part}-${kind} の ${b} を ほる`).toBe(item);
        expect(items.get(String(item)), `${part}: ${item} が ${items.get(String(item))} と ${kind} で 同じ`).toBeUndefined();
        items.set(String(item), kind);
      }
    }
  });
});

describe('AC11: なしの 家（§2.4）', () => {
  const win2 = { ...BASE, windows: 4 };

  it('やね なし: 高さ 4・やねの ブロックが ない・ちょうちんは いつもの 場所（中の 3 段目の まん中）・かざり（えんとつ・しゃちほこ）は つかない', () => {
    for (const light of LIGHT_KINDS) {
      const bp = lookBp({ ...win2, roof: 'none', light, deco: ['entotsu_shiro', 'shachi'] as never });
      const s = houseShape(bp);
      expect(houseBox(bp).h, '箱の 高さ').toBe(4);
      expect(Math.max(...s.cells.map((c) => c.y)), '一番 上の 段').toBe(3);
      const roofBlocks = ALL_KINDS.roof.flatMap((k) => kindBlocks('roof', k));
      expect(has(s, roofBlocks), 'やねの ブロック').toBe(false);
      expect(has(s, [...kindBlocks('deco', 'entotsu_shiro'), ...kindBlocks('deco', 'shachi')]), 'やねの 上の かざり').toBe(false);
      const cx = 1 + (bp.w - 1) / 2;
      const cz = 1 + (bp.d - 1) / 2;
      expect(kindBlocks('light', light), `あかり ${light} は 3 段目の まん中`).toContain(cellAt(s, cx, HEIGHT.floor + HEIGHT.inner - 1, cz));
    }
  });

  it('ちょうちんは どの やねでも いつもの 場所（中の 3 段目の まん中）', () => {
    for (const roof of ALL_KINDS.roof) {
      const bp = lookBp({ ...win2, roof: roof as never });
      const s = houseShape(bp);
      const cx = 1 + (bp.w - 1) / 2;
      const cz = 1 + (bp.d - 1) / 2;
      expect(cellAt(s, cx, HEIGHT.floor + HEIGHT.inner - 1, cz), `${roof}`).toBe('lantern');
    }
  });

  it('かべ なし: 外まわりは 4 すみの 柱（3 段）と 戸 だけ・ほかは 空気。窓・はなだんは 建たない・戸は ある', () => {
    for (const door of ALL_KINDS.door) {
      const bp = lookBp({ ...win2, wall: 'none', door: door as never, deco: ['hanadan_mura'] as never });
      const s = houseShape(bp);
      const ow = bp.w + 2;
      const od = bp.d + 2;
      const pillar = new Set<string>(kindBlocks('wall', 'none'));
      const doorX = 1 + doorIndex(bp);
      let pillars = 0;
      for (const c of s.cells) {
        const ring = c.x === 0 || c.z === 0 || c.x === ow - 1 || c.z === od - 1;
        if (!ring || c.y < HEIGHT.floor || c.y >= HEIGHT.floor + HEIGHT.inner) continue;
        const corner = (c.x === 0 || c.x === ow - 1) && (c.z === 0 || c.z === od - 1);
        const isDoor = c.x === doorX && c.z === od - 1 && c.y <= HEIGHT.doorLevels;
        if (corner) {
          expect(pillar.has(c.id), `${door}: すみ (${c.x},${c.y},${c.z}) は 柱 → ${c.id}`).toBe(true);
          pillars++;
        } else if (isDoor) {
          expect(doorInfo(c.id), `${door}: 戸 (${c.x},${c.y},${c.z}) → ${c.id}`).not.toBeNull();
        } else {
          expect(c.id, `${door}: 外まわり (${c.x},${c.y},${c.z})`).toBe('air');
        }
      }
      expect(pillars, '4 すみ × 中の 段').toBe(4 * HEIGHT.inner);
      expect(has(s, [...kindBlocks('window', 'shoji'), ...ALL_KINDS.window.flatMap((k) => kindBlocks('window', k)), ...kindBlocks('deco', 'hanadan_mura')]), '窓・はなだんは 建たない').toBe(false);
      expect(s.door, '戸の 場所は かわらない').toEqual({ x: doorX, y: HEIGHT.floor, z: od - 1 });
    }
  });

  it('まど なし: 窓の マスが 空気（かべは そのまま）。窓の 数・場所は 今までの 式', () => {
    for (const wall of ALL_KINDS.wall) {
      const bp = lookBp({ ...win2, wall: wall as never, windowKind: 'none' });
      const s = houseShape(bp);
      const ow = bp.w + 2;
      const wc = windowCells(bp);
      expect(wc.length, '窓の 数').toBe(bp.windows);
      for (const c of wc) {
        const x = c.wall === 'back' ? 1 + c.i : c.wall === 'left' ? 0 : ow - 1;
        const z = c.wall === 'back' ? 0 : 1 + c.i;
        expect(cellAt(s, x, WINDOW_Y, z), `${wall}: 窓の マス (${x},${WINDOW_Y},${z})`).toBe('air');
      }
      if (wall !== 'none') expect(has(s, kindBlocks('wall', wall)), `${wall}: かべは のこる`).toBe(true);
    }
  });

  it('やね なしでも かべ なしでも まど なしでも 箱の ぜんぶの マスが ある（箱の 外へ 出ない）', () => {
    const bp = lookBp({ ...win2, roof: 'none', wall: 'none', windowKind: 'none' });
    const box = houseBox(bp);
    expect(houseShape(bp).cells).toHaveLength(box.w * box.d * box.h);
  });
});
