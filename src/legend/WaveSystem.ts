import type { BladeTech, ItemId, Vec3, VoxelWorld, W2Settings, YokaiWorld } from '../contracts';
import { capsuleDist } from '../combat/attackFacing';
import { createRng } from '../world/gen/random';
import { chargeOf, legendPowerOf, waveOf } from './defs';

/**
 * WEAPON-7 §4.3: 風神剣の 真空波。ふつうの わざの 当たりの はじめの F に 1 つ とぶ（刀の 外の 小さな 係）。
 * WEAPON-8 §2.3: ためわざ「らせんの かぜ」（kind 'spiral'）も ここで とばす。真空波の 上限 8 には 数えない（べつに 1 つ）。
 * 1 ステップに 1 回 `step` を 呼ぶ。先に とんでいる 波を 進め、そのあと 新しい 波を 出す（出た ステップは 進まない）。
 */

export type WaveEvent =
  | { type: 'waveStart'; tick: number; id: number; position: Vec3; dir: Vec3 }
  | { type: 'waveHit'; tick: number; id: number; yokaiId: number; damage: number }
  | { type: 'waveEnd'; tick: number; id: number; reason: 'range' | 'block'; position: Vec3 };

export type SpiralEvent =
  | { type: 'spiralStart'; tick: number; id: number; position: Vec3; dir: Vec3 }
  | { type: 'spiralHit'; tick: number; id: number; yokaiId: number; damage: number }
  | { type: 'spiralEnd'; tick: number; id: number; reason: 'range' | 'block'; position: Vec3; traveled?: number };

/** 画面の 見え方（真空波の 絵の 向き `face` を 決める）。カメラを 持たない テストでは なし */
export interface WaveView3D {
  /** カメラの 前（単位ベクトル） */
  forward: Vec3;
  /** 世界の 点を 画面の 平面に うつす（x = 右、y = 上。たてよこ 同じ 長さ）。見えない とき false */
  project(p: Vec3, out: { x: number; y: number }): boolean;
}

export interface WaveDeps {
  world: Pick<VoxelWorld, 'isSolid'>;
  yokai: () => Pick<YokaiWorld, 'list' | 'damage'>;
  settings: Pick<W2Settings, 'legendary'>;
  tick: () => number;
  emit: (e: WaveEvent | SpiralEvent) => void;
  /** 「ヒュオッ」。variant = 高さ（0〜2。前と ちがう 物） */
  sound?: (variant: number) => void;
  /** らせんの かぜの 音（F6 に 1 回） */
  spiralSound?: () => { stop(fadeSec: number): void } | void;
  /** らせんの かぜが 1 体 以上に 当たった（1 つの かぜで 1 回）。たいきゅうを 1 へらす */
  onSpiralHit?: () => void;
  /** 「動きを減らす」（らせんを 回さない） */
  reducedMotion?: () => boolean;
  /** 真空波の 絵の 向きを 決める カメラ */
  view?: () => WaveView3D | null;
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
  kind: 'wave' | 'spiral';
  position: Vec3;
  dir: Vec3;
  traveled: number;
  /** らせん: 生まれてからの ステップ数 a（真空波は 生まれてから の ステップ数） */
  age: number;
  /** らせんの 回った 角度（度。真空波と 「動きを減らす」は 0） */
  spin: number;
  /** 見た目の 位置（真空波は 剣の 手の 側へ 0.4、らせんは position と 同じ） */
  drawPos: Vec3;
  /** 真空波の 絵の 向き 0〜7（右から 反時計回りに 45 度。らせんは null） */
  face: number | null;
  bodyAlpha: number | null;
  backAlpha: number | null;
}

interface Wave extends WaveView {
  speed: number;
  range: number;
  radius: number;
  damage: number;
  knock: [number, number];
  hit: Set<number>;
  /** らせん: 体の 点 B・向き・生まれた ステップ */
  origin: Vec3;
  bornTick: number;
  worn: boolean;
  /** らせんの 音（かべで 消えたら 止める） */
  sound: { stop(fadeSec: number): void } | null;
}

const round2 = (v: number): number => Math.round(v * 100 + 1e-7) / 100;
const DEG = Math.PI / 180;
const MAX_WAVES = 8;
/** 見た目の ずらし（進む 向きの 右へ。当たりの 半径 0.5 の 中） */
export const BLADE_SIDE_OFFSET = 0.4;
/** らせんの 回る 速さ（1 ステップ 15 度 = 24 ステップで 1 回り） */
export const SPIRAL_SPIN_PER_STEP = 15;
export const SPIRAL_BODY_ALPHA = 0.5;
export const SPIRAL_BACK_ALPHA = 0.3;
/** 生まれる 所（B から 前へ）と 1 ステップの 進み */
const SPIRAL_START = 1.0;

