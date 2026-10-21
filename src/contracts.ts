/**
 * つなぎ目の約束（M1）。PO が決める。型だけで、処理は書かない。
 * 並列で作業する開発者どうしは、このファイルの形だけを頼りにつながる。
 * 変えたいときは PO に相談する（勝手に変えない）。
 * 担当の割り振り: docs/tickets/M1-dev-split.md
 */

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
  | 'nobana'; // のばな（あわい あおの 小さな はな。FLORA-75）

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

// ---------------------------------------------------------------- 入力・スタート画面（T5）

/** マウスの動き（ピクセル。右・下が正）。T5 が作り、T3 が読む */
export interface LookSource {
  /** 前回から動いた量を返して 0 に戻す。ロックが外れている間は常に {dx:0, dy:0} */
  consume(): { dx: number; dy: number };
}

/** ポインターロックと案内画面の状態。T5 が作る */
export interface LockStatus {
  locked(): boolean;
  overlayVisible(): boolean;
  /** 実時間のゲームループを進めてよいか（M1-02 §2.4）。step() はこれに関係なく進む */
  realtimeAllowed(): boolean;
  /** 遊びの入力（移動・ジャンプ・向き）を受け付けてよいか */
  playInputEnabled(): boolean;
}

// ---------------------------------------------------------------- プレイヤー（T3）

export interface PlayerState {
  /** 足もとの中央 */
  position: Vec3;
  velocity: Vec3;
  /** 0 以上 360 未満。0 = 北（-Z）、上から見て時計回り（M1-02 §4.3） */
  yawDeg: number;
  /** 0 = 水平、上がプラス */
  pitchDeg: number;
  onGround: boolean;
  inWater: boolean;
  /** 水平に動いているか（人形の手足を振るため） */
  moving: boolean;
  /** CHAR-1: キャラの向き（0 以上 360 未満。yaw と同じ数え方）。見た目だけ。省略時は yaw と同じ */
  facingDeg: number;
  /** CHAR-1: 走る入力が効いているか（run を押していて 歩く入力あり） */
  running: boolean;
}

// ---------------------------------------------------------------- テスト用窓口の入れ物

/** `window.__rikkun` に入る名前空間。各担当が中身（関数の入れ物）を作り、つなぎ込み担当が組み立てる */
export type HookNamespace = Record<string, (...args: never[]) => unknown>;

// ================================================================ M2（掘る・置く・持ち物）
// 担当の割り振り: docs/tickets/M2-dev-split.md。仕様: docs/design/M2-dig-inventory.md

/**
 * アイテムだけのもの（置けない）。M3 で妖怪のドロップを足した（オーナー決定）。M4 で道具を足す。
 * yokai_orb は M3 第 1 版の名残り（使わなくなったが、型を壊さないため残す）
 */
export type ItemOnlyId =
  | 'yokai_orb'
  | 'paper' // かみ
  | 'oil' // あぶら
  | 'string' // いと
  | 'cloth' // ぬの
  | 'clay' // ねんど
  | 'crystal' // すいしょう（レア度の低い宝石）
  // M4（docs/design/M4-craft.md §4.4）
  | 'wood_pickaxe'
  | 'stone_pickaxe'
  | 'iron_pickaxe'
  // BAL-D（BALANCE.md §2.8）: おの 3 本
  | 'wood_axe'
  | 'stone_axe'
  | 'iron_axe'
  | 'iron_ingot'
  | 'bokuto'
  | 'katana'
  | 'naginata'
  | 'crystal_katana'
  | 'yumi'
  | 'ya'
  | 'kabuto'
  | 'yoroi'
  | 'kote' // こて（籠手）
  | 'suneate' // すねあて（脛当て）
  | 'torch'
  | 'lantern'
  | 'kite'
  | 'futon'
  | 'omamori'
  | 'waraji'
  | 'haniwa'
  // M7（うしろに足す）
  | 'seed_onion'
  | 'seed_tomato'
  | 'seed_pumpkin'
  | 'seed_eggplant'
  | 'onion'
  | 'tomato'
  | 'pumpkin'
  | 'eggplant'
  | 'kuwa'
  // M7-2（うしろに足す）
  | 'watering_can'
  | 'long_watering_can'
  // BUCKET-1（うしろに足す）
  | 'bucket' // バケツ（から）
  | 'water_bucket' // みずの バケツ
  // LIVE-1（うしろに足す）
  | 'egg' // たまご
  // LIVE-1 版 3.2（§4.2。egg の うしろ）
  | 'mushi' // むし
  | 'mushi_ami' // むしとりあみ
  // WEAPON-7（うしろに足す。レジェンダリー）
  | 'raijin_ken' // 雷神剣（ヌシが おとす）
  | 'fujin_ken' // 風神剣（ヌシが おとす。WEAPON-7 PR2）
  | 'niji'; // 虹（ヌシが おとす。WEAPON-9。強さは 1 本ごと 4〜10）

/** アイテムの種類。ブロックとアイテムだけのもの */
export type ItemId = BlockId | ItemOnlyId;

export interface ItemStack {
  item: ItemId;
  count: number;
  /** WEAPON-2: へった たいきゅう（0 か なし = 新品）。たいきゅうで へる 道具だけが 持つ（上限 1）。前の保存には 無い = 新品 */
  wear?: number;
  /** M7-2: じょうろ の みず の 量（1〜入る回数。なし・0 = からっぽ）。じょうろ 2 しゅるい だけが 持つ */
  water?: number;
  /** WEAPON-9: 虹の 強さ（4〜10。1 本ごとに 保存）。虹だけが 持つ。なし = 7 */
  power?: number;
}

export interface ItemType {
  id: ItemId;
  /** ひらがな */
  name: string;
  maxStack: number;
  /** 置くと何のブロックになるか。置けないものは null */
  placeBlock: BlockId | null;
}

/** 持ち物（36 マス。0〜8 がホットバー）。担当 AB が `src/inventory/` で実装する */
export interface Inventory {
  readonly size: number;
  slots(): ReadonlyArray<ItemStack | null>;
  selected(): number;
  select(index: number): void;
  /** ホットバーのとなりへ（ぐるっと回る） */
  selectNext(dir: 1 | -1): void;
  setSlot(index: number, stack: ItemStack | null): void;
  clear(): void;
  /** 入らなかった数を返す */
  add(item: ItemId, count: number, opts?: { power?: number }): number;
  count(item: ItemId): number;
  /** 取り出せた数を返す */
  remove(item: ItemId, count: number): number;
  /** 1 こでも入るか */
  canAdd(item: ItemId): boolean;
  /** 今えらんでいるマス（手に持っているもの） */
  held(): ItemStack | null;
  /** 手に持っているマスから 1 こ減らす。減らせたら true */
  consumeHeld(): boolean;
  /**
   * WEAPON-2: 手に持っている道具の たいきゅうを n へらす（n ≧ 1）。たいきゅうで へる 道具でなければ null（何もしない）。
   * 0 になったら そのステップで マスを 空にして `toolBreak` を出す（その 1 回は ふつうに 効く。呼ぶ側は 先に 効かせてから 呼ぶ）
   */
  wearHeld(n: number): WearResult | null;
  /** WEAPON-2: マス slot の たいきゅうを n へらす（`wearHeld` と 同じ） */
  wearSlot(slot: number, n: number): WearResult | null;
  /** WEAPON-2: マス slot の たいきゅう（たいきゅうで へる 道具でなければ null） */
  durability(slot: number): Durability | null;
  /** WEAPON-2: `wearLow` / `toolBreak`（呼ぶと空になる。画面と音用） */
  drainWearEvents(): WearEvent[];
  /** WEAPON-2: テストの窓口用（読んでも空にならない） */
  peekWearEvents(): WearEvent[];
  /** もちもの画面でのクリック（M2 §2.5） */
  click(index: number): void;
  cursor(): ItemStack | null;
  /** 閉じるとき、カーソルのものを「持ち上げたマス」へ戻す */
  returnCursor(): void;
  itemTypes(): ItemType[];
  serialize(): unknown;
  deserialize(data: unknown): void;
  /** 中身が変わったら呼ばれる。戻り値で解除 */
  onChange(fn: () => void): () => void;
}

export interface TargetInfo {
  block: Vec3;
  id: BlockId;
  /** 面の外向きの向き（各成分 −1・0・1） */
  face: Vec3;
  /** 置く場所（世界の外でもそのまま） */
  place: Vec3;
  /** 目から面まで */
  distance: number;
}

export type DigBlockedReason = 'needTool' | 'unbreakable';

export interface DigState {
  active: boolean;
  block: Vec3 | null;
  /** 0〜1 */
  progress: number;
  /** 0〜3（3 = MAX。あとひと押しでこわれる） */
  crackStage: number;
  /** ひびが MAX で、ひと押しを待っている */
  ready: boolean;
  blockedReason: DigBlockedReason | null;
}

export type DigEvent =
  /** count: 手に入った数（ドロップ数はランダム。入りきらなかった分はふくまない） */
  | { type: 'break'; tick: number; block: Vec3; id: BlockId; gotItem: boolean; count: number }
  | { type: 'place'; tick: number; block: Vec3; id: BlockId }
  /** ひびが MAX になった（あとひと押しでこわれる。オーナー決定 B） */
  | { type: 'ready'; tick: number; block: Vec3; id: BlockId }
  | { type: 'blocked'; tick: number; block: Vec3; id: BlockId; reason: DigBlockedReason };

/** ねらう・ほる・おく。担当 AB が `src/dig/` で実装する */
export interface DigSystem {
  target(): TargetInfo | null;
  state(): DigState;
  /** 前に呼んでから起きた出来事（呼ぶと空になる）。画面と音用 */
  drainEvents(): DigEvent[];
  /** テストの窓口用。読んでも空にならない、まだ読まれていない出来事 */
  peekEvents(): DigEvent[];
  /** 何もねらっていない場所で振った（空振り）回数の合計。見た目と音用 */
  whiffCount?(): number;
}

/** 画面の状態。担当 D が作る */
/** M6: 'celebrate' = おめでとう画面。WEAPON-7 で なくなり、この 値は もう 出ない（BGM の 表の ために 型だけ 残す） */
export type ScreenMode = 'play' | 'inventory' | 'guide' | 'celebrate';

export interface ScreenState {
  mode(): ScreenMode;
  inventoryOpen(): boolean;
  /** 実時間の速さの倍率（あそぶ 1、もちもの 0.25、案内 0） */
  timeScale(): number;
}

/** 担当 AB の設定（`settings.*` の名前と同じ）。値は AB が `src/dig/config.ts` で決める */
export interface DigSettings {
  reach: number;
  /** ブロックごとのかたさ（素手の秒数）。null はこわれない */
  hardness: Record<BlockId, number | null>;
  /** ほるのに要るレベル */
  harvestLevel: Record<BlockId, number>;
  handPower: number;
  handLevel: number;
  digResumeTicks: number;
  digCooldown: number;
  placeRepeatTicks: number;
}

/** ブロックのめずらしさ（ドロップ数の最大を決める。オーナー決定） */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'superRare' | 'epic' | 'mythic' | 'legendary';
/** めずらしさの順番（0〜6）。星の数は +1 */
export type RarityIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** 宝石の印の形の名前（7 つ） */
export type GemShape = 'circle' | 'diamond' | 'hexagon' | 'star' | 'moon' | 'flame' | 'crown';

/** 担当 D の設定 */
export interface ScreenSettings {
  inventoryTimeScale: number;
  saveIntervalTicks: number;
}

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

export type YokaiKind = 'karakasa' | 'chochin' | 'nurikabe' | 'rokurokubi';

export type YokaiState =
  | 'appear'
  | 'idle'
  | 'wander'
  | 'chase'
  | 'retreat'
  | 'attack'
  | 'search'
  | 'dying'
  | 'leaving';

export interface YokaiInfo {
  id: number;
  kind: YokaiKind;
  /** 足もとの中央 */
  position: Vec3;
  yawDeg: number;
  hp: number;
  maxHp: number;
  state: YokaiState;
  /** 攻撃の何ステップ目か（攻撃していなければ 0） */
  attackTick: number;
  scale: number;
  /** 表示名（モデルの displayName。例 からかさおばけ） */
  name: string;
  /** 二つ名（BALANCE §2.5） */
  title: YokaiTitle;
  /** 出たときの場所の倍率 M（BALANCE §2.3） */
  m: number;
  /** 1 回の攻撃力（体力。1 = ハート半分） */
  attack: number;
}

/** 二つ名（弱い順 おやぶん → たいしょう → ヌシ。BALANCE §2.5） */
export type YokaiTitle = 'none' | 'oyabun' | 'taisho' | 'nushi';

export type YokaiEvent =
  | { type: 'spawn'; tick: number; id: number; kind: YokaiKind; position: Vec3 }
  | { type: 'attackStart'; tick: number; id: number; kind: YokaiKind }
  | { type: 'attackHit'; tick: number; id: number; kind: YokaiKind; hitPlayer: boolean; position: Vec3 }
  | { type: 'fireball'; tick: number; id: number; position: Vec3 }
  | { type: 'fireballEnd'; tick: number; position: Vec3; hitPlayer: boolean }
  | { type: 'hurt'; tick: number; id: number; kind: YokaiKind; position: Vec3 }
  | { type: 'defeat'; tick: number; id: number; kind: YokaiKind; position: Vec3; reward: number; title: YokaiTitle }
  /** 二つ名の妖怪が出た（1 体に 1 回。音を鳴らす合図） */
  | { type: 'titleSound'; tick: number; id: number; kind: YokaiKind; title: Exclude<YokaiTitle, 'none'> }
  | { type: 'leave'; tick: number; id: number; kind: YokaiKind; position: Vec3 };

