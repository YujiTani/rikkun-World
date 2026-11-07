// COOP-1 4a（docs/design/COOP-1.md §3.3・§12.0）: 2 人用 もちもの・クラフト画面の「決まり」。DOM を 使わない 関数だけ。
import type { Action } from '../input/actions';

/** 画面の 形（`#inventory-screen` の `data-layout` は 'duo' の ときだけ 付く） */
export type InvLayout = 'full' | 'duo';
/** 1P の 全面が 今 見せている ページ */
export type FullPage = 'items' | 'craft' | 'furnace' | 'storage' | 'achievements' | 'log';
/** 2 人用 画面の ページ（`data-page`・`duo.inv(who).page`）。やく・たんす は 4c から 3 つ目の タブ */
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

// ---- 【4c】COOP-1 4c（§3.3「3 つ目の タブ」「開いた ときの えらび」・§9.8）

/** かまど・たんすを 開いている か（開いている 人は その場に 止まるので 両方 true には ならない） */
export interface DuoOpenNow {
  furnace: boolean;
  storage: boolean;
}

/**
 * 2 人用の ページごとの 性質。足し忘れは 型で 落とす。
 * craftTab = その ページで「つくる」の 部品が 見せる 中身（なければ null）、furnace・storage = かまど・たんすを 開いている ときだけ 出る ページか
 */
const PAGE_TRAITS = {
  items: { craftTab: null, furnace: false, storage: false },
  craft: { craftTab: 'craft', furnace: false, storage: false },
  furnace: { craftTab: 'bake', furnace: true, storage: false },
  tansu: { craftTab: null, furnace: false, storage: true },
} as const satisfies Record<DuoInvPage, { craftTab: 'craft' | 'bake' | null; furnace: boolean; storage: boolean }>;

export function duoPageTraits(page: DuoInvPage): (typeof PAGE_TRAITS)[DuoInvPage] {
  return PAGE_TRAITS[page];
}

const TABS_BASE: readonly DuoInvPage[] = ['items', 'craft'];
const TABS_FURNACE: readonly DuoInvPage[] = ['items', 'craft', 'furnace'];
const TABS_TANSU: readonly DuoInvPage[] = ['items', 'craft', 'tansu'];

/** 上の タブの 並び。いつも もちもの・つくる、かまどを 開いている あいだは 3 つ目に やく、たんすを 開いている あいだは 3 つ目に たんす */
export function duoTabs(open: DuoOpenNow): readonly DuoInvPage[] {
  if (open.furnace) return TABS_FURNACE;
  if (open.storage) return TABS_TANSU;
  return TABS_BASE;
}

/** その ページの タブを 出して よいか（やく = かまどを 開いている・たんす = たんすを 開いている。もちもの・つくる は いつも） */
export function duoPageAvailable(page: DuoInvPage, open: DuoOpenNow): boolean {
  const t = PAGE_TRAITS[page];
  return (!t.furnace || open.furnace) && (!t.storage || open.storage);
}

/** 今の ページが もう 出せない（かまど・たんすが こわれた）なら「もちもの」。出せるなら そのまま（パネルは とじない） */
export function duoPageFallback(page: DuoInvPage, open: DuoOpenNow): DuoInvPage {
  return duoPageAvailable(page, open) ? page : 'items';
}

/**
 * 開いた ときの 最初の えらび（`duo.inv(who).focus`）。たんす → 'tansu:0'、やく → はじめの やく レシピ。
 * もちもの・つくる は null（画面の いちばん はじめの 物を 呼ぶ側が えらぶ）。2P は いつも、1P は パッドで 開いた とき
 */
export function duoFirstFocus(page: DuoInvPage, bakeRecipeIds: readonly string[]): string | null {
  return FIRST_FOCUS[page](bakeRecipeIds);
}

/** ページごとの はじめの えらび。足し忘れは 型で 落とす */
const FIRST_FOCUS = {
  items: () => null,
  craft: () => null,
  furnace: (ids) => (ids.length > 0 ? `tile:${ids[0]}` : null),
  tansu: () => 'tansu:0',
} as const satisfies Record<DuoInvPage, (bakeRecipeIds: readonly string[]) => string | null>;

/** 2P の「やめる」を 出す ページ（「もちもの」だけ。つくる・やく・たんす には 出さない） */
export function duoQuitShown(page: DuoInvPage): boolean {
  return page === 'items';
}

/**
 * たんす（9 列）・レシピの 列で、index の マスの 段が まるごと 見える ために 中の スクロール量を どうするか（新しい scrollTop）。
 * すでに まるごと 見えていれば そのまま。上に はみ出していれば その 段の 上へ、下に はみ出していれば その 段の 下が 見える 最小の 量へ。
 */
export function scrollTopToShow(index: number, g: { columns: number; rowHeight: number; rowGap: number; viewHeight: number; scrollTop: number }): number {
  const top = Math.floor(index / g.columns) * (g.rowHeight + g.rowGap);
  const bottom = top + g.rowHeight;
  if (top < g.scrollTop) return top;
  if (bottom > g.scrollTop + g.viewHeight) return bottom - g.viewHeight;
  return g.scrollTop;
}

const TANSU_BAND_DUO = ['tansu-store-all', 'tansu-store-same', 'tansu-take-all'] as const;
const TANSU_BAND_FULL = [...TANSU_BAND_DUO, 'tansu-store-marked'] as const;

/** たんすの 帯の ボタンの 種類の 名前。2 人用は「えらんだ もの を しまう」（マウスの Ctrl クリック）を 出さない（1P も 2P も 同じ 3 つ。§13） */
export function tansuBandIds(layout: InvLayout): readonly string[] {
  return layout === 'duo' ? TANSU_BAND_DUO : TANSU_BAND_FULL;
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
