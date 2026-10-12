import type { ArmorSlot, CombatEvent, CraftEvent, CraftSystem, Inventory, ItemId, Rarity, SwingAnim } from '../contracts';
import type { CraftSoundName } from '../fx/craftSounds';
import { CRAFT_SOUNDS, playCraft } from '../fx/craftSounds';
import type { SoundFx, Tone } from '../fx/sound';
import { CraftHint } from './craftHint';
import { anyCraftNow } from './craftModel';
import type { CraftPanel } from './craftPanel';
import type { PickupLog } from './pickupLog';
import type { Tooltip } from './tooltip';

/** CraftEvent を音と拾ったログにする（つなぎ込みが `craft.drainEvents()` の結果をここへ渡す） */
export function handleCraftEvents(
  events: readonly CraftEvent[],
  d: {
    sound: Pick<SoundFx, 'playTones'>;
    pickupLog?: Pick<PickupLog, 'push'>;
    /** M6: 「つくった」の音は 演出（CelebrateUi.made）が鳴らす。true なら ここでは鳴らさない */
    celebrate?: boolean;
  },
): void {
  for (const e of events) {
    switch (e.type) {
      case 'craft': {
        if (d.celebrate) break;
        // トントン ぽん！ のあとに ばんざい の明るい音
        const banzai = CRAFT_SOUNDS.banzai.map((t): Tone => ({ ...t, delay: t.delay + 0.38, gain: t.gain * 0.7 }));
        d.sound.playTones([...(CRAFT_SOUNDS.craft as readonly Tone[]), ...banzai]);
        break;
      }
      case 'craftFail':
        playCraft(d.sound, 'craftFail');
        break;
      case 'bakeStart':
        playCraft(d.sound, 'bakeStart');
        break;
      case 'bakeDone':
        playCraft(d.sound, 'bakeDone');
        break;
      case 'pickup':
        d.pickupLog?.push(e.item, e.count);
        break;
    }
  }
}

/** うでの動き（ToolSystem.drainSwings）に合わせた音の名前。武器が きらきらの かたな なら「キラン」もつく */
export function swingSounds(anim: SwingAnim, held: ItemId | null): CraftSoundName[] {
  switch (anim) {
    case 'slash':
      return held === 'crystal_katana' ? ['slash', 'sparkle'] : ['slash'];
    case 'thrust':
    case 'sweep':
      return ['naginata'];
    case 'draw':
      return ['bowDraw'];
    case 'release':
      return ['bowRelease'];
    default:
      return [];
  }
}

export function playSwing(sound: Pick<SoundFx, 'playTones'>, anim: SwingAnim, held: ItemId | null): void {
  for (const n of swingSounds(anim, held)) playCraft(sound, n);
}

/** 戦いの出来事から鳴らす M4 の音: ふせいだ「カキン！」（防具でカットしたとき） */
export function handleGuardEvents(events: readonly CombatEvent[], sound: Pick<SoundFx, 'playTones'>): void {
  for (const e of events) if (e.type === 'playerHit' && e.blocked === true) playCraft(sound, 'guard');
}

export interface CraftUiDeps {
  hud: HTMLElement;
  craft: CraftSystem;
  inv: Pick<Inventory, 'count' | 'onChange'>;
  nameOf(item: ItemId): string;
  rarityOf(item: ItemId): Rarity;
}

/** 遊んでいるときに出る M4 の画面（つくれる マーク・拾ったときの ログ）をまとめて動かす */
export class CraftUiHud {
  readonly hint: CraftHint;
  constructor(private readonly d: CraftUiDeps, readonly pickupLog: PickupLog) {
    this.hint = new CraftHint(d.hud);
  }

  /** 毎ステップ（dt = 1 ステップの秒） */
  update(dt: number): void {
    this.hint.update(anyCraftNow(this.d.craft, this.d.inv), dt);
    this.pickupLog.step();
  }
}

export interface CraftUiHookDeps {
  panel: CraftPanel;
  craft: CraftSystem;
  inv: Pick<Inventory, 'count'>;
  pickupLog: Pick<PickupLog, 'model'>;
  tooltip: Pick<Tooltip, 'hover' | 'data'>;
  /** そうびのマスをクリック（ArmorSystem.click） */
  armorClick(slot: ArmorSlot): void;
}

/**
 * テストの窓口（M4 §6.1）のうち、画面の担当（C1）の分。つなぎ込みが `window.__rikkun` にくっつける。
 * - `craft.click(id)`・`craft.ui()`
 * - `armor.click('head' | 'body')`
 * - `inventory.pickupLog()`・`inventory.hover(target | null)`・`inventory.tooltip()`
 * （`lock.tab` と `lock.get()` に足す項目は `createGuideHook`。`inventory.pickup` は A）
 */
export function createCraftUiHook(d: CraftUiHookDeps) {
  return {
    craft: {
      click: (id: string) => d.panel.click(id),
      ui: () => ({ ...d.panel.ui(), hintVisible: anyCraftNow(d.craft, d.inv) }),
    },
    armor: {
      click: (slot: string) => d.armorClick(slot as ArmorSlot),
    },
    inventory: {
      pickupLog: () => d.pickupLog.model.list(),
      hover: (target: string | number | null) => d.tooltip.hover(target),
      tooltip: () => {
        const t = d.tooltip.data();
        return t ? { item: t.item, name: t.name, rarity: t.rarity, stars: t.stars, lines: [...t.lines] } : null;
      },
    },
  };
}
