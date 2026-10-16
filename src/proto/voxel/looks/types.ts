/**
 * 「見た目 (Look)」の約束。1 ファイル = 1 案（looks/<id>.ts）。形と色と空気感は、ここの `Look` だけで決まる。
 * メッシュ作り（meshVoxel.ts）・3D テクスチャ（shapeTexture.ts）・空と霧（ProtoScene / main.ts）は Look を引くだけで、案の中身は見ない。
 *
 * 案を足す手順: looks/<id>.ts で `export const myLook: Look = {...}` を作り、looks/index.ts の ALL_LOOKS に 1 行足す。それだけ。
 * 手はじめは placeholder.ts を見る。共通の道具（ハッシュ・面の判定・パレット作り）は looks/common.ts。
 *
 * ## 約束
 * 1. 小ブロックは 9×9×9。`fillBlockLook` は out（長さ 729）に 0 = 空 / 1〜255 = 色番号を書く。
 *    並びは (y * 9 + z) * 9 + x（y が上）。
 * 2. 色番号 n は palette[n * 3 .. n * 3 + 2] = sRGB の R, G, B。palette[0..2]（空）は使わない。
 *    パレットは **色 255 まで**（色番号は Uint8 のため）。`createPalette()` が超えると エラーにする。
 *    色が多いとテクスチャ・頂点データは ふえないが、形の細かさ（でこぼこ）が増えると 三角形が増える。
 *    目安: hybrid r=16 で 70 万三角形・30MB（VOX-0）から大きく増やさない。
 * 3. `exposed` は「となりが 空・水・はっぱ・十字の板 で、この面が外に見える」面の印（FACE_BIT の OR。上 1, 下 2, +x 4, -x 8, +z 16, -z 32）。
 *    へこみ・でこぼこ・穴は **見える面の側だけ**。見えない面（固いとなりにくっつく面）の外側の層は ぜんぶ つまっていること
 *    （はっぱのような すきまのある種類は 例外）。これを守らないと、ブロックのさかいに すきまが見える（unit test が確かめる）。
 * 4. 同じ (id, bx, by, bz, exposed) からは いつも同じ結果。位置のハッシュだけを使い、Math.random は使わない。
 * 5. 種類のあつかい（`kinds` に書く。ブロック id は src/world/blocks/blockTypes.ts）:
 *    - `kinds` に **ない** id = 小ブロックで描かない（空気・水・十字の板・たいまつ・作物）。水は平らな半透明、十字の板は今のまま。
 *    - `occludes: true`（ふつう）= となりの面をかくす固い種類。
 *    - `occludes: false`（はっぱ など）= どの面にも すきまがあってよく、となりの面はかくさない。
 *      となりの面が見えたままになるので、となりの石などは その面を「見える面」として作る。
 *    - `base` = 3D テクスチャで、空のマスをうめる「代表の色」の色番号（遠めの hybrid「箱」の見た目の平均色に近い色にする）。
 * 6. `sky` = 空の色、`fog` = 霧（色・はじまる距離・かんぜんに かくれる距離。ブロック単位）。案ごとの空気感。
 *    霧の色は ふつう 空の色に近づける。遠くの「かんたんメッシュ(LOD)」は ゲーム本体の色のままで、霧でなじませる。
 *    ひとつの画面で上空まで見るので、霧の far は 120 以上を おすすめ（近すぎると 上空が霧だけになる）。
 */

/** 小ブロックの 1 辺の数 */
export const LOOK_N = 9;
/** 1 ブロックの小ブロックの数 */
export const LOOK_VOLUME = LOOK_N * LOOK_N * LOOK_N;
/** 面の印。meshChunk の FACES の並びと同じ: 上, 下, +x, -x, +z, -z */
export const FACE_BIT = [1, 2, 4, 8, 16, 32] as const;
export const ALL_FACES = 63;

/** 1 つの種類の見た目の指定。`kinds[ブロック id]` */
export interface KindSpec {
  /** 3D テクスチャの「代表の色」の色番号（>= 1） */
  base: number;
  /** false = はっぱのように すきまがあり、となりの面をかくさない。省略 = true */
  occludes?: boolean;
  /** (bx, by, bz) = ブロックの位置。exposed = 見える面の印。out に 729 個の色番号を書く。上の約束 1〜4 を守ること */
  fill(bx: number, by: number, bz: number, exposed: number, out: Uint8Array): void;
}

export interface Look {
  /** `?look=<id>` の id。小文字の英数字とハイフン */
  id: string;
  /** ボタンの文字（大人が見る画面なので漢字でよい） */
  label: string;
  /** 色番号 → sRGB（3 バイトずつ）。createPalette().rgb() で作る */
  palette: Uint8Array;
  /** 空の色（0xRRGGBB） */
  sky: number;
  fog: { color: number; near: number; far: number };
  /** ブロック id → 見た目。ここに無い id は 小ブロックで描かない */
  kinds: Readonly<Record<string, KindSpec>>;
}
