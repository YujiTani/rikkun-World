import type { AnimalBreed, AnimalStage, KitEgg } from '../contracts';

/**
 * 保存 `animals` の 読みこみ（LIVE-2 §4.4・台帳 G8、LIVE-2.1 §4.3）。v 1 → v 2 → v 3 → v 4 の 順 に 直して 読む。
 * こたつ の 行: v 4 は `eggs`（先 の 3 こ だけ・0 こ は すてる・世界 ぜんぶ で 6 こ まで）、v 3 は `{ egg, left }` を `eggs` 1 行 に 直す。
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
  /** GOLD-1: 0〜natsukiMax・まち 0〜waitMax・のこり 1〜decayMax に おさめる（なし = はじめ の 値）。ひよこ は 0・0・0・decayMax */
  natsuki: number;
  natsukiBugWait: number;
  natsukiPetWait: number;
  natsukiDecayLeft: number;
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
export interface ParsedKitEgg {
  egg: KitEgg;
  left: number;
}
/** LIVE-2.1: こたつ の 行（たまご は 入れた 順。1〜3 こ） */
export interface ParsedKit {
  x: number;
  y: number;
  z: number;
  eggs: ParsedKitEgg[];
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
  /** 世界 ぜんぶ で あたためる たまご の 数（`kitActiveMax`） */
  kitMax: number;
  /** こたつ 1 台 の たまご（`kitEggMax`。なければ 3） */
  kitEggMax?: number;
  /** GOLD-1: なつき度 の 上限・まち の 上限（bug・pet）・へる まで の 上限（なければ 100・18,000・18,000・36,000） */
  natsukiMax?: number;
  bugWaitMax?: number;
  petWaitMax?: number;
  decayMax?: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): number => (isNum(v) ? Math.max(0, Math.round(v)) : 0);
const obj = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null);

/** 数 で なければ `dflt`、そうで なければ [lo, hi] に おさめて 整数 に する（GOLD-1 §4.4「おかしい 値 は はんい に おさめる」） */
const clampInt = (v: unknown, lo: number, hi: number, dflt: number): number => (isNum(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : dflt);

function parseBird(r: unknown, followMax: number, keepFollow: boolean, lim: ParseLimits): ParsedBird | null {
  const o = obj(r);
  if (!o) return null;
  if (!isNum(o.x) || !isNum(o.y) || !isNum(o.z)) return null;
  const adult = o.stage !== 'chick';
  const decayMax = lim.decayMax ?? 36000;
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
    natsuki: adult ? clampInt(o.natsuki, 0, lim.natsukiMax ?? 100, 0) : 0,
    natsukiBugWait: adult ? clampInt(o.natsukiBugWait, 0, lim.bugWaitMax ?? 18000, 0) : 0,
    natsukiPetWait: adult ? clampInt(o.natsukiPetWait, 0, lim.petWaitMax ?? 18000, 0) : 0,
    natsukiDecayLeft: adult ? clampInt(o.natsukiDecayLeft, 1, decayMax, decayMax) : decayMax,
  };
}

export function parseAnimalSave(data: unknown, lim: ParseLimits): ParsedSave | null {
  const o = obj(data);
  if (!o || !Array.isArray(o.friends)) return null;
  const out: ParsedSave = { friends: [], coops: [], kits: [], machoMiss: 0 };
  for (const r of o.friends) {
    if (out.friends.length >= lim.friendMax) break;
    const b = parseBird(r, lim.followMax, true, lim);
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
          const b = parseBird(k, lim.followMax, false, lim);
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
    const perKit = lim.kitEggMax ?? 3;
    let total = 0;
    for (const r of o.kits) {
      if (total >= lim.kitMax) break;
      const k = obj(r);
      if (!k || !isNum(k.x) || !isNum(k.y) || !isNum(k.z)) continue;
      const eggs: ParsedKitEgg[] = [];
      if (Array.isArray(k.eggs)) {
        for (const q of k.eggs) {
          if (eggs.length >= perKit || total + eggs.length >= lim.kitMax) break;
          const e = obj(q);
          if (!e || (e.egg !== 'egg' && e.egg !== 'gold') || !isNum(e.left)) continue;
          eggs.push({ egg: e.egg, left: Math.max(0, Math.round(e.left)) });
        }
      } else if ((k.egg === 'egg' || k.egg === 'gold') && isNum(k.left)) {
        eggs.push({ egg: k.egg, left: Math.max(0, Math.round(k.left)) });
      }
      if (eggs.length === 0) continue;
      total += eggs.length;
      out.kits.push({ x: Math.round(k.x), y: Math.round(k.y), z: Math.round(k.z), eggs });
    }
  }
  out.machoMiss = count(o.machoMiss);
  return out;
}
