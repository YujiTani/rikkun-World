/**
 * #202 ブロックの「型」。
 * ブロック 1 つの ごつごつ（fillBlockLook）を 毎回 729 マス計算する代わりに、種類ごとに K 通りの型を 先に作って とっておき、
 * 場所のハッシュで 型を選ぶだけにする。型は（種類・見える面・型の番号）ごとに 1 回だけ作る。
 * 水のそばは 型を使わず 毎回計算する（いちばん ばらばら）。地下・ほらあなは 地下用の数（KATA_UNDER）で型を使う。
 */

/** 表の特別な行: 地下（ほらあな）の型の数。0・なし = 毎回計算 */
export const KATA_UNDER = '@under';

/** ブロック id → 型の数。0 = 型を使わず 毎回計算。ここに無い id は 0 */
export type KataTable = Readonly<Record<string, number>>;

/** 既定の表。木は型で（はっぱの形は木の種類ごとに数種類）、地面・すなは ばらつき少なめ、石は 8 通り */
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
  [KATA_UNDER]: 8,
};

const MAX_KATA = 32;

function parseCount(raw: string | null, min: number): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= MAX_KATA ? n : null;
}

/**
 * 見くらべ用 `?kata=off|4|8|16`（なし = 既定の表）。
 * 数字 = 表にある種類（地下も）ぜんぶ その数。off = 型なし。`&kataUnder=K` = 地下だけ K 通り（0 = 毎回計算。?kata より強い）
 */
export function decideKata(search: string): KataTable {
  const q = new URLSearchParams(search);
  const raw = q.get('kata');
  let table: KataTable = KATA_TABLE;
  if (raw === 'off') table = {};
  else {
    const n = parseCount(raw, 1);
    if (n !== null) table = Object.fromEntries(Object.keys(KATA_TABLE).map((id) => [id, n]));
  }
  const under = parseCount(q.get('kataUnder'), 0);
  return under !== null ? { ...table, [KATA_UNDER]: under } : table;
}
