/**
 * 持つ範囲の輪（VOX-D R1〜R6）。距離は列のチェビシェフ距離 max(|cx − pcx|, |cz − pcz|)。three にも world にも依らない。
 */

/** 描く / 光 / 生成 / 残す（これより外は捨てる） */
export const R_DRAW = 6;
export const R_LIGHT = 7;
export const R_GEN = 8;
export const R_KEEP = 10;
/** 描く輪の外へ出たメッシュを捨てるのは、この半径より外（7 は残す） */
export const R_DRAW_DROP = 7;
/** 持つ列の最大（21×21） */
export const MAX_COLUMNS = (2 * R_KEEP + 1) ** 2;

export const cheb = (cx: number, cz: number, pcx: number, pcz: number): number => Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));

/** 半径 r の輪の列の数 */
export const ringCount = (r: number): number => (2 * r + 1) ** 2;

/** 列の番号（数 1 つ）。負でもちがう数 */
export const colKey = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

export interface ColPos {
  cx: number;
  cz: number;
}

/**
 * S3 の並び: チェビシェフ距離の小さい順。同じなら 列の中心どうしの距離（ユークリッド）の小さい順。
 * それも同じなら cz、cx の小さい順（どの実行でも同じ順）。
 */
export function compareNear(pcx: number, pcz: number, a: ColPos, b: ColPos): number {
  const ca = cheb(a.cx, a.cz, pcx, pcz);
  const cb = cheb(b.cx, b.cz, pcx, pcz);
  if (ca !== cb) return ca - cb;
  const ea = (a.cx - pcx) ** 2 + (a.cz - pcz) ** 2;
  const eb = (b.cx - pcx) ** 2 + (b.cz - pcz) ** 2;
  if (ea !== eb) return ea - eb;
  if (a.cz !== b.cz) return a.cz - b.cz;
  return a.cx - b.cx;
}

/** 中心 (pcx, pcz) から半径 r 以内の列を、S3 の順で返す */
export function ringColumns(pcx: number, pcz: number, r: number): ColPos[] {
  const out: ColPos[] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) out.push({ cx: pcx + dx, cz: pcz + dz });
  out.sort((a, b) => compareNear(pcx, pcz, a, b));
  return out;
}

// ------------------------------------------------------------ 段の条件（S1・S2）

/** S1: 自分と 8 つのとなりが「生成ずみ」なら 光を計算してよい */
export function canLight(isGenerated: (cx: number, cz: number) => boolean, cx: number, cz: number): boolean {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!isGenerated(cx + dx, cz + dz)) return false;
  return true;
}

/** S2: 自分と 8 つのとなりが「光ずみ」ならメッシュを作ってよい */
export function canMesh(isLit: (cx: number, cz: number) => boolean, cx: number, cz: number): boolean {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!isLit(cx + dx, cz + dz)) return false;
  return true;
}
