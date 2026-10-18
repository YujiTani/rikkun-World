/**
 * 持つ範囲の輪（VOX-D R1〜R6）。距離は列のチェビシェフ距離 max(|cx − pcx|, |cz − pcz|)。three にも world にも依らない。
 */

/** 輪の大きさ一式。起動のときに 1 回だけ決める（#203） */
export interface RingSpec {
  /** 描く / 光 / 生成 / 残す（これより外は捨てる） */
  readonly draw: number;
  readonly light: number;
  readonly gen: number;
  readonly keep: number;
  /** 描く輪の外へ出たメッシュを捨てるのは、この半径より外（full では 7 は残す） */
  readonly drawDrop: number;
  /** 持つ列の最大 */
  readonly maxColumns: number;
}

const mk = (draw: number, light: number, gen: number, keep: number, drawDrop: number): RingSpec => ({
  draw,
  light,
  gen,
  keep,
  drawDrop,
  maxColumns: (2 * keep + 1) ** 2,
});

/** ふだんの輪（描く 6・光 7・生成 8・残す 10・捨てる 7） */
export const RING_FULL: RingSpec = mk(6, 7, 8, 10, 7);
/** E2E 用の小さい輪（開始の条件 K1 は半径 4 の 81 列なので 描く 4 より小さくしない） */
export const RING_SMALL: RingSpec = mk(4, 5, 6, 8, 5);

/**
 * 決める順: URL `?ring=full|small` > 環境変数 `VITE_RING_DEFAULT=small` > full（shadowPref・decideMicroR と同じ形）。
 */
export function decideRing(search: string, envDefault: string | undefined): RingSpec {
  const raw = new URLSearchParams(search).get('ring');
  if (raw === 'full') return RING_FULL;
  if (raw === 'small') return RING_SMALL;
  return envDefault === 'small' ? RING_SMALL : RING_FULL;
}

let current: RingSpec = RING_FULL;
/** main.ts が起動のとき 1 回だけ呼ぶ（WorldRenderer・ChunkStream を作る前） */
export function setRing(r: RingSpec): void {
  current = r;
}
export const getRing = (): RingSpec => current;

/** full の値（ユニットテストの目安） */
export const R_DRAW = RING_FULL.draw;
export const R_LIGHT = RING_FULL.light;
export const R_GEN = RING_FULL.gen;
export const R_KEEP = RING_FULL.keep;
export const R_DRAW_DROP = RING_FULL.drawDrop;
export const MAX_COLUMNS = RING_FULL.maxColumns;

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
