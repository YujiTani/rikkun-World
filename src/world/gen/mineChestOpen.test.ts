import { beforeAll, describe, expect, it } from 'vitest';
import type { ItemId, Rarity } from '../../contracts';
import { itemDef } from '../../content/items/registry';
import { RARITY_ORDER } from '../../drops/rarityTable';
import { InventoryImpl } from '../../inventory/Inventory';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { NINJA_TUNING } from '../../craft/ninjaTuning';
import { createMineHook } from './mineHook';
import { SEEDS_20, genColumn, hook1c, ptKey, type ChestRoll, type MineHook1C, type Shaft } from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * MINE-1C（docs/design/MINE-1.md §4.6「あける」・§5・受け入れ基準 C8）: 宝箱を あける〔持ち物・落とし物・テロップ・からっぽ〕。
 *
 *   窓口 `mine.open(x, y, z)`（右クリックと 同じ。どちらの マスでも）と `mine.chestPreview(x, y, z)`（あける 前と あとで 同じ。2 マスの どちらでも 同じ）。
 *
 * 【自分で 決めた つなぎ】 developer が ちがう 形に した ときは、下の `ports()` の 1 か所だけ あわせる:
 *   `createMineHook({ seed, world, chest: ChestPorts })` の `chest` に、あけた ときの 出口を わたす〔持ち物・落とし物・ログ・テロップ・実績は ゲームの つなぎ込みが 本物を わたす〕:
 *     add(item, count) → のこりの 数〔`Inventory.add` と 同じ。入りきらない 分・maxOwned を こえる 分が のこる〕
 *     drop(item, count) → 足もとに 落とし物
 *     say(text) → ログ〔「からっぽ だよ」〕   telop(item) → ハイパーレア 以上の テロップ〔いちばん めずらしい 物 1 つ〕
 *     opened(tier) → 実績「はじめて たからばこ を あけた！」の 出来事〔C11 は src/achievements/mine1c.test.ts〕
 *   画面が いる 分は E2E〔e2e/mine1c.spec.ts C13〕: ヒント「あける」〔2 マス どちらでも・あいたら 右なし〕・手に ブロックを 持った 右クリック〔あいた 宝箱でも 置かれない〕・
 *   ふたが 動いて いる 間〔0.46 秒〕の 2 回目。ここ〔ユニット〕では「くじの 設定〔忍者・侍〕を 1 に しても 中身が かわらない」まで。
 *   こわれない は ブロックの 表〔src/world/blocks/mineChestBlocks.test.ts〕。
 *
 *   【検証で 見る】〔本番の 部品の 形が 決まって から。テストの 準備では 書けない C8 の 項目。PO が 台帳に 写す〕:
 *     ・ぬりかべが たおれこんでも 2 マス とも こわれない
 *     ・こわす 処理を 直接 よんで 1 マスを こわすと 2 マス とも 消える〔こたつと 同じ〕
 *     ・テスト用の 表を 足すと その 中身の 宝箱に なる〔#195 の ため。表を 足す 窓口が 仕様に 無い〕
 *     ・くじの 設定の うち はらぱん〔GOLD-1 harapanChest は ゲームごとの 設定で 窓口に 渡らない〕を 1 に しても 変わらない
 */

interface Ports {
  inv: InventoryImpl;
  say: string[];
  drops: { item: ItemId; count: number }[];
  telops: ItemId[];
  opened: number[];
}

/** 本番の 持ち物〔InventoryImpl〕を つなぐ。ほかは 記録するだけ */
function ports(): Ports & { chest: unknown } {
  const p: Ports = { inv: new InventoryImpl(), say: [], drops: [], telops: [], opened: [] };
  return {
    ...p,
    chest: {
      add: (item: ItemId, count: number): number => p.inv.add(item, count),
      drop: (item: ItemId, count: number): void => void p.drops.push({ item, count }),
      say: (t: string): void => void p.say.push(t),
      telop: (item: ItemId): void => void p.telops.push(item),
      opened: (tier: number): void => void p.opened.push(tier),
    },
  };
}

interface Rig extends Ports {
  mine: MineHook1C;
  world: ArrayVoxelWorld;
  shaft: Shaft;
  cells: { x: number; y: number; z: number }[];
  seed: number;
}

