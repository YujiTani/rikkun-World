import type { BladeTech } from '../contracts';
import type { SlashView } from '../legend/slashView';
import slash3 from './nijiSlash3.json';

/**
 * WEAPON-9 虹の 斬撃 v3 の 純粋な きまり（three.js なし）。つなぎ目の 約束は art/WEAPON-9/slash-niji/wiring.md。
 * コマ表・出す 時（spawnDelay）・左右 反転・ばらつき（シード付き）・当たりの 火花。
 */
export const SLASH3 = slash3;
export type SlashStep = 1 | 2 | 3;
export const SLASH_FRAMES = 6;
const SP = slash3.spark;

/** シード付き乱数（0 以上 1 未満）。テストで 同じ 並びに なる */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** techStart から 出すまで 待つ ステップ数（1 段目 = firstStage・2・3 段目 = comboStage） */
export function spawnDelayOf(tech: BladeTech, step: SlashStep): number {
  const d = slash3.techs[tech].spawnDelay;
  return step === 1 ? d.firstStage : d.comboStage;
}

/** 6 コマの ステップ数。lifeFrame の コマだけ lifeDelta（±1）ふやす・へらす（1 より 小さく しない） */
export function frameSteps(tech: BladeTech, lifeFrame = -1, lifeDelta = 0): number[] {
  const s = [...slash3.techs[tech].steps];
  if (lifeFrame >= 0 && lifeFrame < s.length) s[lifeFrame] = Math.max(1, s[lifeFrame]! + lifeDelta);
  return s;
}

/** 出てから age ステップ目の コマ（おわったら -1） */
export function frameAt(steps: readonly number[], age: number): number {
  let a = age;
  for (let f = 0; f < steps.length; f++) {
    if (a < steps[f]!) return f;
    a -= steps[f]!;
  }
  return -1;
}

export const rowOf = (tech: BladeTech, view: SlashView): number => slash3.rows[tech][view];

/** 絵の どこを 読むか。flipY の 絵（行 0 = いちばん 上）。mirror で 左右 反転（repeat を マイナスに） */
export function uvOf(frame: number, row: number, mirror: boolean): { repeatX: number; offsetX: number; offsetY: number } {
  return {
    repeatX: (mirror ? -1 : 1) / SLASH_FRAMES,
    offsetX: (mirror ? frame + 1 : frame) / SLASH_FRAMES,
    offsetY: 1 - (row + 1) / SLASH_FRAMES,
  };
}

/** コマごとの 弧の まん中（絵の 中の px）。mirror なら x を 64 − x に */
export function centroidOf(tech: BladeTech, view: SlashView, frame: number, mirror: boolean): [number, number] {
  const c = slash3.techs[tech].centroid[view][frame]!;
  return [mirror ? 64 - c[0]! : c[0]!, c[1]!];
}

export interface SlashVariation {
  angleDeg: number;
  scale: number;
  lifeFrame: number;
  lifeDelta: -1 | 1;
}

/** 出る たびの ばらつき: 角度 ±5°・大きさ ±5%・消える コマ（2〜4）の どれか 1 つに ±1 ステップ */
export function rollVariation(rng: () => number): SlashVariation {
  const v = slash3.variation;
  return {
    angleDeg: (rng() * 2 - 1) * v.angleDeg,
    scale: 1 + (rng() * 2 - 1) * v.scale,
    lifeFrame: 2 + Math.floor(rng() * 3),
    lifeDelta: rng() < 0.5 ? -1 : 1,
  };
}

/** わざが 画面で 進む 向き（度。右 = 0・上 = 90）。絵の 決めから 最後の コマへの まん中の 動き。左右 反転で 180 − θ */
export function swingScreenAngleDeg(tech: BladeTech, mirror: boolean): number {
  const c = slash3.techs[tech].centroid.side;
  const a = c[1]!;
  const b = c[SLASH_FRAMES - 1]!;
  const deg = (Math.atan2(a[1]! - b[1]!, b[0]! - a[0]!) * 180) / Math.PI;
  return mirror ? 180 - deg : deg;
}

/** 速さの 向き（度）に いちばん 近い 45° の 升（0〜7。0 = 右・2 = 上）。回さない */
export function streakCell(angleDeg: number): number {
  return (((Math.round(angleDeg / 45) % 8) + 8) % 8);
}

export interface Spark {
  /** 当たった 場所からの ずれ（画面の 右・上 に ついて。マス） */
  x: number;
  y: number;
  /** 1 ステップの 動き（マス） */
  vx: number;
  vy: number;
  age: number;
  life: number;
  color: number;
  back: boolean;
  /** 寿命の 半分を すぎた = 短い すじ */
  short: boolean;
  cell: number;
}

export interface HitBurst {
  sparks: Spark[];
  age: number;
  reduced: boolean;
}

/** 当たった 妖怪 1 体 ごとに 1 回。数 6〜8（うち 2 は 振った 向きの 逆へ・0.6 倍の 速さ） */
export function createHit(rng: () => number, tech: BladeTech, mirror: boolean, reduced: boolean): HitBurst {
  const theta = swingScreenAngleDeg(tech, mirror);
  const n = SP.count[0]! + Math.floor(rng() * (SP.count[1]! - SP.count[0]! + 1));
  const total = reduced ? n - SP.backCount : n;
  const sparks: Spark[] = [];
  for (let i = 0; i < total; i++) {
    const back = i >= n - SP.backCount;
    const ang = theta + (back ? 180 + (rng() * 2 - 1) * SP.backSpreadDeg : (rng() * 2 - 1) * SP.spreadDeg);
    const speed = ((SP.speed0 * (1 + (rng() * 2 - 1) * SP.speedJitter)) / 60) * (back ? 0.6 : 1);
    const life = SP.life + Math.round((rng() * 2 - 1) * SP.lifeJitter);
    const color = Math.floor(rng() * 5);
    const r = (ang * Math.PI) / 180;
    sparks.push({ x: 0, y: 0, vx: Math.cos(r) * speed, vy: Math.sin(r) * speed, age: 0, life, color, back, short: false, cell: streakCell(ang) });
  }
  return { sparks, age: 0, reduced };
}

/** まん中の 光の コマ（2・2・3 ステップ。うごきを へらす なら 1 コマ目 だけ）。なければ -1 */
export function flashFrameAt(age: number, reduced: boolean): number {
  const steps = reduced ? [SP.flashSteps[0]!] : SP.flashSteps;
  return frameAt(steps, age);
}

/** 1 ステップ。毎ステップ v に dragPerStep を かける */
export function stepHit(h: HitBurst): void {
  h.age++;
  for (const s of h.sparks) {
    if (s.age >= s.life) continue;
    s.x += s.vx;
    s.y += s.vy;
    s.vx *= SP.dragPerStep;
    s.vy *= SP.dragPerStep;
    s.age++;
    // 速さの 向きは 変わらない ので 升は そのまま。寿命の 半分から 短い すじ
    s.short = s.age >= s.life * SP.shortAt;
  }
}

export const hitAlive = (h: HitBurst): boolean => h.sparks.some((s) => s.age < s.life) || flashFrameAt(h.age, h.reduced) >= 0;