export interface YokaiRayHit {
  id: number;
  kind: YokaiKind;
  /** 線の始まりから当たりの箱の面まで */
  distance: number;
}

/** 妖怪たち。担当 B が `src/yokai/`（モデルは既存）と `src/yokai/ai/` で実装する */
export interface YokaiWorld {
  list(): YokaiInfo[];
  /** 線に当たるいちばん近い妖怪（パンチ用）。maxDistance より遠ければ null */
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): YokaiRayHit | null;
  /**
   * パンチが当たった。from はたたいた人の足もと（押される向き）。
   * WEAPON-2: `knock` を 省くと 今まで どおり（水平 1.0・上へ 0）。ぬりかべは どの 値でも 押されない
   */
  /** 実際に 与えた ダメージを 返してもよい（よろけの 2 倍の あと。WEAPON-5） */
  damage(id: number, amount: number, from: Vec3, knock?: YokaiKnock): number | void;
  /** そのマスに妖怪の当たりの箱が重なっているか（ブロックを置けない） */
  occupies(x: number, y: number, z: number): boolean;
  /** 画面と音用（呼ぶと空になる）。テストの窓口用の列は別に持つ */
  drainEvents(): YokaiEvent[];
}

export type CombatEvent =
  | { type: 'punchStart'; tick: number; /** WEAPON-3: パンチの向き u と えらんだ 妖怪 */ dirDeg?: number; targetId?: number | null }
  | { type: 'punchHit'; tick: number; yokaiId: number }
  | { type: 'punchMiss'; tick: number }
  | { type: 'playerHit'; tick: number; by: YokaiKind; amount: number; /** 防具でカットした（カキン） */ blocked?: boolean }
  | { type: 'fallHurt'; tick: number; amount: number }
  | { type: 'regen'; tick: number; hp: number }
  | { type: 'death'; tick: number; dropped: number[] }
  | { type: 'respawn'; tick: number }
  | { type: 'pickup'; tick: number; bagId: number };

/** プレイヤーの体力と戦い。担当 C が `src/combat/` で実装する */
export interface PlayerCombat {
  hp(): number;
  maxHp(): number;
  dead(): boolean;
  /** むてきのこりステップ */
  invincibleTicks(): number;
  /** 妖怪の攻撃が当たった。むてきなどで受けなかったら false */
  damage(amount: number, by: YokaiKind, from: Vec3, kind?: DamageKind): boolean;
  /** M7: 体力を もどす（ハート半分 = 1）。最大をこえない。やられている間は 0。実際に もどった量を返す */
  heal(amount: number): number;
  /** 画面と音用（呼ぶと空になる）。テストの窓口用の列は別に持つ */
  drainEvents(): CombatEvent[];
}

// ================================================================ M4（作る・やく・道具・武器・防具）
// 担当の割り振り: docs/tickets/M4-dev-split.md。仕様: docs/design/M4-craft.md

export interface Recipe {
  id: string;
  output: ItemStack;
  inputs: ItemStack[];
  /** M4 で働きまで作るか（false は作れるだけ） */
  works: boolean;
  /** つくる（どこでも）か、やく（かまど）か */
  station: 'craft' | 'furnace';
}

export type CraftEvent =
  | { type: 'craft'; tick: number; recipe: string; item: ItemId; count: number; /** CRAFT-2: たんす から使った分（空 = 使っていない。省くと 空と同じ） */ fromTansu?: (TansuPos & { item: ItemId; count: number })[] }
  | { type: 'craftFail'; tick: number; recipe: string; reason: 'missing' | 'full' | 'unknown' }
  | { type: 'bakeStart'; tick: number; recipe: string; fuel: ItemId; position: Vec3 }
  | { type: 'bakeDone'; tick: number; recipe: string; item: ItemId; count: number; position: Vec3 }
  /** 拾った・焼けて入った（ログ用。つくったもの・テスト用の add は出さない） */
  | { type: 'pickup'; tick: number; item: ItemId; count: number };

/** つくる・やく。担当 A が `src/craft/` で実装する */
export interface CraftSystem {
  recipes(): Recipe[];
  /** 今の持ち物で作れるか・足りないもの */
  status(recipeId: string): { craftable: boolean; missing: ItemStack[] };
  make(recipeId: string): { ok: boolean; reason: null | 'missing' | 'full' | 'unknown' | 'noFuel' | 'queueFull'; /** CRAFT-2: ok のときだけ（ねんりょう もふくむ） */ used?: MaterialUse | null };
  /** CRAFT-2: 今 つくったら どこから何こ取るかの 予定（何も変えない） */
  sources(recipeId: string): MaterialSources;
  /** CRAFT-2: 今の位置で `fogFar` 以内に しぼった 使える たんす（取る順。§2.4 (3)） */
  tansuInRange(): (TansuPos & { dist: number })[];
  /** CRAFT-2: テスト用の数（AC9b） */
  debugCounts(): { tansuFilterCount: number };
  /** いま えらんでいる ねんりょう（0 こなら 自動の順の次。なければ null） */
  fuel?(): ItemId | null;
  /** ねんりょう を えらぶ（せきたん・あぶら・き のどれか。持っていなくてもよい） */
  setFuel?(id: ItemId): boolean;
  /** かまど のブロックか */
  isFurnace(x: number, y: number, z: number): boolean;
  /** かまど を開く（画面は担当 C） */
  openFurnace(x: number, y: number, z: number): void;
  /** 開いている かまど（なければ null） */
  openedFurnace(): Vec3 | null;
  /** かまど をこわした（中身を返す） */
  furnaceBroken(x: number, y: number, z: number): void;
  /** こわしたときの数が決まっているブロック（なければ null で M2 のランダム） */
  fixedDrop(id: BlockId): number | null;
  /** 画面と音用（呼ぶと空）。テスト用の列は別に持つ */
  drainEvents(): CraftEvent[];
}

/** ダメージの種類: normal（かみつき・ふみつけ・たいあたり・たおれこみ・首）・ball（玉）・fall（落下） */
export type DamageKind = 'normal' | 'ball' | 'fall';

/** そうびの部位: あたま（かぶと）・からだ（よろい）・うで（こて）・あし（すねあて） */
export type ArmorSlot = 'head' | 'body' | 'arms' | 'legs';

/** 防具。担当 A が `src/craft/`（または `src/armor/`）で実装する */
export interface ArmorSystem {
  equipped(slot: ArmorSlot): ItemId | null;
  /** 着られるアイテムなら着る（手に持っているものを着る・入れかえ）。着たら true */
  tryEquip(item: ItemId): boolean;
  /**
   * 妖怪の攻撃を受けた。カットする量（体力の単位。ハート半分 = 1）を返す。受けるダメージ = max(1, 元 − カット)。
   * WEAPON-2: `amount` = 元の ダメージ。カットを **先に** 決めて 返し、**その あと** その 種類を ふせぐ 防具の たいきゅうを
   * `max(1, 切り捨て(amount ÷ armorDiv))` へらす（`amount` が 無い 古い 呼び方は へらさない）
   */
  cut(kind?: DamageKind, amount?: number): number;
  /** WEAPON-2: 着ている 防具を へった 量つきで（なければ null） */
  equippedStack(slot: ArmorSlot): ItemStack | null;
  /** WEAPON-2: 着ている 防具の たいきゅう（なければ null） */
  durability(slot: ArmorSlot): Durability | null;
  /** WEAPON-2: `wearLow` / `toolBreak`（`slot` は ArmorSlot。呼ぶと空になる） */
  drainWearEvents(): WearEvent[];
  peekWearEvents(): WearEvent[];
}

export type ToolKind = 'hand' | 'pickaxe' | 'blade' | 'bow' | 'other';

export interface ToolInfo {
  item: ItemId | null;
  kind: ToolKind;
  /** ほる強さ */
  power: number;
  /** ほれるレベル */
  level: number;
  /** たたく強さ */
  damage: number;
  /** とどく距離 */
  reach: number;
  /** 当たるまでのステップ */
  ticks: number;
}

export type SwingAnim =
  | 'slash'
  | 'thrust'
  | 'sweep'
  | 'draw'
  | 'release'
  | 'punch'
  | 'dig'
  | 'place'
  | 'whiff'
  | 'throw'
  // WEAPON-2（刀の わざ。かまえ を かえる は 'stance'）
  | 'kesa'
  | 'kiriage'
  | 'stance';

