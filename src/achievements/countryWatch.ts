/**
 * 「国に入った」の 判定（COUNTRY-1 §4.1）。
 * その国の まん中寄り（e ≥ blend）に 続けて 180 コマ いたら 入った。境目（e < blend）・地下に 出たら 数えなおし。
 * 地下 = 足の y が その列の 生成の地面の高さ（heightAt）より 8 以上 ひくい。
 * 国の 並びは 持たない（入ったとき onEnter を 1 回 呼ぶ。つなぎ込みが AchievementSystem.enterCountry へ つなぐ）。
 */
export const COUNTRY_ENTER_STEPS = 180;
/** 地下と みなす 深さ（足の y ≤ heightAt − これ） */
export const COUNTRY_UNDERGROUND = 8;

export interface CountryWatchOptions {
  at(x: number, z: number): { kind: string; e: number };
  heightAt(x: number, z: number): number;
  blend: number;
  onEnter(kind: string): void;
}

export class CountryWatch {
  private current_: string | null = null;
  private cand: string | null = null;
  private count = 0;
  private quiet_ = false;

  constructor(private readonly o: CountryWatchOptions) {}

  /** 今の国（さいごに 入った 国。はじめは null） */
  current(): string | null {
    return this.current_;
  }

  /** テスト用の しずかモード: on の間は 判定を しない */
  quiet(on: boolean): void {
    this.quiet_ = on;
    this.cand = null;
    this.count = 0;
  }

  isQuiet(): boolean {
    return this.quiet_;
  }

  /** ロードの あと など: 今の国・数えを すてる */
  reset(): void {
    this.current_ = null;
    this.cand = null;
    this.count = 0;
  }

  /** 毎ステップ。pos = 足もと。steps = この更新で すすんだ コマ（あそぶ 1・止まっている 0・もちもの画面は 1/4 など） */
  step(pos: { x: number; y: number; z: number }, steps: number): void {
    if (this.quiet_ || !(steps > 0)) return;
    const x = Math.floor(pos.x);
    const z = Math.floor(pos.z);
    const a = this.o.at(x, z);
    if (a.e < this.o.blend || pos.y <= this.o.heightAt(x, z) - COUNTRY_UNDERGROUND) {
      this.cand = null;
      this.count = 0;
      return;
    }
    if (a.kind !== this.cand) {
      this.cand = a.kind;
      this.count = 0;
    }
    if (this.current_ === a.kind) return;
    this.count += steps;
    if (this.count >= COUNTRY_ENTER_STEPS) {
      this.current_ = a.kind;
      this.o.onEnter(a.kind);
    }
  }
}