export interface WaveSystem {
  step(ctx: WaveStepCtx): void;
  /** WEAPON-8: らせんの かぜを 出す（F6。出た ステップは すすまない） */
  launchSpiral(a: { item: ItemId; dirDeg: number; body: Vec3 }): void;
  /** とんでいる 波（見た目と 窓口用。毎回 同じ 配列を 返す）。真空波 → らせんの 順 */
  list(): readonly WaveView[];
}

const scr0 = { x: 0, y: 0 };
const scr1 = { x: 0, y: 0 };
const probe: Vec3 = { x: 0, y: 0, z: 0 };

export function createWaveSystem(deps: WaveDeps): WaveSystem {
  const waves: Wave[] = [];
  const spirals: Wave[] = [];
  const view: WaveView[] = [];
  const rng = createRng((deps.seed ?? 0) ^ 0x57a11);
  let nextId = 1;
  let lastVariant = -1;

  function blockedAt(p: Vec3): boolean {
    return deps.world.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
  }

  function sweep(w: Wave, from: Vec3, len: number): number {
    const yw = deps.yokai();
    const spiral = w.kind === 'spiral';
    let n = 0;
    for (const y of yw.list()) {
      if (y.state === 'dying' || y.state === 'leaving') continue;
      if (w.hit.has(y.id)) continue;
      if (capsuleDist(from, w.dir, len, w.radius, y) < 0) continue;
      w.hit.add(y.id);
      n += 1;
      const dealt = yw.damage(y.id, w.damage, { x: y.position.x - w.dir.x, y: y.position.y, z: y.position.z - w.dir.z }, { dist: w.knock[0], up: w.knock[1] });
      const shown = typeof dealt === 'number' && dealt > 0 ? dealt : w.damage;
      deps.emit({ type: spiral ? 'spiralHit' : 'waveHit', tick: deps.tick(), id: w.id, yokaiId: y.id, damage: shown });
    }
    if (spiral && n > 0 && !w.worn) {
      w.worn = true;
      deps.onSpiralHit?.();
    }
    return n;
  }

  function remove(list: Wave[], i: number, reason: 'range' | 'block'): void {
    const [w] = list.splice(i, 1);
    if (reason === 'block') w!.sound?.stop(0.2);
    if (w!.kind === 'spiral') deps.emit({ type: 'spiralEnd', tick: deps.tick(), id: w!.id, reason, position: { ...w!.position }, traveled: w!.traveled });
    else deps.emit({ type: 'waveEnd', tick: deps.tick(), id: w!.id, reason, position: { ...w!.position } });
  }

  /** 真空波の 絵の 向き（画面で 進む 向きを 45 度に まるめる。0 = 右、2 = 上） */
  function faceOf(w: Wave): number {
    const v = deps.view?.();
    if (!v) return 0;
    const fwd = w.dir.x * v.forward.x + w.dir.y * v.forward.y + w.dir.z * v.forward.z;
    if (fwd >= 0.7) return 2;
    if (fwd <= -0.7) return 6;
    probe.x = w.position.x;
    probe.y = w.position.y;
    probe.z = w.position.z;
    if (!v.project(probe, scr0)) return 0;
    probe.x += w.dir.x;
    probe.y += w.dir.y;
    probe.z += w.dir.z;
    if (!v.project(probe, scr1)) return 0;
    const deg = Math.atan2(scr1.y - scr0.y, scr1.x - scr0.x) / DEG;
    return (((Math.round(deg / 45) % 8) + 8) % 8) | 0;
  }

  function look(w: Wave): void {
    if (w.kind === 'spiral') {
      w.drawPos.x = w.position.x;
      w.drawPos.y = w.position.y;
      w.drawPos.z = w.position.z;
      w.spin = deps.reducedMotion?.() ? 0 : w.age * SPIRAL_SPIN_PER_STEP;
      return;
    }
    // 進む 向きの 右（上から 見て）へ 水平に ずらす
    const hl = Math.hypot(w.dir.x, w.dir.z) || 1;
    w.drawPos.x = w.position.x + (-w.dir.z / hl) * BLADE_SIDE_OFFSET;
    w.drawPos.y = w.position.y;
    w.drawPos.z = w.position.z + (w.dir.x / hl) * BLADE_SIDE_OFFSET;
    w.face = faceOf(w);
  }

  function rebuild(): void {
    view.length = 0;
    for (const w of waves) view.push(w);
    for (const w of spirals) view.push(w);
  }

  const from: Vec3 = { x: 0, y: 0, z: 0 };

  function blank(id: number, position: Vec3, dir: Vec3, kind: 'wave' | 'spiral'): Wave {
    return {
      id,
      kind,
      position,
      dir,
      traveled: 0,
      age: 0,
      spin: 0,
      drawPos: { ...position },
      face: kind === 'wave' ? 0 : null,
      bodyAlpha: kind === 'spiral' ? SPIRAL_BODY_ALPHA : null,
      backAlpha: kind === 'spiral' ? SPIRAL_BACK_ALPHA : null,
      speed: 0,
      range: 0,
      radius: 0,
      damage: 0,
      knock: [0, 0],
      hit: new Set(),
      origin: { x: 0, y: 0, z: 0 },
      bornTick: -1,
      worn: false,
      sound: null,
    };
  }

  const spiralPoint = (w: Wave, a: number, out: Vec3): Vec3 => {
    const d = SPIRAL_START + (w.speed / 60) * a;
    out.x = w.origin.x + w.dir.x * d;
    out.y = w.origin.y;
    out.z = w.origin.z + w.dir.z * d;
    return out;
  };

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
          remove(waves, i, 'block');
          continue;
        }
        sweep(w, from, d);
        w.position.x = nx;
        w.position.y = ny;
        w.position.z = nz;
        w.traveled += d;
        w.age += 1;
        look(w);
        if (w.traveled >= w.range - 1e-9) remove(waves, i, 'range');
      }
      // らせん（生まれた ステップは すすまない）
      for (let i = spirals.length - 1; i >= 0; i--) {
        const w = spirals[i]!;
        if (w.bornTick === deps.tick()) continue;
        from.x = w.position.x;
        from.y = w.position.y;
        from.z = w.position.z;
        w.age += 1;
        spiralPoint(w, w.age, w.position);
        if (blockedAt(w.position)) {
          w.age -= 1;
          spiralPoint(w, w.age + 1, w.position);
          remove(spirals, i, 'block');
          continue;
        }
        sweep(w, from, w.speed / 60);
        w.traveled = (w.speed / 60) * w.age;
        look(w);
        if (w.traveled >= w.range - 1e-9) {
          w.traveled = w.range;
          remove(spirals, i, 'range');
        }
      }
      // 新しい 波（当たりの はじめの F）
      const def = waveOf(deps.settings, ctx.item);
      if (def && ctx.tech && ctx.phase === 'active' && ctx.frame === ctx.startup + 1 && waves.length < MAX_WAVES) {
        const ur = ctx.dirDeg * DEG;
        const w = blank(nextId++, { x: ctx.body.x, y: ctx.body.y, z: ctx.body.z }, { x: Math.sin(ur), y: 0, z: -Math.cos(ur) }, 'wave');
        w.speed = def.speed;
        w.range = def.range;
        w.radius = def.radius;
        w.damage = round2((legendPowerOf(deps.settings, ctx.item) ?? 1) * def.damageMul);
        w.knock = [def.knock[0], def.knock[1]];
        deps.emit({ type: 'waveStart', tick: deps.tick(), id: w.id, position: { ...w.position }, dir: { ...w.dir } });
        // 高さ: 3 つの 中から 前と ちがう 物
        const v = lastVariant < 0 ? Math.floor(rng() * 3) : (lastVariant + 1 + Math.floor(rng() * 2)) % 3;
        lastVariant = v;
        deps.sound?.(v);
        if (blockedAt(w.position)) {
          deps.emit({ type: 'waveEnd', tick: deps.tick(), id: w.id, reason: 'block', position: { ...w.position } });
        } else {
          look(w);
          waves.push(w);
          sweep(w, w.position, 0);
        }
      }
      rebuild();
    },

    launchSpiral(a): void {
      const c = chargeOf(deps.settings, a.item);
      if (!c || c.kind !== 'spiral' || spirals.length > 0) return;
      const ur = a.dirDeg * DEG;
      const dir = { x: Math.sin(ur), y: 0, z: -Math.cos(ur) };
      const w = blank(nextId++, { x: 0, y: 0, z: 0 }, dir, 'spiral');
      w.origin = { x: a.body.x, y: a.body.y, z: a.body.z };
      w.speed = c.speed;
      w.range = c.range;
      w.radius = c.radius;
      w.damage = round2((legendPowerOf(deps.settings, a.item) ?? 1) * c.damageMul);
      w.knock = [c.knock[0], c.knock[1]];
      w.bornTick = deps.tick();
      spiralPoint(w, 0, w.position);
      look(w);
      deps.emit({ type: 'spiralStart', tick: deps.tick(), id: w.id, position: { ...w.position }, dir: { ...w.dir } });
      w.sound = deps.spiralSound?.() ?? null;
      if (blockedAt(w.position)) {
        w.sound?.stop(0.2);
        deps.emit({ type: 'spiralEnd', tick: deps.tick(), id: w.id, reason: 'block', position: { ...w.position }, traveled: 0 });
        rebuild();
        return;
      }
      spirals.push(w);
      sweep(w, w.position, 0);
      rebuild();
    },

    list(): readonly WaveView[] {
      return view;
    },
  };
}