/** 手に持っているものの働き。担当 B が `src/tools/` で実装する */
export interface ToolSystem {
  current(): ToolInfo;
  /** うでの動きを始めたとき（人形の動き用。呼ぶと空） */
  drainSwings(): { anim: SwingAnim; tick: number }[];
  /** WEAPON-2: ゆみ（担当 B が `src/tools/bow/` で作り、ToolSystemImpl が 持つ） */
  bow?(): BowSystem;
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
/** 世界の中心・スタート地点の列 */
export const WORLD_CENTER = { x: 64, z: 64 } as const;

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

// ================================================================ M6（作る画面・実績・UI 作り直し）
// 担当の割り振り: docs/tickets/M6-dev-split.md。仕様: docs/design/M6-ui-achievements.md

// WEAPON-7 O8: 実績の おめでとう画面（時間を止める `ModalScreenState`）は なくなった。実績は 画面の 上の 帯に 出し、ゲームは 止めない

/** 実績の id: `<シリーズ>.<段階の数>`（例 `break.dirt.10`。§4.2） */
export type AchievementId = string;

export type MedalTier = 'bronze' | 'silver' | 'gold' | 'rainbow';

/** 実績の分類（§2.7）: こわす・おく・つくる・あつめる・たたかう・レベル・ぼうけん・ばしょ */
export type AchievementCategory =
  | 'break'
  | 'place'
  | 'craft'
  | 'collect'
  | 'fight'
  | 'level'
  | 'adventure'
  | 'places'
  // M7: 9 こ目「そだてる」
  | 'farm';

export type DefeatWith = 'hand' | 'pickaxe' | 'bokuto' | 'katana' | 'naginata' | 'crystal_katana' | 'yumi';

/** 記録のキー（§2.5。`achievements.stats()` のキーと同じ） */
export type StatKey =
  | `break:${string}`
  | `place:${string}`
  | `craft:${string}`
  | `bake:${string}`
  | `obtain:${string}`
  | `defeat:${string}`
  | `defeatWith:${DefeatWith}`
  | `wear:${string}`
  | `visit:${string}`
  | `drop:${string}`
  | `store:${string}`
  // LIVE-1 畜産（`<kind>` は 'chicken'、`*` は ぜんぶ）
  | `feed:${string}`
  | `friend:${string}`
  | `petAnimal:${string}`
  | `egg:${string}`
  // LIVE-1 版 3.2（§4.5）
  | `bug:${string}` // `bug:catch`・`bug:*` など
  | `carry:${string}` // `carry:chicken`・`carry:*` など
  // M7 農業（`visit:oldfarm` は上の `visit:` の形）
  | 'till'
  | `plant:${string}` // `plant:<kind>`・`plant:*`
  | `harvest:${string}` // `harvest:<kind>`・`harvest:*`
  | 'harvestWet'
  | `eat:${string}` // `eat:<item>`・`eat:*`
  | `wild:${string}` // `wild:<kind>`・`wild:*`
  | `seedFrom:${string}` // `seedFrom:grass`・`seedFrom:yokai`・`seedFrom:oldfarm`
  // M7-2
  | 'water:*' // みずやり（はんい に はたけ が 1 つ 以上）
  | 'pet:*' // ごきげん に した
  | 'bucketPlace' // BUCKET-1: バケツ で 水を おいた
  | 'harvestPet' // ごきげん の 作物 を しゅうかく
  | 'craftItems:ya'
  | 'pickup:*'
  | 'bagBack'
  | 'defeatLow'
  | 'chain'
  | 'guard'
  | 'bladeCombo3' // WEAPON-6: 3 段 ぜんぶ 当てた
  | `get:${string}` // WEAPON-7: レジェンダリーを はじめて 手に 入れた（`get:raijin_ken`）
  | 'legendKinds' // WEAPON-7: 手に 入れた ことの ある レジェンダリーの しゅるいの 数
  | 'wearAll'
  | 'death'
  | 'level'
  | 'playTicks'
  | 'night'
  | 'morning'
  | 'walk'
  | 'jump'
  | 'arrowShot'
  | 'arrowHit'
  | 'full'
  | 'storeFull'
  // WEAPON-2（道具が こわれた 回数・へった たいきゅうの 合計・防具が こわれた 回数）
  | 'toolBroken'
  | 'wearTotal'
  | 'armorBroken';

/** 実績 1 つ（表の 1 行。§4.2） */
export interface AchievementDef {
  id: AchievementId;
  series: string;
  category: AchievementCategory;
  /** 記録のキーと目標 */
  stat: StatKey;
  goal: number;
  /** 何番目の段階か（1 から） */
  tier: number;
  medal: MedalTier;
  /** ちいさい実績か（§2.6 (1)） */
  small: boolean;
  /** 名前（ひらがな・カタカナ。漢字は使わない） */
  name: string;
}

/** C → B: 今 出す おめでとう画面の 1 枚（§2.6 (3)） */
export interface AchievementShow {
  /** 見せる実績の id（取った順） */
  ids: AchievementId[];
  /** 主役（いちばん高いメダル。同じなら先に取った） */
  mainId: AchievementId;
  /** 5 行をこえた分の数（`ほか 3 こ`） */
  more: number;
}

/** B が持つ おめでとう画面の口（C が使う） */
export interface AchievementModalPort {
  /** 出す（上の 帯。ゲームは 止めない）。すでに出ている・テロップが 先なら false（C が 毎ステップ やりなおす） */
  open(show: AchievementShow): boolean;
  isOpen(): boolean;
  /** きえたとき（見せた id の列。240 ステップで 自動）。C が「見せた」にして 待ち時間を数えはじめる */
  onClosed(fn: (shown: AchievementId[]) => void): void;
}

/** B → C: しずか判定に使う「演出が出ているか」 */
export interface CelebrateBusyPort {
  bannerShowing(): boolean;
  levelUpShowing(): boolean;
}

/** C が持つ: 取ったばかり（まだ見せていない）の列から 今の 1 枚を作る */
export interface AchievementShowSource {
  /** 出すきまり（§2.6 (2)）を すべて満たしたら その 1 枚。まだなら null */
  nextShow(): AchievementShow | null;
  /** まだ見せていない数（メダルの印の数） */
  pendingCount(): number;
  /** その レシピを はじめて 作った・焼いた か（記録を 足す前に聞く。横断幕を出すか決める） */
  isFirstMade(kind: 'craft' | 'bake', recipe: string): boolean;
}

/** A → B: 作った・焼いた（演出と横断幕の出来事。`CraftEvent` の craft / bakeDone から A が作る） */
export interface CraftMadeEvent {
  kind: 'craft' | 'bake';
  tick: number;
  recipe: string;
  item: ItemId;
  count: number;
  /** はじめて（横断幕を出す）か */
  first: boolean;
  /** コンボ（1 から。§2.4 (1) の 5） */
  combo: number;
}
export type CraftMadeListener = (e: CraftMadeEvent) => void;

/** D → C: すてた・しまった の出来事（記録 `drop:*`・`store:*`・`storeFull`） */
export type StorageEvent =
  | { type: 'drop'; tick: number; item: ItemId; count: number }
  | { type: 'store'; tick: number; item: ItemId; count: number }
  | { type: 'storeFull'; tick: number };

/** §4.1 の設定（`settings.get/set` の名前そのまま。1 秒 = 60 ステップ）。初期値は `M6_SETTING_DEFAULTS` */
export interface M6Settings {
  craftComboTicks: number;
  craftComboMax: number;
  bannerTicks: number;
  bannerInTicks: number;
  bannerOutTicks: number;
  achieveSmallBatch: number;
  achieveSmallMaxWait: number;
  achieveCooldown: number;
  achieveCooldownEarly: number;
  achieveEarlyTicks: number;
  achieveCalmHurtTicks: number;
  achieveCalmYokaiDist: number;
  achieveCalmMaxWait: number;
  /** WEAPON-7 §2.6 (1): 実績の おしらせ（上の 帯）が 自動で きえる ステップ（出る 30・きえる 30 を ふくむ）。前の `achieveCloseDelay`（とじる が 押せる まで）は なくなった */
  achieveToastTicks: number;
  /** WEAPON-7 §2.6 (2): レジェンダリーの テロップの ステップ（出る 36・きえる 30 を ふくむ） */
  legendTelopTicks: number;
  achieveModalRows: number;
  achieveLowHp: number;
  achieveChainTicks: number;
  achieveChainCount: number;
  dropPickupDelay: number;
  dropThrowSpeed: number;
  dropThrowUp: number;
  tansuSlots: number;
  tansuCloseDist: number;
}

/** `hardness.tansu`・`fixedDrop.tansu`（5・1 こ）は D が M2・M4 の設定に足す */
export const M6_SETTING_DEFAULTS: Readonly<M6Settings> = {
  craftComboTicks: 120,
  craftComboMax: 8,
  bannerTicks: 180,
  bannerInTicks: 36,
  bannerOutTicks: 30,
  achieveSmallBatch: 5,
  achieveSmallMaxWait: 18000,
  achieveCooldown: 1800,
  achieveCooldownEarly: 5400,
  achieveEarlyTicks: 18000,
  achieveCalmHurtTicks: 120,
  achieveCalmYokaiDist: 8,
  achieveCalmMaxWait: 1800,
  achieveToastTicks: 240,
  legendTelopTicks: 300,
  achieveModalRows: 5,
  achieveLowHp: 3,
  achieveChainTicks: 600,
  achieveChainCount: 3,
  dropPickupDelay: 60,
  dropThrowSpeed: 4,
  dropThrowUp: 2,
  tansuSlots: 54,
  tansuCloseDist: 6,
};

/** 設定の入れ物を作る（つなぎ込みが `createSettingsHook` の extras に渡す。毎回 新しいコピー） */
export function createM6Settings(): M6Settings {
  return { ...M6_SETTING_DEFAULTS };
}

// ================================================================ M7（農業 フェーズ 1）
// 担当の割り振り: docs/tickets/M7-dev-split.md。仕様: docs/design/M7-farm.md

/** 作物の しゅるい。ブロックの id は しゅるいごと（`crop_<kind>`・`wild_<kind>`）。段階は id に入れない */
export type CropKind = 'onion' | 'tomato' | 'pumpkin' | 'eggplant';
export const CROP_KINDS: readonly CropKind[] = ['onion', 'tomato', 'pumpkin', 'eggplant'];
/** 0 = め・1 = は・2 = みが すこし・3 = みのった */
export type CropStage = 0 | 1 | 2 | 3;

export const CROP_BLOCK: Readonly<Record<CropKind, BlockId>> = {
  onion: 'crop_onion',
  tomato: 'crop_tomato',
  pumpkin: 'crop_pumpkin',
  eggplant: 'crop_eggplant',
};
export const WILD_BLOCK: Readonly<Record<CropKind, BlockId>> = {
  onion: 'wild_onion',
  tomato: 'wild_tomato',
  pumpkin: 'wild_pumpkin',
  eggplant: 'wild_eggplant',
};
export const SEED_ITEM: Readonly<Record<CropKind, ItemId>> = {
  onion: 'seed_onion',
  tomato: 'seed_tomato',
  pumpkin: 'seed_pumpkin',
  eggplant: 'seed_eggplant',
};
/** やさいの アイテム id は しゅるいの名前そのまま（`onion` ほか） */
export const VEG_ITEM: Readonly<Record<CropKind, ItemId>> = {
  onion: 'onion',
  tomato: 'tomato',
  pumpkin: 'pumpkin',
  eggplant: 'eggplant',
};

/** ブロック id から 作物の しゅるいを引く（作物・やせいの やさい 以外は null） */
export function cropKindOfBlock(id: BlockId | 'outside'): { kind: CropKind; wild: boolean } | null {
  switch (id) {
    case 'crop_onion': return { kind: 'onion', wild: false };
    case 'crop_tomato': return { kind: 'tomato', wild: false };
    case 'crop_pumpkin': return { kind: 'pumpkin', wild: false };
    case 'crop_eggplant': return { kind: 'eggplant', wild: false };
    case 'wild_onion': return { kind: 'onion', wild: true };
    case 'wild_tomato': return { kind: 'tomato', wild: true };
    case 'wild_pumpkin': return { kind: 'pumpkin', wild: true };
    case 'wild_eggplant': return { kind: 'eggplant', wild: true };
    default: return null;
  }
}
/** アイテム id から たね／やさい の しゅるいを引く */
export function seedKindOfItem(id: ItemId): CropKind | null {
  switch (id) {
    case 'seed_onion': return 'onion';
    case 'seed_tomato': return 'tomato';
    case 'seed_pumpkin': return 'pumpkin';
    case 'seed_eggplant': return 'eggplant';
    default: return null;
  }
}
export function vegKindOfItem(id: ItemId): CropKind | null {
  return id === 'onion' || id === 'tomato' || id === 'pumpkin' || id === 'eggplant' ? id : null;
}

/** 作物 1 つ（`farm.crop` の答え。座標は 作物のマス = はたけ の 1 つ上） */
export interface FarmCropInfo {
  kind: CropKind;
  stage: CropStage;
  /** 同じだんに いる 明るい ステップ */
  stageTicks: number;
  /** 下の はたけ が しめっているか */
  wet: boolean;
  /** 今 明るさ 9 以上（`farmMinLight`）か */
  lit: boolean;
  ripe: boolean;
}

export type FarmHintKind = 'till' | 'full' | 'fill' | 'bucket';
export type SeedSource = 'grass' | 'yokai' | 'oldfarm';

/** 農業の出来事。`tick` と 場所つき。画面（D）・音・実績・テストの窓口が読む */
export type FarmEvent =
  | { type: 'till'; tick: number; x: number; y: number; z: number }
  /** すで の 1・2 回目（count = 何回目） */
  | { type: 'tillPress'; tick: number; x: number; y: number; z: number; count: number }
  | { type: 'plant'; tick: number; x: number; y: number; z: number; kind: CropKind }
  | { type: 'stage'; tick: number; x: number; y: number; z: number; kind: CropKind; from: CropStage; to: CropStage }
  | { type: 'harvest'; tick: number; x: number; y: number; z: number; kind: CropKind; veg: number; seeds: number; wet: boolean; happy?: boolean }
  | { type: 'wild'; tick: number; x: number; y: number; z: number; kind: CropKind; seeds: number }
  | { type: 'notRipe'; tick: number; x: number; y: number; z: number; kind: CropKind }
  | { type: 'wet'; tick: number; x: number; y: number; z: number; wet: boolean }
  | { type: 'eat'; tick: number; x: number; y: number; z: number; item: ItemId; heal: number }
  | { type: 'seedFound'; tick: number; x: number; y: number; z: number; from: SeedSource; item: ItemId }
  /** 合図（D が チップを出す）。C が `noteHint` で伝える */
  | { type: 'hint'; tick: number; x: number; y: number; z: number; hint: FarmHintKind }
  /** かかし から 横 4 以内に 入った（`visit:oldfarm`。はじめて だけでなく 入るたび。数えるのは D の実績） */
  | { type: 'visitOldFarm'; tick: number; x: number; y: number; z: number }
  // ---- M7-2
  /** じょうろ に みず を くんだ（x,y,z = 当たった みず の マス）。`water` = くんだ あと の 量 */
  | { type: 'fill'; tick: number; x: number; y: number; z: number; item: WateringCanId; water: number; wasFull?: boolean }
  /** みずやり（x,y,z = まん中 = ねらった はたけ。`tiles` = はんい の はたけ の 数。0 でも 出る） */
  | { type: 'pour'; tick: number; x: number; y: number; z: number; item: WateringCanId; tiles: number }
  /** なでた。happy = ごきげん に なった・again = ごきげん の あいだ・wild = やせいの やさい */
  | { type: 'pet'; tick: number; x: number; y: number; z: number; result: PetResult }
  | { type: 'sprinklerPlaced'; tick: number; x: number; y: number; z: number }
  | { type: 'sprinklerBroken'; tick: number; x: number; y: number; z: number }
  // ---- BUCKET-1
  /** バケツ で 水を くんだ（x,y,z = 水の マス。`item` = くむ ときに 持っていた バケツ。`changed` = から → みず に かわった） */
  | { type: 'bucketFill'; tick: number; x: number; y: number; z: number; item: BucketId; changed: boolean }
  /** バケツ で 水を おいた（x,y,z = 水の マス） */
  | { type: 'bucketPlace'; tick: number; x: number; y: number; z: number }
  /** みずの バケツ が 置けない（コン） */
  | { type: 'bucketNo'; tick: number; x: number; y: number; z: number };

/** BUCKET-1: バケツ 2 しゅるい */
export type BucketId = 'bucket' | 'water_bucket';

/** M7-2: じょうろ 2 しゅるい */
export type WateringCanId = 'watering_can' | 'long_watering_can';
/** M7-2: なでた 結果（`null` = なでられない） */
export type PetResult = 'happy' | 'again' | 'wild';

/** しゅうかく の 結果 */
export type FarmHarvestResult =
  | { ok: false; reason: 'notRipe' | 'none' }
  | {
      ok: true;
      kind: CropKind;
      wild: boolean;
      wet: boolean;
      /** 入れるもの（やさい と たね。順は やさい・たね）。持ち物に入らない分は C が `scatterItem` で出す */
      items: ItemStack[];
    };

/** ねらった作物・はたけ の しるし（HUD。`farm.hud()` と同じ形） */
export interface FarmAim {
  /** 0〜4（段階 s なら s+1。はたけ だけなら 0） */
  dots: number;
  ripe: boolean;
  wet: boolean;
  /** 暗くて そだたない（明るさ 8 以下 で まだ みのっていない作物） */
  dark: boolean;
  /** M7-2: ごきげん の 作物（A が 入れる。無い = false） */
  happy?: boolean;
  /** M7-2: しめり が じょうろ の 分 だけ で のこり が `farmWetSoonRatio` 以下（「もうすぐ かわく」） */
  wetSoon?: boolean;
}

/** 農業の毎ステップに渡すもの */
export interface FarmStepContext {
  /** かかし への 近づきの 判定用 */
  playerPos: Vec3;
}

/**
 * 農業のしくみ。担当 A が `src/farm/` で実装する（`createFarmSystem(deps)`）。
 * ブロックの置きかえ（たがやす・まく・しゅうかく・しめり）は A が `world.setBlock` で行う。
 * 持ち物・体力に触るのは C（A は 持ち物を持たない）。座標は 特にことわりがなければ「作物のマス」。
 */
export interface FarmSystem {
  /** 作物のマスなら 情報、ちがえば null（やせいの やさい は stage 3・ripe で返す） */
  crop(x: number, y: number, z: number): FarmCropInfo | null;
  crops(): Array<{ x: number; y: number; z: number } & FarmCropInfo>;
  /** はたけ のマスなら `{wet}`（座標は はたけ のマス） */
  soil(x: number, y: number, z: number): { wet: boolean } | null;
  /** 設定（live）。C が 「すで 3 回」の数を読むのに使う */
  settings(): Readonly<M7Settings>;

