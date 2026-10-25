import type { Vec3 } from '../contracts';
import { ANIMAL_FX } from './animalFxConfig';
import { ease } from './animalFxMath';
import type { BugFlight } from './animalFxTypes';

const FLIGHT_SLOTS = 4;

/** あみ で とれた むし が プレイヤー の 胸 へ とんで くる 動き（§2.4。ふって 10 ステップ 目 から 20 ステップ）。表（`flights`）を 使いまわす */
export function startFlight(flights: BugFlight[], eye: Vec3, cx: number, cy: number, cz: number): void {
  if (flights.length >= FLIGHT_SLOTS) flights.shift();
  // ねらった ブロック の プレイヤー がわ の 面 から ぴょん と 出る
  const dx = eye.x - cx;
  const dz = eye.z - cz;
  const len = Math.hypot(dx, dz) || 1;
  const sx = cx + (dx / len) * 0.55;
  const sz = cz + (dz / len) * 0.55;
  flights.push({ x: sx, y: cy, z: sz, yaw: Math.atan2(-dx, -dz), pitch: 0, scale: 0.4, curl: 0, age: 0, sx, sy: cy, sz });
}

export function stepFlights(flights: BugFlight[], eye: Vec3): void {
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    f.age++;
    if (f.age >= ANIMAL_FX.bugFly) {
      flights.splice(i, 1);
      continue;
    }
    const t = f.age / ANIMAL_FX.bugFly;
    const k = ease(t);
    // 行き先 = プレイヤー の 胸（毎ステップ 読みなおす）
    const tx = eye.x;
    const ty = eye.y - 0.35;
    const tz = eye.z;
    const px = f.x;
    const py = f.y;
    const pz = f.z;
    f.x = f.sx + (tx - f.sx) * k;
    f.z = f.sz + (tz - f.sz) * k;
    f.y = f.sy + (ty - f.sy) * k + 0.55 * Math.sin(Math.PI * t); // 弧
    const mx = f.x - px;
    const mz = f.z - pz;
    if (mx * mx + mz * mz > 1e-8) f.yaw = Math.atan2(-mx, -mz); // 頭（−z）が すすむ 向き
    f.pitch = Math.atan2(f.y - py, Math.hypot(mx, mz) + 1e-4) * 0.6;
    f.scale = t < 0.2 ? 0.4 + 0.6 * ease(t / 0.2) : 1 - 0.35 * ease((t - 0.2) / 0.8);
    f.curl = 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.6)); // 空中 で まるまる
  }
}