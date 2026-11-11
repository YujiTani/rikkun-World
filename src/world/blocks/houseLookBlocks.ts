/**
 * 家の しゅるいの ブロック（HOUSE-2B #364。何も import しない 葉）。ブロックの 番号は **形ごと**（PO 決め 2026-11-11。256 に おさめる ため）。
 * むら・おしろ・こうざんの 3 案は 同じ id を 使い、案は 家の 記録から 場所で 引く（house/book.ts の cellOf）。
 * ここに ある 20 こ は ぜんぶ 箱の 組み合わせで 描く 固い ブロック（世界は render/houseLook.ts、見本は house/preview）。
 */

/** やねの 形ごとの ブロック（のき・なか・むね・向きは マスの 場所で かわる 1 つの id） */
const LOOK_ROOF_IDS = ['lk_roof_sankaku', 'lk_roof_kawara', 'lk_roof_wara', 'lk_roof_kin'] as const;
/** かべの 形ごと ＋ かべ なしの 4 すみの 柱 */
const LOOK_WALL_IDS = ['lk_wall_shikkui', 'lk_wall_renga', 'lk_wall_ishi', 'lk_wall_pillar'] as const;
/** まどの 形ごと（向きは かべから） */
const LOOK_WINDOW_IDS = ['lk_window_suisho', 'lk_window_maru'] as const;
/** てつの と（下・上 × しめ・あけ） */
export const LOOK_DOOR_IDS = ['lk_door_tetsu', 'lk_door_tetsu_top', 'lk_door_tetsu_open', 'lk_door_tetsu_open_top'] as const;
/** かざり（えんとつ・のれん・はなだん・しゃちほこ） */
const LOOK_DECO_IDS = ['lk_deco_entotsu', 'lk_deco_noren', 'lk_deco_hanadan', 'lk_deco_shachi'] as const;
/** あかり（ほたるいし・すいしょう） */
const LOOK_LIGHT_IDS = ['lk_light_hotaru', 'lk_light_suisho'] as const;

export const LOOK_BLOCK_IDS = [...LOOK_ROOF_IDS, ...LOOK_WALL_IDS, ...LOOK_WINDOW_IDS, ...LOOK_DOOR_IDS, ...LOOK_DECO_IDS, ...LOOK_LIGHT_IDS] as const;
export type LookBlockId = (typeof LOOK_BLOCK_IDS)[number];

/** てつの との 4 つの id → どちらの 半分か・あいて いるか（戸の いつもの 物は houseBlocks.ts の doorInfo） */
export const LOOK_DOOR_INFO: Readonly<Record<(typeof LOOK_DOOR_IDS)[number], { top: boolean; open: boolean }>> = {
  lk_door_tetsu: { top: false, open: false },
  lk_door_tetsu_top: { top: true, open: false },
  lk_door_tetsu_open: { top: false, open: true },
  lk_door_tetsu_open_top: { top: true, open: true },
};

const IDS: ReadonlySet<string> = new Set<string>(LOOK_BLOCK_IDS);
export const isLookBlock = (id: string): id is LookBlockId => IDS.has(id);

/** ブロックの 名前（持ち物に 入る 名前は しゅるいの アイテム。これは 登録表の すがた） */
export const LOOK_PILLAR_NAME: Readonly<Partial<Record<LookBlockId, string>>> = { lk_wall_pillar: 'いえの はしら' };
