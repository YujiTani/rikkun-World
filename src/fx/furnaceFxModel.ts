import { CRAFT_UI_SETTINGS, type CraftUiSettings } from './craftConfig';
import type { Rng } from '../world/gen/random';

/** 見せる かまど 1 こ分の情報（つなぎ込みが furnace.get から作る） */
export interface FurnaceFxEntry {
  x: number;
  y: number;
  z: number;
  /** 焼いているか */
  burning: boolean;
  /** 焼けたのに入らず待っているもの（あれば上にふわふわ浮く） */
  waiting: string | null;
}

/** 火の明るさ 0.6〜1。2 つの波を足すだけ（どちらも 1 秒に 3 回未満なので点滅に見えない） */
export function flameLevel(t: number, phase = 0, cfg: CraftUiSettings = CRAFT_UI_SETTINGS): number {
  const a = Math.sin(2 * Math.PI * cfg.flameHz1 * t + phase);
  const b = Math.sin(2 * Math.PI * cfg.flameHz2 * t + phase * 1.7 + 1);
  return 0.8 + 0.12 * a + 0.08 * b;
}

export interface SmokePuff {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  size: number;
  drift: number;
}

/** けむりの小さな四角のプール（毎フレーム new しない） */
export class SmokePool {
  readonly puffs: SmokePuff[];
  private readonly spawnLeft = new Map<string, number>();

  constructor(
    private readonly rng: Rng,
    private readonly cfg: CraftUiSettings = CRAFT_UI_SETTINGS,
  ) {
    this.puffs = Array.from({ length: cfg.smokeMax }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      age: 0,
      life: 1,
      size: 0.1,
      drift: 0,
    }));
  }

  spawn(x: number, y: number, z: number): boolean {
    const p = this.puffs.find((q) => !q.active);
    if (!p) return false;
    p.active = true;
    p.x = x + (this.rng() - 0.5) * 0.25;
    p.y = y;
    p.z = z + (this.rng() - 0.5) * 0.25;
    p.age = 0;
    p.life = this.cfg.smokeLife * (0.8 + this.rng() * 0.4);
    p.size = 0.1 + this.rng() * 0.08;
    p.drift = (this.rng() - 0.5) * 0.3;
    return true;
  }

  /** 燃えている かまど の上から出す */
  update(dt: number, entries: readonly FurnaceFxEntry[]): void {
    for (const e of entries) {
      if (!e.burning) continue;
      const key = `${e.x},${e.y},${e.z}`;
      let left = (this.spawnLeft.get(key) ?? 0) + dt * this.cfg.smokePerSecond;
      while (left >= 1) {
        this.spawn(e.x + 0.5, e.y + 1.05, e.z + 0.5);
        left -= 1;
      }
      this.spawnLeft.set(key, left);
    }
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      p.y += this.cfg.smokeRise * dt;
      p.x += p.drift * dt;
    }
  }

  activeCount(): number {
    let n = 0;
    for (const p of this.puffs) if (p.active) n++;
    return n;
  }
}

/** パチパチを鳴らす かまど: 燃えているもののうち 8 ブロック以内でいちばん近い 1 つ（同時に 1 つだけ） */
export function crackleTarget(
  entries: readonly FurnaceFxEntry[],
  px: number,
  py: number,
  pz: number,
  cfg: CraftUiSettings = CRAFT_UI_SETTINGS,
): FurnaceFxEntry | null {
  let best: FurnaceFxEntry | null = null;
  let bestD = cfg.crackleRange * cfg.crackleRange;
  for (const e of entries) {
    if (!e.burning) continue;
    const dx = e.x + 0.5 - px;
    const dy = e.y + 0.5 - py;
    const dz = e.z + 0.5 - pz;
    const d = dx * dx + dy * dy + dz * dz;
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** 次のパチパチまでの秒 */
export function nextCrackleDelay(rng: Rng, cfg: CraftUiSettings = CRAFT_UI_SETTINGS): number {
  return cfg.crackleMinInterval + rng() * (cfg.crackleMaxInterval - cfg.crackleMinInterval);
}
