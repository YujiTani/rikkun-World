// main.ts の 流れ 12: かじやさん・かいとりの やたい・食事の やたい・かえりの おふだ（TOWN-1 区切り 1E。docs/design/TOWN-1-shop.md §2.10〜§2.13・§3.2）。
// 係（保存の ため 妖怪の つなぎ〔creatures.ts〕で 先に 作る。vendorService.ts）を 画面・ふきだし・話す 口（shared.townVendors）に つなぐ。
// 止める きまり・その場に 止まる・パッド・Esc は よろずやと 同じ 口（shared.shop）に まぜる（1 人で 1P が 開いて いる 間だけ 世界を 止める）。
// テストの 窓口 `__rikkun.ofuda / smith / stall / food` と `duo.durability / setDurability`（e2e/town1e.spec.ts の 頭の 約束）。
import type { ItemId, Vec3 } from '../../contracts';
import { playCraft } from '../../fx/craftSounds';
import type { ShopPad, ShopSfx } from '../../town/shop/shopSession';
import type { ShopHub } from '../../town/shop/shopTalk';
import { currentTown } from '../../town/townState';
import { VendorDesk, smithSlotOf, vendorFreezesWorld, type VendorKind, type VendorNpc } from '../../town/vendor/vendorDesk';
import type { SmithSlot } from '../../town/vendor/smith';
import type { FoodKind } from '../../town/vendor/vendorTable';
import { MEAL_TEXT, OFUDA_TEXT, SMITH_TEXT, STALL_TEXT } from '../../town/vendor/vendorText';
import { MealScreen } from '../../ui/shop/mealScreen';
import { ShopSay } from '../../ui/shop/shopSay';
import { smithCards, smithDetail, smithKey, stallCards, stallDetail, stallKey } from '../../ui/shop/vendorCards';
import { VendorScreen } from '../../ui/shop/vendorScreen';
import { modalLock } from './modalLock';
import type { WiredShop } from './shop';
import { createVendorLooks } from './vendorLooks';

type Who = 1 | 2;

/** パッドの メニューの Action → 画面の 操作（よろずやと 同じ） */
const PAD: Readonly<Record<string, ShopPad>> = { focusUp: 'up', focusDown: 'down', focusLeft: 'left', focusRight: 'right', confirm: 'confirm', closeMenu: 'back' };

/** 話す 人の 名前（ふきだし） */
const NPC_NAME = { smith: SMITH_TEXT.name, stall: STALL_TEXT.name, dango: MEAL_TEXT.dango, gohan: MEAL_TEXT.gohan } as const satisfies Record<VendorNpc, string>;