/** 宝箱の ある 坑道の 列だけ 読みこんだ 世界で 窓口を 作る */
function rig(seed: number, shaft: Shaft, fill?: (inv: InventoryImpl) => void): Rig {
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  const chest = shaft.chest!;
  const cols = new Set(chest.cells.map((c) => `${c.x >> 4},${c.z >> 4}`));
  for (const k of cols) {
    const [cx, cz] = k.split(',').map(Number) as [number, number];
    world.loadColumn(genColumn(seed, cx, cz));
  }
  const p = ports();
  fill?.(p.inv);
  const mine = createMineHook({ seed, world, chest: p.chest } as never) as unknown as MineHook1C;
  return { ...p, mine, world, shaft, cells: chest.cells, seed };
}

/** 宝箱の ある 坑道を さがす〔はじまりの 坑道 ＋ スタートの まわりの ほかの 坑道〕。段・テロップの 有無が ちがう ものを あつめる */
const found: { seed: number; shaft: Shaft; preview: ChestRoll }[] = [];
beforeAll(() => {
  for (const seed of SEEDS_20) {
    const h = hook1c(seed);
    const sp = spawnOf(seed);
    const all = [h.startShaft(), ...h.shafts(sp.x - 1536, sp.z - 1536, sp.x + 1535, sp.z + 1535)];
    for (const shaft of all) {
      if (!shaft.chest) continue;
      if (found.some((f) => f.seed === seed && f.shaft.id === shaft.id)) continue;
      const c = shaft.chest.cells[0]!;
      found.push({ seed, shaft, preview: h.chestPreview(c.x, c.y, c.z)! });
    }
  }
}, 120_000);

const rarityOf = (item: ItemId): Rarity => itemDef(item)!.rarity;
const idxOf = (r: Rarity): number => RARITY_ORDER.indexOf(r);
const bagOf = (inv: InventoryImpl): Map<string, number> => {
  const m = new Map<string, number>();
  for (const s of inv.slots()) if (s) m.set(s.item, (m.get(s.item) ?? 0) + s.count);
  return m;
};
/** あけた とき 出るはずの もちもの 〔同じ 入れ方を した もの〕 */
function expectedBag(preview: ChestRoll, fill?: (inv: InventoryImpl) => void): { bag: Map<string, number>; left: Map<string, number> } {
  const inv = new InventoryImpl();
  fill?.(inv);
  const left = new Map<string, number>();
  for (const it of preview.items) {
    const rest = inv.add(it.item, it.count);
    if (rest > 0) left.set(it.item, (left.get(it.item) ?? 0) + rest);
  }
  return { bag: bagOf(inv), left };
}
const dropsOf = (d: { item: ItemId; count: number }[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of d) m.set(x.item, (m.get(x.item) ?? 0) + x.count);
  return m;
};

