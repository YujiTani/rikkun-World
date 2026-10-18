/**
 * #202 ブロックの「型」（オーナーの案「型を決める」）。
 * ブロック 1 つの ごつごつ（fillBlockLook）を 毎回 729 マス計算する代わりに、種類ごとに K 通りの型を 先に作って とっておき、
 * 場所のハッシュで 型を選ぶだけにする。型は（種類・見える面・型の番号）ごとに 1 回だけ作る。
 * 地下・ほらあな・水のそば は 型を使わず 毎回計算する（いちばん ばらばら。オーナー 2026-10-18）。
 */

/** ブロック id → 型の数。0 = 型を使わず 毎回計算。ここに無い id は 0 */
export type KataTable = Readonly<Record<string, number>>;

/** おすすめの表（試作）。木は型で（はっぱの形は木の種類ごとに数種類）、地面・すなは ばらつき少なめ */
export const KATA_TABLE: KataTable = {
  leaves: 4,
  matsu_leaves: 4,
  momiji_leaves: 4,
  log: 3,
  bamboo: 3,
  grass: 4,
  dirt: 4,
  sand: 4,
  snow: 4,
  stone: 8,
  bedrock: 4,
  coal_ore: 8,
  iron_ore: 8,
};

/** 見くらべ用 `?kata=off|table|4|8|16`（なし = table）。`&kataUnder=K` = 地下も K 通りの型（0 = 毎回計算） */
export function decideKata(search: string): KataTable {
  const q = new URLSearchParams(search);
  const t = decideKataBase(q.get('kata'));
  const u = Number(q.get('kataUnder'));
  return q.get('kataUnder') !== null && Number.isInteger(u) && u >= 0 && u <= 32 ? { ...t, [KATA_UNDER]: u } : t;
}

/** 表の特別な行: 地下（ほらあな）の型の数。0・なし = 毎回計算 */
export const KATA_UNDER = '@under';

function decideKataBase(raw: string | null): KataTable {
  if (raw === 'off') return {};
  const n = Number(raw);
  if (raw !== null && Number.isInteger(n) && n > 0 && n <= 32) {
    const t: Record<string, number> = {};
    for (const id of Object.keys(KATA_TABLE)) t[id] = n;
    return t;
  }
  return KATA_TABLE;
}
