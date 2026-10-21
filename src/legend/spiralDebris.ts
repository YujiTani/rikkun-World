import type { Vec3, VoxelWorld } from '../contracts';
import { createRng } from '../world/gen/random';

/**
 * WEAPON-8 §3.1: らせんの かぜが ふきとばす 地面の 土と 草の つぶ（見た目だけ。ブロックは こわさない・変えない）。
 * 毎ステップ `step`。つぶの 位置は 生まれた 所から 式で 出す（重さ 20 マス/秒²）。同時に 48 こまで（点の 描き方〈Points〉）。
 */
export type DebrisGround = 'kusa' | 'tsuchi' | 'ishi' | 'suna';
export const GROUND_INDEX: Record<DebrisGround, number> = { kusa: 0, tsuchi: 1, ishi: 2, suna: 3 };

/** 地面を 探す とどく きょり（P(a) の 真下。これ 以下 だけ 出る） */
export const DEBRIS_REACH = 2.5;
export const DEBRIS_MAX = 48;
const GRAVITY = 20;
const SMOKE_LIFE = 14;

export interface DebrisSpiral {
  id: number;
  /** 生まれてからの ステップ数 a */
  age: number;
  /** まん中の 点 P(a) */
  position: Vec3;
  dir: Vec3;
}

export interface DebrisView {
  alive: number;
  ground: DebrisGround | null;
  smoke: number;
}

export interface SpiralDebris {
  step(spiral: DebrisSpiral | null, reduced: boolean): void;
  view(): DebrisView;
  /** 描く 点（0〜count-1）。位置・大きさ（点の 数）・地面の しゅるい 0〜3・色の 段 0〜4・網 */
  readonly count: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly size: Float32Array;
  readonly kind: Uint8Array;
  /** 0 草の 切れはし 1 草（おちる ころ）2 土の かたまり 3 土（おちる ころ）4 土けむり */
  readonly tone: Uint8Array;
  readonly dither: Uint8Array;
}

interface Bit {
  x0: number;
  y0: number;
  z0: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  smoke: boolean;
  grass: boolean;
  kind: number;
  floorY: number;
}

const KINDS: DebrisGround[] = ['kusa', 'tsuchi', 'ishi', 'suna'];

function groundKindOf(id: string): DebrisGround {
  if (id === 'grass') return 'kusa';
  if (id === 'dirt') return 'tsuchi';
  if (id === 'sand') return 'suna';
  return 'ishi';
}

export function createSpiralDebris(deps: { world: Pick<VoxelWorld, 'getBlock' | 'isSolid'>; seed?: number }): SpiralDebris {
  const rng = createRng((deps.seed ?? 0) ^ 0xd3b215);
  const bits: Bit[] = [];
  const out = {
    count: 0,
    px: new Float32Array(DEBRIS_MAX),
    py: new Float32Array(DEBRIS_MAX),
    pz: new Float32Array(DEBRIS_MAX),
    size: new Float32Array(DEBRIS_MAX),
    kind: new Uint8Array(DEBRIS_MAX),
    tone: new Uint8Array(DEBRIS_MAX),
    dither: new Uint8Array(DEBRIS_MAX),
  };
  const v: DebrisView = { alive: 0, ground: null, smoke: 0 };
  let lastId = -1;
  let lastAge = -1;

  /** 真下の 地面: { 上の 面の 高さ, しゅるい } か なし（穴・水の 面） */
  function groundBelow(p: Vec3): { top: number; kind: DebrisGround } | null {
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    const y0 = Math.floor(p.y);
    for (let y = y0; y >= y0 - 4; y--) {
      const b = deps.world.getBlock(x, y, z);
      if (b === 'water') return null;
      if (b !== 'air' && b !== 'outside' && deps.world.isSolid(x, y, z)) {
        const top = y + 1;
        return p.y - top <= DEBRIS_REACH + 1e-9 ? { top, kind: groundKindOf(b) } : null;
      }
      if (b === 'outside') return null;
      if (p.y - y > DEBRIS_REACH + 1.5) break;
    }
    return null;
  }

  function sync(): void {
    let n = 0;
    let alive = 0;
    let smoke = 0;
    for (const b of bits) {
      if (n >= DEBRIS_MAX) break;
      const t = b.age / 60;
      const y = b.y0 + b.vy * t - (b.smoke ? 0 : (GRAVITY / 2) * t * t);
      if (!b.smoke && y < b.floorY) continue;
      out.px[n] = b.x0 + b.vx * t;
      out.py[n] = y;
      out.pz[n] = b.z0 + b.vz * t;
      out.kind[n] = b.kind;
      const late = b.age > b.life * 0.65;
      if (b.smoke) {
        out.tone[n] = 4;
        out.size[n] = 3 + 3 * (b.age / b.life);
        out.dither[n] = 1;
        smoke += 1;
      } else {
        out.tone[n] = b.grass ? (late ? 1 : 0) : late ? 3 : 2;
        out.size[n] = b.grass ? 2 : 3;
        out.dither[n] = late ? 1 : 0;
        alive += 1;
      }
      n += 1;
    }
    out.count = n;
    v.alive = alive;
    v.smoke = smoke;
  }

  return {
    step(sp: DebrisSpiral | null, reduced: boolean): void {
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i]!;
        b.age += 1;
        if (b.age >= b.life) bits.splice(i, 1);
      }
      if (sp && (sp.id !== lastId || sp.age !== lastAge)) {
        if (sp.id !== lastId) v.ground = null;
        lastId = sp.id;
        lastAge = sp.age;
        const g = groundBelow(sp.position);
        if (g) {
          const k = GROUND_INDEX[g.kind];
          v.ground = g.kind;
          // 回る 向き（右）
          const rx = -sp.dir.z;
          const rz = sp.dir.x;
          const count = reduced ? 0 : sp.age % 2 === 0 ? 2 : 1;
          for (let c = 0; c < count && bits.length < DEBRIS_MAX; c++) {
            const back = 0.4 + 1.2 * rng();
            const lat = (rng() * 2 - 1) * 0.8;
            const up = 5 + 3 * rng();
            const fw = 3 + 4 * rng();
            const sd = (1.5 + 2 * rng()) * (rng() < 0.7 ? 1 : -1) * (rng() < 0.5 ? -1 : 1);
            bits.push({
              x0: sp.position.x - sp.dir.x * back + rx * lat,
              y0: g.top + 0.05,
              z0: sp.position.z - sp.dir.z * back + rz * lat,
              vx: sp.dir.x * fw + rx * sd,
              vy: up,
              vz: sp.dir.z * fw + rz * sd,
              age: 0,
              life: 12 + Math.floor(rng() * 9),
              smoke: false,
              grass: c === 1 || sp.age % 3 === 0,
              kind: k,
              floorY: g.top,
            });
          }
          if (sp.age % 4 === 0 && bits.length < DEBRIS_MAX) {
            bits.push({
              x0: sp.position.x,
              y0: g.top + 0.2,
              z0: sp.position.z,
              vx: sp.dir.x * 2.0,
              vy: 2.6,
              vz: sp.dir.z * 2.0,
              age: 0,
              life: SMOKE_LIFE,
              smoke: true,
              grass: false,
              kind: k,
              floorY: g.top,
            });
          }
        }
      }
      sync();
    },
    view: () => v,
    get count() {
      return out.count;
    },
    px: out.px,
    py: out.py,
    pz: out.pz,
    size: out.size,
    kind: out.kind,
    tone: out.tone,
    dither: out.dither,
  };
}

export { KINDS as DEBRIS_KINDS };
