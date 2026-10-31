// 「けんちくを はじめる」の 流れ（HOUSE-1C PR-2 #340。仕様 §2.8・§3.4・§4.7・AC18〜AC20）: せっけいずの 一覧 → 上空の 視点（わく・決定・確かめ）。DOM・three なし。
// 上空の 視点に 入る ときに 1 回 だけ 世界を 読む（findSites）。あとは わくの 位置と 表を くらべる だけ。
import type { Blueprint } from '../editor/blueprint';
import { doorIndex } from '../editor/model';
import type { Site } from './sites';
import { MSG } from './tuning';

export type FlowPage = 'pick' | 'need' | 'sky';

/** 一覧の せっけいず 1 まい（enough = くらに 材料が そろって いる。おまけの 分は ひいて 数える） */
export interface FlowPlan {
  slot: number;
  bp: Blueprint;
  enough: boolean;
}

export interface FlowDeps {
  plans(): FlowPlan[];
  /** せっけいずの 家が 建てられる 場所（プレイヤーの まわり。近い 順） */
  findSites(bp: Blueprint): Site[];
  /** ［ここに たてる］: 建築を はじめる（材料を へらす・足場を 立てる）。はじめられたら true */
  begin(slot: number, bp: Blueprint, site: Site): boolean;
}

export interface FlowCursor {
  x: number;
  z: number;
  ok: boolean;
  confirm: boolean;
}

export interface FlowButton {
  id: string;
  enabled: boolean;
}

/** press の 答え: 'started' = 建築が はじまった、'stay' = 画面を かえた・何も しない */
export type FlowResult = 'started' | 'stay';

export class BuildFlow {
  page: FlowPage | null = null;
  say = '';
  /** 画面に 見える もの（page・わく・確かめの まど）が かわる たびに ふえる 数（HouseTalk.version の もと） */
  version = 0;
  private slot = -1;
  private bp: Blueprint | null = null;
  private found: Site[] = [];
  private cx = 0;
  private cz = 0;
  private confirm_ = false;

  constructor(private readonly d: FlowDeps) {}

  /** メニューの「けんちくを はじめる」。一覧に なれば true（せっけいずが 0 まいは ふきだしだけ） */
  open(): boolean {
    this.version++;
    this.reset();
    if (this.d.plans().length === 0) return false;
    this.page = 'pick';
    this.say = MSG.pick;
    return true;
  }

  /** 流れを おわる（とじた・はじまった） */
  reset(): void {
    this.version++;
    this.page = null;
    this.say = '';
    this.slot = -1;
    this.bp = null;
    this.found = [];
    this.confirm_ = false;
  }

  /** せっけいずの 一覧で マス slot を えらんだ（材料が たりなければ need、場所が なければ ふきだし、あれば 上空の 視点） */
  pick(slot: number): void {
    this.version++;
    const plan = this.d.plans().find((p) => p.slot === slot);
    if (!plan) return;
    this.slot = slot;
    this.bp = plan.bp;
    if (!plan.enough) {
      this.page = 'need';
      this.say = MSG.short;
      return;
    }
    const found = this.d.findSites(plan.bp);
    if (found.length === 0) {
      this.page = 'pick';
      this.say = MSG.noSite;
      return;
    }
    this.found = found;
    this.cx = found[0]!.x;
    this.cz = found[0]!.z;
    this.confirm_ = false;
    this.page = 'sky';
    this.say = MSG.sky;
  }

  /** ひつような もの（page 'need'）の せっけいずの マス */
  needSlot(): number {
    return this.slot;
  }

  /** 上空の 視点の 間の 置ける 場所 */
  sites(): readonly Site[] {
    return this.page === 'sky' ? this.found : [];
  }

  cursor(): FlowCursor | null {
    if (this.page !== 'sky' || !this.bp) return null;
    return { x: this.cx, z: this.cz, ok: this.siteAt() !== null, confirm: this.confirm_ };
  }

  /** わくの 大きさ（外よこ × 外たて） */
  outer(): { w: number; d: number } | null {
    return this.bp ? { w: this.bp.w + 2, d: this.bp.d + 2 } : null;
  }

  /** 確かめの まどに 出す 名前 */
  planName(): string {
    return this.bp ? this.bp.name.front + this.bp.name.back : '';
  }

  /** わくを 1 マス（矢印）。確かめの まどが ある 間は 動かない */
  move(dx: number, dz: number): void {
    this.version++;
    if (this.page !== 'sky' || this.confirm_) return;
    this.cx += dx;
    this.cz += dz;
  }

  /** わくを (x, z) へ（マウス）。確かめの まどが ある 間は 動かない */
  moveTo(x: number, z: number): void {
    this.version++;
    if (this.page !== 'sky' || this.confirm_) return;
    this.cx = x;
    this.cz = z;
  }

  /** 決定（Enter・左クリック）。置ける 場所の ときだけ 確かめの まど */
  decide(): void {
    this.version++;
    if (this.page === 'sky' && !this.confirm_ && this.siteAt() !== null) this.confirm_ = true;
  }

  /** Esc・◀ もどる: 確かめの まど → 上空の 視点 → 一覧。ひつような もの → 一覧。一覧は 何も せず false（呼ぶ 側が ぜんぶ とじる） */
  escape(): boolean {
    this.version++;
    if (this.page === 'sky' && this.confirm_) this.confirm_ = false;
    else if (this.page === 'sky' || this.page === 'need') {
      this.page = 'pick';
      this.say = MSG.pick;
      this.found = [];
      this.confirm_ = false;
    } else return false;
    return true;
  }

  buttons(): FlowButton[] {
    if (this.page === 'pick') return [...this.d.plans().map((p) => ({ id: `pick-${p.slot}`, enabled: p.enough })), { id: 'close', enabled: true }];
    if (this.page === 'need') return [{ id: 'needClose', enabled: true }, { id: 'close', enabled: true }];
    if (this.page === 'sky') return this.confirm_ ? [{ id: 'yes', enabled: true }, { id: 'no', enabled: true }] : [{ id: 'back', enabled: true }];
    return [];
  }

  /** ボタン。close は 呼ぶ 側（HouseTalk）が 先に 受ける */
  press(id: string, arg?: unknown): FlowResult {
    const slotOf = id === 'pick' ? Number(arg) : id.startsWith('pick-') ? Number(id.slice(5)) : Number.NaN;
    if (this.page === 'pick' && Number.isInteger(slotOf)) this.pick(slotOf);
    else if (this.page === 'need' && id === 'needClose') this.escape();
    else if (this.page === 'sky' && this.confirm_ && id === 'no') this.confirm_ = false;
    else if (this.page === 'sky' && !this.confirm_ && id === 'back') this.escape();
    else if (this.page === 'sky' && this.confirm_ && id === 'yes') return this.start() ? 'started' : 'stay';
    return 'stay';
  }

  /** ［ここに たてる］（確かめの まどが ある とき だけ） */
  start(): boolean {
    this.version++;
    const site = this.page === 'sky' && this.confirm_ ? this.siteAt() : null;
    if (!site || !this.bp) return false;
    const ok = this.d.begin(this.slot, this.bp, site);
    if (ok) this.reset();
    return ok;
  }

  /** わくの 場所(x, z)に 建てられる 場所（近い 順の 先頭。なければ null） */
  private siteAt(): Site | null {
    return this.found.find((s) => s.x === this.cx && s.z === this.cz) ?? null;
  }
}

/** 戸の 場所（外の 箱の 北西から の ずれ）。場所の しらべと 同じ 式 */
export const doorOffset = (bp: Pick<Blueprint, 'w' | 'd'>): number => 1 + doorIndex(bp);
