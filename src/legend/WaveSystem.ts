import type { BladeTech, ItemId, Vec3, VoxelWorld, W2Settings, YokaiWorld } from '../contracts';
import { capsuleDist } from '../combat/attackFacing';
import { createRng } from '../world/gen/random';
import { legendPowerOf, waveOf } from './defs';

/**
 * WEAPON-7 §4.3: 風神剣の 真空波。ふつうの わざの 当たりの はじめの F に 1 つ とぶ（刀の 外の 小さな 係）。
 * 1 ステップに 1 回 `step` を 呼ぶ。先に とんでいる 波を 進め、そのあと 新しい 波を 出す（出た ステップは 進まない）。
 */

export type WaveEvent =
  | { type: 'waveStart'; tick: number; id: number; position: Vec3; dir: Vec3 }
  | { type: 'waveHit'; tick: number; id: number; yokaiId: number; damage: number }
  | { type: 'waveEnd'; tick: number; id: number; reason: 'range' | 'block'; position: Vec3 };

export interface WaveDeps {
  world: Pick<VoxelWorld, 'isSolid'>;
  yokai: () => Pick<YokaiWorld, 'list' | 'damage'>;
  settings: Pick<W2Settings, 'legendary'>;
  tick: () => number;
  emit: (e: WaveEvent) => void;
  /** 「ヒュオッ」。variant = 高さ（0〜2。前と ちがう 物） */
  sound?: (variant: number) => void;
  seed?: number;
}

export interface WaveStepCtx {
  item: ItemId | null;
  tech: BladeTech | null;
  phase: string;
  frame: number;
  /** この わざの はじまりの 長さ（当たりの はじめの F = startup + 1） */
  startup: number;
  /** わざの 向き u（度。0 = 北） */
  dirDeg: number;
  /** 体の点 B（このステップの おわりの 体） */
  body: Vec3;
}

export interface WaveView {
  id: number;
  position: Vec3;
  dir: Vec3;
  traveled: number;
}

interface Wave extends WaveView {
  speed: number;
  range: number;
  radius: number;
  damage: number;
  knock: [number, number];
  hit: Set<number>;
}

const round2 = (v: number): number => Math.round(v * 100 + 1e-7) / 100;
const DEG = Math.PI / 180;
const MAX_WAVES = 8;

export interface WaveSystem {
  step(ctx: WaveStepCtx): void;
  /** とんでいる 波（見た目と 窓口用。毎回 同じ 配列を 返す） */
  list(): readonly WaveView[];
}

export function createWaveSystem(deps: WaveDeps): WaveSystem {
  const waves: Wave[] = [];
  const view: WaveView[] = waves;
  const rng = createRng((deps.seed ?? 0) ^ 0x57a11);
  let nextId = 1;
  let lastVariant = -1;

  function blockedAt(p: Vec3): boolean {
    return deps.world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
  }

  function sweep(w: Wave, from: Vec3, len: number): void {
    const yw = deps.yokai();
    for (const y of yw.list()) {
      if (y.state === 'dying' || y.state === 'leaving') continue;
      if (w.hit.has(y.id)) continue;
      if (capsuleDist(from, w.dir, len, w.radius, y) < 0) continue;
      w.hit.add(y.id);
      const dealt = yw.damage(y.id, w.damage, { x: y.position.x - w.dir.x, y: y.position.y, z: y.position.z - w.dir.z }, { dist: w.knock[0], up: w.knock[1] });
      const shown = typeof dealt === 'number' && dealt > 0 ? dealt : w.damage;
      deps.emit({ type: 'waveHit', tick: deps.tick(), id: w.id, yokaiId: y.id, damage: shown });
    }
  }

  function remove(i: number, reason: 'range' | 'block'): void {
    const [w] = waves.splice(i, 1);
    deps.emit({ type: 'waveEnd', tick: deps.tick(), id: w!.id, reason, position: { ...w!.position } });
  }

  const from: Vec3 = { x: 0, y: 0, z: 0 };

  return {
    step(ctx: WaveStepCtx): void {
      // とんでいる 波を 進める
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i]!;
        const d = w.speed / 60;
        from.x = w.position.x;
        from.y = w.position.y;
        from.z = w.position.z;
        const nx = from.x + w.dir.x * d;
        const ny = from.y + w.dir.y * d;
        const nz = from.z + w.dir.z * d;
        if (blockedAt({ x: nx, y: ny, z: nz })) {
          remove(i, 'block');
          continue;
        }
        sweep(w, from, d);
        w.position.x = nx;
        w.position.y = ny;
        w.position.z = nz;
        w.traveled += d;
        if (w.traveled >= w.range - 1e-9) remove(i, 'range');
      }
      // 新しい 波（当たりの はじめの F）
      const def = waveOf(deps.settings, ctx.item);
      if (!def || !ctx.tech || ctx.phase !== 'active' || ctx.frame !== ctx.startup + 1) return;
      if (waves.length >= MAX_WAVES) return;
      const ur = ctx.dirDeg * DEG;
      const w: Wave = {
        id: nextId++,
        position: { x: ctx.body.x, y: ctx.body.y, z: ctx.body.z },
        dir: { x: Math.sin(ur), y: 0, z: -Math.cos(ur) },
        traveled: 0,
        speed: def.speed,
        range: def.range,
        radius: def.radius,
        damage: round2((legendPowerOf(deps.settings, ctx.item) ?? 1) * def.damageMul),
        knock: [def.knock[0], def.knock[1]],
        hit: new Set(),
      };
      deps.emit({ type: 'waveStart', tick: deps.tick(), id: w.id, position: { ...w.position }, dir: { ...w.dir } });
      // 高さ: 3 つの 中から 前と ちがう 物
      const v = lastVariant < 0 ? Math.floor(rng() * 3) : (lastVariant + 1 + Math.floor(rng() * 2)) % 3;
      lastVariant = v;
      deps.sound?.(v);
      if (blockedAt(w.position)) {
        deps.emit({ type: 'waveEnd', tick: deps.tick(), id: w.id, reason: 'block', position: { ...w.position } });
        return;
      }
      waves.push(w);
      sweep(w, w.position, 0);
    },
    list(): readonly WaveView[] {
      return view;
    },
  };
}
