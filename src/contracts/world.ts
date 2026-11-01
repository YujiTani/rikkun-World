/**
 * 世界・座標・ブロック・区画の型（時刻 DayPhase・TimeOfDay と 区域 WorldRegions も ここ）。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { ChalkMarkId } from '../world/blocks/chalkMark';
import type { KATAME_TSUCHI, ScaffoldId } from '../world/blocks/buildBlocks';
import type { ReservedId, WaterPartialId } from '../world/blocks/water';
import type { FurnBlockId, HouseBlockId, HouseDoorPartId } from '../world/blocks/houseBlocks';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------- ブロック（T2）

/** M1-01 4-2 のブロック 11 種 */
export type BlockId =
  | 'air'
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'sand'
  | 'log'
  | 'leaves'
  | 'coal_ore'
  | 'iron_ore'
  | 'water'
  | 'bedrock'
  // M4
  | 'furnace' // かまど
  | 'kawara' // かわら
  | 'brick' // レンガ
  // M4 光（オーナー決定: マイクラと同じ明るさの仕組み）
  | 'torch' // たいまつ（置ける。光る。固くない）
  | 'start_torch' // スタート地点の こわれない たいまつ
  // M6
  | 'tansu' // たんす（和だんす。54 マスの入れもの）
  // M7（農業。うしろに足す。作物の段階は id に入れない: 作物は 4 しゅるい、段階は FarmSystem が持つ）
  | 'farmland' // はたけ（かわいた）
  | 'farmland_wet' // はたけ（しめった）
  | 'crop_onion'
  | 'crop_tomato'
  | 'crop_pumpkin'
  | 'crop_eggplant'
  | 'wild_onion' // やせいの やさい
  | 'wild_tomato'
  | 'wild_pumpkin'
  | 'wild_eggplant'
  | 'kakashi' // かかし（下）
  | 'kakashi_head' // かかし（上）
  | 'saku' // こわれた さく
  // M7-2（うしろに足す）
  | 'sprinkler' // スプリンクラー
  // VOX-I-1（12 の国。うしろに足す）
  | 'snow' // ゆき
  | 'momiji_leaves' // もみじの はっぱ
  | 'matsu_leaves' // まつの はっぱ
  | 'flower_y' // はな（き）
  | 'flower_o' // はな（だいだい）
  | 'flower_p' // はな（むらさき）
  | 'bamboo' // たけ
  | 'susuki' // すすき
  | 'kusa' // くさ（せの たかい くさ。FLORA-75。こわすと 消えるだけ）
  | 'nobana' // のばな（あわい あおの 小さな はな。FLORA-75）
  // LIVE-2（§4.2）
  | 'nukunuku' // こたつ（たまご を あたためる。置ける ブロック。持ち物 の id も 同じ）
  // 小屋 の ブロック（持ち物 に 入らない。置く と 一度 に 5×5×4、こわす と toriya 1）
  | 'toriya_fence' // さく（見た目 12/9 マス、当たり 高さ 2）
  | 'toriya_gate' // もん（のれん。はば 1・高さ 2）
  | 'toriya_nest' // ねぐら
  | 'toriya_box' // すばこ（ねぐら の ゆか）
  // こたつ 2×2 の のこり 3 マス（かど の `nukunuku` が 本体。ここは 持ち物 に 入らない。`src/world/blocks/kotatsu.ts`）
  | 'nukunuku_e' // 本体 の 東（+x）
  | 'nukunuku_s' // 本体 の 南（+z）
  | 'nukunuku_se' // 本体 の 南東
  // #293 試作（うしろに足す）
  | 'geyser_dirt' // かんけつせんの つち（上に 間欠泉の 柱が たつ。ほると 持ち物に 入る。置けば どこでも 間欠泉）
  // ITEM-FX-1（#342。うしろに足す）: 小物 3 つが 置ける ブロックに なった。アイテムの id も 同じ
  | 'lantern' // ちょうちん（固くない。光る。下・横・上のどれかに 固い ブロックが いる）
  | 'futon' // ふとん（固くない。平たい。ゆうがた・よるに 右クリックで ねる）。2 マス: これは まくら側（e 向き）の マス
  // ふとん 2 マスの のこり 7 つ（持ち物に 入らない。`src/world/blocks/futon.ts`）
  | 'futon_s' | 'futon_w' | 'futon_n' | 'futon_foot_e' | 'futon_foot_s' | 'futon_foot_w' | 'futon_foot_n'
  | 'haniwa' // はにわ（固くない。かざるだけ）
  // MINE-1B（#349。うしろに足す）: 新しい 鉱物と しっくい。ほたるいしは 光る 固い ブロック（光 7）
  | 'nendo' // ねんど（つちの なかま。ほると ねんど `clay`）
  | 'sekkaiseki' // せっかいせき
  | 'shikkui' // しっくい（作る ブロック）
  | 'hotaruishi' // ほたるいし（光 7）
  | 'kin_ore' // きんの いし
  | 'suisho_ore' // すいしょうの いし（ほると すいしょう `crystal`）
  | 'diamond_ore' // ダイヤの いし（ほると ダイヤ `diamond`）
  // チョークの しるし 12 こ（面 × やじるしの 向き。持ち物に 入らない。`src/world/blocks/chalkMark.ts`）
  | ChalkMarkId
  // HOUSE-1C PR-1（#340。うしろに足す）: 家の ブロック 5 つ・戸の のこり 3 マス・向きの ある 家具（向き × マスごとの id。`src/world/blocks/houseBlocks.ts`）
  | HouseBlockId
  | HouseDoorPartId
  | FurnBlockId
  // HOUSE-1C PR-2（#340。うしろに足す）: かためた つち・足場 5 つ（`src/world/blocks/buildBlocks.ts`）
  | typeof KATAME_TSUCHI
  | ScaffoldId
  // WATER-1（#376。うしろに足す）: 量 1〜7 の 水と 予約の 番号（`src/world/blocks/water.ts`）
  | WaterPartialId
  | ReservedId
  // ROPE-1（うしろに足す）: ロープ（固くない。つかまって のぼり おり できる）
  | 'rope'
  | 'rope_coil'; // ロープ溜まり（ロープの いちばん 下。床に とどいた とき）

