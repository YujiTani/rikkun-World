/**
 * #293 試作: まわりの 地面から 間欠泉に かえる 場所を えらぶ（純粋な 計算。gashaGeyserSpawn.test.ts で 確かめる）。
 * がしゃどくろの 体の 中心から 半径 radius の 円の 中を ランダム（シード付き）に えらび、
 * cells × cells マスが ぜんぶ「地表の くさ・つち」で、平らで、上が あいていて、体の 下でも ほかの 間欠泉の そばでも ない 所だけ 通す。
 */
import { BLOCK_TYPES } from '../world/blocks/blockTypes';

export interface SpawnTune {
  radius: number;
  bodyClear: number;
  gap: number;
  tries: number;
}

export interface SpawnProbe {
  /** 地面の いちばん 上の ブロックの 高さ */
  surfaceY(x: number, z: number): number;
  blockAt(x: number, y: number, z: number): string;
  /** がしゃどくろの 体の 当たり（固い マス） */
  bodySolid(x: number, y: number, z: number): boolean;
  /** すでに 間欠泉・かわる 途中の マス */
  taken(x: number, z: number): boolean;
}

export interface Spot {
  x0: number;
  z0: number;
  /** かえる ブロックの 高さ（地表の ブロック） */
  y: number;
}

const SOLID = new Set<string>(BLOCK_TYPES.filter((t) => t.solid).map((t) => t.id));

/** 柱が 立つ 上の あき（水・かたい ブロックが ない） */
export function isClearAbove(id: string): boolean {
  return id !== 'water' && id !== 'outside' && !SOLID.has(id);
}

/** 1 か所を えらぶ。見つからなければ null。rnd は 0〜1 の 乱数 */
export function pickSpot(rnd: () => number, cx: number, cz: number, cells: number, probe: SpawnProbe, tune: SpawnTune): Spot | null {
  for (let n = 0; n < tune.tries; n++) {
    const ang = rnd() * Math.PI * 2;
    const r = tune.radius * Math.sqrt(rnd());
    const x0 = Math.floor(cx + Math.cos(ang) * r - cells / 2);
    const z0 = Math.floor(cz + Math.sin(ang) * r - cells / 2);
    if (spotOk(x0, z0, cells, cx, cz, probe, tune)) return { x0, z0, y: probe.surfaceY(x0, z0) };
  }
  return null;
}

export function spotOk(x0: number, z0: number, cells: number, cx: number, cz: number, probe: SpawnProbe, tune: SpawnTune): boolean {
  if (Math.hypot(x0 + cells / 2 - cx, z0 + cells / 2 - cz) < tune.bodyClear) return false;
  const y = probe.surfaceY(x0, z0);
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x = x0 + i, z = z0 + j;
      if (probe.surfaceY(x, z) !== y) return false; // 平ら
      const b = probe.blockAt(x, y, z);
      if (b !== 'grass' && b !== 'dirt') return false; // 水・木・建物・石の 上は えらばない
      if (!isClearAbove(probe.blockAt(x, y + 1, z)) || !isClearAbove(probe.blockAt(x, y + 2, z))) return false;
    }
  }
  const g = tune.gap;
  for (let i = -g; i < cells + g; i++) {
    for (let j = -g; j < cells + g; j++) {
      const x = x0 + i, z = z0 + j;
      if (probe.taken(x, z)) return false;
      for (let dy = 1; dy <= 3; dy++) if (probe.bodySolid(x, y + dy, z)) return false; // 体の 下
    }
  }
  return true;
}

/** 間欠泉の 数（cells × cells マスで 1 本。はんぱは 切り上げ） */
export function groupsOf(cellCount: number, cells: number): number {
  return Math.ceil(cellCount / (cells * cells));
}
