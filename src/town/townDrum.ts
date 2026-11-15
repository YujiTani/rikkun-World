/**
 * TOWN-1 1B-2 §2.15 の 4・AC47: アスレチックの ゴールの 太鼓。その 人が はじめて たたいた ときだけ「ゴール！」（first）。
 * 2 回目からは 音と ゆれだけ。1P・2P は べつ。保存は 2 人ぶんの 真偽だけ。計算だけ（three なし）。
 */
const VERSION = 1;

interface Saved {
  v: number;
  /** [1P, 2P] */
  cleared: [boolean, boolean];
}

export class TownDrum {
  private done: [boolean, boolean] = [false, false];

  /** at ＝ 太鼓の ブロックの マス（x・z は マスの まん中でも 左上でも よい。floor で 比べる） */
  constructor(private readonly at: { x: number; y: number; z: number }) {}

  isDrum(x: number, y: number, z: number): boolean {
    return x === Math.floor(this.at.x) && y === Math.floor(this.at.y) && z === Math.floor(this.at.z);
  }

  cleared(who: 1 | 2): boolean {
    return this.done[who - 1]!;
  }

  /** たたいた。その 人の はじめてなら first */
  hit(who: 1 | 2): { first: boolean } {
    const first = !this.done[who - 1];
    this.done[who - 1] = true;
    return { first };
  }

  serialize(): Saved {
    return { v: VERSION, cleared: [this.done[0], this.done[1]] };
  }

  /** 読む。形が ちがう・古い セーブは 2 人とも false */
  deserialize(data: unknown): void {
    this.done = [false, false];
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<Saved>;
    if (d.v !== VERSION || !Array.isArray(d.cleared)) return;
    this.done = [d.cleared[0] === true, d.cleared[1] === true];
  }
}
