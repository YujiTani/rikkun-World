/**
 * TOWN-1 1B-2 試作: 建物の 置き方の 表を 作る 道具（ローカル座標 u ＝ 西→東・v ＝ 奥→手前・dy ＝ 地面の 上の ブロックの 数）。
 * 何も import しない 葉。建物ごとの 表は townBuildings.ts（よろずや・ふんすい）・townKajiya.ts・townDaiku.ts。
 */

/** 表の 1 マス ぶん: ブロックの 名前（上の 印つき） */
export interface BuildingCell {
  u: number;
  v: number;
  dy: number;
  id: string;
}

export const hash3 = (a: number, b: number, c: number): number => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) >>> 0;

export const T = (s: string): string => `town_${s}`;

/** 屋根の 板の 高さ: 1 ブロックを 3 つに 切った 下（0）・まん中（1）・上（2） */
const LEVELS = ['lo', 'mid', 'hi'] as const;

/** 石づみに まぜる 石 */
export const WALL_MIX = ['ishizumi', 'ishizumi', 'koishizumi', 'kokeishi'] as const;
/** かわら（くろ 2 に あお 1） */
const KAWARA_MIX = ['kuro', 'kuro', 'ao'] as const;

export class Builder {
  readonly cells = new Map<number, BuildingCell>();
  /** id が 空 ＝ 置かない（あなを あける） */
  put(u: number, v: number, dy: number, id: string): void {
    if (id === '') return;
    this.cells.set((dy * 128 + v) * 128 + u, { u, v, dy, id });
  }
  /** 四角の 中の 置いた 物を ぜんぶ けす（あなを あける） */
  clear(u0: number, v0: number, dy0: number, u1: number, v1: number, dy1: number): void {
    for (let dy = dy0; dy <= dy1; dy++) for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) this.cells.delete((dy * 128 + v) * 128 + u);
  }
  fill(u0: number, v0: number, dy0: number, u1: number, v1: number, dy1: number, pick: string | ((u: number, v: number, dy: number) => string)): void {
    for (let dy = dy0; dy <= dy1; dy++) for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) this.put(u, v, dy, typeof pick === 'string' ? pick : pick(u, v, dy));
  }
  /** 屋根の 板 1 まい: T ＝ 板の 上の 高さ（1/3 ブロック 単位。dy 0 の 下の ふちが T 0）。kind ＝ kuro・ao（かわら）・ita・ita_b・ita_c（いたぶき 3 色） */
  roof(u: number, v: number, t: number, kind?: string): void {
    const dy = Math.floor((t - 1) / 3);
    const k = LEVELS[(t - 1) % 3]!;
    const m = kind ?? KAWARA_MIX[hash3(u, v, t) % KAWARA_MIX.length]!;
    this.put(u, v, dy, T(m === 'shima' || m === 'shimaki' ? `${m}_${k}` : m.startsWith('ita') ? `${m}_${k}` : `kawara_${m}_${k}`));
  }
  /** 屋根の よこ 1 列（u0〜u1）に 板を ならべる。wallAt の u は かべの 上なので すきまを ふさぐ 板。mix ＝ 板の しゅるいを まぜる 表 */
  roofRow(u0: number, u1: number, v: number, t: number, wallAt: readonly number[] = [], mix?: readonly string[]): void {
    const itaFill = mix !== undefined && mix.every((m) => m.startsWith('ita')); // 板ぶきの 屋根は すきまも 板の 色
    const itaWhite = itaFill && mix !== undefined && mix.every((m) => m.startsWith('itaw')); // だいくの 明るい 板
    for (let u = u0; u <= u1; u++) {
      const k = (t - 1) % 3;
      if (wallAt.includes(u) && k > 0) this.put(u, v, Math.floor((t - 1) / 3), T(`${itaFill ? (itaWhite ? 'itaw_fill' : 'ita_fill') : 'kawara_fill'}_${k === 1 ? 'mid' : 'hi'}`));
      else this.roof(u, v, t, mix ? mix[hash3(u, v, t) % mix.length]! : undefined);
    }
  }
  has(u: number, v: number, dy: number): boolean {
    return this.cells.has((dy * 128 + v) * 128 + u);
  }
}
