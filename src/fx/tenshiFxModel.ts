import type { ArrowInfo, Vec3 } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { createRng, type Rng } from '../world/gen/random';

/**
 * 天使の弓の 見た目の 決まり（LEGEND-4 §6.3-11・§3.5）。three なし・当たりには かかわらない。
 * 背中の つばさの コマ・空中ジャンプの 羽ばたき・足もとに 舞う 羽（全部で 48 点まで。古い 物から 消す）・羽の すじを つける や の えらび方。
 */
const T = LEGEND4_TUNING.tenshi;
/** 羽が おちる 速さ（マス/ステップ）。ふわふわ */
const FALL = 0.012;
/** 羽が 横へ ちる 速さの はば（マス/ステップ） */
const DRIFT = 0.025;

/** つばさの 絵の コマ（ゆっくり ぐるぐる） */
export function wingFrame(tick: number): number {
  return Math.floor(tick / T.wingStepsPerFrame) % T.wingFrames;
}

/** 羽ばたき（のこり ステップ 0〜flapSteps）の 縦の 大きさ。ふだん 1、まん中で いちばん 大きい */
export function flapScale(left: number): number {
  if (left <= 0 || left >= T.flapSteps) return 1;
  return 1 + 0.3 * Math.sin(Math.PI * (1 - left / T.flapSteps));
}

interface Feather {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
}

export interface Feathers {
  /** 足もとに 羽を burstFeathers まい 出す */
  burst(at: Vec3): void;
  /** 1 ステップ */
  step(): void;
  list(): readonly Feather[];
  clear(): void;
}

export function createFeathers(max: number = T.featherPointsMax, life: number = T.featherSteps, rng: Rng = createRng(0x7e45)): Feathers {
  const items: Feather[] = [];
  return {
    burst(at) {
      for (let i = 0; i < T.burstFeathers; i++) {
        if (items.length >= max) items.shift();
        const a = rng() * Math.PI * 2;
        items.push({ x: at.x + Math.cos(a) * 0.25, y: at.y + 0.1 + rng() * 0.3, z: at.z + Math.sin(a) * 0.25, vx: Math.cos(a) * DRIFT * (0.4 + rng()), vz: Math.sin(a) * DRIFT * (0.4 + rng()), age: 0 });
      }
    },
    step() {
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i]!;
        p.age += 1;
        if (p.age >= life) {
          items.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.z += p.vz;
        p.y -= FALL;
      }
    },
    list: () => items,
    clear() {
      items.length = 0;
    },
  };
}

/** 羽の すじを つける や（feather の や だけ。新しい 方から trailMax 本） */
export function pickTrails(arrows: readonly ArrowInfo[]): ArrowInfo[] {
  const out = arrows.filter((a) => a.feather === true);
  return out.length > T.trailMax ? out.slice(out.length - T.trailMax) : out;
}
