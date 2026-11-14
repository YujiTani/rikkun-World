/**
 * TOWN-1 1B-1（docs/design/TOWN-1-place.md §4.5b）: 街の 新しい ブロック。id を 書くのは ここ 1 回（絵の 色は townTextures.ts）。
 * 見本 `town/art/v4/CA4-blocks.png` の 40 こ ＋ 見本に ない 石の てすり（`town_ishi_tesuri`）。
 * 街 だけに ある: アイテムに ならない・クラフトに ない。1.4: 妖怪の わざで こわれる（`breakable: true`）。プレイヤーが ほれる のは 妖怪が かえた 所と ふち だけ（街の 守り）。
 * 何も import しない 葉。番号は BLOCK_TYPES の いちばん 後ろに この 順で 足す（保存データの 番号を かえない）。
 */

/** 光り方: 'light' ＝ まわりを 照らす あかり・'deco' ＝ 光って 見える だけ（明るさ 0 の かざり光）・null ＝ 光らない */
type TownGlow = 'light' | 'deco' | null;

/** 絵の かき方（townTextures.ts が 読む）。base ＝ 地の 色、acc ＝ 足す 色（2〜3 色）、pat ＝ 模様 */
export type TownPattern = 'mottle' | 'brick' | 'paving' | 'plank' | 'plankH' | 'scale' | 'lattice' | 'stripe' | 'weave' | 'plate' | 'glowbox' | 'bars' | 'pot' | 'pole' | 'barrel';

export interface TownBlockDef {
  /** ブロックの id（`town_` ＋ 名前） */
  id: string;
  /** 画面の 名前（ひらがな） */
  name: string;
  /** すける（向こうが 見える・光を 通す）か */
  see: boolean;
  glow: TownGlow;
  /** 絵 */
  art: { pat: TownPattern; base: string; acc: readonly string[] };
}

