import type { AnimalBreed, AnimalStage, KitEgg } from '../contracts';

/**
 * 保存 `animals` の 読みこみ（LIVE-2 §4.4・台帳 G8）。v 1 → v 2 → v 3 の 順 に 直して 読む。
 * 数 で ない 行 は 飛ばす。知らない `breed`（`'gold'` も）は `normal`、知らない `stage` は `adult`。
 * 小屋 は `coopCountMax` まで、小屋 の 子 は `coopMax` まで、こたつ は `kitMax` 行 まで しか 読まない。
 */
export interface ParsedBird {
  x: number;
  y: number;
  z: number;
  yaw: number;
  follow: number;
  stage: AnimalStage;
  breed: AnimalBreed;
  raised: boolean;
  bugs: number;
  goldMiss: number;
  grow: number;
}
export interface ParsedCoop {
  id: number | null;
  x: number;
  y: number;
  z: number;
  dir: 0 | 1 | 2 | 3;
  kids: ParsedBird[];
  egg: number;
  gold: number;
}
export interface ParsedKit {
  x: number;
  y: number;
  z: number;
  egg: KitEgg;
  left: number;
}
export interface ParsedSave {
  friends: ParsedBird[];
  coops: ParsedCoop[];
  kits: ParsedKit[];
  machoMiss: number;
}
export interface ParseLimits {
  followMax: number;
  friendMax: number;
  coopMax: number;
  coopCountMax: number;
  kitMax: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): number => (isNum(v) ? Math.max(0, Math.round(v)) : 0);
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null);

function parseBird(r: unknown, followMax: number, keepFollow: boolean): ParsedBird | null {
  const o = obj(r);
  if (!o) return null;
  if (!isNum(o.x) || !isNum(o.y) || !isNum(o.z)) return null;
  return {
    x: o.x,
    y: o.y,
    z: o.z,
    yaw: isNum(o.yaw) ? o.yaw : 0,
    follow: keepFollow ? (isNum(o.follow) ? Math.max(0, Math.min(followMax, Math.round(o.follow))) : followMax) : 0,
    stage: o.stage === 'chick' ? 'chick' : 'adult',
    breed: o.breed === 'macho' ? 'macho' : 'normal',
    raised: o.raised === true,
    bugs: count(o.bugs),
    goldMiss: count(o.goldMiss),
    grow: count(o.grow),
  };
}

export function parseAnimalSave(data: unknown, lim: ParseLimits): ParsedSave | null {
  const o = obj(data);
  if (!o || !Array.isArray(o.friends)) return null;
  const out: ParsedSave = { friends: [], coops: [], kits: [], machoMiss: 0 };
  for (const r of o.friends) {
    if (out.friends.length >= lim.friendMax) break;
    const b = parseBird(r, lim.followMax, true);
    if (b) out.friends.push(b);
  }
  // v 3 より 前（v 1・v 2）には 小屋・こたつ・machoMiss が 無い（空）
  if (Array.isArray(o.coops)) {
    for (const r of o.coops) {
      if (out.coops.length >= lim.coopCountMax) break;
      const c = obj(r);
      if (!c || !isNum(c.x) || !isNum(c.y) || !isNum(c.z)) continue;
      const dir = isNum(c.dir) && c.dir >= 0 && c.dir <= 3 ? (Math.round(c.dir) as 0 | 1 | 2 | 3) : 0;
      const kids: ParsedBird[] = [];
      if (Array.isArray(c.kids)) {
        for (const k of c.kids) {
          if (kids.length >= lim.coopMax) break;
          const b = parseBird(k, lim.followMax, false);
          if (b) kids.push(b);
        }
      }
      const nest = obj(c.nest);
      out.coops.push({
        id: isNum(c.id) ? Math.round(c.id) : null,
        x: Math.round(c.x),
        y: Math.round(c.y),
        z: Math.round(c.z),
        dir,
        kids,
        egg: count(nest?.egg),
        gold: count(nest?.gold),
      });
    }
  }
  if (Array.isArray(o.kits)) {
    for (const r of o.kits) {
      if (out.kits.length >= lim.kitMax) break;
      const k = obj(r);
      if (!k || !isNum(k.x) || !isNum(k.y) || !isNum(k.z) || !isNum(k.left)) continue;
      if (k.egg !== 'egg' && k.egg !== 'gold') continue;
      out.kits.push({ x: Math.round(k.x), y: Math.round(k.y), z: Math.round(k.z), egg: k.egg, left: Math.max(0, Math.round(k.left)) });
    }
  }
  out.machoMiss = count(o.machoMiss);
  return out;
}
