import { cellKey } from './cellKey';
import type { FarmCropInfo, M7Settings, PetPort, PetResult } from '../contracts';

/**
 * なでる・ごきげん（M7-2 §2.3・§4.4）。A の `FarmSystem` が `PetPort` として使う。
 * ごきげん の のこり は 農業 の ステップ（`tick()` が 1 ずつ へらす）。1 にち = `dayLength()` ステップ。
 * 保存 `farm.happy` は `serialize()`（x, y, z, のこり の 4 こ ずつ）。
 */
export interface PetDeps {
  /** 設定の 入れ物（`settings.set` で 変えても すぐ 効くよう 同じ オブジェクトを 読む） */
  settings: Pick<M7Settings, 'farmPetDays' | 'farmPetGrowBonus'>;
  /** 1 にち の ステップ数（今 91,800） */
  dayLength(): number;
}

interface Entry {
  x: number;
  y: number;
  z: number;
  left: number;
}

const key = cellKey;

export class Pet implements PetPort {
  private readonly map = new Map<number, Entry>();

  constructor(private readonly d: PetDeps) {}

  growFactor(x: number, y: number, z: number): number {
    return this.map.has(key(x, y, z)) ? 1 + this.d.settings.farmPetGrowBonus : 1;
  }

  isHappy(x: number, y: number, z: number): boolean {
    return this.map.has(key(x, y, z));
  }

  left(x: number, y: number, z: number): number {
    return this.map.get(key(x, y, z))?.left ?? 0;
  }

  pet(x: number, y: number, z: number, crop: FarmCropInfo & { wild: boolean }): PetResult | null {
    if (!crop) return null;
    if (crop.wild) return 'wild';
    const k = key(x, y, z);
    if (this.map.has(k)) return 'again';
    const n = Math.max(1, Math.round(this.d.settings.farmPetDays * this.d.dayLength()));
    this.map.set(k, { x, y, z, left: n });
    return 'happy';
  }

  /** 1 ステップ。active があれば、それが false の (x, z)（読みこんでいない列）の作物は 時間を止める（VOX-D） */
  tick(active?: (x: number, z: number) => boolean): void {
    if (this.map.size === 0) return;
    for (const [k, e] of this.map) {
      if (active && !active(e.x, e.z)) continue;
      if (--e.left <= 0) this.map.delete(k);
    }
  }

  onCropRemoved(x: number, y: number, z: number): void {
    this.map.delete(key(x, y, z));
  }

  serialize(): number[] {
    const out: number[] = [];
    for (const e of this.map.values()) out.push(e.x, e.y, e.z, e.left);
    return out;
  }

  deserialize(flat: unknown, isCrop: (x: number, y: number, z: number) => boolean): void {
    this.map.clear();
    if (!Array.isArray(flat)) return;
    for (let i = 0; i + 3 < flat.length; i += 4) {
      const x = flat[i];
      const y = flat[i + 1];
      const z = flat[i + 2];
      const left = flat[i + 3];
      if (![x, y, z, left].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      const n = Math.floor(left);
      if (n <= 0 || !isCrop(x, y, z)) continue;
      this.map.set(key(x, y, z), { x, y, z, left: n });
    }
  }

  /** つぶ用: ごきげん の 作物 を 1 こ ずつ 見る（作らない・こわさない） */
  forEach(fn: (x: number, y: number, z: number, left: number) => void): void {
    for (const e of this.map.values()) fn(e.x, e.y, e.z, e.left);
  }

  get size(): number {
    return this.map.size;
  }
}

export function createPet(d: PetDeps): Pet {
  return new Pet(d);
}
