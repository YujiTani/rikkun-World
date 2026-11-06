import { CAVE_CONFIG as C, CAVE_KIND_LIST, CAVE_LAYERS, type CaveKind } from './mineCaveConfig';
import type { PlacedCave } from './mineCaves';
import type { MineLayerId } from './mineConfig';
import type { RoomStats } from './mineCaveRoom';
import type { ShaftWorld } from './mineShafts';

/**
 * window.__rikkun.mine の ほらあなの 種類の 窓口（MINE-1D §6.1）。計画から 答える（世界は 読まない）。
 */

export interface Cave {
  id: string;
  kind: CaveKind;
  layer: MineLayerId;
  box: PlacedCave['box'];
  center: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  linked: boolean;
  shaft: string | null;
}

/** 窓口の 範囲（findCave の 打ちきり。マス） */
const FIND_MAX = 4096;

function toCave(c: PlacedCave): Cave {
  const b = c.box;
  return {
    id: c.id,
    kind: c.kind,
    layer: c.layer,
    box: { ...b },
    center: { x: (b.x0 + b.x1 + 1) / 2, y: (b.y0 + b.y1 + 1) / 2, z: (b.z0 + b.z1 + 1) / 2 },
    size: { x: b.x1 - b.x0 + 1, y: b.y1 - b.y0 + 1, z: b.z1 - b.z0 + 1 },
    linked: c.room.stats.openings > 0,
    shaft: c.shaft,
  };
}

export function createCaveHook(world: () => ShaftWorld, spawn: () => { x: number; z: number }) {
  const caves = (): ShaftWorld['caves'] => world().caves;
  const find = (id: string): PlacedCave | null => caves().byId(id);
  return {
    caves: (x0: number, z0: number, x1: number, z1: number): Cave[] => caves().caves(x0, z0, x1, z1).map(toCave),
    findCave(kind: CaveKind, from?: { x: number; z: number }): Cave | null {
      const p = from ?? spawn();
      const c = caves().find(kind, p.x, p.z, FIND_MAX);
      return c ? toCave(c) : null;
    },
    caveRolls: (x0: number, z0: number, x1: number, z1: number) => caves().rolls(x0, z0, x1, z1),
    caveTable: () => CAVE_LAYERS.map((layer) => ({ layer, kinds: { ...C.rolls[layer] } as Partial<Record<CaveKind, number>> })),
    heyaLinkTable: () => CAVE_LAYERS.map((layer) => ({ layer, chance: C.link[layer].chance, kinds: { ...C.link[layer].kinds } as Partial<Record<CaveKind, number>> })),
    caveSpec: () => ({
      kinds: Object.fromEntries(CAVE_KIND_LIST.map((k) => [k, { layers: [...C.kinds[k].layers], x: [...C.kinds[k].x], z: [...C.kinds[k].z], y: [...C.kinds[k].y] }])),
      rules: JSON.parse(JSON.stringify(C.rules)) as typeof C.rules,
    }),
    caveStats(id: string): RoomStats {
      const c = find(id);
      if (!c) throw new Error(`知らない 部屋 ${id}`);
      return { ...c.room.stats, visible: { ...c.room.stats.visible } };
    },
    /** その マスが 部屋の 中なら 種類 */
    caveKindAt: (x: number, y: number, z: number): CaveKind | null => caves().kindAt(Math.floor(x), Math.floor(y), Math.floor(z)),
  };
}
