// main.ts の 流れ 11: よろずや と たからばこ（TOWN-1 区切り 1C。docs/design/TOWN-1-shop.md §2.6・§2.7・§3.2・§4.2・§4.3）。
// こうかんの 係（ShopService。保存の ため 妖怪の つなぎ〔creatures.ts〕で 先に 作る）・画面の 状態・画面（1P・2P）・よろずやさんの 見た目・
// 話す 口（shared.shop）・止める きまり（1 人 ＝ 世界を 止める／2 人 ＝ 止めない）・音・テストの 窓口 `__rikkun.shop`。
import type { Vec3 } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { CHEST_SOUNDS } from '../../fx/chestSounds';
import { playCraft } from '../../fx/craftSounds';
import type { ShopBuyResult, ShopRow } from '../../town/shop/shop';
import { ShopSessions, shopFreezesWorld, sparkles, type ShopPad, type ShopSfx, type ShopView } from '../../town/shop/shopSession';
import { SHOP_TALK_ID, type ShopHub } from '../../town/shop/shopTalk';
import { shopGood, type ShopGive, type ShopItemId } from '../../town/shop/shopTable';
import { ShopkeeperRenderer } from '../../town/ShopkeeperRenderer';
import { currentTown } from '../../town/townState';
import { ShopScreen } from '../../ui/shop/shopScreen';
import { modalLock } from './modalLock';
import type { WiredMine } from './mine';

type Who = 1 | 2;

/** ★7（レジェンダリー）の めずらしさの ★ の 数（紙ふぶきの テロップ・ファンファーレ） */
const LEGEND_STARS = 7;

/** パッドの メニューの Action → よろずやの 操作 */
const PAD: Readonly<Record<string, ShopPad>> = { focusUp: 'up', focusDown: 'down', focusLeft: 'left', focusRight: 'right', confirm: 'confirm', closeMenu: 'back' };