  // ---- DigSystem（C）から呼ぶ。座標は ねらった ブロック（`dig.target().block`）
  /** くさ・つち（上が くうき）を はたけ（`farmland`。みず が近ければ `farmland_wet`）にする。できたら true。出来事 till */
  till(x: number, y: number, z: number): boolean;
  /** すで の 1・2 回目。出来事 tillPress だけ出す */
  noteTillPress(x: number, y: number, z: number, count: number): void;
  /** はたけ（座標は はたけ のマス）の 上が くうき なら 上のマスに 作物 stage 0。できたら true。出来事 plant。たねを へらすのは C */
  plant(x: number, y: number, z: number, kind: CropKind): boolean;
  /**
   * 作物・やせいの やさい の しゅうかく（座標は 作物のマス）。みのっていなければ `notRipe`（出来事 notRipe）。
   * みのっていれば 作物を くうき にして（はたけ は のこす）、入るもの（乱数は 農業の シード付き）を返し、出来事 harvest / wild
   */
  harvest(x: number, y: number, z: number): FarmHarvestResult;
  /**
   * ブロックを こわした あと（`setBlock(…, 'air')` の あと）に C が呼ぶ。はたけ なら 上の作物を かたづけて、
   * 返す物（みのっていれば しゅうかく と同じ。みのっていなければ たね 1 こ）を 返す。
   * くさ の上の やせいの やさい も 同じ（とったのと同じもの）。つち 1 こ は C が M2 のとおり。ほかは []
   */
  onBlockBroken(x: number, y: number, z: number, id: BlockId): ItemStack[];
  /** くさ を こわした列 (x, z) で 1/8 の くじ。当たれば たね 1 こ（場所で 出やすい たね。出来事 seedFound grass）、はずれは null */
  grassSeed(x: number, z: number): ItemId | null;
  /** その列で くさ を こわしたとき 出やすい たね（`regions()` から。なければ null = 4 しゅるい同じ）。テスト用 */
  grassSeedKind(x: number, z: number): CropKind | null;
  /** やさい を たべたときに もどる体力（やさい でなければ 0）。`eatHeal` の設定 */
  eatHeal(item: ItemId): number;
  /** たべた（出来事 eat。実績用）。体力の変更・持ち物を へらすのは C */
  noteEat(item: ItemId, heal: number, at: Vec3): void;
  /** 合図を 出す（出来事 hint）。同じ合図の 出し直しは D が 受け持つ */
  noteHint(hint: FarmHintKind, at: Vec3): void;
  /** 妖怪の おとしもの・ふるい たんす で たねが 持ち物に入った（出来事 seedFound。つなぎ込みが呼ぶ） */
  noteSeedFound(from: SeedSource, item: ItemId, at: Vec3): void;

