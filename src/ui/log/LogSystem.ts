import type { Craft2Settings, ItemId, LogCategory, LogEntry, LogKind, TansuPos } from '../../contracts';
import { createCraft2Settings } from '../../contracts';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../../fx/craftConfig';
import { PickupLogModel, liveRowText, type LiveKind } from '../pickupLogModel';
import { categoryIconPixels } from './categoryIcons';

/** できごと ページが 一度に見せる行 */
export const LOG_VISIBLE_ROWS = 7;

export type LogTab = 'items' | 'achievements' | 'log';

/** もちもの画面との つなぎ（つなぎ込みが `bindHost` で渡す） */
export interface LogHost {
  /** もちもの画面が 開いているか */
  isOpen(): boolean;
  tab(): LogTab;
  /** もちもの画面を できごと タブで 開く（開いていれば タブを替える） */
  open(): void;
}

export interface LogLiveRow {
  kind: LiveKind;
  category: LogCategory;
  item: ItemId;
  count: number;
  text: string;
  ticksLeft: number;
}

export interface LogUiState {
  open: boolean;
  tab: LogTab;
  rows: number;
  scrollRow: number;
  canUp: boolean;
  canDown: boolean;
}

export type LogSignal = 'needTool' | 'needIron' | 'noArrow' | 'full' | 'tansuFull';

/** 合図ごとの 文と、ログに 絵で 出す アイテム（なければ null）。1 つの 合図に 1 行（足し忘れは 型エラー） */
const SIGNAL_LOG = {
  needTool: { text: 'つるはし が いるよ', item: 'stone_pickaxe' },
  needIron: { text: 'てつの つるはし が いるよ', item: 'iron_pickaxe' },
  noArrow: { text: 'や が いるよ', item: 'ya' },
  full: { text: 'もちもの が いっぱい！', item: null },
  tansuFull: { text: 'たんす が いっぱい！', item: null },
} as const satisfies Record<LogSignal, { text: string; item: ItemId | null }>;

interface Entry {
  tick: number;
  kind: LogKind;
  category: LogCategory;
  item: ItemId | null;
  /** 数のある件の数。ない件は null */
  count: number | null;
  text: string;
  /** 数のない件の もとの文（`×2` を足す前） */
  base: string;
  /** 数のない件が 何回 起きたか */
  rep: number;
  /** 数のある件の文を 作り直すための 前・後ろ（`×数` の前と後）。数のない件は null */
  fmt: [string, string] | null;
  positions?: (TansuPos & { count: number })[];
}

export interface LogDeps {
  /** アイテムの ひらがなの名前 */
  nameOf?(item: ItemId): string;
  settings?: Pick<Craft2Settings, 'logHistoryMax' | 'logMergeTicks' | 'logScrollRows'>;
  /** 左のログの 5 行・180 ステップ（M4 のまま） */
  live?: CraftUiSettings;
}

/**
 * ログ（左）と できごと（履歴）の中身（CRAFT-2 §2.5〜§2.7。画面なし）。
 * - 履歴: 新しい順に 100 件まで。180 ステップ以内の「同じ件」は 数を足す。保存しない。
 * - 左のログ: 拾った／たんす から つかった の 2 しゅるいで 5 行を 分け合う（`PickupLogModel`）。
 * `step()` を 1 ステップに 1 回呼ぶ。
 */
export class LogSystem {
  /** 左のログの中身。画面（`PickupLog`）が これを読む */
  readonly liveModel: PickupLogModel;
  private readonly hist: Entry[] = []; // 古い → 新しい
  private readonly settings: NonNullable<LogDeps['settings']>;
  private readonly nameOf: (item: ItemId) => string;
  private now = 0;
  private scrollRow_ = 0;
  private version_ = 0;
  private host: LogHost | null = null;
  private readonly edges = new Map<string, boolean>();

  constructor(deps: LogDeps = {}) {
    this.settings = deps.settings ?? createCraft2Settings();
    this.nameOf = deps.nameOf ?? ((i) => i);
    this.liveModel = new PickupLogModel(deps.live ?? CRAFT_UI_SETTINGS);
  }

  // ------------------------------------------------------------ 時間

  /** 1 ステップ */
  step(): void {
    this.now++;
    this.liveModel.step();
  }

  tick(): number {
    return this.now;
  }

  /** 中身が 変わるたびに ふえる数（画面の作り直しの目印） */
  version(): number {
    return this.version_;
  }

  // ------------------------------------------------------------ 入れる

