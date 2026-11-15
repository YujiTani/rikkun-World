// main.ts の 流れ 11: よろずや と たからばこ（TOWN-1 区切り 1C。docs/design/TOWN-1-shop.md §2.6・§2.7・§3.2・§4.2・§4.3）。
// こうかんの 係（ShopService。保存の ため 妖怪の つなぎ〔creatures.ts〕で 先に 作る）・画面の 状態・画面（1P・2P）・よろずやさんの 見た目・
// 話す 口（shared.shop）・止める きまり（1 人 ＝ 世界を 止める／2 人 ＝ 止めない）・音・テストの 窓口 `__rikkun.shop`。
import type { Vec3 } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { FX_SETTINGS } from '../../fx/config';
import { playCraft } from '../../fx/craftSounds';
import type { ShopBuyResult, ShopRow } from '../../town/shop/shop';
import { ShopSessions, shopFreezesWorld, type ShopPad, type ShopSfx, type ShopView } from '../../town/shop/shopSession';
import { SHOP_TALK_ID, type ShopHub } from '../../town/shop/shopTalk';
import { shopGood, type ShopGive, type ShopItemId } from '../../town/shop/shopTable';
import { ShopkeeperRenderer } from '../../town/ShopkeeperRenderer';
import { currentTown } from '../../town/townState';
import { ShopScreen } from '../../ui/shop/shopScreen';
import { ShopSay } from '../../ui/shop/shopSay';
import type { ShopSpot } from '../../town/shop/shopSpots';
import { modalLock } from './modalLock';
import type { WiredMine } from './mine';

type Who = 1 | 2;

/** 箱が 出た・きえた ときの けむりの 色（0xRRGGBB）と つぶの 数（こ） */
const BOX_SMOKE = { hex: 0xf4f1ea, pop: 10, vanish: 16 } as const;

/** パッドの メニューの Action → よろずやの 操作 */
const PAD: Readonly<Record<string, ShopPad>> = { focusUp: 'up', focusDown: 'down', focusLeft: 'left', focusRight: 'right', confirm: 'confirm', closeMenu: 'back' };

export function wireShop(deps: WiredMine) {
  const { shared, game, hud, lock, pointerLock, controller, combat, fxSound, achievements, celebrate, dig, lighting } = deps;
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
      default: {
        const never: never = e;
        throw new Error(`よろずやの 音 ${String(never)}`);
      }
    }
  };

  // わたした（品）: 「はじめて ◯◯ を てにいれた！」（実績は 2 人で 共有・帯は 買った 人の 半分）・★7 は テロップ・まきものは 使い方の テロップ。
  // 見せるのは よろずやの 画面を とじた とき（画面の 上に 帯を かさねない）。たからばこの 中身は 坑道の 宝箱の あける 口が 出す
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
      shared.requestSave(); // 箱の 回数・置いた 箱・もちもの
    },
  });

  // 箱が 出た・きえた: けむり（と 出た ときの「ぽん」）。見た目と 音は 坑道の 宝箱の 物を つかう
  const smoke = (s: ShopSpot, n: number): void => {
    for (const c of s.cells) shared.fx.particles.burstHex(c, BOX_SMOKE.hex, FX_SETTINGS, n);
  };
  shared.shopBoxFx = {
    popped: (s) => {
      smoke(s, BOX_SMOKE.pop);
      playCraft(fxSound, 'badge');
    },
    vanished: (s) => smoke(s, BOX_SMOKE.vanish),
  };

  // 画面（1P・2P。同じ 部品）
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
  const says: Record<Who, ShopSay> = { 1: new ShopSay(hud, 1), 2: new ShopSay(hud, 2) };
  for (const who of [1, 2] as const) {
    screens[who] = new ShopScreen(hud, who, {
      view: (): ShopView => sessions.view(who),
      version: () => sessions.version(who),
      rows: () => rowsOf(who),
      dama: () => svc.dama(who),
      half: joined,
      select: (id) => sessions.select(who, id),
      buy: () => void sessions.press(who),
      close: () => sessions.close(who),
    });
  }
  const sync = (): void => {
    screens[1].sync();
    screens[2].sync();
    says[1].sync(sessions.saying(1), joined());
    says[2].sync(joined() ? sessions.saying(2) : null, true);
  };
  const inTown = (who: Who): boolean => {
    const p = posOf(who);
    const t = currentTown();
    return p !== null && t !== null && t.inTown(p.x, p.z);
  };
  /** 1 ステップ: やられた・街を 出た・2P が やめた で とじる。お店の 前の 箱（あいた・きえる・記録と ブロック）。画面を 合わせる */
  const step = (): void => {
    for (const who of [1, 2] as const) if (sessions.isOpen(who)) sessions.step(who, { alive: alive(who), inTown: inTown(who) });
    sessions.tickSay();
    svc.boxes?.step();
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
        bubble: v.bubble,
        opens: { kobako: svc.opens(p).kobako, obako: svc.opens(p).obako },
      };
    },
    /** 置き場 4 か所（1.5。TOWN-1.md §6.1） */
    spots: () => (currentTown()?.shopSpots() ?? []).map((s) => ({ main: { ...s.main }, cells: s.cells.map((c) => ({ ...c })), front: s.front, stand: { ...s.stand } })),
    /** 置いて ある 箱（保存と 同じ 中身） */
    boxes: () => {
      const spots = currentTown()?.shopSpots() ?? [];
      return (svc.boxes?.list() ?? []).map((b) => {
        const s = spots[b.spot]!;
        return { spot: b.spot, box: b.box, p: b.p, n: b.n, tier: b.tier, main: { ...s.main }, cells: s.cells.map((c) => ({ ...c })), opened: b.opened, vanishIn: b.vanishIn };
      });
    },
    /** その 人が boxes()[i] を ねらって 右クリック した のと 同じ（坑道の 宝箱の あける 口）。2P が いなければ none */
    openBox: (p: Who, i: number): 'ok' | 'opened' | 'none' => {
      const b = svc.boxes?.list()[i];
      const s = b ? currentTown()?.shopSpots()[b.spot] : undefined;
      if (!b || !s || (p === 2 && !joined())) return 'none';
      const was = b.opened || deps.world.getBlock(s.main.x, s.main.y, s.main.z).endsWith('_open');
      dig.chestPort?.open(s.main.x, s.main.y, s.main.z, p);
      return was ? 'opened' : 'ok';
    },
  };
  return { shopHook: hook };
}

export type WiredShop = WiredMine & ReturnType<typeof wireShop>;