  // ---- 毎ステップ・保存・テスト
  /** 1 ステップ。そだつ・しめり・かかし への 近づき。止まっている間は 呼ばない（もちもの画面は 4 ステップに 1 回） */
  update(ctx: FarmStepContext): void;
  /** ねらった作物・はたけ の しるし（HUD 用）。何でもなければ null */
  aim(x: number, y: number, z: number): FarmAim | null;
  /** 今の設定で 0 → 3 に かかる 明るい ステップの 平均 T */
  growTicks(kind: CropKind, wet: boolean): number;
  /** 画面と音用（呼ぶと空になる） */
  drainEvents(): FarmEvent[];
  /** テストの窓口用（読んでも空に ならない） */
  peekEvents(): FarmEvent[];
  /** 「M7 の 置きもの を 置いた」印 */
  placedM7(): boolean;
  serialize(): unknown;
  deserialize(data: unknown): void;
}

// ---- M7-2: つなぎ目の口（docs/design/M7-2-farm.md §7。名前は 担当が 変えて よい。変えたら 報告）

export type Facing = 'x+' | 'x-' | 'z+' | 'z-';

/**
 * B → A: スプリンクラー の はんい（`src/farm/sprinkler.ts`。B が実装）。
 * A は ③（§4.3）を この口 だけ で 聞く。
 */
export interface SprinklerPort {
  /** はたけ のマス (x,y,z) が どれか の スプリンクラー の はんい（5×5・sy−2 ≤ y ≤ sy）か */
  covers(x: number, y: number, z: number): boolean;
  /** 世界 に ある スプリンクラー（`farm.sprinklers()`） */
  list(): Vec3[];
  /** ブロックが 変わった（置いた・こわれた）ことを 知らせる。A が `setBlock` の まわりで 呼ぶ */
  onBlockChanged(x: number, y: number, z: number, before: BlockId, after: BlockId): void;
  /** 読みこみ の あと、世界 から さがし直す */
  rescan(world: VoxelWorld): void;
}

/**
 * C → A: ごきげん（`src/farm/pet.ts`。C が実装）。
 * 座標は 作物のマス。A の `update` が `tick()` を 呼び、そだつ 計算 で `growFactor` を p に かける。
 */
export interface PetPort {
  /** ごきげん なら 1 + `farmPetGrowBonus`、ちがえば 1 */
  growFactor(x: number, y: number, z: number): number;
  isHappy(x: number, y: number, z: number): boolean;
  /** ごきげん の のこり ステップ（無ければ 0） */
  left(x: number, y: number, z: number): number;
  /** なでる。作物 でなければ null。やせいの やさい は 'wild'。'happy' の ときだけ のこり を `farmPetDays` に する */
  pet(x: number, y: number, z: number, crop: FarmCropInfo & { wild: boolean }): PetResult | null;
  /** 農業 の 1 ステップ ごと に A が 呼ぶ（のこり を へらす） */
  tick(): void;
  /** 作物 が なくなった（しゅうかく・こわした）。ごきげん を 消す */
  onCropRemoved(x: number, y: number, z: number): void;
  /** 保存 `farm.happy` に そのまま 入れる（x,y,z,のこり の 4 こ ずつ） */
  serialize(): number[];
  /** 読む。`isCrop(x,y,z)` が false の 行 と のこり ≤ 0 は 飛ばす */
  deserialize(flat: unknown, isCrop: (x: number, y: number, z: number) => boolean): void;
}

/** ねらいの線 の 情報（A の `WateringPort` と C の ふりわけ が 使う） */
export interface WaterRay {
  /** 線 が 固いブロック・作物 に 当たる より 手前で `water` を 通った（目 の ある マス は 数えない） */
  throughWater: boolean;
  /** 通った いちばん 手前 の `water` の マス（throughWater の とき） */
  waterCell: Vec3 | null;
  /** 当たった ブロック・作物 の マス（無ければ null） */
  hit: Vec3 | null;
}

/** 右クリック の 4a〜4c を 見分けた 答え */
export type WaterPreview = 'fill' | 'pour' | 'fillHint';

/**
 * A → C: じょうろ（`src/farm/watering.ts`。A が実装）。C は ふりわけ の 4a〜4c で これ を 呼ぶ だけ。
 * `water` を へらす・ふやす のも A（`slot` の `ItemStack.water` を 書きかえる）。
 */
export interface WateringPort {
  /**
   * 4a〜4c の どれか。持っているのが じょうろ でなければ null。
   * 'fill' = くむ（4a）・'pour' = まく（4b）・'fillHint' = からっぽ の 合図（4c）。
   * repeat = 押しつづけ の くりかえし の ステップ。その とき は 'fill'・'fillHint' を 返さない（4a の ステップ は null で 何もしない）
   */
  canPreview(held: ItemStack | null, ray: WaterRay, repeat: boolean): WaterPreview | null;
  /** くむ。まんたん まで。出来事 fill（まんたん の ときも 出して よい: `water` が 変わらない）。戻り値 = くんだ あと の 量 */
  fill(slot: number, at: Vec3): number;
  /**
   * まく。`target` = 当たった マス（はたけ か 作物）、`facing` = 見ている 向き の 水平 ベクトル (dx, dz)（§2.1 の 近い軸）。
   * はたけ 1 つ 以上 なら `water` 1 へり、出来事 pour。戻り値 = `tiles`（はんい の はたけ の 数。0 なら 何も へらさない）
   */
  pour(slot: number, target: Vec3, facing: { dx: number; dz: number }): number;
}

/** A を作るときに わたすもの */
export interface FarmDeps {
  world: VoxelWorld;
  light: LightField;
  /** 世界のシード（農業の乱数と 置きもの の もと） */
  seed: number;
  /** 1 にち の ステップ数（`dayTicks + duskTicks + nightTicks + dawnTicks`。今 91,800） */
  dayLength(): number;
  /** 設定の 入れ物（`settings.set` で変えたら すぐ効くよう、同じ オブジェクトを 読む） */
  settings: M7Settings;
  /** 今のステップ（出来事の tick 用） */
  tick(): number;
  /** ふるい はたけ の たんす の中身を 入れる（`StorageSystem.set` を つなぐ） */
  fillTansu(pos: Vec3, items: ItemStack[]): void;
  /** 置きもの の 計算（E の `computeFarmPlacement`）。A が 前の保存に あとから置くとき使う */
  placement: FarmPlacementFn;
}

/** DigSystem（C）が 農業を 呼ぶ口（`FarmSystem` の 一部）。`DigM4Deps.farm` に入れる */
export type DigFarmPort = Pick<
  FarmSystem,
  | 'crop'
  | 'soil'
  | 'settings'
  | 'till'
  | 'noteTillPress'
  | 'plant'
  | 'harvest'
  | 'onBlockBroken'
  | 'grassSeed'
  | 'eatHeal'
  | 'noteEat'
  | 'noteHint'
>;

/** 体力を 聞く・もどす口（`PlayerCombat` の 一部）。`DigM4Deps.vitals` に入れる */
export type DigVitalsPort = Pick<PlayerCombat, 'hp' | 'maxHp' | 'heal'>;

// ---------------------------------------------------------------- 置きもの（E → A, 新しい世界）

export interface FarmPlacedBlock {
  x: number;
  y: number;
  z: number;
  id: BlockId;
}

/** 置きもの の 差分（§4.5 (0)。島を作った直後の 地形 と シード だけ で 決まる） */
export interface FarmPlacement {
  /** やせいの やさい（`id` は `wild_<kind>`。下の くさ の列は もとのまま） */
  wild: Array<{ x: number; y: number; z: number; kind: CropKind }>;
  /** ふるい はたけ の あと（置かないときは null） */
  oldFarm: {
    /** 置く マス ぜんぶ（地面を そろえる 分・はたけ 12・さく・かかし 2 段・たんす を ふくむ。順は 下から上） */
    blocks: FarmPlacedBlock[];
    tansu: Vec3;
    /** たんす の 中身（たまねぎ 2・トマト 3・なす 2・かぼちゃ 1） */
    tansuItems: ItemStack[];
    /** かかし（下）の マス */
    kakashi: Vec3;
    /** 8×8 の わく（x0〜x1, z0〜z1 を ふくむ）と、しらべる 高さ（h₀−1〜h₀+6）。前の保存で「変えていない」を しらべる範囲 */
    box: { x0: number; z0: number; x1: number; z1: number; y0: number; y1: number };
    /** §4.5 (3) の ゆるめた 段（0 = ゆるめていない） */
    tier: 0 | 1 | 2 | 3;
  } | null;
}

/**
 * 置きもの の 場所を 計算する（E が `src/world/gen/` で実装する。純粋: 世界は 変えない）。
 * `pristine` を わたすと その 世界（読みこんだ直後の 世界と `IslandInfo`）を 使う。なければ 同じ シードで 読みこみ直して 使う。
 */
export type FarmPlacementFn = (seed: number, pristine?: { world: VoxelWorld; info: IslandInfo }) => FarmPlacement;

/** 新しい世界に 置く（E）。島を作った直後に 1 回。たんす の 中身は 置かない（A が `fillTansu` で入れる） */
export type ApplyFarmPlacement = (world: VoxelWorld, placement: FarmPlacement) => void;

// ---------------------------------------------------------------- 見た目（B → A, D）

/** 作物の 今の 段階を 聞く口（A の `FarmSystem` が 合う）。B の 描画が 読む */
export interface CropStageSource {
  /** 作物・やせいの やさい のマスなら 段階（やせいの やさい は 3）。ちがえば null */
  stageAt(x: number, y: number, z: number): CropStage | null;
}

/** 絵と 描く明るさ（B が `src/world/blocks/`・`render/` で作る。A の `farm.texture`・`farm.look` が そのまま 返す） */
export interface FarmVisual {
  /** 16×16（行ごとに 左から）。`'#rrggbb'`、すきとおる所は null。name は §6.1 の `farm.texture` */
  texture(name: string): Array<string | null>;
  /** 作物のマスの 描いている 絵の名前と 明るさ（作物でなければ null） */
  look(x: number, y: number, z: number): { tile: string; brightness: number } | null;
}

/** BUCKET-1: 4d〜4g の 答え（'idle' = バケツ を 持っているが 何も しない。ほかの 段へ 進まない） */
export type BucketPreview = 'bucketFill' | 'bucketPlace' | 'bucketHint' | 'bucketNo' | 'idle';

/** BUCKET-1: バケツ（`src/farm/bucket.ts`）。持ち物の id を かえる のも 出来事を 出す のも ここだけ */
export interface BucketPort {
  /** 4d〜4g。バケツ でなければ null。repeat（押しつづけ）の ステップは 'idle' */
  preview(held: ItemStack | null, ray: WaterRay, hasTarget: boolean, spot: Vec3 | null, repeat: boolean): BucketPreview | null;
  /** くむ（から → みず。みず は かわらない）。かわったら true。出来事 bucketFill */
  fill(slot: number, at: Vec3): boolean;
  /** おいた あと: みず → から。出来事 bucketPlace。みず でなければ false */
  placed(slot: number, at: Vec3): boolean;
  /** 置けない（コン）。出来事 bucketNo */
  no(at: Vec3): void;
}

/** 右クリックで起きること（`src/dig/rightClick.ts` が 判定。M7-2 で 'fill'・'pour'・'fillHint'・'pet' を 足した） */
export type RightClickKind =
  | 'storage' | 'furnace' | 'armor' | 'till' | 'plant' | 'seedHint' | 'eat' | 'place'
  | 'fill' | 'pour' | 'fillHint' | 'pet'
  | 'bucketFill' | 'bucketPlace' | 'bucketHint' | 'bucketNo'
  // LIVE-1
  | 'feed' | 'animalPet'
  // LIVE-1 版 3.2（§2.3）
  | 'animalFull' | 'net' | 'netHint' | 'putDown';

// ---------------------------------------------------------------- 設定（§4.3・§4.4・§4.5）

export interface M7Settings {
  /** にち（1 にち = dayLength ステップ）。0 → 3 に かかる 明るい ステップの 平均 */
  farmGrowDays: { dry: Record<CropKind, number>; wet: Record<CropKind, number> };
  farmMinLight: number;
  farmMaxWaitFactor: number;
  farmWetRange: number;
  farmWetRecheckTicks: number;
  farmHandTillPresses: number;
  farmHandTillResetTicks: number;
  farmYield: Record<CropKind, [number, number]>;
  farmSeedYield: [number, number];
  farmGrassSeedChance: number;
  farmGrassSeedWeight: number;
  eatHeal: Record<CropKind, number>;
  farmRipeMinBrightness: number;
  // ---- M7-2
  farmWaterDays: number;
  farmCanCapacity: Record<WateringCanId, number>;
  farmCanTiles: Record<WateringCanId, number>;
  farmCanYReach: number;
  farmPourRepeatTicks: number;
  farmWetSoonRatio: number;
  farmSprinklerRadius: number;
  farmSprinklerSprayTicks: number;
  farmPetDays: number;
  farmPetGrowBonus: number;
  farmHeartEvery: number;
  farmHeartRange: number;
  farmHeartMax: number;
  farmSparkleEvery: number;
  farmSparkleRange: number;
  farmSparkleMax: number;
}

export const M7_SETTING_DEFAULTS: Readonly<M7Settings> = {
  farmGrowDays: {
    dry: { onion: 1.875, tomato: 1.125, pumpkin: 3, eggplant: 1.875 },
    wet: { onion: 1.275, tomato: 0.75, pumpkin: 1.95, eggplant: 1.275 },
  },
  farmMinLight: 9,
  farmMaxWaitFactor: 3,
  farmWetRange: 4,
  farmWetRecheckTicks: 60,
  farmHandTillPresses: 3,
  farmHandTillResetTicks: 120,
  farmYield: { onion: [1, 2], tomato: [1, 2], pumpkin: [1, 1], eggplant: [1, 2] },
  farmSeedYield: [1, 2],
  farmGrassSeedChance: 0.125,
  farmGrassSeedWeight: 4,
  eatHeal: { onion: 2, tomato: 2, pumpkin: 4, eggplant: 2 },
  farmRipeMinBrightness: 0.7,
  farmWaterDays: 1,
  farmCanCapacity: { watering_can: 10, long_watering_can: 20 },
  farmCanTiles: { watering_can: 1, long_watering_can: 2 },
  farmCanYReach: 1,
  farmPourRepeatTicks: 30,
  farmWetSoonRatio: 0.25,
  farmSprinklerRadius: 2,
  farmSprinklerSprayTicks: 120,
  farmPetDays: 1,
  farmPetGrowBonus: 0.1,
  farmHeartEvery: 180,
  farmHeartRange: 16,
  farmHeartMax: 32,
  farmSparkleEvery: 45,
  farmSparkleRange: 24,
  farmSparkleMax: 96,
};

/** 設定の入れ物を作る（毎回 ふかい コピー。つなぎ込みが `createSettingsHook` の extras に渡す） */
export function createM7Settings(): M7Settings {
  const d = M7_SETTING_DEFAULTS;
  return {
    ...d,
    farmGrowDays: { dry: { ...d.farmGrowDays.dry }, wet: { ...d.farmGrowDays.wet } },
    farmYield: {
      onion: [...d.farmYield.onion],
      tomato: [...d.farmYield.tomato],
      pumpkin: [...d.farmYield.pumpkin],
      eggplant: [...d.farmYield.eggplant],
    },
    farmSeedYield: [...d.farmSeedYield],
    eatHeal: { ...d.eatHeal },
    farmCanCapacity: { ...d.farmCanCapacity },
    farmCanTiles: { ...d.farmCanTiles },
  };
}

// ================================================================ WEAPON-2（弓の山なり・刀の構えと技・道具の たいきゅう）
// 担当の割り振り: docs/tickets/WEAPON-2-dev-split.md。仕様: docs/design/WEAPON-2.md（第 5 版）

// ---------------------------------------------------------------- 妖怪（E）

/** 押す 距離（水平。P から 妖怪への 向き）と 上への 初速（ブロック/秒）。`YokaiWorld.damage` の 4 つ目 */
export interface YokaiKnock {
  /** 水平に 押す 距離（今の 値は 1.0。10 ステップ かけて 押す） */
  dist: number;
  /** 上への 初速（ブロック/秒。0 = 上げない） */
  up: number;
}

// ---------------------------------------------------------------- たいきゅう（F）

/** 3 つの なかま（§4.6 (1)）: つかうと なくなる・たいきゅうで へる・ずっと へらない */
export type ItemClass = 'consumable' | 'durable' | 'permanent';

/** たいきゅう（max = 新品の 値、left = 今の のこり。left = max − wear） */
export interface Durability {
  max: number;
  left: number;
}

/** `wearHeld` / `wearSlot` の 答え（へらした あと の 様子） */
export interface WearResult extends Durability {
  /** このとき 本当に へった 量（のこりより 多く 頼まれても のこり まで） */
  worn: number;
  /** 0 になって こわれた（マスは 空になった） */
  broke: boolean;
  /** このとき はじめて のこり わずか（`wearLowRatio` 以下）に 入った */
  low: boolean;
}

/** たいきゅうの 出来事（持ち物と 防具が 出す。`slot` は 持ち物の マス番号 か 防具の 部位） */
export type WearEvent =
  | { type: 'wearLow'; tick: number; item: ItemId; slot: number | ArmorSlot }
  | { type: 'toolBreak'; tick: number; item: ItemId; slot: number | ArmorSlot };

// ---------------------------------------------------------------- 動きの 制限（A・B → プレイヤー）

/** わざ・ゆみを ひく あいだの 歩く 速さ。つなぎ込みが プレイヤーの 速さに かける */
export interface PlayerMotionMod {
  /** 歩く 速さの 倍率（1 = ふつう） */
  speedMul: number;
  /** true の あいだ ジャンプ できない（刀の わざの あいだ） */
  jumpLocked: boolean;
  /** CHAR-2: null でない あいだ キャラの 向き（facing）は これ。回らない（わざの 向きの 固定） */
  faceDeg?: number | null;
  /** CHAR-2: true の ステップは 水平の速さを 0 に する */
  stopNow?: boolean;
  /** WEAPON-9: null でない あいだ 足もとの 高さを これに 向けて うごかす（シャイニングで うかぶ。重力を 使わない） */
  hoverY?: number | null;
}

// ---------------------------------------------------------------- 刀（A）

export type BladeStance = 'chudan' | 'jodan' | 'gedan';
export type BladeTech = 'thrust' | 'kesa' | 'kiriage';
export type BladePhase = 'idle' | 'switch' | 'startup' | 'active' | 'recovery';

export interface BladeState {
  /** 刀を 持っていれば その アイテム（持っていない・こわれたら null） */
  item: ItemId | null;
  stance: BladeStance;
  /** わざの 最中だけ */
  tech: BladeTech | null;
  phase: BladePhase;
  /** わざ（か かまえ変え）を 始めた ステップを 1 とした F。`idle` は 0 */
  frame: number;
  /** 先行入力で おぼえている もの（1 つだけ） */
  buffered: 'tech' | 'stance' | null;
  /** `phase` が `switch` の とき 前の かまえ（なめらかに うつす 用）。ほかは null */
  switchFrom: BladeStance | null;
  /** CHAR-2: わざの あいだだけ ふみこみ（それ以外は null）。dirDeg = わざの向き u、origin = 始めた足もと O、target = A(f)、moved = 実際に u へ進んだ きょり */
  move: { dirDeg: number; origin: Vec3; target: number; moved: number; tiltDeg: number } | null;
  /** WEAPON-6: 今の わざの 長さ（2・3 段目は 出だしが ちぢむ）。idle・かまえ変えは null */
  lengths?: BladeTechFrames | null;
  /**
   * WEAPON-6: 3 段攻撃の ようす（つながる刀で わざの あいだだけ。ほかは null）。
   * open = 今の F が つなぎの窓の 中、cancelAt = キャンセルできる F（C）、queued = つなぎを おぼえている
   */
  combo?: { step: 1 | 2 | 3; queued: boolean; open: boolean; cancelAt: number | null } | null;
}

export type BladeStep = 1 | 2 | 3;

/** 今の 当たりの 形（世界の 座標。§6.1） */
export type BladeShapeInfo =
  | { kind: 'capsule'; from: Vec3; to: Vec3; radius: number }
  | {
      kind: 'fan';
      center: Vec3;
      forward: Vec3;
      halfAngleDeg: number;
      rMin: number;
      rMax: number;
      yMin: number;
      yMax: number;
    };

export type BladeEvent =
  | { type: 'techStart'; tick: number; tech: BladeTech; step?: BladeStep }
  | { type: 'techHit'; tick: number; tech: BladeTech; yokaiId: number; damage: number; knock: number; up: number; position: Vec3; step?: BladeStep }
  | { type: 'techMiss'; tick: number; tech: BladeTech; step?: BladeStep }
  | { type: 'stance'; tick: number; from: BladeStance; to: BladeStance }
  | { type: 'cancel'; tick: number };

/** 刀に 毎ステップ わたすもの。ふりわけ（わざ か ほる か しゅうかく）は つなぎ込みの DigSystem が 決めて、わざ なら techPressed / techHeld を 立てる */
export interface BladeStepContext {
  /** 手に 持っている 刀（ぼくとう・かたな・きらめく カタナ）。刀でなければ null（わざ・かまえは おわる） */
  item: ItemId | null;
  /** このステップに ひだりクリック を 押した **そして ふりわけが わざ** */
  techPressed: boolean;
  /** ひだりクリック を おしつづけている **そして ふりわけが わざ**（おしつづけの くりかえし用） */
  techHeld: boolean;
  /** `stanceNext`（R）を このステップに 押した */
  stancePressed: boolean;
  /** 目の 位置 E */
  eye: Vec3;
  /** 照準の 方向 d（長さ 1。上下を ふくむ） */
  dir: Vec3;
  /** 足もと P */
  position: Vec3;
  yawDeg: number;
  /** false（やられた・案内画面 など）の ときは わざを 始めない・今の わざは やめる */
  active: boolean;
  /** WEAPON-3: 体の点 B（P の 真上。肩の高さ） */
  body: Vec3;
  /** WEAPON-3: わざの向き u（度。始めたステップで 固定） */
  attackDirDeg: number;
  /** WEAPON-3: 向きの補助で えらんだ 妖怪 T の 中心の 点（なければ null） */
  attackTarget: Vec3 | null;
}

export interface BladeDeps {
  world: VoxelWorld;
  yokai: () => YokaiWorld;
  settings: W2Settings;
  /** 刀の 強さ（`weaponDamage`。ぼくとう 2・かたな 4・きらめく カタナ 4） */
  weaponDamage: (item: ItemId) => number;
  /** わざが 1 体 以上 に 当たった（1 回の わざで 1 回）。つなぎ込みが `inventory.wearHeld(settings.toolWear.blade.hit)` につなぐ */
  onHit: (info: { tech: BladeTech; count: number }) => void;
  /** わざの ふみこみ。水平に dx, dz だけ 動かして、かべで 止まった あとの 実際に 動いた量を 返す（つなぎ込みが プレイヤー側で 動かす） */
  lunge?: (dx: number, dz: number) => { x: number; z: number };
  tick: () => number;
}

/** 刀のしくみ。担当 A が `src/tools/blade/` で作る（`createBladeSystem(deps)`） */
export interface BladeSystem {
  state(): BladeState;
  /** かまえを すぐ かえる（準備用。8F なし） */
  setStance(s: BladeStance): void;
  /** 1 ステップ（止まっている あいだは 呼ばない） */
  update(ctx: BladeStepContext): void;
  /** 今の 当たりの 形（持続 の あいだ だけ。なければ null） */
  shape(): BladeShapeInfo | null;
  motion(): PlayerMotionMod;
  /** 画面と音用（呼ぶと空） */
  drainEvents(): BladeEvent[];
  /** テストの窓口用（読んでも 空にならない） */
  peekEvents(): BladeEvent[];
  /** WEAPON-5: 先行入力を すてる（パリィが 勝った とき） */
  dropBuffer?(): void;
  /** WEAPON-5: 次の ステップを すすめたあとも わざ・かまえ替えが つづくか（パリィを すぐ 出せるか）・先行入力の 区間か */
  busyNext?(parryPress?: boolean): { busy: boolean; accepts: boolean };
  /** WEAPON-6: 次に わざが 始まるなら どの わざ・何段目か（向きの補助の 届く距離を 段ごとに 見る用） */
  nextStart?(): { tech: BladeTech; step: BladeStep };
  /** WEAPON-6: パリィが 始まった ステップに、つなぎの窓の わざを やめる（イベントは 出さない） */
  yieldToParry?(): void;
}

// ---------------------------------------------------------------- 弓（B）

export type BowStage = 0 | 1 | 2 | 3;

export interface BowState {
  drawing: boolean;
  /** 押してから 何ステップか（押した ステップ = 1） */
  drawTicks: number;
  stage: BowStage;
  /** 次に ひけるまで のこり ステップ（0 = ひける） */
  nockLeft: number;
}

/** 弓の しなり（一人称・三人称で 同じ値。C が 絵に する） */
export interface BowPose {
  stage: BowStage;
  /** つるを 引く 量 0〜1 */
  pull: number;
  /** 弓の まがり（度）。段 3 は ふるえ を ふくむ */
  bendDeg: number;
}

export interface ArrowInfo {
  id: number;
  position: Vec3;
  velocity: Vec3;
  /** 飛んでから の ステップ */
  age: number;
}

export interface StuckArrowInfo {
  id: number;
  position: Vec3;
  /** ささった ときの 飛んでいた 向き（長さ 1） */
  dir: Vec3;
  age: number;
}

export type BowEvent =
  | { type: 'drawStart'; tick: number }
  | { type: 'stage'; tick: number; stage: 1 | 2 | 3 }
  | { type: 'arrowShot'; tick: number; stage: 1 | 2 | 3; speed: number; position: Vec3; velocity: Vec3 }
  | { type: 'arrowHit'; tick: number; yokaiId: number; damage: number; position: Vec3 }
  | { type: 'arrowStick'; tick: number; position: Vec3 }
  | { type: 'arrowEnd'; tick: number; position: Vec3 }
  | { type: 'dryRelease'; tick: number }
  | { type: 'noArrow'; tick: number }
  | { type: 'pickup'; tick: number };

export interface BowStepContext {
  /** 手に 持っているのが ゆみ なら その アイテム、ちがえば null（ひくのを やめる。や は へらない） */
  item: ItemId | null;
  /** ひだりクリック を このステップに 押した */
  pressed: boolean;
  /** おしている */
  held: boolean;
  eye: Vec3;
  /** 照準の 方向 d（長さ 1。上下を ふくむ） */
  dir: Vec3;
  /** 足もと P（や を 拾う 判定用） */
  position: Vec3;
  /** false（やられた・案内画面 など）の ときは ひかない */
  active: boolean;
}

export interface BowDeps {
  world: VoxelWorld;
  yokai: () => YokaiWorld;
  settings: W2Settings;
  inventory: Pick<Inventory, 'count' | 'remove' | 'add' | 'canAdd'>;
  /** や を 1 本 うった。つなぎ込み（か ToolSystemImpl）が `inventory.wearHeld(settings.toolWear.bow.shot)` につなぐ */
  onShot: () => void;
  /** や が 妖怪に 当たった / ささった（実績 `arrowHit` 用） */
  tick: () => number;
}

/** 弓と や。担当 B が `src/tools/bow/` で作る（`createBowSystem(deps)`。`ToolSystem.bow()` が 返す） */
export interface BowSystem {
  state(): BowState;
  pose(): BowPose;
  update(ctx: BowStepContext): void;
  arrows(): ArrowInfo[];
  stuck(): StuckArrowInfo[];
  motion(): PlayerMotionMod;
  drainEvents(): BowEvent[];
  peekEvents(): BowEvent[];
}

// ---------------------------------------------------------------- 見た目（A・B → C）

/** 人形・一人称の 絵が 読む 武器の 今の 形（C の `CameraRig.setWeaponSource` に わたす） */
export interface WeaponVisualSource {
  /** 刀を 持っていない ときは `item` が null の 状態 */
  blade(): BladeState;
  /** 弓を ひいていない ときは `{stage:0, pull:0, bendDeg:0}` */
  bowPose(): BowPose;
}

// ---------------------------------------------------------------- 設定（§4.2〜§4.6）

/** CHAR-2: 刀の わざの 絵の データ（atlas.json の ticks・advance・step と 同じ） */
export interface BladeAdvanceCurve {
  ticks: number[];
  advance: number[];
  step: number;
}

export interface BladeTechFrames {
  startup: number;
  active: number;
  recovery: number;
}

/** WEAPON-6 §4.7 */
export interface BladeComboSettings {
  items: ItemId[];
  order: Record<BladeStance, BladeTech[]>;
  /** 2・3 段目の 出だし */
  stepStartup: Record<BladeTech, number>;
  /** ふりぬき（見せる ステップ） */
  follow: Record<BladeTech, number>;
  /** 2 段目の ふみこみの 線（あれば bladeAdvance の かわりに） */
  step2Advance: Partial<Record<BladeTech, BladeAdvanceCurve>>;
}

export interface W2Settings {
  // 刀（§4.2・§4.3）
  bladeTech: Record<BladeTech, BladeTechFrames>;
  stanceSwitchTicks: number;
  /** 先行入力: 硬直の さいご 何F から 受けるか（突きは 持続から） */
  bladeBufferTicks: number;
  /** わざの あいだの 歩く 速さの 倍率（CHAR-2: 4 つとも 0 = 歩けない。体は ふみこみ だけで 動く） */
  bladeMoveMul: { thrust: number; kesaStartupActive: number; kesaRecovery: number; kiriage: number };
  /** CHAR-2: わざの 絵の ふみこみ（初期値は art の atlas.json を 写す） */
  bladeAdvance: Record<BladeTech, BladeAdvanceCurve>;
  /** WEAPON-6: 3 段攻撃（きらめく カタナだけ） */
  bladeCombo: BladeComboSettings;
  /** 照準の 線で 妖怪を わざに ふりわける 距離 */
  bladeAimReach: number;
  /** WEAPON-4: 刀ごとの 射程 R（3 つのわざで 同じ）。表にない 刀は かたなの 値 */
  bladeReach: Partial<Record<ItemId, number>>;
  /** 注意（WEAPON-4）: thrust.length・kesa/kiriage.rMax は もう 使わない（射程は bladeReach）。半径・角・高さ・rMin だけ 効く */
  bladeShape: {
    thrust: { length: number; radius: number };
    kesa: { halfAngleDeg: number; rMin: number; rMax: number; yMin: number; yMax: number };
    kiriage: { halfAngleDeg: number; rMin: number; rMax: number; yMin: number; yMax: number };
  };
  bladeDamageMul: Record<BladeTech, number>;
  /** [水平の 距離, 上への 初速] */
  bladeKnock: Record<BladeTech, [number, number]>;
  // 弓（§4.4）。段 1・2・3 の 順
  bowStageTicks: [number, number, number];
  bowSpeed: [number, number, number];
  bowDamage: [number, number, number];
  bowKnock: [number, number, number];
  arrowGravity: number;
  arrowLifeTicks: number;
  bowNockTicks: number;
  arrowStuckTicks: number;
  arrowStuckMax: number;
  /** ささった や を 拾う はんい [水平, 高さ] */
  arrowPickupRange: [number, number];
  bowMoveMul: number;
  bowBend: { pull: [number, number, number]; bendDeg: [number, number, number]; blendTicks: number };
  // たいきゅう（§4.6）
  toolDurability: Partial<Record<ItemId, number>>;
  toolWear: {
    pickaxe: { block: number; hit: number };
    blade: { block: number; hit: number };
    bow: { shot: number };
    kuwa: { till: number; block: number; hit: number };
    armorDiv: number;
  };
  /** のこり わずか（のこり ÷ 新品 が これ 以下。切り上げで 数える） */
  wearLowRatio: number;
  /** WEAPON-7 §2.1: レジェンダリー武器の データ（1 つ 足すと 武器が ふえる）。ためわざ・ふつうの わざに 足す 効果・持っている 間の 効果 */
  legendary: LegendaryDef[];
  /** WEAPON-7 §2.3: ヌシの ドロップ表（weight で ランダムに 1 本。初期値 = legendary の ぜんぶ・weight 1） */
  nushiDrops: NushiDropRow[];
  /** WEAPON-7 §2.2: ため中の 歩く 倍率 */
  legendaryChargeWalk: number;
  /** WEAPON-9: 虹を 強さ なしで わたした ときの 強さ */
  nijiTestPower: number;
  /** WEAPON-9 §5.6: 三人称で シャイニング中に カメラを 引く きょり（4 = 引かない） */
  shiningCamDistance: number;
  /** 刀を ふった ときの きせき（武器ごとの 個性。オーナー決定）。style: plain=ふつう・star=星が まじる・long=長い 弧 */
  bladeTrail: Partial<Record<ItemId, BladeTrailStyle>>;
  // WEAPON-3（§4.7）
  /** 向きの補助の 片がわの 角（度）。0 以下で 補助なし。刀・パンチ どちらにも 使う */
  bladeFaceAssistDeg: number;
  /** 突きを 上下へ かたむける 上限（度） */
  thrustTiltMaxDeg: number;
  /** パンチの 扇の柱（届く距離は punchReach・weaponReach） */
  punchShape: { halfAngleDeg: number; yMin: number; yMax: number };
  bladeTrailShape: BladeTrailShape;
  /** 軌跡を 書く 絵の時 τ（CHAR-4 §4.2） */
  bladeTrailWindow: Record<BladeTech, [number, number]>;
  // WEAPON-5（刀の パリィ。§4.7）
  /** かまえ・受け・すき（ステップ） */
  parryTicks: { ready: number; guard: number; recover: number };
  /** すきの はじめの 何ステップが 半分か */
  parryEarlyTicks: number;
  /** 成功のあとの きめ（ステップ） */
  parryKimeTicks: number;
  /** おしい（F1〜2・早すぎ）の ダメージの 倍率（切り上げ） */
  parryEarlyMul: number;
  /** 受けられる 向き（前から 左右 何度まで） */
  parryArcDeg: number;
  /** スロー（ステップ数・ゲームの時間の倍率） */
  parrySlow: { ticks: number; scale: number };
  /** 青白い光（ステップ） */
  parryGlowTicks: number;
  /** よろけ（ステップ） */
  staggerTicks: number;
  /** よろけ中の 次の一撃の 倍率 */
  staggerDamageMul: number;
  /** はね返した 火の玉（速さ ブロック/秒・とどく きょり・ダメージ = 火の玉の強さ × damageMul） */
  reflectFireball: { speed: number; range: number; damageMul: number };
}

// ---------------------------------------------------------------- WEAPON-7（レジェンダリー武器）

/** ためわざ。`kind` で 中身を 差しかえる（§2.1）。新しい ためわざは `kind` を 1 つ 足す。`shining` は PR3 で 作る */
export type LegendaryCharge =
  | { kind: 'lightning'; chargeTicks: number; range: number; radius: number; damageMul: number; knock: [number, number]; strikeF: number; boltSteps: number; recovery: number }
  | { kind: 'spiral'; chargeTicks: number; launchF: number; recovery: number; speed: number; range: number; radius: number; damageMul: number; knock: [number, number] }
  | { kind: 'shining'; chargeTicks: number; rise: number; riseSteps: number; holdSteps: number; fallSteps: number; radius: number; damageMul: number; hitEvery: number; push: [number, number]; cooldown: number; takenMul: number };
/** ふつうの わざに 足す 効果（見た目・音・弾）。`wave` は PR2 で 作る */
export type LegendaryAttackFx =
  | { kind: 'trail'; style: 'thunder' | 'rainbow' }
  | { kind: 'wave'; speed: number; range: number; radius: number; damageMul: number; knock: [number, number] };
/** 手に 持っている 間の 効果。`moveMul` は PR2 で 作る */
export type LegendaryPassive = { kind: 'moveMul'; mul: number };

export interface LegendaryDef {
  item: ItemId;
  /** 強さ P。[最小, 最大] なら 落ちた ときに 整数で 決めて その 1 本に 保存（PR3） */
  power: number | [number, number];
  /** ためわざ（null = ためない。押しつづけは 今どおり くり返す） */
  charge: LegendaryCharge | null;
  onAttack: LegendaryAttackFx[];
  passive: LegendaryPassive[];
}

export interface NushiDropRow {
  item: ItemId;
  weight: number;
}

export const LEGENDARY_DEFAULTS: readonly LegendaryDef[] = [
  {
    item: 'raijin_ken',
    power: 8,
    charge: { kind: 'lightning', chargeTicks: 60, range: 20, radius: 5, damageMul: 2.0, knock: [2, 4], strikeF: 8, boltSteps: 12, recovery: 40 },
    onAttack: [{ kind: 'trail', style: 'thunder' }],
    passive: [],
  },
  {
    item: 'fujin_ken',
    power: 6,
    // WEAPON-8: 風神剣の ためわざ「らせんの かぜ」（前へ まっすぐ 12 マス・つらぬく・12 ダメージ）
    charge: { kind: 'spiral', chargeTicks: 60, launchF: 6, recovery: 40, speed: 12, range: 12, radius: 1.0, damageMul: 2.0, knock: [3, 1] },
    onAttack: [{ kind: 'wave', speed: 15, range: 5, radius: 0.5, damageMul: 0.3, knock: [0.5, 0] }],
    passive: [{ kind: 'moveMul', mul: 1.2 }],
  },
  {
    item: 'niji',
    power: [4, 10],
    // WEAPON-9 §5.1: 虹。ため 2.5 秒 → シャイニング（うかぶ 40・とどまる 160・おりる 40・もどり 20）。休み 600
    charge: { kind: 'shining', chargeTicks: 150, rise: 2.0, riseSteps: 40, holdSteps: 160, fallSteps: 40, radius: 7, damageMul: 2.5, hitEvery: 60, push: [3, 2], cooldown: 600, takenMul: 1 / 3 },
    onAttack: [{ kind: 'trail', style: 'rainbow' }],
    passive: [],
  },
];

export function cloneLegendary(d: LegendaryDef): LegendaryDef {
  return {
    item: d.item,
    power: Array.isArray(d.power) ? ([...d.power] as [number, number]) : d.power,
    charge: d.charge
      ? d.charge.kind === 'lightning' || d.charge.kind === 'spiral'
        ? { ...d.charge, knock: [...d.charge.knock] as [number, number] }
        : { ...d.charge, push: [...d.charge.push] as [number, number] }
      : null,
    onAttack: d.onAttack.map((a) => (a.kind === 'wave' ? { ...a, knock: [...a.knock] as [number, number] } : { ...a })),
    passive: d.passive.map((p) => ({ ...p })),
  };
}

export interface BladeTrailStyle {
  /** 軌跡の色 */
  color: number;
  /** 軌跡の そとの光 */
  glow: number;
  /** キャラの絵の 刃の地（色見本の 20 番を これに） */
  blade: number;
  /** 刃の ふちの光（21 番を これに） */
  bladeShine: number;
  /** plain=ふつう・star=星が まじる・long=長い 弧・thunder=ふちに 小さな いなずま（雷神剣） */
  style: 'plain' | 'star' | 'long' | 'thunder';
}

/** CHAR-4 §4.4: 軌跡の 形・だん・消え方 */
export interface BladeTrailShape {
  widthRatio: number;
  minWidth: number;
  lifeSteps: number;
  segPerStep: number;
  maxSegs: number;
  bandEdges: [number, number, number];
  bandAlpha: [number, number, number, number];
  fadeAges: [number, number, number];
  starAt: [number, number, number];
  starMaxAge: number;
}

export const W2_SETTING_DEFAULTS: Readonly<W2Settings> = {
  bladeTech: {
    thrust: { startup: 4, active: 2, recovery: 35 },
    kesa: { startup: 28, active: 6, recovery: 72 },
    kiriage: { startup: 19, active: 3, recovery: 30 },
  },
  stanceSwitchTicks: 8,
  bladeBufferTicks: 8,
  bladeMoveMul: { thrust: 0, kesaStartupActive: 0, kesaRecovery: 0, kiriage: 0 },
  bladeAdvance: {
    thrust: { ticks: [2, 2, 1, 1, 3, 11, 4, 4, 4, 4, 5], advance: [0, 0.08, 0.255, 0.26, 0.29, 0.32, 0.285, 0.241, 0.16, 0.073, 0.002], step: 0 },
    kesa: { ticks: [4, 4, 6, 5, 4, 5, 2, 2, 2, 5, 28, 8, 8, 8, 8, 7], advance: [0, 0, 0, 0.02, 0.04, 0.08, 0.4, 1.4, 2.4, 3.1, 3.1, 3.1, 3.1, 3.1, 3.1, 3.1], step: 3.1 },
    kiriage: { ticks: [3, 4, 6, 3, 3, 1, 2, 7, 6, 5, 4, 4, 4], advance: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], step: 0 },
  },
  bladeCombo: {
    items: ['crystal_katana', 'raijin_ken', 'fujin_ken', 'niji'],
    order: { chudan: ['thrust', 'kiriage', 'kesa'], gedan: ['kiriage', 'thrust', 'kesa'], jodan: ['kesa'] },
    stepStartup: { thrust: 4, kiriage: 12, kesa: 20 },
    follow: { thrust: 14, kiriage: 12, kesa: 12 },
    step2Advance: {
      kiriage: { ticks: [3, 4, 6, 3, 3, 1, 2, 7, 6, 5, 4, 4, 4], advance: [0, 0, 0, 0.1, 0.4, 1.0, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4], step: 1.4 },
      thrust: { ticks: [2, 2, 1, 1, 3, 11, 4, 4, 4, 4, 5], advance: [0, 0.5, 1.1, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4, 1.4], step: 1.4 },
    },
  },
  bladeAimReach: 4.5,
  bladeReach: { bokuto: 2.2, katana: 2.2, crystal_katana: 2.2, raijin_ken: 2.2, fujin_ken: 2.2, niji: 2.2 },
  bladeShape: {
    thrust: { length: 2.2, radius: 0.2 },
    kesa: { halfAngleDeg: 75, rMin: 0.3, rMax: 2.2, yMin: -0.5, yMax: 2.6 },
    kiriage: { halfAngleDeg: 45, rMin: 0.3, rMax: 2.2, yMin: -0.3, yMax: 6.0 },
  },
  bladeDamageMul: { thrust: 0.75, kiriage: 1.15, kesa: 2.5 },
  bladeKnock: { thrust: [0.8, 0], kesa: [6, 3], kiriage: [1.0, 7] },
  bowStageTicks: [10, 25, 40],
  bowSpeed: [12, 20, 28],
  bowDamage: [1, 2, 3],
  bowKnock: [0.5, 1.0, 1.5],
  arrowGravity: 20,
  arrowLifeTicks: 600,
  bowNockTicks: 10,
  arrowStuckTicks: 1800,
  arrowStuckMax: 32,
  arrowPickupRange: [1.2, 2],
  bowMoveMul: 0.5,
  bowBend: { pull: [0.4, 0.7, 1.0], bendDeg: [12, 22, 32], blendTicks: 6 },
  toolDurability: {
    wood_pickaxe: 59,
    stone_pickaxe: 131,
    iron_pickaxe: 250,
    wood_axe: 59,
    stone_axe: 131,
    iron_axe: 250,
    bokuto: 59,
    katana: 250,
    naginata: 250,
    crystal_katana: 400,
    yumi: 384,
    kuwa: 131,
    kabuto: 165,
    yoroi: 240,
    kote: 225,
    suneate: 195,
    raijin_ken: 10000, // WEAPON-7 §2.4: つくれず ヌシでしか 手に 入らない 武器だけの 例外
    fujin_ken: 10000,
    niji: 10000,
  },
  toolWear: {
    pickaxe: { block: 1, hit: 2 },
    blade: { block: 2, hit: 1 },
    bow: { shot: 1 },
    kuwa: { till: 1, block: 2, hit: 2 },
    armorDiv: 4,
  },
  wearLowRatio: 0.1,
  legendary: LEGENDARY_DEFAULTS as LegendaryDef[],
  nushiDrops: LEGENDARY_DEFAULTS.map((d) => ({ item: d.item, weight: 1 })),
  legendaryChargeWalk: 0.5,
  nijiTestPower: 7,
  shiningCamDistance: 14,
  bladeTrail: {
    bokuto: { color: 0x9c6b3a, glow: 0xe8c08a, blade: 0xb98b54, bladeShine: 0xe0bc86, style: 'plain' },
    katana: { color: 0xe8f1fa, glow: 0xffffff, blade: 0xc8cdd8, bladeShine: 0xffffff, style: 'plain' },
    crystal_katana: { color: 0x7fdcff, glow: 0xe6faff, blade: 0x6fcdf5, bladeShine: 0xe6faff, style: 'star' },
    naginata: { color: 0xcfe8ff, glow: 0xffffff, blade: 0xb8cce0, bladeShine: 0xeef6ff, style: 'long' },
    // WEAPON-7: 雷神剣。刃は むらさき（0xb070ff 系）、軌跡は 白〜うすい 黄（雷 v4 の 色）
    raijin_ken: { color: 0xfff6c0, glow: 0xffffff, blade: 0xb070ff, bladeShine: 0xe6d2ff, style: 'thunder' },
    // WEAPON-7 PR2: 風神剣。ふつうの 斬撃の 形（plain）で 白〜みずいろ
    fujin_ken: { color: 0xe6f8ff, glow: 0xffffff, blade: 0xcfefff, bladeShine: 0xffffff, style: 'plain' },
    niji: { color: 0xd16be6, glow: 0xffffff, blade: 0xc3cee2, bladeShine: 0x5fd98e, style: 'plain' },
  },
  bladeFaceAssistDeg: 30,
  thrustTiltMaxDeg: 45,
  punchShape: { halfAngleDeg: 45, yMin: -0.5, yMax: 3.0 },
  bladeTrailShape: {
    widthRatio: 0.45,
    minWidth: 0.1,
    lifeSteps: 9,
    segPerStep: 6,
    maxSegs: 36,
    bandEdges: [1 / 6, 1 / 2, 5 / 6],
    bandAlpha: [1, 0.85, 0.5, 0.22],
    fadeAges: [2.25, 4.5, 6.75],
    starAt: [0.25, 0.55, 0.85],
    starMaxAge: 8.55,
  },
  bladeTrailWindow: { thrust: [2, 6], kesa: [28, 34], kiriage: [19, 22] },
  parryTicks: { ready: 2, guard: 18, recover: 20 },
  parryEarlyTicks: 12,
  parryKimeTicks: 8,
  parryEarlyMul: 0.5,
  parryArcDeg: 90,
  parrySlow: { ticks: 6, scale: 0.25 },
  parryGlowTicks: 20,
  staggerTicks: 90,
  staggerDamageMul: 2,
  reflectFireball: { speed: 10, range: 8, damageMul: 1 },
};