export function wireShop(deps: WiredMine) {
  const { shared, game, hud, lock, pointerLock, controller, combat, fxSound, achievements, celebrate, reducedMotionMq, dig, lighting } = deps;
  const svc = shared.shopSave!;
  const modal = modalLock({ game, lock, pointerLock }); // 1P: マウスを 出す（2 人でも 1P が 開いた とき）
  const joined = (): boolean => shared.duoJoined();
  const alive = (who: Who): boolean => (who === 1 ? !combat.dead() : joined() && !shared.p2Down());
  const posOf = (who: Who): Vec3 | null => (who === 1 ? controller.state.position : (shared.duoMate()?.position ?? null));

  // 音（サウンドの 確認 まち: 今 ある 音を つかう）
  const play = (e: ShopSfx): void => {
    switch (e.k) {
      case 'select':
        playCraft(fxSound, 'tab');
        break;
      case 'buy':
        playCraft(fxSound, 'craft');
        break;
      case 'short':
        playCraft(fxSound, 'craftFail');
        break;
      case 'box':
        fxSound.playTones(e.box === 'obako' ? CHEST_SOUNDS.chestOpen4 : CHEST_SOUNDS.chestOpen1);
        if (e.top >= LEGEND_STARS) playCraft(fxSound, 'fanfare');
        else if (sparkles(e.top)) playCraft(fxSound, 'sparkle');
        break;
      default: {
        const never: never = e;
        throw new Error(`よろずやの 音 ${String(never)}`);
      }
    }
  };

  // わたした: 「はじめて ◯◯ を てにいれた！」（実績は 2 人で 共有・帯は あけた 人の 半分）・★7 は テロップ・まきものは 使い方の テロップ。
  // 見せるのは 中身の 表示か よろずやの 画面を とじた とき（宝箱の ふたの あとと 同じ 考え。画面の 上に 帯を かさねない）
  const pending: Record<Who, { item: ShopGive['item']; count: number }[]> = { 1: [], 2: [] };
  const scrollHint: Record<Who, boolean> = { 1: false, 2: false };
  shared.shopGave = (who, id, stacks) => {
    for (const s of stacks) pending[who].push({ item: s.item, count: s.count });
    if (shopGood(id)?.kind === 'scroll') scrollHint[who] = true;
  };
  const flush = (who: Who): void => {
    const list = pending[who];
    if (list.length > 0) {
      pending[who] = [];
      for (const s of list) {
        achievements.withWho(who, () => achievements.feedCraft([{ type: 'pickup', tick: game.tick, item: s.item, count: s.count }]));
        if (ITEM_DEFS[s.item as keyof typeof ITEM_DEFS]?.rarity === 'legendary') celebrate.enqueueTelop(s.item, 'chest', who);
      }
    }
    if (scrollHint[who]) {
      scrollHint[who] = false;
      shared.house?.recipes.welcome(who);
    }
  };

  const sessions = new ShopSessions({
    shop: svc,
    play,
    onOpen: (who) => {
      if (who === 1) modal.open();
    },
    onClose: (who) => {
      if (who === 1) modal.close(1);
      flush(who);
      shared.requestSave(); // 箱の 回数・もちもの
    },
    onResultClose: flush,
  });

  // 画面（1P・2P。同じ 部品）
  const reduced = (): boolean => reducedMotionMq?.matches === true;
  const rowsMemo: Record<Who, { v: number; d: number; rows: ShopRow[] }> = { 1: { v: -1, d: -1, rows: [] }, 2: { v: -1, d: -1, rows: [] } };
  const rowsOf = (who: Who): ShopRow[] => {
    const m = rowsMemo[who];
    const v = sessions.version(who);
    const d = svc.dama(who);
    if (m.v !== v || m.d !== d) {
      m.v = v;
      m.d = d;
      m.rows = svc.rows(who);
    }
    return m.rows;
  };
  const screens: Record<Who, ShopScreen> = { 1: null!, 2: null! };
  for (const who of [1, 2] as const) {
    screens[who] = new ShopScreen(hud, who, {
      view: (): ShopView => sessions.view(who),
      version: () => sessions.version(who),
      rows: () => rowsOf(who),
      dama: () => svc.dama(who),
      half: joined,
      reduced,
      select: (id) => sessions.select(who, id),
      buy: () => void sessions.press(who),
      close: () => sessions.close(who),
      closeResult: () => sessions.closeResult(who),
    });
  }
  const sync = (): void => {
    screens[1].sync();
    screens[2].sync();
  };
  const inTown = (who: Who): boolean => {
    const p = posOf(who);
    const t = currentTown();
    return p !== null && t !== null && t.inTown(p.x, p.z);
  };
  /** 1 ステップ: やられた・街を 出た・2P が やめた で とじる。画面を 合わせる */
  const step = (): void => {
    for (const who of [1, 2] as const) if (sessions.isOpen(who)) sessions.step(who, { alive: alive(who), inTown: inTown(who) });
    sync();
  };

  const open = (who: Who): boolean => {
    if (who === 2 && !joined()) return false;
    if (!alive(who) || !currentTown()) return false;
    const ok = sessions.open(who, inTown(who));
    sync();
    return ok;
  };
  const hub: ShopHub = {
    at: () => currentTown()?.info().npcs.find((n) => n.kind === 'shop')?.pos ?? null,
    talk: open,
    openBy: (who) => sessions.isOpen(who),
    frozen: () => shopFreezesWorld({ open1: sessions.isOpen(1), joined: joined() }),
    tick: step,
    pad: (who, action) => {
      const a = PAD[action];
      if (!a || !sessions.isOpen(who)) return;
      sessions.pad(who, a, screens[who].cols());
      sync();
    },
  };
  shared.shop = hub;
  game.onUpdate(step);
  // 1P の Esc（と 1P の パッドの メニュー操作）。2P の パッドは duo.ts の ステップが hub.pad へ
  game.input.onPress((action) => {
    if (sessions.isOpen(1)) hub.pad(1, action);
  });

  // よろずやさんの 見た目（1 描画。ねらい中は ふちどり）
  const keeper = new ShopkeeperRenderer((x, z) => shared.streamHost?.stream.isDrawn(Math.floor(x) >> 4, Math.floor(z) >> 4) ?? true);
  game.scene.add(keeper.group);
  lighting.register(keeper.bodyMaterial, 'doll');
  game.onBeforeRender(() => {
    const n = currentTown()?.info().npcs.find((x) => x.kind === 'shop');
    keeper.update(n ? { x: n.pos.x, y: n.pos.y, z: n.pos.z, yaw: n.yaw } : null, game.camera, dig.aimedArchitect() === SHOP_TALK_ID);
  });

  /** `window.__rikkun.shop`（e2e/town1c.spec.ts の 頭の 約束。p ＝ 1 | 2） */
  const hook = {
    open: (p: Who): boolean => open(p),
    close: (p: Who): void => {
      sessions.close(p);
      sync();
    },
    select: (p: Who, id: ShopItemId | null): void => {
      sessions.select(p, id);
      sync();
    },
    buy: (p: Who, id: ShopItemId): ShopBuyResult => {
      const r = sessions.buy(p, id);
      sync();
      return r;
    },
    state: (p: Who) => {
      const v = sessions.view(p);
      const has = p === 1 || joined();
      return {
        open: v.open,
        dama: has ? svc.dama(p) : 0,
        items: svc.rows(p),
        selected: v.selected,
        result: v.result ? { box: v.result.box, items: v.result.items.map((x) => ({ ...x })) } : null,
        bubble: v.bubble,
        opens: { kobako: svc.opens(p).kobako, obako: svc.opens(p).obako },
      };
    },
  };
  return { shopHook: hook };
}

export type WiredShop = WiredMine & ReturnType<typeof wireShop>;
