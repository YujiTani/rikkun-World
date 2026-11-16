import type { Inventory, ItemId } from '../../contracts';
import type { WalletPort } from '../../dama/walletPort';
import { KAITORI_ROWS, KAITORI_TUNING } from './vendorTable';

/**
 * かいとりの やたいの 係（TOWN-1 1E。docs/design/TOWN-1-shop.md §2.12・§4.9・AC35。保存 TOWN-1.md §4.6）。画面・three なし。
 * やさい・たまご・鉱石を 1 組 わたすと ようかいダマ 1。1 日に もらえる ようかいダマに 上限（人ごと）。
 * 「1 日」は ゲームの 日（`time.day()`。つぎの ひるの はじめの ステップで ふえる）。日が かわると きょうの 数は 0。
 */

type Who = 1 | 2;

export type KaitoriGiveResult = 'ok' | 'short' | 'cap';

/** カードの 1 行（窓口 `stall.state(p).rows` と 同じ 形） */
export interface KaitoriRowView {
  item: ItemId;
  need: number;
  have: number;
  canGive: boolean;
}

export interface KaitoriState {
  /** きょう もらった ようかいダマ */
  today: number;
  /** 1 日の 上限 */
  cap: number;
  rows: KaitoriRowView[];
}

export interface KaitoriPorts {
  /** その 人の もちもの（2P が いなければ null） */
  inventory(who: Who): Pick<Inventory, 'add' | 'count' | 'remove'> | null;
  /** その 人の さいふ（かいとりの ようかいダマは ここへ。いっぱいでも 足もとに 落とさない。1.6〔1F〕） */
  wallet: WalletPort;
  /** いまの ゲームの 日（`time.day()`） */
  day(): number;
}

const VERSION = 1;
interface Saved {
  v: number;
  /** [1P, 2P] の きょう もらった 数と その 日 */
  p: [{ today: number; day: number }, { today: number; day: number }];
}

/** 表に ある 物の 1 組の 数（ない 物は null） */
function kaitoriNeed(item: string): number | null {
  return KAITORI_ROWS.find((r) => r.item === item)?.need ?? null;
}

export class KaitoriService {
  private readonly got: [{ today: number; day: number }, { today: number; day: number }] = [
    { today: 0, day: 0 },
    { today: 0, day: 0 },
  ];

  constructor(private readonly ports: KaitoriPorts) {
    const d = ports.day();
    this.got[0].day = d;
    this.got[1].day = d;
  }

  /** 毎ステップ: 日が かわったら きょうの 数を 0 に（画面を 開いた ままでも） */
  step(): void {
    this.roll(1);
    this.roll(2);
  }

  /** その 人の きょうの 数 */
  today(who: Who): number {
    this.roll(who);
    return this.got[who - 1]!.today;
  }

  state(who: Who): KaitoriState {
    const today = this.today(who);
    const cap = KAITORI_TUNING.dailyCap;
    const rows: KaitoriRowView[] = [];
    const inv = this.ports.inventory(who);
    if (inv) {
      for (const r of KAITORI_ROWS) {
        const have = inv.count(r.item);
        if (have > 0) rows.push({ item: r.item, need: r.need, have, canGive: have >= r.need && today < cap });
      }
    }
    return { today, cap, rows };
  }

  /** あと 何こ たりないか（たりて いる・表に ない 物は 0） */
  short(who: Who, item: ItemId): number {
    const need = kaitoriNeed(item);
    const inv = this.ports.inventory(who);
    return need === null || !inv ? 0 : Math.max(0, need - inv.count(item));
  }

  /** 1 組 わたす（たりない・表に ない ＝ short、きょうは もう いっぱい ＝ cap。どちらも 何も へらない） */
  give(who: Who, item: ItemId): KaitoriGiveResult {
    const need = kaitoriNeed(item);
    const inv = this.ports.inventory(who);
    if (need === null || !inv) return 'short';
    if (this.today(who) >= KAITORI_TUNING.dailyCap) return 'cap';
    if (inv.count(item) < need) return 'short';
    inv.remove(item, need);
    this.got[who - 1]!.today++;
    this.ports.wallet.add(who, 1);
    return 'ok';
  }

  serialize(): Saved {
    return { v: VERSION, p: [{ ...this.got[0] }, { ...this.got[1] }] };
  }

  /** 読む。形が ちがう・古い セーブは 2 人とも 0（その 日） */
  deserialize(data: unknown): void {
    const d0 = this.ports.day();
    for (const g of this.got) {
      g.today = 0;
      g.day = d0;
    }
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<Saved>;
    if (d.v !== VERSION || !Array.isArray(d.p)) return;
    const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
    for (const i of [0, 1] as const) {
      const src = d.p[i] as Partial<{ today: number; day: number }> | undefined;
      this.got[i] = { today: Math.min(KAITORI_TUNING.dailyCap, n(src?.today)), day: n(src?.day) };
    }
    this.step();
  }

  private roll(who: Who): void {
    const g = this.got[who - 1]!;
    const d = this.ports.day();
    if (g.day !== d) {
      g.day = d;
      g.today = 0;
    }
  }
}