/** 設定の 入れ物を作る（毎回 ふかい コピー。つなぎ込みが `createSettingsHook` の extras に渡す） */
export function createW2Settings(): W2Settings {
  const d = W2_SETTING_DEFAULTS;
  return {
    bladeTech: {
      thrust: { ...d.bladeTech.thrust },
      kesa: { ...d.bladeTech.kesa },
      kiriage: { ...d.bladeTech.kiriage },
    },
    stanceSwitchTicks: d.stanceSwitchTicks,
    bladeBufferTicks: d.bladeBufferTicks,
    bladeMoveMul: { ...d.bladeMoveMul },
    bladeAdvance: {
      thrust: { ...d.bladeAdvance.thrust, ticks: [...d.bladeAdvance.thrust.ticks], advance: [...d.bladeAdvance.thrust.advance] },
      kesa: { ...d.bladeAdvance.kesa, ticks: [...d.bladeAdvance.kesa.ticks], advance: [...d.bladeAdvance.kesa.advance] },
      kiriage: { ...d.bladeAdvance.kiriage, ticks: [...d.bladeAdvance.kiriage.ticks], advance: [...d.bladeAdvance.kiriage.advance] },
    },
    bladeCombo: {
      items: [...d.bladeCombo.items],
      order: { chudan: [...d.bladeCombo.order.chudan], gedan: [...d.bladeCombo.order.gedan], jodan: [...d.bladeCombo.order.jodan] },
      stepStartup: { ...d.bladeCombo.stepStartup },
      follow: { ...d.bladeCombo.follow },
      step2Advance: Object.fromEntries(
        Object.entries(d.bladeCombo.step2Advance).map(([k, v]) => [k, { ...v, ticks: [...v.ticks], advance: [...v.advance] }]),
      ) as BladeComboSettings['step2Advance'],
    },
    bladeAimReach: d.bladeAimReach,
    bladeReach: { ...d.bladeReach },
    bladeShape: {
      thrust: { ...d.bladeShape.thrust },
      kesa: { ...d.bladeShape.kesa },
      kiriage: { ...d.bladeShape.kiriage },
    },
    bladeDamageMul: { ...d.bladeDamageMul },
    bladeKnock: { thrust: [...d.bladeKnock.thrust], kesa: [...d.bladeKnock.kesa], kiriage: [...d.bladeKnock.kiriage] },
    bowStageTicks: [...d.bowStageTicks],
    bowSpeed: [...d.bowSpeed],
    bowDamage: [...d.bowDamage],
    bowKnock: [...d.bowKnock],
    arrowGravity: d.arrowGravity,
    arrowLifeTicks: d.arrowLifeTicks,
    bowNockTicks: d.bowNockTicks,
    arrowStuckTicks: d.arrowStuckTicks,
    arrowStuckMax: d.arrowStuckMax,
    arrowPickupRange: [...d.arrowPickupRange],
    bowMoveMul: d.bowMoveMul,
    bowBend: { pull: [...d.bowBend.pull], bendDeg: [...d.bowBend.bendDeg], blendTicks: d.bowBend.blendTicks },
    toolDurability: { ...d.toolDurability },
    toolWear: {
      pickaxe: { ...d.toolWear.pickaxe },
      blade: { ...d.toolWear.blade },
      bow: { ...d.toolWear.bow },
      kuwa: { ...d.toolWear.kuwa },
      armorDiv: d.toolWear.armorDiv,
    },
    wearLowRatio: d.wearLowRatio,
    legendary: d.legendary.map(cloneLegendary),
    nushiDrops: d.nushiDrops.map((r) => ({ ...r })),
    legendaryChargeWalk: d.legendaryChargeWalk,
    nijiTestPower: d.nijiTestPower,
    shiningCamDistance: d.shiningCamDistance,
    bladeTrail: Object.fromEntries(Object.entries(d.bladeTrail).map(([k, v]) => [k, { ...v }])) as W2Settings['bladeTrail'],
    bladeFaceAssistDeg: d.bladeFaceAssistDeg,
    thrustTiltMaxDeg: d.thrustTiltMaxDeg,
    punchShape: { ...d.punchShape },
    bladeTrailShape: {
      ...d.bladeTrailShape,
      bandEdges: [...d.bladeTrailShape.bandEdges],
      bandAlpha: [...d.bladeTrailShape.bandAlpha],
      fadeAges: [...d.bladeTrailShape.fadeAges],
      starAt: [...d.bladeTrailShape.starAt],
    },
    bladeTrailWindow: { thrust: [...d.bladeTrailWindow.thrust], kesa: [...d.bladeTrailWindow.kesa], kiriage: [...d.bladeTrailWindow.kiriage] },
    parryTicks: { ...d.parryTicks },
    parryEarlyTicks: d.parryEarlyTicks,
    parryKimeTicks: d.parryKimeTicks,
    parryEarlyMul: d.parryEarlyMul,
    parryArcDeg: d.parryArcDeg,
    parrySlow: { ...d.parrySlow },
    parryGlowTicks: d.parryGlowTicks,
    staggerTicks: d.staggerTicks,
    staggerDamageMul: d.staggerDamageMul,
    reflectFireball: { ...d.reflectFireball },
  };
}