export interface BlockType {
  id: BlockId;
  /** ひらがなの名前 */
  name: string;
  solid: boolean;
  breakable: boolean;
}

/** ブロックの入れ物。T2 が `src/world/VoxelWorld.ts` で実装する */
export interface VoxelWorld {
  /** 高さだけ持つ（VOX-A: 横の大きさは無い。読みこんでいるかは isLoaded で見る） */
  readonly size: { readonly y: number };
  /** その (x,z) の列が読みこんであるか */
  isLoaded(x: number, z: number): boolean;
  /** 読みこんである列をふくむ いちばん小さい長方形（ブロック座標。x1・z1 はふくまない）。世界の端の処理用 */
  loadedBounds(): LoadedBounds;
  /** 整数座標。読みこんでいないマス・高さの外は 'outside'（固い） */
  getBlock(x: number, y: number, z: number): BlockId | 'outside';
  /** 範囲外・知らない id は false で何もしない。変わったチャンクは描画側に伝わる */
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  /** 固いブロックなら true。範囲外は false（世界の端は T3 が面で止める） */
  isSolid(x: number, y: number, z: number): boolean;
  /** LIVE-2: プレイヤー の 体 の 当たり 用。`isSolid` に 足して、とりごやの さく の すぐ 上 の 1 マス も 固い（さく の 当たり は 高さ 2。見た目 は 12/9）。なければ `isSolid` を 使う */
  isSolidForPlayer?(x: number, y: number, z: number): boolean;
  /**
   * M7: ブロックの id は同じまま、見た目だけ作り直させる（作物の段階が変わったとき）。光の計算し直しは起こさない。
   * 範囲外は何もしない。持たない VoxelWorld（テスト用の仮のもの）では呼ばない（`world.touch?.()`）
   */
  touch?(x: number, y: number, z: number): void;
}

// ---------------------------------------------------------------- 島生成（T1）

export interface SpawnPoint {
  /** 足もとの中央 */
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
}

export interface TestArea {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}

/** 世界を読みこんだ結果（VOX-B: `src/world/gen/populate.ts` の `populateWorld`。島は作らない） */
export interface IslandInfo {
  readonly seed: number;
  readonly genTimeMs: number;
  /** 地面の高さ h（M1-01 4-1） */
  groundHeight(x: number, z: number): number;
  /** 呼んだ時点の world で計算した戻る場所（M1-01 4-7） */
  spawn(): SpawnPoint;
  testArea(): TestArea;
  /** M5: 地形の場所 */
  regions(): WorldRegions;
}

// ---------------------------------------------------------------- テスト用窓口の入れ物

/** `window.__rikkun` に入る名前空間。各担当が中身（関数の入れ物）を作り、つなぎ込み担当が組み立てる */
export type HookNamespace = Record<string, (...args: never[]) => unknown>;

