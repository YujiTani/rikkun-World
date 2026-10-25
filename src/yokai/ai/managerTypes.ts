import type {
  ArmorSlot,
  BlockId,
  Inventory,
  ItemId,
  LightField,
  PlayerCombat,
  PlayerState,
  TimeOfDay,
  ItemStack,
  Vec3,
  VoxelWorld,
  YokaiEvent,
  YokaiKind,
  YokaiTitle,
  W2Settings,
} from '../../contracts';
import type { StaggerBy } from '../stagger';
import type { StrengthLevel } from '../stats';
import type { YokaiRow } from '../countryPick';
import type { YokaiConfig } from './config';


/** テストの窓口用の出来事（画面用の YokaiEvent に、消えた・ドロップを足したもの） */
export type HookYokaiEvent =
  | YokaiEvent
  | { type: 'remove'; tick: number; id: number; kind: YokaiKind; position: Vec3 }
  | { type: 'drop'; tick: number; id: number; kind: YokaiKind; item: ItemId; count: number; added: number };

/** プレイヤーの位置と向きだけがあればよい */
export type PlayerLike = Pick<PlayerState, 'position'>;

export interface YokaiManagerOptions {
  world: VoxelWorld;
  time: TimeOfDay;
  /** 足もとの中央 */
  getPlayer: () => PlayerLike;
  combat: PlayerCombat;
  inventory: Inventory;
  /** あれば ドロップを地面にばらまく（なければ そのまま持ち物に入れる）。`DropField` がそのまま使える */
  drops?: {
    scatter(position: Vec3, stacks: ItemStack[], opts?: { kind?: 'death' | 'yokai' }): number;
  };
  /** 出来事に付ける「ゲームの何ステップ目か」。なければ update を呼んだ回数 */
  tick?: () => number;
  seed?: number;
  /** GOLD-1 §4.7: 妖怪 の 足もと の 高さ → はらぱんみみず が おちる か（`createHarapanRoll().yokai`） */
  harapan?: (y: number) => boolean;
  /** START-1: つよさ（その 世界の 妖怪の 体力・攻撃力に かける。なければ ふつう） */
  strength?: StrengthLevel;
  config?: YokaiConfig;
  /** 光（M4）。あれば 出現は「暗い所」、明るさは足もとの光。なければ 時刻だけで決める */
  light?: Pick<LightField, 'level'> & {
    isDarkForSpawn(x: number, y: number, z: number): boolean;
    brightness(x: number, y: number, z: number): number;
  };
  /** 足もとの光の下限（人形の明るさ）。既定は LIGHT_CONFIG.yokaiMin（#76 で 0。光らせない） */
  lightMin?: number;
  /** プレイヤーが妖怪をたおした（経験値用。xp = 場所の倍率 M と二つ名を入れた数） */
  onDefeat?: (kind: YokaiKind, info: DefeatInfo) => void;
  /** あれば、妖怪が出てよい (x, z) か聞く（VOX-D: つなぎ込みが「描く輪のメッシュずみの列」を渡す。無ければ 読みこんでいる列ならどこでも） */
  canSpawnAt?: (x: number, z: number) => boolean;
  /** はじまりの場所（水平）。世界の設定から読む。複数なら いちばん近い所から d をはかる。省くと (0, 0) */
  origin?: () => { x: number; z: number } | readonly { x: number; z: number }[];
  /** 海面の高さ。世界の設定（contracts の SEA_Y）。省くと SEA_Y */
  seaY?: () => number;
  /** ブロックがこわれた・石になった（くだけるつぶ・音用。1 回の出来事ぶんをまとめて渡す） */
  onBlocks?: (cells: { x: number; y: number; z: number; from: BlockId; to: BlockId }[], why: 'crush' | 'stone') => void;
  /** NINJA-1: 着ている 防具を 聞く 入り口（忍び装束の とき 気づく 距離が 半分）。なければ 何も 着て いない */
  armor?: { equipped(slot: ArmorSlot): ItemId | null };
  /** SAMURAI-1 §4.2: 侍帳（手に 入れた ことの ある 侍装備）と 今 持って いる 物。ヌシの 表で 選べない 侍装備の 行を とばす ため。なければ 帳は 空・何も 持って いない */
  samurai?: () => { book: readonly ItemId[]; have: readonly ItemId[] };
  /** WEAPON-5: 設定の入れ物（よろけ・はね返し。WEAPON-7: ヌシの ドロップ表 `nushiDrops`。なければ 初期値） */
  settings?: W2Settings;
  /**
   * WEAPON-7 §2.3・§2.6 (2): ヌシから レジェンダリーの 袋が 出た（テロップ・音の 合図。袋を 出した ステップに 呼ぶ）。
   * `added` = 持ち物に 入った 数（`drops` が ないとき）
   */
  onLegendDrop?: (info: { item: ItemId; yokaiId: number; kind: YokaiKind; position: Vec3 }) => void;
  /** WEAPON-5: パリィ。妖怪の攻撃・火の玉が プレイヤーに当たる直前に聞く（なければ 今のまま） */
  parry?: YokaiParryPort;
  /** WEAPON-9: シャイニングの ドームの 球（なければ null）。火の玉などの 弾は ふれた ステップに 消える */
  dome?: () => { x: number; y: number; z: number; r: number } | null;
  /** WEAPON-9: 弾が ドームで 消えた（弾の id） */
  onDomeErase?: (projectileId: number) => void;
  /** COUNTRY-1 §3.3: (x, z) の 国の kind を 聞く（つなぎ込みは countryAt を わたす。なければ いつも はらっぱ） */
  countryOf?: (x: number, z: number) => string;
  /** COUNTRY-1 §3.3: 国の表（kind と 妖怪の重み）。なければ 12 国の表 */
  countryTable?: readonly { kind: string; yokai: YokaiRow }[];
  /** WEAPON-5: よろけ・2 倍・はね返しが当たった 出来事を パリィの 出来事の 列へ */
  onParryEvent?: (e: { type: 'stagger' | 'staggerDouble' | 'reflectHit'; yokaiId: number; by?: StaggerBy; damage?: number }) => void;
}

