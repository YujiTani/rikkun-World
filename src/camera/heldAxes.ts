/**
 * おの 3 本の 手に持つ形（DESIGN 13.4）。箱 4 つ: え・みね・刃・刃先。
 * 向き・Part の書き方は `heldTools.ts` と同じ（原点 = にぎった手、のびる向き = -Z、X = 横）。
 * つなぎこみは開発（#115）。
 */
export interface Part {
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  color: number;
  rotY?: number;
}

type AxeId = 'wood_axe' | 'stone_axe' | 'iron_axe';
const WOOD = 0x7a5230;
const COL: Record<AxeId, { head: number; shade: number; edge: number }> = {
  wood_axe: { head: 0xc99860, shade: 0x9a6a3a, edge: 0xecc890 },
  stone_axe: { head: 0x8a8a8a, shade: 0x666666, edge: 0xbdbdbd },
  iron_axe: { head: 0xe0e0e8, shade: 0xa8a8b4, edge: 0xffffff },
};

function axe(id: AxeId): Part[] {
  const c = COL[id];
  return [
    { size: [0.05, 0.05, 0.55], pos: [0, 0, -0.175], color: WOOD },
    { size: [0.08, 0.07, 0.1], pos: [0, 0, -0.42], color: c.shade },
    { size: [0.16, 0.04, 0.12], pos: [0.1, 0, -0.42], color: c.head },
    { size: [0.05, 0.045, 0.18], pos: [0.2, 0, -0.42], color: c.edge },
  ];
}

export const AXE_HELD_PARTS: Record<AxeId, Part[]> = {
  wood_axe: axe('wood_axe'),
  stone_axe: axe('stone_axe'),
  iron_axe: axe('iron_axe'),
};