// ================================================================ CRAFT-2（たんす の 素材・ログ・半透明）
// 担当の割り振り: docs/tickets/CRAFT-2-dev.md。仕様: docs/design/CRAFT-2.md

export interface TansuPos {
  x: number;
  y: number;
  z: number;
}

/** つくる・やく で 使った（使う予定の）素材。持ち物と たんす ごと */
export interface MaterialUse {
  inv: { item: ItemId; count: number }[];
  tansu: (TansuPos & { item: ItemId; count: number })[];
}

/** `CraftSystem.sources` の返り値（§6.1 `craft.sources`） */
export interface MaterialSources extends MaterialUse {
  ok: boolean;
  missing: { item: ItemId; count: number }[];
}

/** たんす の 中身を 数える・取り出す口（A が `StorageSystem` に実装。B・C は使わない） */
export interface TansuMaterialStore {
  /** そこの たんす に item が 全部で何こ あるか（たんす でなければ 0） */
  countItem(x: number, y: number, z: number, item: ItemId): number;
  /** そこの たんす から item を 最大 count こ 取り出して 取れた数を返す（うしろのマス 53 → 0 の順に。仕様 §2.3） */
  takeItem(x: number, y: number, z: number, item: ItemId, count: number): number;
}

/** §2.7 のカテゴリー 6 つ */
export type LogCategory = 'pickup' | 'craft' | 'fight' | 'achieve' | 'info' | 'warn';