/** パリィの 答え（`createParry().hit` と 同じ形のうち 使う分） */
export interface YokaiParryVerdict {
  result: 'success' | 'early' | 'fail' | 'none';
  /** early のとき 半分にした 数 */
  amount: number;
}

export interface YokaiParryPort {
  /** dirDeg = プレイヤーの足もとから 来た向き（0 = 北。null = 真上・真下）。amount = 元のダメージ */
  hit(h: { by: 'attack' | 'fireball'; yokaiId: number | null; dirDeg: number | null; amount: number }): YokaiParryVerdict;
}

/** 飛んでいる 火の玉の 見た目の 情報（テストの窓口 `yokai.fireballList()`） */
export interface FireballView {
  position: Vec3;
  dir: Vec3;
  speed: number;
  reflected: boolean;
  owner: number;
}

/** たおした妖怪の 経験値・二つ名（onDefeat に渡す） */
interface DefeatInfo {
  xp: number;
  title: YokaiTitle;
  m: number;
}

export interface SpawnOptions {
  /** false なら動かない・攻撃しない（たたかれる・押される・たおれるはする） */
  ai?: boolean;
  yawDeg?: number;
  /** 二つ名を決めて出す（テスト用。省くと なし。たいしょう・ヌシ は 1 体まで） */
  title?: YokaiTitle;
  /** 場所の倍率を決めて出す（テスト用。省くと 1。'auto' なら 自動の出現と同じに 出た場所から決める） */
  m?: number | 'auto';
}

/** 登場のおしらせ（画面の上のまん中） */
export interface AnnounceInfo {
  text: string;
  icon: 'taisho' | 'nushi';
  ticksLeft: number;
}