export function wireVendors(deps: WiredShop) {
  const { shared, game, hud, lock, pointerLock, controller, combat, fxSound } = deps;
  const svc = shared.vendors!;
  const modal = modalLock({ game, lock, pointerLock });
  const joined = (): boolean => shared.duoJoined();
  const alive = (who: Who): boolean => (who === 1 ? !combat.dead() : joined() && !shared.p2Down());
  const posOf = (who: Who): Vec3 | null => (who === 1 ? controller.state.position : joined() ? (shared.duoMate()?.position ?? null) : null);
  const inTown = (who: Who): boolean => {
    const p = posOf(who);
    const t = currentTown();
    return p !== null && t !== null && t.inTown(p.x, p.z);
  };
  const looks = createVendorLooks(deps);

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
        throw new Error(`やたいの 音 ${String(never)}`);
      }
    }
  };

  const desk = new VendorDesk({
    smith: svc.smith,
    kaitori: svc.kaitori,
    food: svc.food,
    play,
    onOpen: (who) => {
      if (who === 1) modal.open();
    },
    onClose: (who) => {
      if (who === 1) modal.close(1);
      shared.requestSave(); // やたいの きょうの 数・もちもの
    },
    fixed: () => {
      looks.hammer();
      playCraft(fxSound, 'guard'); // トンカン（仮）
    },
  });

  // ふきだし（画面の かわり。人の 名前 ＝ さいごに 話した 人。おふだ ＝ 名前なし）
  const sayName: Record<Who, string> = { 1: '', 2: '' };
  const says: Record<Who, ShopSay> = { 1: new ShopSay(hud, 1, () => sayName[1], 'vendor-say'), 2: new ShopSay(hud, 2, () => sayName[2], 'vendor-say') };
  shared.ofudaFx = {
    started: () => playCraft(fxSound, 'modalSparkle'),
    arrived: (_who, at) => {
      looks.arrived(at);
      playCraft(fxSound, 'sparkle');
    },
    refused: (who) => {
      sayName[who] = '';
      desk.say(who, OFUDA_TEXT.inTown);
      playCraft(fxSound, 'craftFail');
    },
  };
  shared.foodFx = {
    munch: () => playCraft(fxSound, 'crackle'),
    popped: () => playCraft(fxSound, 'badge'),
  };

  // 画面（1P・2P。同じ 部品）
  const smithScreens = {} as Record<Who, VendorScreen>;
  const stallScreens = {} as Record<Who, VendorScreen>;
  const mealScreens = {} as Record<Who, MealScreen>;
  for (const who of [1, 2] as const) {
    const common = {
      view: () => desk.view(who),
      dama: () => svc.smith.dama(who),
      half: joined,
      select: (id: string) => desk.select(who, id),
      buy: () => void desk.press(who),
      close: () => desk.close(who),
    };
    smithScreens[who] = new VendorScreen(hud, who, 'smith', SMITH_TEXT, {
      ...common,
      key: () => `${desk.version(who)}|${svc.smith.dama(who)}|${joined() ? 1 : 0}|${smithKey(svc.smith.items(who))}`,
      cards: () => smithCards(svc.smith.items(who)),
      detail: (id) => {
        const it = svc.smith.itemAt(who, smithSlotOf(id));
        return it ? smithDetail(it) : null;
      },
    });
    stallScreens[who] = new VendorScreen(hud, who, 'stall', STALL_TEXT, {
      ...common,
      key: () => `${desk.version(who)}|${svc.smith.dama(who)}|${joined() ? 1 : 0}|${stallKey(svc.kaitori.state(who))}`,
      cards: () => stallCards(svc.kaitori.state(who)),
      detail: (id) => {
        const st = svc.kaitori.state(who);
        const r = st.rows.find((x) => x.item === id);
        return r ? stallDetail(r, st) : null;
      },
    });
    mealScreens[who] = new MealScreen(hud, who, {
      view: () => desk.view(who),
      key: () => `${desk.version(who)}|${svc.food.dama(who)}|${joined() ? 1 : 0}|${svc.food.canEat(who, desk.view(who).meal ?? 'dango') ? 1 : 0}`,
      half: joined,
      canEat: (kind) => svc.food.canEat(who, kind),
      eat: () => void desk.press(who),
      close: () => desk.close(who),
    });
  }
  const sync = (): void => {
    for (const who of [1, 2] as const) {
      const on = who === 1 || joined();
      smithScreens[who].sync(on && desk.isOpen(who, 'smith'));
      stallScreens[who].sync(on && desk.isOpen(who, 'stall'));
      mealScreens[who].sync(on && desk.isOpen(who, 'meal'));
    }
    says[1].sync(desk.saying(1), joined());
    says[2].sync(joined() ? desk.saying(2) : null, true);
  };
  /** 画面の 1 ステップ（世界を 止めて いる 間も）: やられた・街を 出た で とじる・ふきだしの 時間・画面を 合わせる */
  const uiStep = (): void => {
    for (const who of [1, 2] as const) if (desk.isOpen(who)) desk.step(who, { alive: alive(who), inTown: inTown(who) });
    if (!joined()) svc.ofuda.cancel(2);
    desk.tickSay();
    sync();
  };
  game.onUpdate(() => {
    desk.stepWorld(); // 日が かわる・もぐもぐ
    svc.ofuda.step();
    looks.step(
      (who) => svc.ofuda.state(who).charging,
      (who) => posOf(who),
    );
    uiStep();
  });

  const shopHub = shared.shop; // よろずや（wireShop が 先に 入れた 口）
  /** 話す（右クリック・ZL・窓口の open） */
  const talk = (who: Who, npc: VendorNpc): boolean => {
    if (who === 2 && !joined()) return false;
    if (!alive(who) || !currentTown() || shopHub.openBy(who)) return false;
    const ok = desk.talk(who, npc, inTown(who));
    if (!ok) sayName[who] = NPC_NAME[npc];
    sync();
    return ok;
  };
  shared.townVendors = { at: (npc) => currentTown()?.info().npcs.find((n) => n.kind === npc)?.pos ?? null, talk };

  // よろずやの 口に まぜる（止める・その場に 止まる・パッド・Esc）
  const vendorFrozen = (): boolean => vendorFreezesWorld({ open1: desk.isOpen(1), joined: joined() });
  const vendorPad = (who: Who, action: string): void => {
    const a = PAD[action];
    if (!a || !desk.isOpen(who)) return;
    desk.pad(who, a, desk.isOpen(who, 'smith') ? smithScreens[who].cols() : stallScreens[who].cols());
    sync();
  };
  const hub: ShopHub = {
    at: () => shopHub.at(),
    talk: (who) => !desk.isOpen(who) && shopHub.talk(who),
    openBy: (who) => shopHub.openBy(who) || desk.isOpen(who),
    frozen: () => shopHub.frozen() || vendorFrozen(),
    tick: () => {
      if (shopHub.frozen()) shopHub.tick();
      if (vendorFrozen()) uiStep();
    },
    pad: (who, action) => {
      if (shopHub.openBy(who)) shopHub.pad(who, action);
      else vendorPad(who, action);
    },
  };
  shared.shop = hub;
  // 1P の Esc（と 1P の パッドの メニュー操作）。2P の パッドは duo.ts の ステップが shared.shop.pad へ
  game.input.onPress((action) => {
    if (desk.isOpen(1)) vendorPad(1, action);
  });

  const open = (who: Who, kind: VendorKind, npc: VendorNpc): boolean => talk(who, npc) && desk.isOpen(who, kind);
  const close = (who: Who): void => {
    desk.close(who);
    sync();
  };
  const dev = new URLSearchParams(location.search).get('duo') === 'dev';
  const invOf = (who: Who) => (who === 1 ? deps.inventory : joined() ? (shared.duoMate()?.inventory ?? null) : null);

  /** `window.__rikkun.ofuda / smith / stall / food` と `duo` の 足し（e2e/town1e.spec.ts の 頭の 約束。p ＝ 1 | 2） */
  const vendorHook = {
    ofuda: {
      use: (p: Who): void => {
        if (p === 2 && !joined()) return;
        svc.ofuda.use(p);
      },
      state: (p: Who) => svc.ofuda.state(p),
    },
    smith: {
      open: (p: Who): boolean => open(p, 'smith', 'smith'),
      state: (p: Who) => ({ open: desk.isOpen(p, 'smith'), items: svc.smith.items(p).map((i) => ({ ...i })) }),
      fix: (p: Who, slot: SmithSlot) => {
        const r = desk.fix(p, slot);
        sync();
        return r;
      },
      close,
    },
    stall: {
      open: (p: Who): boolean => open(p, 'stall', 'stall'),
      state: (p: Who) => {
        const st = svc.kaitori.state(p);
        return { open: desk.isOpen(p, 'stall'), today: st.today, cap: st.cap, rows: st.rows.map((r) => ({ ...r })) };
      },
      give: (p: Who, item: ItemId) => {
        const r = desk.give(p, item);
        sync();
        return r;
      },
      close,
    },
    food: {
      open: (p: Who, kind: FoodKind): boolean => open(p, 'meal', kind),
      eat: (p: Who, kind: FoodKind) => {
        const r = desk.eat(p, kind);
        sync();
        return r;
      },
      state: (p: Who) => ({ open: desk.isOpen(p, 'meal'), kind: desk.view(p).meal, munching: svc.food.munching(p) }),
      close,
    },
    duo: {
      /** その 人の もちものの マス（0 はじまり）の たいきゅう */
      durability: (p: Who, slot: number): { max: number; left: number } | null => {
        const d = invOf(p)?.durability(slot);
        return d ? { max: d.max, left: d.left } : null;
      },
      /** たいきゅうを left に する（`?duo=dev` の ときだけ） */
      setDurability: (p: Who, slot: number, left: number): void => {
        const inv = invOf(p) as { setDurability?(slot: number, left: number): void } | null;
        if (dev) inv?.setDurability?.(slot, left);
      },
    },
  };
  return { vendorHook };
}

export type WiredVendors = WiredShop & ReturnType<typeof wireVendors>;
