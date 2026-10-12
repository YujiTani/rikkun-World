/** 直近 N フレームの処理時間から平均・最悪値・fps を出す */
export class FrameStats {
  private samples: number[] = [];
  private index = 0;

  constructor(private readonly size = 120) {}

  add(ms: number): void {
    if (this.samples.length < this.size) this.samples.push(ms);
    else this.samples[this.index] = ms;
    this.index = (this.index + 1) % this.size;
  }

  get count(): number {
    return this.samples.length;
  }

  get averageMs(): number {
    if (this.samples.length === 0) return 0;
    return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
  }

  get worstMs(): number {
    return this.samples.length === 0 ? 0 : Math.max(...this.samples);
  }

  get fps(): number {
    const avg = this.averageMs;
    return avg > 0 ? 1000 / avg : 0;
  }
}