  /** 1 件 入れる（まとめ方は §2.6 (2)）。`e.count` が数のない件は null */
  push(e: LogEntry): void {
    const last = this.hist[this.hist.length - 1];
    const sameKey = (a: Entry): boolean =>
      a.category === e.category && a.kind === e.kind && a.item === e.item && (e.count !== null || a.base === e.text);
    if (last && (last.count !== null) === (e.count !== null) && sameKey(last) && e.tick - last.tick <= this.settings.logMergeTicks) {
      if (e.count !== null && last.count !== null) {
        const next = last.count + e.count;
        if (last.fmt) last.text = `${last.fmt[0]}×${next}${last.fmt[1]}`;
        last.count = next;
        if (e.positions) last.positions = mergePositions(last.positions ?? [], e.positions);
      } else {
        last.rep++;
        last.text = `${last.base} ×${last.rep}`;
      }
    } else {
      this.hist.push({
        tick: e.tick,
        kind: e.kind,
        category: e.category,
        item: e.item,
        count: e.count,
        text: e.text,
        base: e.text,
        rep: 1,
        fmt: splitCount(e.text, e.count),
        positions: e.positions ? e.positions.map((p) => ({ ...p })) : undefined,
      });
      while (this.hist.length > Math.max(1, this.settings.logHistoryMax)) this.hist.shift();
      if (this.scrollRow_ > 0) this.scrollRow_++; // 下を見ているときは 見ている行を 動かさない
      this.clampScroll();
    }
    if ((e.kind === 'pickup' || e.kind === 'fromTansu') && e.item && e.count && e.count > 0) {
      this.liveModel.push(e.item, e.count, e.kind);
    }
    this.version_++;
  }

  /** 拾った（ほった・おとしもの・焼けて入った・しゅうかく）。左のログにも出る */
  pickup(item: ItemId, count: number): void {
    if (!(count > 0)) return;
    this.push({ tick: this.now, kind: 'pickup', category: 'pickup', item, count, text: liveRowText('pickup', this.nameOf(item), count) });
  }

  /** たんす から つかった（アイテムごとに 1 件。`fromTansu` が 空なら 何もしない）。左のログにも出る */
  fromTansu(used: readonly (TansuPos & { item: ItemId; count: number })[] | undefined): void {
    const byItem = new Map<ItemId, { total: number; pos: (TansuPos & { count: number })[] }>();
    for (const u of used ?? []) {
      if (!(u.count > 0)) continue;
      const g = byItem.get(u.item) ?? { total: 0, pos: [] };
      g.total += u.count;
      g.pos = mergePositions(g.pos, [{ x: u.x, y: u.y, z: u.z, count: u.count }]);
      byItem.set(u.item, g);
    }
    for (const [item, g] of byItem) {
      this.push({
        tick: this.now,
        kind: 'fromTansu',
        category: 'craft',
        item,
        count: g.total,
        text: liveRowText('fromTansu', this.nameOf(item), g.total),
        positions: g.pos,
      });
    }
  }

  /** つくった（履歴だけ） */
  craftMade(item: ItemId, count: number): void {
    this.push({ tick: this.now, kind: 'craft', category: 'craft', item, count, text: `${this.nameOf(item)} ×${count} を つくった` });
  }

  /** やきはじめた（履歴だけ）。item = できるもの */
  bakeStart(item: ItemId): void {
    this.push({ tick: this.now, kind: 'bakeStart', category: 'craft', item, count: null, text: `かまど で ${this.nameOf(item)} を やく` });
  }

  /** 照準の下の合図（いっぱい・つるはし・てつの つるはし・や）。出ていない状態から 出たときだけ呼ぶ */
  signal(kind: LogSignal): void {
    const { text, item } = SIGNAL_LOG[kind];
    this.push({ tick: this.now, kind: 'signal', category: 'warn', item, count: null, text });
  }

  /** 農業の合図（M7 の文。漢字は ふりがな付きの HTML のまま、ここでは ひらがなの文を受ける） */
  farmHint(text: string, item: ItemId | null = null): void {
    this.push({ tick: this.now, kind: 'farmHint', category: 'info', item, count: null, text });
  }

  wearLow(item: ItemId): void {
    this.push({ tick: this.now, kind: 'wearLow', category: 'info', item, count: null, text: `${this.nameOf(item)} が もうすぐ こわれるよ` });
  }

  wearBroken(item: ItemId): void {
    this.push({ tick: this.now, kind: 'wearBroken', category: 'info', item, count: null, text: `${this.nameOf(item)} が こわれた` });
  }

  /** 妖怪を たおした（履歴だけ） */
  defeat(yokaiName: string): void {
    this.push({ tick: this.now, kind: 'defeat', category: 'fight', item: null, count: null, text: `${yokaiName} を たおした` });
  }

