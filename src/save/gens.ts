/**
 * 保存の 版の 数（MINE-1 §4.8）。1 か所に 書く（#304）。SaveManager が 再び 書き出す（`SAVE_GEN` など）。
 * 生成の 窓口（mine.saveGens）も ここを 読む ため 葉に した（保存 ← 生成 の 輪を つくらない）。
 */
/** 今の 保存の 版。1C で 4 → 5〔坑道の 版〕、1D で 5 → 6〔部屋の 版〕、1E で 6 → 7〔坑道の 冒険の 版〕、1F で 7 → 8〔やかたの 版〕、新しい 景色（木 v2・山 v2・目じるし）を 既定に して 8 → 9 */
export const SAVE_GEN = 9;
/** 読める いちばん 古い 版（これ 以上 SAVE_GEN 以下の 保存は 読む。版 3・4 の 列が まざった 世界も） */
export const OLDEST_READABLE_GEN = 3;
/** 坑道（MINE-1C）が 入った 版。これより 古い 保存の 列には 坑道を かかない（古い 列の 一覧） */
export const KODO_GEN = 5;
/** ほらあなの 種類の 部屋（MINE-1D）が 入った 版。これより 古い 保存の 列には 部屋を かかない（古い 列の 一覧 heya） */
export const HEYA_GEN = 6;
/** 坑道の 冒険（MINE-1E）が 入った 版。これより 古い 保存の 列には 1E の 坑道を かかない（古い 列の 一覧 boken） */
export const BOKEN_GEN = 7;
/** ようかいの やかた（MINE-1F）が 入った 版。これより 古い 保存の 列に かかる 坑道には やかたを つけない（古い 列の 一覧 yakata）。BOKEN_GEN の 次 */
export const YAKATA_GEN = BOKEN_GEN + 1;
/**
 * 新しい 景色（木 v2・山 v2・舞う 雪と 紅葉・山の 目じるし）が 既定に なった 版。これより 古い 保存を 開く とき、保存した 列は すてて 新しい 地形に する
 * （持ち物・レシピ・実績などは 残す。save/renewTerrain.ts）。
 */
export const TERRAIN_RENEW_GEN = 9;
