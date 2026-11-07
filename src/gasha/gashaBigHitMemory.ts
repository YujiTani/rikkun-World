/**
 * COOP-1 4d-3: がしゃどくろの 当たりの「おぼえ」を 人ごとに 持つ 小さな 部品（gashaBigHit.ts から 分けた）。
 * 1 振り・飛んで いる 波の id・ドームの 間かくは 人ごとに 数える（同じ 名前・同じ id でも 2 人は ぶつからない）。
 */
type Vec3 = { x: number; y: number; z: number };

export class HitMemory {
  swingKey: string | null = null;
  swingFrame = 0;
  swingDone = false;
  readonly waveLast = new Map<number, Vec3>();
  readonly waveDone = new Set<number>();
  domeLast = -1e9;

  reset(): void {
    this.swingKey = null;
    this.swingDone = false;
    this.waveLast.clear();
    this.waveDone.clear();
    this.domeLast = -1e9;
  }
}

/** 人ごとの おぼえの 入れもの（人が ふえたら 作り、一覧から 消えたら 手ばなす） */
export class HitMemories {
  private readonly map = new Map<number, HitMemory>();

  of(who: number): HitMemory {
    let m = this.map.get(who);
    if (!m) { m = new HitMemory(); this.map.set(who, m); }
    return m;
  }

  /** 一覧に いない 人の おぼえを 手ばなす（list の 中に いる 人だけ のこす） */
  prune(list: readonly { who: number }[]): void {
    for (const who of this.map.keys()) {
      let found = false;
      for (let i = 0; i < list.length; i++) if (list[i]!.who === who) { found = true; break; }
      if (!found) this.map.delete(who);
    }
  }

  reset(): void {
    this.map.clear();
  }
}
