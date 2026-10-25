/**
 * 世界の定数。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

// ================================================================ M5（広い世界）
// 担当の割り振り: docs/tickets/M5-dev-split.md。仕様: docs/design/M5-world.md


// ================================================================ VOX-A（無限の世界の土台）
// 仕様: docs/design/VOX-plan.md §2・§6・§9。中身を作るのは VOX-B〜F。

/** 世界の高さ（16 の倍数）。ほかの所は この定数から求めること（VOX-B: 352） */
export const WORLD_HEIGHT = 352;

/** 海面の高さ。いちばん上の水のマスの y（VOX-B: 144） */
export const SEA_Y = 144;

/**
 * 読みこんでおく範囲（VOX-B では 横 128×128 に固定。VOX-D で プレイヤーのまわりへ広げる）。
 * src の中では y を使わず WORLD_HEIGHT を使う（テストが 大きさを聞く用）。
 */
export const WORLD_SIZE = { x: 128, y: WORLD_HEIGHT, z: 128 } as const;

/** 世界の果ての見えない壁（VOX-D W1）。遊べるマスは x, z = -WORLD_LIMIT 〜 WORLD_LIMIT - 1 */
export const WORLD_LIMIT = 30000;

/** 列（チャンク）の横の大きさ */
export const CHUNK_SIZE = 16;

/** セクションの 1 辺 */
export const SECTION_SIZE = 16;

/** 世界の中心・スタート地点の列 */
export const WORLD_CENTER = { x: 64, z: 64 } as const;
