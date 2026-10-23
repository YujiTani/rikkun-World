/**
 * LIVE-3 とりごや の メニュー の 中身（DOM なし。docs/design/LIVE-3.md §2.3）。
 * 3 ページ: `top`（たまご を あつめる／おにく に する）→ `pick`（どの こ に する？）→ `confirm`（ほんとう に いい？）。
 * `info()` は 窓口 `ui.coopMenu()` の 形、`press()` は 窓口 `ui.coopMenuPress()` と 同じ。
 */
export type CoopMenuPage = 'top' | 'pick' | 'confirm';
export type CoopMenuButton = 'collect' | 'meat' | 'back' | 'cancel' | 'ok' | 'close' | 'card' | 'hover';

export interface CoopMenuInfo {
  open: boolean;
  coop: number | null;
  page: CoopMenuPage;
  kids: number[];
  selected: number | null;
  eggs: number;
  meatDisabled: boolean;
}

export interface CoopMenuDeps {
  /** その 小屋 の えらべる 子 の id */
  meatList(coop: number): number[];
  /** すばこ の たまご の 数（`egg`＋`kin_tamago`） */
  eggs(coop: number): number;
  /** 演出 中 の 子 の id（なければ null） */
  busy(coop: number): number | null;
  exists(coop: number): boolean;
  /** プレイヤー が 小屋 に とどく 距離 の 中 か */
  inReach(coop: number): boolean;
  collect(coop: number): void;
  /** いただきます を はじめる。はじまったら true */
  startMeat(coop: number, id: number): boolean;
  onOpen(): void;
  onClose(): void;
}

/** 小屋 の ふち（まん中 ±2.5）から プレイヤー まで の 水平 きょり が `reach` 以内 か。`c` = 5×5 の まん中 の マス */
export function coopMenuReach(c: { x: number; z: number }, px: number, pz: number, reach: number): boolean {
  const dx = Math.max(0, Math.abs(px - (c.x + 0.5)) - 2.5);
  const dz = Math.max(0, Math.abs(pz - (c.z + 0.5)) - 2.5);
  return Math.hypot(dx, dz) <= reach;
}

export class CoopMenuModel {
  private isOpen = false;
  private coop: number | null = null;
  private page: CoopMenuPage = 'top';
  private kids: number[] = [];
  private selected: number | null = null;
  private hovered: number | null = null;
  private eggs = 0;
  private busy = false;
  /** 画面 が 作り直す 目印（ページ・一覧・たまご が かわる と ふえる） */
  version = 0;

  constructor(private readonly d: CoopMenuDeps) {}

  /** ひらく。えらべる 子 が 0 わ なら ひらかない */
  open(coop: number): boolean {
    if (!this.d.exists(coop)) return false;
    const kids = this.d.meatList(coop);
    if (kids.length === 0) return false;
    this.isOpen = true;
    this.coop = coop;
    this.page = 'top';
    this.kids = kids;
    this.selected = null;
    this.hovered = null;
    this.refresh();
    this.version++;
    this.d.onOpen();
    return true;
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.coop = null;
    this.page = 'top';
    this.kids = [];
    this.selected = null;
    this.hovered = null;
    this.version++;
    this.d.onClose();
  }

  private refresh(): void {
    if (this.coop === null) return;
    this.eggs = this.d.eggs(this.coop);
    this.busy = this.d.busy(this.coop) !== null;
  }

  info(): CoopMenuInfo {
    return {
      open: this.isOpen,
      coop: this.coop,
      page: this.page,
      kids: this.kids.slice(),
      selected: this.selected,
      eggs: this.eggs,
      meatDisabled: this.busy,
    };
  }

  /** 世界 の 頭 の 上 に ▼ を 出す 子（ページ 2 で のせて いる 子・ページ 3 で えらんだ 子） */
  pick(): number | null {
    if (!this.isOpen) return null;
    if (this.page === 'confirm') return this.selected;
    if (this.page === 'pick') return this.hovered;
    return null;
  }

  /** 毎ステップ: たまご の 数・演出 中 を 読み直し、はなれた／小屋 が 無く なったら とじる */
  update(): void {
    if (!this.isOpen || this.coop === null) return;
    if (!this.d.exists(this.coop) || !this.d.inReach(this.coop)) {
      this.close();
      return;
    }
    const eggs = this.eggs;
    const busy = this.busy;
    this.refresh();
    if (this.page === 'pick' || this.page === 'confirm') {
      // えらべる 子 は 毎ステップ 読み直す（いなく なった・ふえた 子 を カード に 合わせる）
      const kids = this.d.meatList(this.coop);
      if (kids.join(',') !== this.kids.join(',')) {
        this.kids = kids;
        if (this.hovered !== null && !kids.includes(this.hovered)) this.hovered = null;
        if (this.page === 'confirm' && (this.selected === null || !kids.includes(this.selected))) {
          this.selected = null;
          this.page = kids.length > 0 ? 'pick' : 'top';
        } else if (this.page === 'pick' && kids.length === 0) this.page = 'top';
        this.version++;
      }
    }
    if (eggs !== this.eggs || busy !== this.busy) this.version++;
  }

  press(button: CoopMenuButton, id?: number): void {
    if (!this.isOpen || this.coop === null) return;
    const coop = this.coop;
    switch (button) {
      case 'close':
        this.close();
        return;
      case 'collect':
        if (this.page !== 'top' || this.d.eggs(coop) <= 0) return;
        this.d.collect(coop);
        this.refresh();
        this.version++;
        return;
      case 'meat':
        if (this.page !== 'top' || this.busy) return;
        this.showPick();
        return;
      case 'back':
        if (this.page !== 'pick') return;
        this.page = 'top';
        this.hovered = null;
        this.refresh();
        this.version++;
        return;
      case 'hover':
        if (this.page !== 'pick') return;
        this.hovered = id !== undefined && this.kids.includes(id) ? id : null;
        return;
      case 'card':
        if (this.page !== 'pick' || id === undefined || !this.kids.includes(id)) return;
        this.selected = id;
        this.page = 'confirm';
        this.version++;
        return;
      case 'cancel':
        if (this.page !== 'confirm') return;
        this.selected = null;
        this.showPick();
        return;
      case 'ok': {
        if (this.page !== 'confirm' || this.selected === null) return;
        const id2 = this.selected;
        // 押した ステップ に えらべない 子 に なって いた → 何も せず ページ 2（0 わ なら ページ 1）
        if (!this.d.meatList(coop).includes(id2) || !this.d.startMeat(coop, id2)) {
          this.selected = null;
          this.showPick();
          return;
        }
        this.close();
        return;
      }
    }
  }

  /** ページ 2 を 出す（毎回 えらべる 子 を 出し直す）。0 わ なら ページ 1 */
  private showPick(): void {
    if (this.coop === null) return;
    this.kids = this.d.meatList(this.coop);
    this.hovered = null;
    this.page = this.kids.length > 0 ? 'pick' : 'top';
    this.refresh();
    this.version++;
  }
}
