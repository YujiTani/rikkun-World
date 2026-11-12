import { beforeAll, describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { LOOK_DOOR_IDS } from '../world/blocks/houseLookBlocks';
import { HouseBook } from './book';
import { houseRig } from './houseRig';
import { houseShape, recordHouse } from './shape';
import { STYLES, type Style } from './recipes/kinds';
import { kindBlocks, withKind, type LookBook } from './recipes/lookKit';
import { loadPlaced, styledForms, unstyledItems, watchPlaced, type Facing, type PlacedLooksLike, type PlacedLooksMod } from './recipes/craftKit';

/**
 * HOUSE-2C AC18b（仕様 3.4 版 §2.7・§6.2）: 手で 置いた 家の 物の 案の 記録（置いた ときの 記録）。保存・消える とき・どの 案か の 順・仕事の 数。
 * 窓口の 名前は src/house/recipes/craftKit.ts の「2C の 約束」。置く・ほる の 通しは src/dig/placedLooksDig.test.ts。
 * 数（形の 数・案の 数）は 表から（#311）。ブロックの id は kindBlocks に 聞く。
 */

let M: PlacedLooksMod;
beforeAll(async () => {
  M = await loadPlaced();
});
const forms = styledForms();
/** 案の ある 形の ブロック id（形ごとに 1 つ。戸は しめた 下の 半分） */
const blockOf = (f: (typeof forms)[number]): BlockId => f.blocks[0]!;
const roof = (): (typeof forms)[number] => forms.find((f) => f.part === 'roof')!;
const wall = (): (typeof forms)[number] => forms.find((f) => f.part === 'wall')!;
const P = { x: 12, y: 20, z: 7 };

describe('AC18b: 記録の 入れもの（PlacedLooks）', () => {
  it('set → get ・同じ マスは あとの 行・size・erase', () => {
    const p = new M.PlacedLooks();
    expect(p.size).toBe(0);
    expect(p.get(P.x, P.y, P.z)).toBeNull();
    const b = blockOf(roof());
    p.set(P.x, P.y, P.z, 'shiro', 's', b);
    expect(p.get(P.x, P.y, P.z)).toEqual({ style: 'shiro', facing: 's' });
    expect(p.size).toBe(1);
    p.set(P.x, P.y, P.z, 'kozan', 'w', b);
    expect(p.get(P.x, P.y, P.z)).toEqual({ style: 'kozan', facing: 'w' });
    expect(p.size, '同じ マスは 1 つ').toBe(1);
    p.erase(P.x, P.y, P.z);
    expect(p.get(P.x, P.y, P.z)).toBeNull();
    expect(p.size).toBe(0);
  });

  it('③ 消える: 空気・ほかの ブロック・同じ id を 置きなおしても 消える（建築士さんの 置きかえ）', () => {
    for (const after of ['air', 'stone', 'water', blockOf(roof())] as BlockId[]) {
      const p = new M.PlacedLooks();
      p.set(P.x, P.y, P.z, 'shiro', 'n', blockOf(roof()));
      p.set(P.x + 1, P.y, P.z, 'shiro', 'n', blockOf(roof()));
      p.cellChanged(P.x, P.y, P.z, after);
      expect(p.get(P.x, P.y, P.z), `${after} に かわる`).toBeNull();
      expect(p.get(P.x + 1, P.y, P.z), 'となりの マスは そのまま').not.toBeNull();
    }
  });

  it('③ てつの と: あける・しめる（lk_door_tetsu の 4 つ の あいだの かわり）では 下・上 とも のこる。ほかの ブロックに かわると 消える', () => {
    const [bottom, top, openB, openT] = [...LOOK_DOOR_IDS] as BlockId[];
    const p = new M.PlacedLooks();
    p.set(P.x, P.y, P.z, 'kozan', 's', bottom!);
    p.set(P.x, P.y + 1, P.z, 'kozan', 's', top!);
    p.cellChanged(P.x, P.y, P.z, openB!);
    p.cellChanged(P.x, P.y + 1, P.z, openT!);
    expect(p.get(P.x, P.y, P.z), 'あけた（下）').toEqual({ style: 'kozan', facing: 's' });
    expect(p.get(P.x, P.y + 1, P.z), 'あけた（上）').toEqual({ style: 'kozan', facing: 's' });
    p.cellChanged(P.x, P.y, P.z, bottom!);
    p.cellChanged(P.x, P.y + 1, P.z, top!);
    expect(p.get(P.x, P.y, P.z), 'しめた（下）').not.toBeNull();
    expect(p.get(P.x, P.y + 1, P.z), 'しめた（上）').not.toBeNull();
    p.cellChanged(P.x, P.y, P.z, 'air');
    p.cellChanged(P.x, P.y + 1, P.z, 'stone');
    expect(p.get(P.x, P.y, P.z)).toBeNull();
    expect(p.get(P.x, P.y + 1, P.z)).toBeNull();
  });

  it('③ fill（boxFilled）: 箱の 中の 記録だけ 消える', () => {
    const p = new M.PlacedLooks();
    p.set(1, 5, 1, 'mura', 'n', blockOf(roof()));
    p.set(2, 5, 2, 'mura', 'n', blockOf(roof()));
    p.set(9, 5, 9, 'mura', 'n', blockOf(roof()));
    p.boxFilled(0, 5, 0, 3, 6, 3, 'air');
    expect([p.get(1, 5, 1), p.get(2, 5, 2)]).toEqual([null, null]);
    expect(p.get(9, 5, 9)).not.toBeNull();
  });

  it('⑤ 保存: save() の 行は [x, y, z, 案, 向き]・restore で もどる（ブロックが 合って いる 行だけ）', () => {
    const p = new M.PlacedLooks();
    const rows: Array<[number, number, number, Style, Facing, BlockId]> = [];
    let i = 0;
    for (const f of forms) {
      const style = STYLES[i % STYLES.length]!;
      const facing = (['n', 'e', 's', 'w'] as const)[i % 4]!;
      rows.push([i, 20, 3, style, facing, blockOf(f)]);
      p.set(i, 20, 3, style, facing, blockOf(f));
      i++;
    }
    const saved = JSON.parse(JSON.stringify(p.save())) as unknown[];
    expect(saved).toHaveLength(rows.length);
    for (const r of saved as unknown[][]) expect([r.length, typeof r[0], typeof r[3], typeof r[4]]).toEqual([5, 'number', 'string', 'string']);
    const q = new M.PlacedLooks();
    q.restore(saved, (x, y, z) => rows.find((r) => r[0] === x && r[1] === y && r[2] === z)?.[5] ?? 'air');
    expect(q.size).toBe(rows.length);
    for (const r of rows) expect(q.get(r[0], r[1], r[2]), `(${r[0]})`).toEqual({ style: r[3], facing: r[4] });
  });

  it('⑤ 読む とき: キーが ない・配列で ない は 記録 なし。形の おかしい 行・ブロックと 合わない 行は すてて ほかは 読む。同じ マスは あとの 行', () => {
    const b = blockOf(roof());
    const at = (_x: number, y: number, _z: number): BlockId | 'outside' => (y === 20 ? b : 'air');
    for (const bad of [undefined, null, 'x', 5, {}]) {
      const p = new M.PlacedLooks();
      p.restore(bad, at);
      expect(p.size, `rows ＝ ${JSON.stringify(bad)}`).toBe(0);
    }
    const p = new M.PlacedLooks();
    p.restore(
      [
        [1, 20, 1, 'shiro', 's'], // よい
        [2, 20, 2, 'shiro'], // みじかい
        [3, 20, 3, 'oshiro', 's'], // 知らない 案
        [4, 20, 4, 'shiro', 'x'], // 知らない 向き
        [5.5, 20, 5, 'shiro', 's'], // 整数でない
        'abc',
        null,
        [6, 21, 6, 'shiro', 's'], // ブロックが air
        [7, 20, 7, 'kozan', 'e'], // よい
        [7, 20, 7, 'mura', 'w'], // 同じ マス（あとの 行）
        [8, 20, 8, 'mura', 'n', 'ぶんしょう'], // 長すぎる 行は 形が おかしい
      ],
      at,
    );
    expect(p.get(1, 20, 1)).toEqual({ style: 'shiro', facing: 's' });
    expect(p.get(7, 20, 7), '同じ マスは あとの 行').toEqual({ style: 'mura', facing: 'w' });
    for (const [x, y, z] of [[2, 20, 2], [3, 20, 3], [4, 20, 4], [5, 20, 5], [6, 21, 6]]) expect(p.get(x!, y!, z!), `${x},${y},${z}`).toBeNull();
    expect(p.size, 'よい 行だけ（記録の 数は 世界の ブロックの 数 いか）').toBeLessThanOrEqual(3);
  });

  it('⑤ 読む とき: 案の ない ブロック（柱・しゃちほこ・あかり・いつもの 物・空気）に ついた 行は すてる', () => {
    const none: BlockId[] = ['lk_wall_pillar', 'house_wall', 'stone', 'air', ...kindBlocksOfUnstyled()];
    for (const b of none) {
      const p = new M.PlacedLooks();
      p.restore([[1, 20, 1, 'shiro', 's']], () => b);
      expect(p.size, b).toBe(0);
    }
  });

  it('⑦ 仕事の 数: 記録を 10 こ → 100 こ に しても、1 マスの get で 記録を 見る 回数が ふえない', () => {
    const probesFor = (n: number): number => {
      const p = new M.PlacedLooks();
      for (let i = 0; i < n; i++) p.set(i, 20, 0, 'shiro', 'n', blockOf(roof()));
      const before = p.probes;
      p.get(5, 20, 0);
      p.get(n + 50, 20, 0); // 記録の ない マス
      return p.probes - before;
    };
    const small = probesFor(10);
    const big = probesFor(100);
    expect(big, '10 倍に しても ふえない').toBe(small);
    expect(small, '1 マスの 仕事は 記録の 数より ずっと 少ない').toBeLessThan(10);
  });
});

/** 案の ない 新しい 物（しゃちほこ・あかり）の lk_ ブロック */
function kindBlocksOfUnstyled(): BlockId[] {
  const out: BlockId[] = [...kindBlocks('deco', 'shachi')];
  for (const k of ['hotaru', 'suisho']) out.push(...kindBlocks('light', k));
  expect(unstyledItems().length).toBeGreaterThan(0);
  return out;
}

describe('AC18b ④: どの 案か の 順（resolveLook ＝ 見た目・ほった アイテム・house.lookOf が ぜんぶ 同じ 答え）', () => {
  const AT = { x: 40, y: 20, z: 40 };
  const emptyBook = { lookAt: () => null };

  it('③ 記録も 置いた 記録も ない マス: その 形の むら（案の ある 形 ぜんぶ）', () => {
    const p = new M.PlacedLooks();
    for (const f of forms) expect(M.resolveLook({ block: blockOf(f), placed: p, book: emptyBook }, 1, 2, 3), `${f.part}-${f.form}`).toBe(f.kinds[0]);
  });

  it('案の ある lk_ ブロック で なければ null（いつもの 物・柱・空気・しゃちほこ・あかり）', () => {
    const p = new M.PlacedLooks();
    for (const b of ['house_wall', 'house_roof', 'lk_wall_pillar', 'air', 'stone', ...kindBlocksOfUnstyled()] as BlockId[]) {
      expect(M.resolveLook({ block: b, placed: p, book: emptyBook }, 1, 2, 3), b).toBeNull();
    }
    expect(M.resolveLook({ block: 'outside', placed: p, book: emptyBook }, 1, 2, 3)).toBeNull();
  });

  it('① 置いた ときの 記録が いちばん 先: 3 案 どれでも その 案（記録が 家の 記録と ちがっても）', () => {
    const f = wall();
    const bp = withKind('wall', f.kinds[1]!, { w: 7, d: 7, windows: 2 });
    const book = new HouseBook() as LookBook;
    recordHouse(book, bp, 1, AT);
    const cell = houseShape(bp).cells.find((c) => (c as { look?: string }).look === f.kinds[1])!;
    const [x, y, z] = [AT.x + cell.x, AT.y + cell.y, AT.z + cell.z];
    const p = new M.PlacedLooks();
    expect(M.resolveLook({ block: cell.id as BlockId, placed: p, book }, x, y, z), '記録なし → 家の 記録（おしろ）').toBe(f.kinds[1]);
    for (const style of STYLES) {
      p.set(x, y, z, style, 's', cell.id as BlockId);
      expect(M.resolveLook({ block: cell.id as BlockId, placed: p, book }, x, y, z), `置いた 記録 ${style}`).toBe(`${f.form}_${style}`);
    }
  });

  it('② 家の 記録: その マスの ブロックが その しゅるいの ブロックの とき だけ。ブロックが ちがえば 使わない（形の むら）', () => {
    const f = wall();
    const bp = withKind('wall', f.kinds[2]!, { w: 7, d: 7, windows: 2 });
    const book = new HouseBook() as LookBook;
    recordHouse(book, bp, 1, AT);
    const cell = houseShape(bp).cells.find((c) => (c as { look?: string }).look === f.kinds[2])!;
    const [x, y, z] = [AT.x + cell.x, AT.y + cell.y, AT.z + cell.z];
    const p = new M.PlacedLooks();
    expect(M.resolveLook({ block: cell.id as BlockId, placed: p, book }, x, y, z), '家の 記録の こうざん').toBe(f.kinds[2]);
    const other = forms.find((g) => g.part === 'wall' && g.form !== f.form)!;
    expect(M.resolveLook({ block: blockOf(other), placed: p, book }, x, y, z), 'ちがう 形の ブロック → 記録を 使わず むら').toBe(other.kinds[0]);
  });

  it('④ 建てた 家の しっくいの かべ（おしろ）を ほって、こうざんの しっくいの かべを 同じ マスに 置く → こうざん。記録の ない マスは むら', () => {
    const f = forms.find((g) => g.part === 'wall' && g.form === 'shikkui') ?? wall();
    const bp = withKind('wall', f.kinds[1]!, { w: 7, d: 7, windows: 2 });
    const book = new HouseBook() as LookBook;
    recordHouse(book, bp, 1, AT);
    const cell = houseShape(bp).cells.find((c) => (c as { look?: string }).look === f.kinds[1])!;
    const [x, y, z] = [AT.x + cell.x, AT.y + cell.y, AT.z + cell.z];
    const p = new M.PlacedLooks();
    p.set(x, y, z, 'kozan', 'n', cell.id as BlockId);
    expect(M.resolveLook({ block: cell.id as BlockId, placed: p, book }, x, y, z)).toBe(f.kinds[2]);
    expect(M.resolveLook({ block: cell.id as BlockId, placed: p, book }, x + 50, y, z), '家の 記録も 置いた 記録も ない').toBe(f.kinds[0]);
  });
});

describe('AC18b: 窓口 house.lookOf・house.placedLook と 保存（HouseSystem）', () => {
  type Hook = { lookOf(x: number, y: number, z: number): string | null; placedLook(x: number, y: number, z: number): { style: string; facing: string } | null };
  const hookOf = (r: ReturnType<typeof houseRig>): Hook => r.hook as unknown as Hook;
  const placedOf = (r: ReturnType<typeof houseRig>): PlacedLooksLike => (r.sys as unknown as { placedLooks: PlacedLooksLike }).placedLooks;

  it('置いた 記録が あれば lookOf・placedLook が その 案（placedLook は 置いた ときの 記録 だけ）。なければ lookOf は むら・placedLook は null', () => {
    const r = houseRig();
    const f = roof();
    const [x, y, z] = [P.x, 12, P.z];
    r.world.setBlock(x, y, z, blockOf(f));
    expect(hookOf(r).placedLook(x, y, z)).toBeNull();
    expect(hookOf(r).lookOf(x, y, z), '記録 なし → むら').toBe(f.kinds[0]);
    placedOf(r).set(x, y, z, 'shiro', 'e', blockOf(f));
    expect(hookOf(r).placedLook(x, y, z)).toEqual({ style: 'shiro', facing: 'e' });
    expect(hookOf(r).lookOf(x, y, z)).toBe(f.kinds[1]);
    r.world.setBlock(x + 1, 12, z, 'stone');
    expect(hookOf(r).lookOf(x + 1, 12, z), '案の ある lk_ ブロック で ない → null').toBeNull();
  });

  it('保存: serialize → JSON → load で placedLook と lookOf が 同じ。キー placedLooks は [x, y, z, 案, 向き]。今 ある ブロックと 合わない 行は 読む とき すてる', () => {
    const a = houseRig();
    const rows: Array<[number, number, number, Style, Facing]> = [];
    forms.forEach((f, i) => {
      const style = STYLES[(i + 1) % STYLES.length]!;
      const facing = (['n', 'e', 's', 'w'] as const)[i % 4]!;
      a.world.setBlock(20 + i, 12, 30, blockOf(f));
      placedOf(a).set(20 + i, 12, 30, style, facing, blockOf(f));
      rows.push([20 + i, 12, 30, style, facing]);
    });
    const saved = JSON.parse(JSON.stringify(a.sys.serialize())) as { placedLooks?: unknown[] };
    expect(Array.isArray(saved.placedLooks), 'キー placedLooks').toBe(true);
    expect(saved.placedLooks).toHaveLength(rows.length);
    const b = houseRig();
    forms.forEach((f, i) => b.world.setBlock(20 + i, 12, 30, blockOf(f)));
    b.sys.load(saved);
    forms.forEach((f, i) => {
      const [x, y, z, style, facing] = rows[i]!;
      expect(hookOf(b).placedLook(x, y, z), f.form).toEqual({ style, facing });
      expect(hookOf(b).lookOf(x, y, z), f.form).toBe(`${f.form}_${style}`);
    });
    // 合わない 行（ブロックが ない）は すてる
    const c = houseRig();
    c.sys.load(saved);
    forms.forEach((_, i) => expect(hookOf(c).placedLook(20 + i, 12, 30), `ブロック なし ${i}`).toBeNull());
  });

  it('保存: placedLooks の ない セーブ（3.4 版より 前）は 記録 なし', () => {
    const a = houseRig();
    const saved = JSON.parse(JSON.stringify(a.sys.serialize())) as Record<string, unknown>;
    delete saved.placedLooks;
    const b = houseRig();
    b.world.setBlock(P.x, 12, P.z, blockOf(roof()));
    expect(() => b.sys.load(saved)).not.toThrow();
    expect(hookOf(b).placedLook(P.x, 12, P.z)).toBeNull();
  });

  it('③ 建築士さんが 家を 建てて その マスを 置きかえる と 記録は 消える（同じ id でも）。そとの 記録は のこる', () => {
    const r = houseRig();
    const placed = placedOf(r);
    watchPlaced(r.world, placed);
    r.talk(); // 話しかけて から せっけいずを 作る（make の 前提）
    r.make();
    const number = r.hook.blueprints().at(-1)!.number;
    const AT = { x: 20, y: 11, z: 20 };
    const inside = { x: AT.x + 1, y: AT.y + 1, z: AT.z + 0 };
    const outside = { x: AT.x + 60, y: AT.y + 1, z: AT.z };
    r.world.setBlock(inside.x, inside.y, inside.z, blockOf(roof()));
    r.world.setBlock(outside.x, outside.y, outside.z, blockOf(roof()));
    placed.set(inside.x, inside.y, inside.z, 'shiro', 'n', blockOf(roof()));
    placed.set(outside.x, outside.y, outside.z, 'shiro', 'n', blockOf(roof()));
    r.sys.buildNow(number, AT);
    expect(hookOf(r).placedLook(inside.x, inside.y, inside.z), '建てた マスの 記録は 消える').toBeNull();
    expect(hookOf(r).placedLook(outside.x, outside.y, outside.z), '建てて いない マスの 記録は のこる').not.toBeNull();
  });
});
