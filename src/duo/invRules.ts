// COOP-1 4a（docs/design/COOP-1.md §3.3・§12.0）: 2 人用 もちもの・クラフト画面の「決まり」。DOM を 使わない 関数だけ。
import type { Action } from '../input/actions';

/** 画面の 形（`#inventory-screen` の `data-layout` は 'duo' の ときだけ 付く） */
export type InvLayout = 'full' | 'duo';
/** 1P の 全面が 今 見せている ページ */
export type FullPage = 'items' | 'craft' | 'furnace' | 'storage' | 'achievements' | 'log';
/** 2 人用 画面の ページ（`data-page`・`duo.inv(who).page`）。やく・たんす は 4c */
export type DuoInvPage = 'items' | 'craft' | 'furnace' | 'tansu';

/**
 * 1P の 画面の 形。2P が いれば いつも 'duo'（開いている とちゅうで 参加した ときも その ステップで。AC79）。
 * いなければ 開いている あいだは 今の まま（2P が いなくなっても とじるまで 半分）、とじていれば 'full'（つぎに 開く ときから 全面）
 */
export function invLayoutFor(i: { joined: boolean; open: boolean; current: InvLayout }): InvLayout {
  if (i.joined) return 'duo';
  return i.open ? i.current : 'full';
}

/** 全面の ページ → 2 人用の ページ（じっせき・できごと は 2 人用に ないので「もちもの」）。足し忘れは 型で 落とす */
const DUO_PAGE_OF = {
  items: 'items',
  craft: 'craft',
  furnace: 'furnace',
  storage: 'tansu',
  achievements: 'items',
  log: 'items',
} as const satisfies Record<FullPage, DuoInvPage>;

export function duoPageOf(full: FullPage): DuoInvPage {
  return DUO_PAGE_OF[full];
}

/** `duo.inv(who)` の 値。2 人用で 開いている ときだけ 中身が ある（1 人の 全面・とじている ときは 空） */
export function duoInvSnapshot(i: { layout: InvLayout; open: boolean; page: DuoInvPage; focus: string | null }): {
  open: boolean;
  page: DuoInvPage | null;
  focus: string | null;
} {
  if (i.layout !== 'duo' || !i.open) return { open: false, page: null, focus: null };
  return { open: true, page: i.page, focus: i.focus };
}

/** 入力の 出どころ（マス・タブ・つくる の クリック／ドラッグ／ツールチップも 同じ） */
export type InvSource = { device: 'mouse' } | { device: 'key' } | { device: 'pad'; player: 1 | 2 };

/** その 画面（1P = 左・2P = 右）が その 入力を うけるか。マウス・キーは 1P の 物 */
export function invAccepts(panel: 1 | 2, src: InvSource): boolean {
  switch (src.device) {
    case 'mouse':
    case 'key':
      return panel === 1;
    case 'pad':
      return src.player === panel;
    default: {
      const never: never = src;
      return never;
    }
  }
}

/** 開いている 2 人用 画面を パッドで うごかす 命令 */
export type InvPadCommand = 'up' | 'down' | 'left' | 'right' | 'press' | 'close';

/** パッドの Action → 命令。十字・けってい・とじる の 6 つ だけ（L/R・Y・ほかは メニュー中は 何も しない） */
const PAD_COMMANDS: Partial<Record<Action, InvPadCommand>> = {
  focusUp: 'up',
  focusDown: 'down',
  focusLeft: 'left',
  focusRight: 'right',
  confirm: 'press',
  closeMenu: 'close',
};

export function invPadCommand(action: Action): InvPadCommand | null {
  return PAD_COMMANDS[action] ?? null;
}

/** `DuoSession.step` の `quitHeld`: 画面が 開いていて、えらびが「やめる」で、confirm を 押している ときだけ true（AC78） */
export function invQuitHeld(i: { open: boolean; focus: string | null; confirmHeld: boolean }): boolean {
  return i.open && i.focus === 'quit' && i.confirmHeld;
}

export type InvCloseReason = 'left' | 'down' | 'padLost';

/**
 * その 人の パネルを その ステップで とじる 理由（AC89）。
 * 2P: やめた → 'left'、倒れた → 'down'、パッドが ぬけた → 'padLost'（この 順）。
 * 1P: 倒れた → 'down' だけ（1P の パッドが ぬけても キー・マウスで つづく。1P には「やめた」が ない）
 */
export function invCloseReason(who: 1 | 2, i: { down: boolean; padLost: boolean; left: boolean }): InvCloseReason | null {
  if (who === 2) {
    if (i.left) return 'left';
    if (i.down) return 'down';
    if (i.padLost) return 'padLost';
    return null;
  }
  return i.down ? 'down' : null;
}
