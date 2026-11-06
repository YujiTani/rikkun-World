// main.ts の 流れ 10: 坑道の 宝箱（MINE-1C #350。docs/design/MINE-1.md §3・§4.6・§6.1）。
// 宝箱を あける〔右クリック → mine.open〕の つなぎ: 持ち物・落とし物・ふた・光の 柱・音・ログ・テロップ・実績。
import type { ItemId, Rarity } from '../../contracts';
import { itemDef } from '../../content/items/registry';
import { RARITY_ORDER } from '../../drops/rarity';
import { ChestLidFx } from '../../fx/chestLidFx';
import { CHEST_SOUNDS } from '../../fx/chestSounds';
import { itemType } from '../../inventory/items';
import { KODO_GEN } from '../../save/SaveManager';
import { setChestLidless } from '../../world/render/looks/chestLooks';
import { createMineHook } from '../../world/gen/mineHook';
import type { HotbarGain } from '../../ui/hotbarModel';
import type { WiredDuo } from './duo';

/** 中身が あふれた とき 足もとに 落とす 飛ばし方（速さ〔マス/秒〕・上むき 〔マス/秒〕の はば） */
const CHEST_SCATTER = { speedMin: 0.3, speedMax: 0.8, upMin: 3, upMax: 3.5 } as const;
/** 落とし物を 出す 高さ（足もとから 上へ。マス） */
const CHEST_DROP_RISE = 0.5;
/** ログに 名前を 出す 中身の 種類の 数（めずらしい 順の 先頭 から。これより 多いと「など」） */
const LOG_NAMES_MAX = 3;

/** 中身 1 しゅるいの しらせ（ふたが あいた あとに 出す） */
interface Got {
  item: ItemId;
  count: number;
  /** 持ち物に 入った 数 */
  put: number;
}

/** ログの 1 行〔中身を めずらしい 順に 先頭 LOG_NAMES_MAX こ。重なった 同じ アイテムは 1 つ〕。名前は ひらがな〔漢字は ruby〕 */
export function chestLogLine(got: readonly Pick<Got, 'item'>[], nameOf: (item: ItemId) => string, rarityOf: (item: ItemId) => number): string | null {
  const items = [...new Set(got.map((g) => g.item))];
  if (items.length === 0) return null;
  items.sort((a, b) => rarityOf(b) - rarityOf(a)); // めずらしい 順〔同じ めずらしさは 入った 順〕
  const shown = items.slice(0, LOG_NAMES_MAX).map(nameOf).join(' と ');
  return `たからばこ から ${shown}${items.length > LOG_NAMES_MAX ? ' など' : ''} を てにいれた！`;
}

