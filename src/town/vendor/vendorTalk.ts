import type { Vec3 } from '../../contracts';
import { shopkeeperRay, type TalkPort } from '../shop/shopTalk';
import type { VendorNpc } from './vendorDesk';

/**
 * かじやさん・やたいの 3 人に 話しかける 口（TOWN-1-shop §2.11〜§2.13）。右クリック（1P）・ZL（2P）の「はなす」は
 * 建築士さん・よろずやさんと 同じ 道（ほる係の `architects` の 口）を 通るので、その 口に 4 人の 当たりを まぜる（近い 人を ねらう）。
 * 当たりの 箱は よろずやさんと 同じ（`shopkeeperRay`）。かざりの やたいには 人が いない ので「はなす」は 出ない（AC49）。
 */

/** 話す 人の ならび（当たりを しらべる 順） */
export const VENDOR_NPCS: readonly VendorNpc[] = ['smith', 'stall', 'dango', 'gohan'];

/** 話しかける 口の id（建築士さん・よろずやさんの id と かさならない） */
export const VENDOR_TALK_ID = {
  smith: 'town:smith',
  stall: 'town:stall',
  dango: 'town:dango',
  gohan: 'town:gohan',
} as const satisfies Record<VendorNpc, string>;

/** id → 人（ちがえば null） */
function vendorOfTalkId(id: string): VendorNpc | null {
  for (const n of VENDOR_NPCS) if (VENDOR_TALK_ID[n] === id) return n;
  return null;
}

export interface VendorTalkHub {
  /** その 人の 足もと（街が なければ null） */
  at(npc: VendorNpc): Vec3 | null;
  /** 話した（画面が 開けば true） */
  talk(who: 1 | 2, npc: VendorNpc): boolean;
}

/** いちばん 近い 人と その きょり（当たらなければ null） */
export function vendorRay(hub: VendorTalkHub, origin: Vec3, dir: Vec3, reach: number): { npc: VendorNpc; distance: number } | null {
  let best: VendorNpc | null = null;
  let bestT = Infinity;
  for (const n of VENDOR_NPCS) {
    const at = hub.at(n);
    const t = at ? shopkeeperRay(at, origin, dir, reach) : null;
    if (t !== null && t < bestT) {
      best = n;
      bestT = t;
    }
  }
  return best === null ? null : { npc: best, distance: bestT };
}

/** 建築士さんの 口に 4 人を まぜる（近い ほうを ねらう）。who ＝ この 口を 使う 人 */
export function withVendorTalk(base: TalkPort, hub: () => VendorTalkHub | null, who: 1 | 2): TalkPort {
  return {
    rayHit: (origin, dir, reach) => {
      const a = base.rayHit(origin, dir, reach);
      const h = hub();
      const v = h ? vendorRay(h, origin, dir, reach) : null;
      if (v === null || (a && a.distance <= v.distance)) return a;
      return { id: VENDOR_TALK_ID[v.npc], distance: v.distance };
    },
    talk: (id) => {
      const n = vendorOfTalkId(id);
      return n === null ? base.talk(id) : (hub()?.talk(who, n) ?? false);
    },
    hit: (id) => {
      if (vendorOfTalkId(id) === null) base.hit?.(id); // 街の 人は たたいても 何も しない
    },
  };
}
