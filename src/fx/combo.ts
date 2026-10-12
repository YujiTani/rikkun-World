/**
 * 同じものを続けて取ったときの「連続ボーナス」。音の高さ（半音）が少しずつ上がり、
 * しばらくあくと元に戻る。時間はゲームの dt をためて数える（固定ステップで再現できる）。
 */
export class ComboTracker {
  private item: string | null = null;
  private count = 0;
  private idle = 0;

  constructor(
    private readonly semitones: () => number,
    private readonly max: () => number,
    private readonly resetSeconds: () => number,
  ) {}

  update(dt: number): void {
    this.idle += dt;
    if (this.idle > this.resetSeconds()) {
      this.item = null;
      this.count = 0;
    }
  }

  /** アイテムを取った。音の高さの上げ幅（半音）を返す */
  hit(item: string): number {
    if (item !== this.item) {
      this.item = item;
      this.count = 0;
    } else {
      this.count = Math.min(this.count + 1, this.max());
    }
    this.idle = 0;
    return this.count * this.semitones();
  }

  get chain(): number {
    return this.count;
  }
}