export function wireMine(deps: WiredDuo) {
  const { shared, game, world, controller, inventory, drops, celebrate, achievements, seed, shafts, yokaiM, save, restored, fxSound, dig, hotbar, renderer, reducedMotionMq, notice } = deps;
  const rarityOf = (item: ItemId): number => RARITY_ORDER.indexOf(itemDef(item)!.rarity);
  const nameOf = (item: ItemId): string => itemType(item)?.name ?? item;

  // あける 1 回ぶんの しらせ。中身は あけた コマで 持ち物に 入れる〔保存が いつ 来ても「あいた ＋ 中身あり」〕。見せる 物だけ ふたの あとに まわす
  let gots: Got[] | null = null;
  let telopItem: ItemId | null = null;
  let openedTier: 1 | 2 | 3 | 4 | null = null;
  const show = (g: readonly Got[], telop: ItemId | null, tier: 1 | 2 | 3 | 4 | null, gains: readonly HotbarGain[]): void => {
    const line = chestLogLine(g, nameOf, rarityOf);
    if (line) {
      let top = g[0]!.item;
      for (const x of g) if (rarityOf(x.item) > rarityOf(top)) top = x.item;
      shared.log.chestGot(line, top); // 履歴と 左の ログに 1 行〔絵は いちばん めずらしい 中身〕
    }
    // ホットバーの「ぽん」と「+N」: ふえた マスは あけた コマで 取って ある〔いまは もう 描きなおし ずみ〕
    hotbar.popSlots(gains, (item) => g.reduce((n, x) => (x.item === item ? n + x.put : n), 0));
    for (const x of g) {
      if (x.put <= 0) continue;
      achievements.feedCraft([{ type: 'pickup', tick: game.tick, item: x.item, count: x.put }]); // 「はじめて ◯◯ を てにいれた！」
    }
    if (telop) celebrate.enqueueTelop(telop, 'chest');
    if (tier) achievements.feedMine([{ type: 'chestOpen', tick: game.tick, tier }]);
  };

  const mine = createMineHook({
    seed,
    shafts,
    world,
    player: () => controller.state.position,
    spawnHeight: () => yokaiM.config.yokaiSpawnHeight,
    metaGen: () => save.metaGen(),
    kodoGen: KODO_GEN,
    oldCols: restored.oldCols,
    chest: {
      add: (item, count) => {
        const rest = inventory.add(item, count);
        gots?.push({ item, count, put: count - rest });
        return rest;
      },
      drop: (item, count) => {
        const p = controller.state.position;
        drops.scatter({ x: p.x, y: p.y + CHEST_DROP_RISE, z: p.z }, [{ item, count }], CHEST_SCATTER);
      },
      say: (text) => {
        shared.log.chestSay(text); // 履歴
        shared.skipSignalLog = true; // 履歴は 上で 入れた ので 合図の 履歴は 足さない
        notice.showSignal('chestEmpty'); // 画面にも 字で〔「もちものが いっぱい！」と 同じ 出し方〕
        shared.skipSignalLog = false;
      },
      telop: (item) => {
        telopItem = item;
      },
      opened: (tier) => {
        fxSound.playTones(CHEST_SOUNDS[`chestOpen${tier}` as keyof typeof CHEST_SOUNDS]); // 案 A。4 段目だけ「大」（BGM が さがる）
        openedTier = tier;
      },
    },
  });

  const lidFx = new ChestLidFx(game.scene, (x, y, z) => renderer.light.brightness(x, y, z));
  game.onUpdate(() => lidFx.step());
  /** ふたが 動いて いる 宝箱の 本体の マス〔もう 1 回 右クリックしても 何も しない〕 */
  const busy = new Set<string>();
  // 動きの 途中で ページを 閉じると「見せる」物と 実績は 出ない〔中身は もう 持ち物に ある〕
  dig.chestPort = {
    // who ＝ あける 人。今は いつも 1P〔0〕。2P の 右クリックは COOP-1 作業 3 で
    open: (x, y, z, who = 0) => {
      void who;
      const at = mine.chestAt(x, y, z);
      if (!at) return;
      const key = `${at.main.x},${at.main.y},${at.main.z}`;
      if (busy.has(key)) return; // ふたが 動いて いる 間は 何も しない
      if (at.opened) {
        mine.open(x, y, z); // ログ「からっぽ だよ」
        return;
      }
      gots = [];
      telopItem = null;
      openedTier = null;
      mine.open(x, y, z); // ブロックは すぐ あいた 形。中身は ここで 持ち物へ
      const got = gots;
      const telop = telopItem;
      const tier = openedTier;
      const gains = hotbar.takeGains(); // 描きなおす 前に ふえた マスを 取って おく
      gots = null;
      let top = 0;
      for (const g of got) top = Math.max(top, rarityOf(g.item));
      const rarity: Rarity = RARITY_ORDER[top]!;
      if (reducedMotionMq?.matches) {
        // 「うごきを へらす」: ふたは すぐ あいた 形。光の 柱だけ 出す
        lidFx.startStill(at.main, at.tier, at.front, rarity);
        show(got, telop, tier, gains);
        return;
      }
      for (const c of at.cells) setChestLidless(c.x, c.y, c.z, true);
      busy.add(key);
      let ended = false;
      const finish = (): void => {
        if (ended) return;
        ended = true;
        busy.delete(key);
        for (const c of at.cells) {
          setChestLidless(c.x, c.y, c.z, false);
          const id = world.getBlock(c.x, c.y, c.z);
          if (id === 'outside') continue;
          world.setBlock(c.x, c.y, c.z, 'air'); // 同じ ブロックでは 作りなおしに ならない ので 1 回 空気を はさむ
          world.setBlock(c.x, c.y, c.z, id);
        }
        show(got, telop, tier, gains); // ふたが あいた あと〔0.46 秒〕に ログ・テロップ・実績
      };
      lidFx.start(at.main, at.tier, at.front, rarity, finish);
    },
  };
  return { mine };
}

export type WiredMine = WiredDuo & ReturnType<typeof wireMine>;