/** 40 こ（見本の 番号 1〜40 の じゅん）＋ 石の てすり。色は 見本の 絵に 合わせた 近い 色（あとで アートが 直す） */
export const TOWN_BLOCK_DEFS = [
  { id: 'town_kurokawara', name: 'くろかわら', see: false, glow: null, art: { pat: 'scale', base: '#3C4152', acc: ['#2C303E', '#4A5064'] } },
  { id: 'town_aokawara', name: 'あおかわら', see: false, glow: null, art: { pat: 'scale', base: '#44566E', acc: ['#34445A', '#566A86'] } },
  { id: 'town_furukawara', name: 'ふるかわら', see: false, glow: null, art: { pat: 'scale', base: '#6A6A76', acc: ['#585864', '#7E7E8A'] } },
  { id: 'town_munegawara', name: 'むねがわら', see: false, glow: null, art: { pat: 'scale', base: '#22252F', acc: ['#14161C', '#323644'] } },
  { id: 'town_itabuki', name: 'いたぶき', see: false, glow: null, art: { pat: 'plankH', base: '#8A5C3A', acc: ['#6E4528', '#A3724B'] } },
  { id: 'town_kayabuki', name: 'かやぶき', see: false, glow: null, art: { pat: 'plankH', base: '#C9A95A', acc: ['#A88A3E', '#E0C37A'] } },
  { id: 'town_ishizumi', name: 'いしづみ', see: false, glow: null, art: { pat: 'brick', base: '#7A7A7E', acc: ['#5E5E64', '#9A9AA0'] } },
  { id: 'town_koishizumi', name: 'こいしづみ', see: false, glow: null, art: { pat: 'brick', base: '#56565C', acc: ['#3E3E44', '#6E6E76'] } },
  { id: 'town_ishidatami_a', name: 'いしだたみ A', see: false, glow: null, art: { pat: 'paving', base: '#B4B4B8', acc: ['#8E8E96', '#CCCCD0'] } },
  { id: 'town_ishidatami_b', name: 'いしだたみ B', see: false, glow: null, art: { pat: 'paving', base: '#9A9AA0', acc: ['#787880', '#B0B0B6'] } },
  { id: 'town_ishidatami_c', name: 'いしだたみ C', see: false, glow: null, art: { pat: 'paving', base: '#6E6E74', acc: ['#505058', '#86868E'] } },
  { id: 'town_ishidan', name: 'いしだん', see: false, glow: null, art: { pat: 'brick', base: '#A8A8AC', acc: ['#86868C', '#C2C2C6'] } },
  { id: 'town_kokeishi', name: 'こけいし', see: false, glow: null, art: { pat: 'mottle', base: '#6F8A52', acc: ['#587A3E', '#8AA468', '#7A7A7E'] } },
  { id: 'town_tsuchi', name: 'つち', see: false, glow: null, art: { pat: 'mottle', base: '#9A6A44', acc: ['#855836', '#AC7C54'] } },
  { id: 'town_jari', name: 'じゃり', see: false, glow: null, art: { pat: 'mottle', base: '#C8C4BC', acc: ['#A8A49C', '#E2DED6', '#B4B0A8'] } },
  { id: 'town_itabari', name: 'いたばり', see: false, glow: null, art: { pat: 'plank', base: '#6A4426', acc: ['#53341C', '#7E5532'] } },
  { id: 'town_koitabari', name: 'こいいたばり', see: false, glow: null, art: { pat: 'plank', base: '#3E2A1C', acc: ['#2E1E12', '#52382A'] } },
  { id: 'town_yukaita', name: 'ゆかいた', see: false, glow: null, art: { pat: 'plankH', base: '#C89A62', acc: ['#A97E4C', '#DDB27E'] } },
  { id: 'town_shikkui', name: 'しっくい', see: false, glow: null, art: { pat: 'mottle', base: '#ECEAE4', acc: ['#DEDCD4', '#F6F4EE'] } },
  { id: 'town_kurakabe', name: 'くらかべ', see: false, glow: null, art: { pat: 'plate', base: '#ECEAE4', acc: ['#2A2A30', '#D4D2CA'] } },
  { id: 'town_namakokabe', name: 'なまこかべ', see: false, glow: null, art: { pat: 'weave', base: '#24262E', acc: ['#E6E6E8'] } },
  { id: 'town_tsuchikabe', name: 'つちかべ', see: false, glow: null, art: { pat: 'mottle', base: '#C9B38C', acc: ['#B49E76', '#DCC8A2'] } },
  { id: 'town_hashira', name: 'はしら', see: false, glow: null, art: { pat: 'plank', base: '#4A2E1C', acc: ['#38210F', '#5E3D26'] } },
  { id: 'town_shubashira', name: 'しゅばしら', see: false, glow: null, art: { pat: 'plank', base: '#C23A2A', acc: ['#A02C1E', '#D85040'] } },
  { id: 'town_koushimado', name: 'こうしまど', see: true, glow: null, art: { pat: 'bars', base: '#6A4426', acc: ['#3E2A1C'] } },
  { id: 'town_akakoushi', name: 'あかこうし', see: true, glow: null, art: { pat: 'bars', base: '#C23A2A', acc: ['#7A1E14'] } },
  { id: 'town_shoji', name: 'しょうじ', see: false, glow: 'deco', art: { pat: 'lattice', base: '#F2E8CC', acc: ['#7A5230'] } },
  { id: 'town_tatami', name: 'たたみ', see: false, glow: null, art: { pat: 'plankH', base: '#B8BE7A', acc: ['#9EA460', '#CBD08E', '#2E3A24'] } },
  { id: 'town_shimahisashi_shu', name: 'しまひさし 朱', see: false, glow: null, art: { pat: 'stripe', base: '#C23A2A', acc: ['#ECEAE4'] } },
  { id: 'town_shimahisashi_ki', name: 'しまひさし 黄', see: false, glow: null, art: { pat: 'stripe', base: '#E6C23A', acc: ['#4CA332'] } },
  { id: 'town_shimahisashi_ai', name: 'しまひさし 藍', see: false, glow: null, art: { pat: 'stripe', base: '#2E4A8A', acc: ['#ECEAE4'] } },
  { id: 'town_noren_ai', name: 'のれん 藍', see: false, glow: null, art: { pat: 'plate', base: '#2E4A8A', acc: ['#E6E6EE', '#1E3266'] } },
  { id: 'town_noren_shu', name: 'のれん 朱', see: false, glow: null, art: { pat: 'plate', base: '#C23A2A', acc: ['#E8C23A', '#8E241A'] } },
  { id: 'town_andon', name: 'あんどん', see: false, glow: 'light', art: { pat: 'glowbox', base: '#FFE9A8', acc: ['#7A5230', '#FFF6D2'] } },
  { id: 'town_kanban', name: 'かんばん', see: false, glow: null, art: { pat: 'plate', base: '#EFE3C0', acc: ['#B83A2A', '#5A3A20'] } },
  { id: 'town_tesuri', name: 'てすり', see: true, glow: null, art: { pat: 'bars', base: '#8A5C3A', acc: ['#5A3A20'] } },
  { id: 'town_take', name: 'たけ', see: false, glow: null, art: { pat: 'pole', base: '#5DAA45', acc: ['#2E6B2A', '#7EC45E'] } },
  { id: 'town_takegaki', name: 'たけがき', see: true, glow: null, art: { pat: 'bars', base: '#5DAA45', acc: ['#2E6B2A'] } },
  { id: 'town_hachiue', name: 'はちうえ', see: true, glow: null, art: { pat: 'pot', base: '#B8603A', acc: ['#4CA332', '#7EC45E'] } },
  // 見本に ない 物（5 版の 絵の 用水路の てすり）。いちばん 後ろの ブロックは ふつうの 箱（たる）に する ため たるの 前に 置く。ひくい 箱で 描く（当たりは 1 ブロック）
  { id: 'town_ishi_tesuri', name: 'いしの てすり', see: true, glow: null, art: { pat: 'brick', base: '#A8A8AC', acc: ['#86868C', '#C2C2C6'] } },
  { id: 'town_taru', name: 'たる', see: false, glow: null, art: { pat: 'barrel', base: '#8A5C3A', acc: ['#2A2E3A', '#A3724B'] } },
] as const satisfies readonly TownBlockDef[];

export type TownBlockId = (typeof TOWN_BLOCK_DEFS)[number]['id'];

/** ぜんぶの id（BLOCK_TYPES の 並びは この じゅん） */
export const TOWN_BLOCK_IDS: readonly TownBlockId[] = TOWN_BLOCK_DEFS.map((d) => d.id);

const ID_SET: ReadonlySet<string> = new Set(TOWN_BLOCK_IDS);
/** 街の ブロックか（ブロックの id で） */
export const isTownBlockId = (id: string): id is TownBlockId => ID_SET.has(id);

/** 絵の 名前（アトラスの タイル名）。ブロックの id と 同じ 文字 */
export const TOWN_TILE_NAMES: readonly TownBlockId[] = TOWN_BLOCK_IDS;
/** 石の てすり（箱の 高さ。点 = 1/16 ブロック。8 ＝ はんぶん） */
export const TESURI_HEIGHT = 8;
