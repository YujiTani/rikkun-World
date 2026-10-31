// HOUSE-1B 見本の 窓・戸の 光りの 時間（AC56）。three なし。光る 形（板）は glowMesh.ts、光る 場所の 数え方は editor/model.ts の openingChange。
//   cue ＝ 90 コマ 光る 1 回（窓を かえた・① に なった 戸）/ hover ＝ まどの ボタンに 手を おいて いる 間 窓 ぜんぶ（はなすと すうっと 消える）。
import type { WindowCell } from '../editor/model';
import { GLOW, PREVIEW } from './tuning';

/** 窓口 `editor().preview.glow` の 形（光って いる とき。left ＝ のこりの コマ。hover の 間は null） */
export interface GlowInfo {
  door: boolean;
  cells: WindowCell[];
  left: number | null;
}

interface Cue {
  door: boolean;
  cells: readonly WindowCell[];
  /** はじまってからの コマ数と、光りはじめを まつ コマ数 */
  t: number;
  delay: number;
}

const smooth = (t: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

/** 光り 1 回の つよさ 0〜1（t ＝ はじまってからの コマ数）: まって → ふわっと 光る → ゆらぎながら のこる → すうっと 消える */
export function cueLevel(t: number, delay: number, reduced: boolean): number {
  const u = t - delay;
  const len = PREVIEW.glowFrames - delay;
  if (u < 0 || u > len) return 0;
  const env = Math.min(smooth(u / GLOW.riseFrames), smooth((len - u) / GLOW.fadeFrames));
  const wave = reduced ? 1 : 1 - GLOW.pulseDepth * (0.5 - 0.5 * Math.cos((2 * Math.PI * u) / GLOW.pulseFrames));
  return env * wave;
}

/** 手を おいて いる 間の ゆらぎ（t ＝ おいてからの コマ数）。0〜hoverLevel。動きを へらす 設定では 一定 */
export function hoverWave(t: number, reduced: boolean): number {
  return GLOW.hoverLevel * (reduced ? 1 : 1 - GLOW.hoverPulseDepth * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / GLOW.hoverPulseFrames)));
}

export class GlowCtl {
  private cue: Cue | null = null;
  private on = false;
  /** hover の ふえ・へり 0〜1 と、ゆらぎの コマ数 */
  private k = 0;
  private t = 0;

  /** 窓を かえた 光り（cells ＝ かわった 窓。delay ＝ 光りはじめを まつ コマ）。光って いる 間は 見本の 自動の 回りを 止める */
  startWindows(cells: readonly WindowCell[], delay: number): void {
    this.cue = { door: false, cells: [...cells], t: 0, delay };
  }

  /** ① に なった 戸の 光り（回りは 止めない） */
  startDoor(): void {
    this.cue = { door: true, cells: [], t: 0, delay: 0 };
  }

  /** 窓を かえた 光りが 出て いる（見本の 自動の 回りを 止める） */
  get freezing(): boolean {
    return this.cue !== null && !this.cue.door;
  }

  get cueing(): boolean {
    return this.cue !== null;
  }

  /** 出て いる 光り 1 回が 戸の 光り */
  get door(): boolean {
    return this.cue?.door === true;
  }

  /** 光り 1 回だけ 消す（hover は のこす） */
  dropCue(): void {
    this.cue = null;
  }

  get hovering(): boolean {
    return this.on;
  }

  /** ボタンに 手を おいた / はなした。かわったら true */
  setHover(on: boolean): boolean {
    if (on === this.on) return false;
    this.on = on;
    return true;
  }

  /** ぜんぶ 消す（見せ方が かわった・とじた・はじめに もどした） */
  clear(): void {
    this.dropCue();
    this.on = false;
    this.k = 0;
    this.t = 0;
  }

  /** 1 コマ。光り 1 回が おわった コマで true */
  step(): boolean {
    let ended = false;
    const c = this.cue;
    if (c && ++c.t >= PREVIEW.glowFrames) {
      this.cue = null;
      ended = true;
    }
    const k = Math.min(1, Math.max(0, this.k + (this.on ? 1 / GLOW.riseFrames : -1 / GLOW.fadeFrames)));
    this.k = k < 1e-6 ? 0 : k; // 引き算の ずれで 0 に ならない まま 残らない ように
    this.t = this.on || this.k > 0 ? this.t + 1 : 0;
    return ended;
  }

  /** 光り 1 回の つよさ（0 ＝ 見えない） */
  cueNow(reduced: boolean): number {
    return this.cue ? cueLevel(this.cue.t, this.cue.delay, reduced) : 0;
  }

  /** hover の つよさ（0 ＝ 見えない） */
  hoverNow(reduced: boolean): number {
    return this.k > 0 ? this.k * hoverWave(this.t, reduced) : 0;
  }

  /** 窓口 `editor().preview.glow`。all ＝ 今の 窓 ぜんぶ。光って いなければ null（光り 1 回が hover より さき） */
  info(all: readonly WindowCell[]): GlowInfo | null {
    const c = this.cue;
    if (c) return { door: c.door, cells: [...c.cells], left: PREVIEW.glowFrames - c.t };
    if (this.on) return { door: false, cells: [...all], left: null };
    return null;
  }
}
