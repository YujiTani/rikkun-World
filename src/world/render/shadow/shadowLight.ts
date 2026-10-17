// 影の光の向きと強さ（SHADOW.md §5.1）。太陽・月は空に見えている物と同じ向き（sunMoonPose + skyDirection）。
import { SKY_VIEW } from '../../../sky/config';
import { skyDirection, sunMoonPose } from '../../../sky/sunMoon';
import type { TimeSettings } from '../../../time/config';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface ShadowLightInfo {
  body: 'sun' | 'moon';
  /** 地面 → 光（単位ベクトル） */
  dir: V3;
  /** 地図を作る向き。dir の y を 0.05 以上に上げた単位ベクトル（真横の地図はこわれやすい） */
  mapDir: V3;
  /** 影の強さ 0..1（地平線の近くは 0。月は MOON_STRENGTH 倍） */
  strength: number;
}

/** 月の影は昼の半分のこさ（オーナーの決定） */
export const MOON_STRENGTH = 0.5;
const MIN_MAP_Y = 0.05;

const smoothstep = (x: number, a: number, b: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function shadowLight(dayTick: number, settings: TimeSettings): ShadowLightInfo {
  const pose = sunMoonPose(dayTick, settings);
  const sun = pose.sun.visible;
  const body = sun ? pose.sun : pose.moon;
  const d = skyDirection(body.angle, SKY_VIEW.tilt, { x: 0, y: 0, z: 0 });
  const n = Math.hypot(d.x, d.y, d.z);
  const dir = { x: d.x / n, y: d.y / n, z: d.z / n };
  const strength = smoothstep(dir.y, 0.03, 0.25) * (sun ? 1 : MOON_STRENGTH);
  let mapDir = dir;
  if (dir.y < MIN_MAP_Y) {
    const h = Math.hypot(dir.x, dir.z) || 1;
    const k = Math.sqrt(1 - MIN_MAP_Y * MIN_MAP_Y) / h;
    mapDir = { x: dir.x * k, y: MIN_MAP_Y, z: dir.z * k };
  }
  return { body: sun ? 'sun' : 'moon', dir, mapDir, strength };
}
