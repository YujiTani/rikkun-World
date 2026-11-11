/**
 * ブロックの種類の数の上限（BLOCK_TYPES の長さは これ以下）。
 * 描画の 頂点データが 種類を 10 ビットで 持つので 1024（2 の 10 乗）。ここを 変えるときは
 * sectionConsts の MK_ROW・QuadBuilder・voxelMaterial の シェーダーも 合わせる。
 */
export const MAX_BLOCK_KINDS = 1024;