  /** やられて スタートに もどった */
  home(): void {
    this.push({ tick: this.now, kind: 'home', category: 'fight', item: null, count: null, text: 'スタートに もどったよ' });
  }

  achievement(name: string): void {
    this.push({ tick: this.now, kind: 'achievement', category: 'achieve', item: null, count: null, text: `「${name}」 を とった` });
  }

  level(n: number): void {
    this.push({ tick: this.now, kind: 'level', category: 'achieve', item: null, count: null, text: `レベル ${n} に なった` });
  }

  /**
   * 「出ているあいだ 1 件」の合図用。`active` が false → true に変わった呼び出しだけ `fn` を呼ぶ
   * （同じ合図が 出たまま 時間を もどしただけ では 件を ふやさない。§2.6 (1)）
   */
  edge(key: string, active: boolean, fn: () => void): void {
    const was = this.edges.get(key) === true;
    this.edges.set(key, active);
    if (active && !was) fn();
  }

  // ------------------------------------------------------------ 読む（テストの窓口 §6.1）

  /** 左のログの行（上＝古い） */
  live(): LogLiveRow[] {
    return this.liveModel.listAll().map((r) => ({
      kind: r.kind,
      category: r.kind === 'fromTansu' ? 'craft' : 'pickup',
      item: r.item,
      count: r.count,
      text: liveRowText(r.kind, this.nameOf(r.item), r.count),
      ticksLeft: r.ticksLeft,
    }));
  }

  /** 履歴（新しい順） */
  history(): LogEntry[] {
    const out: LogEntry[] = [];
    for (let i = this.hist.length - 1; i >= 0; i--) {
      const h = this.hist[i];
      const e: LogEntry = { tick: h.tick, kind: h.kind, category: h.category, item: h.item, count: h.count, text: h.text };
      if (h.positions) e.positions = h.positions.map((p) => ({ ...p }));
      out.push(e);
    }
    return out;
  }

  length(): number {
    return this.hist.length;
  }

  clear(): void {
    this.hist.length = 0;
    this.liveModel.clear();
    this.scrollRow_ = 0;
    this.version_++;
  }

  // ------------------------------------------------------------ ページ

  bindHost(host: LogHost): void {
    this.host = host;
  }

  /** できごと タブを 開いたのと同じ */
  open(): void {
    this.scrollRow_ = 0;
    this.version_++;
    this.host?.open();
  }

  /** ▼（1）・▲（-1）を 押したのと同じ（1 回で `logScrollRows` 行） */
  scroll(dir: 1 | -1): void {
    this.scrollRows(dir * this.settings.logScrollRows);
  }

  /** ホイールなど 行ごとの 動き */
  scrollRows(n: number): void {
    const before = this.scrollRow_;
    this.scrollRow_ += n;
    this.clampScroll();
    if (this.scrollRow_ !== before) this.version_++;
  }

  /** 開いたとき いつも いちばん上（新しい所）から */
  resetScroll(): void {
    if (this.scrollRow_ !== 0) {
      this.scrollRow_ = 0;
      this.version_++;
    }
  }

  ui(): LogUiState {
    const tab = this.host?.tab() ?? 'items';
    const open = !!this.host && this.host.isOpen() && tab === 'log';
    const max = this.maxScroll();
    return { open, tab, rows: this.hist.length, scrollRow: this.scrollRow_, canUp: this.scrollRow_ > 0, canDown: this.scrollRow_ < max };
  }

  icon(category: LogCategory): (string | null)[] {
    return categoryIconPixels(category);
  }

  private maxScroll(): number {
    return Math.max(0, this.hist.length - LOG_VISIBLE_ROWS);
  }
  private clampScroll(): void {
    this.scrollRow_ = Math.max(0, Math.min(this.maxScroll(), this.scrollRow_));
  }
}

/** 文を `×数` の前と後ろに分ける（数のない件・`×数` が見つからない件は null） */
function splitCount(text: string, count: number | null): [string, string] | null {
  if (count === null) return null;
  const key = `×${count}`;
  const i = text.lastIndexOf(key);
  return i < 0 ? null : [text.slice(0, i), text.slice(i + key.length)];
}

function mergePositions(a: readonly (TansuPos & { count: number })[], b: readonly (TansuPos & { count: number })[]): (TansuPos & { count: number })[] {
  const out = a.map((p) => ({ ...p }));
  for (const p of b) {
    const same = out.find((q) => q.x === p.x && q.y === p.y && q.z === p.z);
    if (same) same.count += p.count;
    else out.push({ ...p });
  }
  return out;
}
