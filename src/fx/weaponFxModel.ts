import type { BladeStance, BladeState, BladeTech, ItemId } from '../contracts';
import { itemIconPixels } from '../ui/itemIcon';

/** 刀・たいきゅうの 演出の 数と 計算（DOM・three.js なしで 確かめられる。WEAPON-2 §3.3・§3.6） */
export const WEAPON_FX = {
  /** わざの 名前を 出す F・うすく なる 最後の F */
  techNameSteps: 24,
  techNameFadeSteps: 8,
  /** かまえを かえた とき 絵が ぽよんと する F */
  stancePopSteps: 8,
  stancePopScale: 1.2,
  /** 当たりの 星 */
  starCount: 6,
  starSeconds: 0.3,
  /** 大げさ斬りが 当たった とき の 画面の ゆれ（px・F）。明るさは かえない */
  shakePx: 2,
  shakeSteps: 6,
  /** こわれた かけら */
  shardCount: 8,
  shardSeconds: 0.4,
  /** 「のこり わずか」の チップ（M6 の 合図 120F） */
  chipSteps: 120,
  /** 大げさ斬り の 硬直 前半（動けない 目印の 灰色の わ）を 出す */
  lockRingOnKesaRecoveryFirstHalf: true,
} as const;

export const TECH_NAME: Readonly<Record<BladeTech, string>> = {
  thrust: 'つき！',
  kesa: 'おおげさぎり！',
  kiriage: 'きりあげ！',
};

/** かまえの 名前（漢字は ふりがな付きの HTML は UI 側で 作る）。順番は 中段・上段・下段 */
export const STANCE_ORDER: readonly BladeStance[] = ['chudan', 'jodan', 'gedan'];
export const STANCE_KANJI: Readonly<Record<BladeStance, [string, string]>> = {
  chudan: ['中段', 'ちゅうだん'],
  jodan: ['上段', 'じょうだん'],
  gedan: ['下段', 'げだん'],
};

/** わざの 名前の 濃さ（始めた ステップから `age` 番目 = 0 始まり。出していない間は 0） */
export function techNameOpacity(age: number): number {
  const W = WEAPON_FX;
  if (age < 0 || age >= W.techNameSteps) return 0;
  const left = W.techNameSteps - age;
  return Math.min(1, left / W.techNameFadeSteps);
}

/** 画面の ゆれ（px）。1 回 だけ 右へ ふくらんで もどる。frame = 0〜shakeSteps-1 */
export function shakeOffset(frame: number): number {
  const W = WEAPON_FX;
  if (frame < 0 || frame >= W.shakeSteps) return 0;
  return W.shakePx * Math.sin((Math.PI * (frame + 0.5)) / W.shakeSteps);
}

/** 大げさ斬り の 硬直 前半か（照準の まわりに うすい 灰色の わ） */
export function lockRingVisible(s: Pick<BladeState, 'tech' | 'phase' | 'frame'>, startup: number, active: number, recovery: number): boolean {
  if (s.tech !== 'kesa' || s.phase !== 'recovery') return false;
  return s.frame <= startup + active + Math.floor(recovery / 2);
}

/** 道具の 絵の 色（かけらの 色）。ふちの 暗い 色は のぞく平均。見つからなければ 白に 近い 灰色 */
export function itemShardColors(item: ItemId): number[] {
  let px: ReturnType<typeof itemIconPixels>;
  try {
    px = itemIconPixels(item);
  } catch {
    return [0xdddddd];
  }
  const out: number[] = [];
  for (const p of px) {
    if (p[3] < 200) continue;
    if (p[0] + p[1] + p[2] < 180) continue; // ふちの こい色
    out.push((p[0] << 16) | (p[1] << 8) | p[2]);
  }
  return out.length ? out : [0xdddddd];
}

/** かけらの 色を n こ えらぶ（シード付きの 乱数 r() で） */
export function pickShardColors(item: ItemId, n: number, r: () => number): number[] {
  const all = itemShardColors(item);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(all[Math.floor(r() * all.length) % all.length]);
  return out;
}

/** 「のこり わずか」の チップ・こわれた ログの 文。名前は ［漢字｜よみ］ の まま（出す ときに `withRuby` で ふりがなつきの HTML に する。WEAPON-7 §2.7） */
export function lowChipText(name: string): string {
  return `${name} が もうすぐ こわれるよ`;
}
export function brokenLogText(name: string): string {
  return `${name} が こわれた`;
}