/** §6.1 `log.history()` の kind 12 種 */
export type LogKind =
  | 'pickup'
  | 'fromTansu'
  | 'craft'
  | 'bakeStart'
  | 'signal'
  | 'farmHint'
  | 'wearLow'
  | 'wearBroken'
  | 'defeat'
  | 'home'
  | 'achievement'
  | 'level';

export interface LogEntry {
  tick: number;
  kind: LogKind;
  category: LogCategory;
  item: ItemId | null;
  count: number | null;
  text: string;
  /** kind が fromTansu のとき */
  positions?: (TansuPos & { count: number })[];
}

/** 画面の不透明度（§2.8。下限・0〜1 を通したあとの 今の値） */
export interface UiAlpha {
  panel: number;
  hud: number;
  scrim: number;
  min: number;
}

/** §4 の設定（`settings.get/set` の名前そのまま）。初期値は `CRAFT2_SETTING_DEFAULTS`。`craftTansuRange` は 使える たんす の きょり（かすみ `fogFar` とは つなげない） */
export interface Craft2Settings {
  logHistoryMax: number;
  logMergeTicks: number;
  logScrollRows: number;
  uiPanelAlpha: number;
  uiHudAlpha: number;
  uiScrimAlpha: number;
  uiAlphaMin: number;
  craftTansuRange: number;
}

export const CRAFT2_SETTING_DEFAULTS: Readonly<Craft2Settings> = {
  logHistoryMax: 100,
  logMergeTicks: 180,
  logScrollRows: 3,
  uiPanelAlpha: 0.8,
  uiHudAlpha: 0.6,
  uiScrimAlpha: 0.2,
  uiAlphaMin: 0.6,
  craftTansuRange: 40,
};

export function createCraft2Settings(): Craft2Settings {
  return { ...CRAFT2_SETTING_DEFAULTS };
}

// ================================================================ LIVE-1（にわとり）
// 仕様: docs/design/LIVE-1.md。担当の割り振り: docs/tickets/LIVE-1-dev-split.md

export type AnimalKind = 'chicken';
export type AnimalState = 'appear' | 'wander' | 'rest' | 'look' | 'eat' | 'pet' | 'lay' | 'cheer' | 'follow' | 'idle'
  // LIVE-1 版 3.2
  | 'full' | 'carried' | 'putDown';
/**
 * 合図（§3.1・§6.1）。窓口 `animals.lastHint()` の 型 と 同じ（`AnimalWindowHint` を 統合）。
 */
export type AnimalHintKind = AnimalWindowHint;
export type AnimalRemoveReason = 'far' | 'void' | 'buried';

/** `animals.events()` の出来事（§6.1） */
export type AnimalEvent =
  | { type: 'spawn'; id: number; x: number; y: number; z: number }
  | { type: 'remove'; id: number; reason: AnimalRemoveReason }
  | { type: 'feed'; id: number; item: ItemId; hearts: number; friend: boolean }
  | { type: 'friend'; id: number; first: boolean; count: number }
  | { type: 'pet'; id: number; friend: boolean }
  | { type: 'egg'; id: number; x: number; y: number; z: number }
  | { type: 'warp'; id: number; from: Vec3; to: Vec3 }
  | { type: 'hint'; hint: AnimalHintKind }
  // 版 3.2（§6.1）
  | { type: 'full'; id: number }
  | { type: 'followEnd'; id: number }
  | { type: 'carry'; id: number }
  | { type: 'putDown'; id: number; x: number; y: number; z: number }
  | { type: 'swing'; x: number; y: number; z: number; caught: boolean; reason: SwingReason }
  | { type: 'bugCatch'; toInventory: boolean }
  /** 版 3.2: はじめて の お祝い が おわった（記録 `carry:*` が 0 の あいだ）。つなぎ込み が 合図 `carryHint` に する */
  | { type: 'carryHint' };

/** `animals.list()` の 1 行 */
export interface AnimalInfo {
  id: number;
  kind: AnimalKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  friend: boolean;
  hearts: 0 | 1 | 2;
  state: AnimalState;
  lookingAtPlayer: boolean;
  inWater: boolean;
  // ---- 版 3.2（§6.1）
  /** ついてくる 残り ステップ（なかま） */
  follow: number;
  /** おなかいっぱい の 残り ステップ */
  fullLeft: number;
  carried: boolean;
  fluttering: boolean;
  /** 上下 の 速さ（下 が 負、マス/秒） */
  vy: number;
}

export interface AnimalSpawnOpts {
  friend?: boolean;
  hearts?: 0 | 1 | 2;
  // ---- 版 3.2（§6.1）
  follow?: number;
  fullLeft?: number;
}

/** 版 3.2 の 合図 8 つ（§3.1。`animals.lastHint()` の 型） */
export type AnimalWindowHint =
  | 'feedHint' | 'fullHint' | 'friendFull' | 'treeEmpty' | 'netHint' | 'carryHint' | 'carryWild' | 'cantPutHere';

/** あみ の 結果 の わけ（§6.1 `swing`） */
export type SwingReason = 'chance' | 'pity' | 'empty' | 'miss';
export interface SwingResult {
  caught: boolean;
  reason: SwingReason;
}

/** `animals.fx()` の 1 わ ぶん の しるし（§6.1。版 2 の `progress` を おきかえる） */
export interface AnimalMark {
  id: number;
  hearts?: number;
  steps?: number;
  full: boolean;
}
export interface AnimalFxRecord {
  hearts: number;
  burst: number;
  confetti: number;
  puff: number;
  sparkle: number;
  leaf: number;
  marks: AnimalMark[];
}

/** §4.1 の設定（`settings.get/set` の名前そのまま）。初期値は `LIVE_SETTING_DEFAULTS` */
export interface LiveSettings {
  animalAutoSpawn: boolean;
  animalSpawnInterval: number;
  animalWildMax: number;
  animalSpawnMinDist: number;
  animalSpawnMaxDist: number;
  animalRemoveDist: number;
  animalWanderSpeed: number;
  animalLookDist: number;
  animalFriendFeeds: number;
  animalFriendMax: number;
  animalReactTicks: number;
  animalEggDelay: number;
  animalEggHeal: number;
  animalFollowStart: number;
  animalFollowStop: number;
  animalFollowSpeed: number;
  animalWarpDist: number;
  animalStuckTicks: number;
  // ---- 版 3.2 の 11 こ（§4.1）
  animalFollowTicks: number;
  animalFullTicks: number;
  animalEggChance: number;
  animalEggPity: number;
  bugChance: number;
  bugPity: number;
  bugTreeCooldown: number;
  bugTreeRadius: number;
  netSwingTicks: number;
  carryHoldTicks: number;
  animalFlutterFallSpeed: number;
}

export const LIVE_SETTING_DEFAULTS: Readonly<LiveSettings> = {
  animalAutoSpawn: true,
  animalSpawnInterval: 600,
  animalWildMax: 3,
  animalSpawnMinDist: 16,
  animalSpawnMaxDist: 40,
  animalRemoveDist: 64,
  animalWanderSpeed: 1.0,
  animalLookDist: 6,
  animalFriendFeeds: 3,
  animalFriendMax: 8,
  animalReactTicks: 30,
  animalEggDelay: 60,
  animalEggHeal: 2,
  animalFollowStart: 4,
  animalFollowStop: 2.5,
  animalFollowSpeed: 4.0,
  animalWarpDist: 16,
  animalStuckTicks: 120,
  animalFollowTicks: 18000,
  animalFullTicks: 600,
  animalEggChance: 0.25,
  animalEggPity: 7,
  bugChance: 1 / 3,
  bugPity: 2,
  bugTreeCooldown: 1800,
  bugTreeRadius: 4,
  netSwingTicks: 20,
  carryHoldTicks: 40,
  animalFlutterFallSpeed: 2.0,
};

export function createLiveSettings(): LiveSettings {
  return { ...LIVE_SETTING_DEFAULTS };
}

/** A -> B: 描く 1 わ ぶん（§7 約束 3。B は A を import しない） */
export interface AnimalView {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  headYaw: number;
  state: AnimalState;
  stateTicks: number;
  friend: boolean;
  hearts: 0 | 1 | 2;
  /** 今 ねらわれて いる（しるし を 出す） */
  targeted: boolean;
  // ---- 版 3.2（B が 描くために 読む。A が forEachVisible で 埋める。ない ときは 0／false）
  /** ついてくる 残り ステップ（なかま） */
  follow?: number;
  /** おなかいっぱい の 残り ステップ */
  fullLeft?: number;
  /** だっこ されて いる（描く 位置 は B が プレイヤー の 前 に 置く） */
  carried?: boolean;
  /** パタパタ おりて いる（空中 で 下 へ） */
  fluttering?: boolean;
}

/** A の口（C の ふりわけ・B の 描画・窓口 が 使う。§7 約束 2・3） */
export interface AnimalApi {
  /** ねらう 箱（横 0.8×0.8・高さ 1.0）との 当たり。C が ブロック の 当たり と くらべる */
  rayHit(origin: Vec3, dir: Vec3, maxDist: number): { id: number; distance: number } | null;
  /** null = 動き の とちゅう で 何も しない */
  preview(id: number, held: ItemStack | null): 'feed' | 'animalFull' | 'animalPet' | null;
  /** 版 3.2（C が 足した）: なかま か。なかま は 右クリック を はなす か 40 おしつづける まで 何も しない（§2.3・§2.8）。なければ やせい あつかい */
  isFriend?(id: number): boolean;
  /** 版 3.2（C が 足した）: C から の 合図（treeEmpty・netHint・cantPutHere・carryWild・fullHint・friendFull・feedHint）を 出来事 `hint` と `lastHint()` に 入れる */
  emitHint?(h: AnimalHintKind): void;
  /** 'ate' の とき だけ C が むし を 1 へらす。'full' = おなかいっぱい、'pet' = なでる に なった、'friendFull' = なかま が 8 わ */
  feed(id: number, item: ItemId): 'ate' | 'full' | 'pet' | 'friendFull' | null;
  pet(id: number): 'wild' | 'friend' | null;
  /** 版 3.2: おなかいっぱい か（テスト・確認用。照準 の 下 の `まってね` は `preview` が 'animalFull' を 返す） */
  isFull?(id: number): boolean;
  /** 版 3.2: あみ を ふる（block = ねらって いる ブロック）。くじ は A */
  swingNet(block: Vec3): SwingResult;
  /** 版 3.2: 押しつづけ（heldTicks）。'lifted' = だっこ した、'wait' = まだ、'wild' = やせい は だっこ できない、null = 何も しない */
  carryHold(id: number, heldTicks: number): 'lifted' | 'wait' | 'wild' | null;
  /** 版 3.2: おろす（spot = 足もと の 位置）。おろせたら true */
  putDown(spot: Vec3): boolean;
  /** だっこ している id か null */
  carrying(): number | null;
  forEachVisible(fn: (v: AnimalView) => void): void;
}

/** A が 外から 受け取る 物（にせ の 世界・時刻・dropEgg で ユニット できる。§7 約束 4・5） */
export interface AnimalDeps {
  seed: number;
  settings?: LiveSettings;
  dropEgg(at: Vec3): void;
  /** 版 3.2: 持ち物 に 入れる。入らなければ 落として false（むし） */
  addItem(item: ItemId): boolean;
  /** 版 3.2: もう だっこ した ことが ある か（記録 `carry:*` ＞ 0）。`carryHint` を 出すか の 判定 */
  carriedBefore?(): boolean;
  day(): number;
  phase(): DayPhase;
  countryAt(seed: number, x: number, z: number): { kind: string };
}