// ================================================================ M3（戦い）
// 担当の割り振り: docs/tickets/M3-dev-split.md。仕様: docs/design/M3-combat.md, docs/design/M3-yokai-candidates.md

export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';

/** 1 日の時刻。担当 AD が `src/time/` で実装する */
export interface TimeOfDay {
  /** 1 日の中のステップ（0 から 1 日の長さ−1。長さは設定 dayTicks＋duskTicks＋nightTicks＋dawnTicks） */
  dayTick(): number;
  /** 何日目（0 から） */
  day(): number;
  phase(): DayPhase;
  /** '#rrggbb' */
  skyColor(): string;
  /** ブロックの明るさ */
  brightness(): number;
  /** 妖怪・人形の明るさ */
  dollBrightness(): number;
  set(dayTick: number): void;
  /** 1 ステップ進める（ゲームの更新から呼ぶ） */
  update(): void;
  /** 時間帯が変わったら呼ばれる。戻り値で解除 */
  onPhaseChange(fn: (phase: DayPhase) => void): () => void;
}

// ---------------------------------------------------------------- M4 光（担当 L）

/** 明るさ 0〜15（マイクラと同じ）。担当 L が `src/world/light/` で実装する */
export interface LightField {
  // VOX-C の契約（VOX-D/E 向け）: 列を読みこんだ直後の光は 未計算で、skyLight は「空 15」を返してしまう。
  // メッシュを作る側は isColumnLit(cx, cz)（まわり 8 列をふくむ）が true になってから作ること。
  // 光が計算されると、光の側が world.markDirty で その列の作り直しを呼ぶ。
  /** そのセクションの光が計算ずみか */
  isSectionReady?(cx: number, sy: number, cz: number): boolean;
  /** その列とまわりの列の光が ぜんぶ計算ずみか */
  isColumnLit?(cx: number, cz: number): boolean;
  /** そのマスの空の光（0〜15。昼の空の下は 15） */
  skyLight(x: number, y: number, z: number): number;
  /** そのマスのブロックの光（たいまつなど。0〜15） */
  blockLight(x: number, y: number, z: number): number;
  /** 今の時刻をふくめた明るさ（0〜15）。妖怪の出現や人形の明るさに使う */
  level(x: number, y: number, z: number): number;
}

/** 読みこんである範囲の長方形（ブロック座標。x1・z1 はふくまない） */
export interface LoadedBounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 列の位置（チャンク座標。負もある） */
export interface ColumnPos {
  cx: number;
  cz: number;
}

/**
 * セクション（16³）の持ち方 3 つ。番号は BLOCK_TYPES の順。マスの順は (ly * 16 + lz) * 16 + lx。
 * - uniform: 全部同じ 1 種類（1 バイト）
 * - palette: 16 種類までの表 + 1 マス 4 ビット（2,048 B）
 * - full: そのまま 1 マス 1 バイト（4,096 B）
 */
export type SectionData =
  | { readonly kind: 'uniform'; readonly block: number }
  | { readonly kind: 'palette'; readonly palette: Uint8Array; readonly packed: Uint8Array }
  | { readonly kind: 'full'; readonly data: Uint8Array };

/** 1 列（16×WORLD_HEIGHT×16）。sections は下から並ぶ（長さ WORLD_HEIGHT/16） */
export interface ChunkColumn {
  readonly cx: number;
  readonly cz: number;
  readonly sections: SectionData[];
}

/** 列を 1 つ作る（VOX-B が実装）。同じ seed と (cx,cz) なら いつも同じ列 */
export type GenerateChunk = (seed: number, cx: number, cz: number) => ChunkColumn;

/** 列の保存・読み出し（VOX-F が実装） */
export interface ChunkStore {
  load(cx: number, cz: number): Promise<ChunkColumn | null>;
  save(column: ChunkColumn): Promise<void>;
}

/** セクションのメッシュを作る（VOX-C・E が実装）。見えないセクションは null */
export type BuildSectionMesh = (cx: number, sy: number, cz: number) => unknown | null;

export interface RegionCircle {
  cx: number;
  cz: number;
  r: number;
}

export interface RegionRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 地形の場所（担当 A が作る。`world.regions()` と、妖怪・農業・畜産が使う） */
export interface WorldRegions {
  center: { x: number; z: number };
  startH0: number;
  mountain: RegionCircle & { peak: { x: number; z: number; h: number } };
  rock: RegionCircle;
  forest: RegionCircle;
  flat: RegionRect;
  spring: RegionCircle;
  /** かわ の長方形の並び（いずみ側から順に） */
  river: RegionRect[];
  meadow: RegionCircle;
  pond: RegionCircle;
}
