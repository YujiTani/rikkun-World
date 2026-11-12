/**
 * MINE-1F（docs/design/MINE-1F.md §4.2「やかたの 中の 見え方」・F21）: やかたの 中だけの 光の 見え方の 数と 箱。
 *  1. うすい 明るさの 段: 光 `dim.from`〜`dim.to` の 所を `dim.shade` より 暗く しない。妖怪の 体は さらに `dim.foe` より 暗く しない。
 *  2. 光の 色: 中の ブロックの 光の 色を 今の だいだい〔warmTint〕の かわりに 組の 色〔`lookTint`〕に する。色は 段〔shade〕より 上の ぶんにだけ かける。
 * ブロックの 面〔シェーダー。`render/lightShader.ts`〕も 体の 明るさ〔`WorldLight.brightness`〕も この 表の 数を 通る〔写さない〕。
 * 数は ここ 1 か所〔窓口 `yakataTable().dim`・`.lookTint` は これを そのまま かえす〕。箱は 世界の 座標で、見える やかた ぜんぶ。
 */
import { Vector4 } from 'three';

export type YakataLookId = 'maou' | 'otera';

export interface YakataLightBox {
  /** 世界の マス座標。両はし ふくむ */
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  look: YakataLookId;
}

export const YAKATA_LIGHT = {
  dim: {
    from: 2, // うすい 明るさの 段に する 光の 下はし（ブロックの 光 2）
    to: 5, // 上はし（ブロックの 光 5。6 から 先は 今の「少し 明るい」の 段）
    shade: 0.16, // この 光の 所の 明るさの 下限（0〜1。見本と 同じ。今の いちばん 暗い 0.045 より 上）
    foe: 0.25, // 妖怪の 体の 明るさの 下限（0〜1。プレイヤーの dollMin 0.3 と 同じ 考え）
  },
  /** 光の 色（RGB の 倍率 0〜1）: A まおうの しろ = むらさき・B よるの おてら = 青白い（見本 1F-yakata.png の ほのおの 色の よせ） */
  lookTint: {
    maou: [0.8, 0.58, 1.0],
    otera: [0.62, 0.82, 1.0],
  } satisfies Record<YakataLookId, [number, number, number]>,
} as const;

/** 1 つの 材料が 持てる 箱の 数（1 つの やかたで 2 つ。見える やかた 8 つ ぶん） */
export const YAKATA_BOX_MAX = 16;

/** その マスが 入る 箱 〔なければ null〕 */
export function boxAt(boxes: readonly YakataLightBox[], x: number, y: number, z: number): YakataLightBox | null {
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  for (const b of boxes) if (fx >= b.x0 && fx <= b.x1 && fy >= b.y0 && fy <= b.y1 && fz >= b.z0 && fz <= b.z1) return b;
  return null;
}

/** やかたの 中の 見た目の 明るさ: 光 dim.from〜dim.to の 所は shade より 暗く しない。ほかは そのまま */
export function liftDim(brightness: number, blockLevel: number): number {
  const d = YAKATA_LIGHT.dim;
  return blockLevel >= d.from && blockLevel <= d.to ? Math.max(brightness, d.shade) : brightness;
}

/**
 * シェーダーへ わたす 箱（材料で 共有する 入れ物。skyDarkness と 同じ 考え）。
 * min = (x0, y0, z0, 組の 番号 0 = maou・1 = otera)・max = (x1 + 1, y1 + 1, z1 + 1, 0)〔頂点の 座標で くらべる ので 外がわの 面まで 入る〕。使わない 分は 0 のまま。
 */
export const yakataUniforms = {
  min: { value: Array.from({ length: YAKATA_BOX_MAX }, () => new Vector4()) },
  max: { value: Array.from({ length: YAKATA_BOX_MAX }, () => new Vector4()) },
  count: { value: 0 },
  /** あやしい たいまつの 明るさの ゆれ（倍率。1 = ゆれなし）。`setYakataSway` が 毎ステップ 書く */
  sway: { value: 1 },
};

const LOOK_NO: Record<YakataLookId, number> = { maou: 0, otera: 1 };

/** 箱を シェーダーの 入れ物に 書く（YAKATA_BOX_MAX を こえた 分は すてる） */
export function writeYakataUniforms(boxes: readonly YakataLightBox[]): void {
  const n = Math.min(boxes.length, YAKATA_BOX_MAX);
  for (let i = 0; i < n; i++) {
    const b = boxes[i]!;
    yakataUniforms.min.value[i]!.set(b.x0, b.y0, b.z0, LOOK_NO[b.look]);
    yakataUniforms.max.value[i]!.set(b.x1 + 1, b.y1 + 1, b.z1 + 1, 0);
  }
  yakataUniforms.count.value = n;
}