describe('C8: 宝箱を あける', () => {
  it('宝箱の ある 坑道が 十分 ある〔段・中身が ばらける〕', () => {
    expect(found.length).toBeGreaterThanOrEqual(8);
    expect(new Set(found.map((f) => f.shaft.chest!.tier)).size, '段の しゅるい').toBeGreaterThanOrEqual(2);
    expect(new Set(found.map((f) => JSON.stringify(f.preview.items))).size, '中身の ちがい').toBeGreaterThanOrEqual(5);
  });

  it('chestPreview: 2 マスの どちらでも 同じ・あける 前と あとで 同じ・段が chestAt と 同じ・いくつか の わくに 中身が ある', () => {
    for (const f of found.slice(0, 6)) {
      const r = rig(f.seed, f.shaft);
      const [a, b] = r.cells as [Rig['cells'][number], Rig['cells'][number]];
      const pa = r.mine.chestPreview(a.x, a.y, a.z)!;
      expect(r.mine.chestPreview(b.x, b.y, b.z), `${f.shaft.id}: 2 マス目`).toEqual(pa);
      expect(pa.tier, `${f.shaft.id}`).toBe(f.shaft.chest!.tier);
      expect(pa.items.length).toBeGreaterThanOrEqual(1);
      r.mine.open(b.x, b.y, b.z);
      expect(r.mine.chestPreview(a.x, a.y, a.z), `${f.shaft.id}: あけた あと`).toEqual(pa);
      expect(pa).toEqual(f.preview);
    }
  });

  it('本体で ない ほうの マスを 右クリック〔open〕→ 持ち物が chestPreview の とおり ふえる・2 マス とも あいた〔chestAt の opened・ブロックが かわる〕・あけた 出来事が 1 回', () => {
    for (const f of found.slice(0, 6)) {
      const r = rig(f.seed, f.shaft);
      const [a, b] = r.cells as [Rig['cells'][number], Rig['cells'][number]];
      const before = r.cells.map((c) => r.world.getBlock(c.x, c.y, c.z));
      expect(r.mine.chestAt(a.x, a.y, a.z)!.opened, `${f.shaft.id}: あける 前`).toBe(false);
      r.mine.open(b.x, b.y, b.z);
      const { bag, left } = expectedBag(f.preview);
      expect(bagOf(r.inv), `${f.shaft.id}: 持ち物`).toEqual(bag);
      expect(dropsOf(r.drops), `${f.shaft.id}: 落とし物〔入りきらない 分だけ〕`).toEqual(left);
      expect(r.mine.chestAt(a.x, a.y, a.z)!.opened, '本体').toBe(true);
      expect(r.mine.chestAt(b.x, b.y, b.z)!.opened, 'のこりの マス').toBe(true);
      const after = r.cells.map((c) => r.world.getBlock(c.x, c.y, c.z));
      expect(after[0], `${f.shaft.id}: 本体の ブロック`).not.toBe(before[0]);
      expect(after[1], `${f.shaft.id}: のこりの マスの ブロック`).not.toBe(before[1]);
      expect(r.mine.chestAt(a.x, a.y, a.z)!.tier, '段は のこる').toBe(f.shaft.chest!.tier);
      expect(r.opened, 'あけた 出来事').toEqual([f.shaft.chest!.tier]);
    }
  });

  it('本体を 右クリックしても 同じ 中身〔どちらの マスでも〕。あけたら 本体・のこりの マスの どちらを もう 1 回 右クリックしても ふえない・ログ「からっぽ だよ」', () => {
    const f = found[0]!;
    for (const first of [0, 1] as const) {
      const r = rig(f.seed, f.shaft);
      const first_ = r.cells[first]!;
      r.mine.open(first_.x, first_.y, first_.z);
      const afterFirst = bagOf(r.inv);
      const dropsFirst = r.drops.length;
      const telopsFirst = r.telops.length;
      expect(afterFirst, '1 回目').toEqual(expectedBag(f.preview).bag);
      expect(r.say, '1 回目は ログを 出さない').toEqual([]);
      for (const c of r.cells) {
        r.mine.open(c.x, c.y, c.z);
        expect(bagOf(r.inv), `2 回目〔${ptKey(c)}〕: ふえない`).toEqual(afterFirst);
        expect(r.drops.length, '落とし物も ふえない').toBe(dropsFirst);
        expect(r.telops.length, 'テロップも 出ない').toBe(telopsFirst);
        expect(r.opened, 'あけた 出来事は 1 回だけ').toHaveLength(1);
      }
      expect(r.say, 'ログ「からっぽ だよ」').toEqual(['からっぽ だよ', 'からっぽ だよ']);
    }
  });

  it('持ち物が いっぱいなら 足もとに 落とし物〔のこりの ぜんぶ。持ち物は かわらない〕', () => {
    const f = found[0]!;
    // 別の 物で いっぱいに する〔石を 入るだけ〕
    const fill = (inv: InventoryImpl): void => {
      while (inv.add('stone' as ItemId, 64) === 0) {
        /* いっぱいに なるまで */
      }
    };
    const r = rig(f.seed, f.shaft, fill);
    const before = bagOf(r.inv);
    const c = r.cells[1]!;
    r.mine.open(c.x, c.y, c.z);
    const { bag, left } = expectedBag(f.preview, fill);
    expect(bagOf(r.inv), '持ち物').toEqual(bag);
    expect(dropsOf(r.drops), '落とし物').toEqual(left);
    expect(sumValues(left), '落ちる 数が ある').toBeGreaterThan(0);
    expect(r.mine.chestAt(c.x, c.y, c.z)!.opened, 'あいた').toBe(true);
    expect([...before.keys()]).toContain('stone');
  });

  it('ハイパーレア 以上の 物が 入って いれば、いちばん めずらしい 物 1 つを テロップ〔ほかは 出ない〕。入って いなければ 出ない', () => {
    const SUPER = idxOf('superRare');
    let withTelop = 0;
    let without = 0;
    for (const f of found) {
      const r = rig(f.seed, f.shaft);
      const c = r.cells[0]!;
      r.mine.open(c.x, c.y, c.z);
      const top = [...f.preview.items].sort((a, b) => idxOf(rarityOf(b.item)) - idxOf(rarityOf(a.item)))[0]!;
      if (idxOf(rarityOf(top.item)) >= SUPER) {
        withTelop++;
        expect(r.telops, `${f.shaft.id}（${top.item}）`).toHaveLength(1);
        expect(rarityOf(r.telops[0]!), `${f.shaft.id} の テロップは いちばん めずらしい 物`).toBe(rarityOf(top.item));
        expect(f.preview.items.map((i) => i.item)).toContain(r.telops[0]);
      } else {
        without++;
        expect(r.telops, `${f.shaft.id}`).toEqual([]);
      }
    }
    expect(withTelop, 'ハイパーレア 以上の 宝箱').toBeGreaterThan(0);
    expect(without, 'ハイパーレア 未満の 宝箱').toBeGreaterThan(0);
  });

  it('宝箱の 場所と シードで 中身が きまる: 同じ 世界の 同じ 宝箱は 開き直しても 同じ〔あける 前に 窓口を 作りなおしても〕・ちがう 宝箱は 中身が ちがう ことが ある', () => {
    for (const f of found.slice(0, 4)) {
      const c = f.shaft.chest!.cells[0]!;
      expect(hook1c(f.seed).chestPreview(c.x, c.y, c.z)).toEqual(f.preview);
    }
    expect(new Set(found.map((f) => JSON.stringify(f.preview))).size).toBeGreaterThan(found.length / 2);
  });

  it('くじの 設定〔忍者・侍の 宝箱の 確率〕を 1 に しても、坑道の 宝箱の 中身は かわらない〔くじの 箱から だけ 引く〕', () => {
    const keep = { ninja: NINJA_TUNING.ninjaChestChance, samurai: NINJA_TUNING.samuraiChestChance };
    const base = found.slice(0, 6).map((f) => ({ f, roll: hook1c(f.seed).rollChest('kodo', 777, 3), preview: f.preview }));
    try {
      NINJA_TUNING.ninjaChestChance = 1;
      NINJA_TUNING.samuraiChestChance = 1;
      for (const { f, roll, preview } of base) {
        expect(hook1c(f.seed).rollChest('kodo', 777, 3), `${f.shaft.id}: rollChest`).toEqual(roll);
        const c = f.shaft.chest!.cells[0]!;
        expect(hook1c(f.seed).chestPreview(c.x, c.y, c.z), `${f.shaft.id}: chestPreview`).toEqual(preview);
        const r = rig(f.seed, f.shaft);
        r.mine.open(c.x, c.y, c.z);
        expect(bagOf(r.inv), `${f.shaft.id}: あけた 持ち物`).toEqual(expectedBag(preview).bag);
      }
    } finally {
      NINJA_TUNING.ninjaChestChance = keep.ninja;
      NINJA_TUNING.samuraiChestChance = keep.samurai;
    }
  });

  it('宝箱でない マスを open しても 何も おきない', () => {
    const f = found[0]!;
    const r = rig(f.seed, f.shaft);
    const c = r.cells[0]!;
    const bag = bagOf(r.inv);
    r.mine.open(c.x, c.y + 10, c.z);
    r.mine.open(c.x + 3, c.y, c.z + 3);
    expect(bagOf(r.inv)).toEqual(bag);
    expect(r.opened).toEqual([]);
    expect(r.mine.chestAt(c.x, c.y + 10, c.z)).toBeNull();
  });
});

const sumValues = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);
