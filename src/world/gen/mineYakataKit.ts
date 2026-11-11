import { createMineHook } from './mineHook';
import { type BokenShaft, type MineHookE } from './mineBokenKit';
import { SEEDS_20, type OldCols, type PathCell, type Pt, type Tier } from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * MINE-1F（docs/design/MINE-1F.md §4・§6.1・受け入れ基準 F1〜F21）の テスト用の 道具。ゲームの 外〔テスト〕だけで 使う。
 *
 *   ・窓口 `Shaft.yakata`・`yakataRolls`・`yakataTable`・`yakataFoes`・`yakataState`・`yakataPlanFor` の 型〔仕様 §6.1 の とおり〕
 *   ・やかたを あつめる `yakataSample`〔くじ・形〕・計画の 標本 `rollSample`〔くじ〕
 *   ・1E の kit〔mineBokenKit.ts〕の 上に 足す。1E の 窓口〔`shafts`・`shaftPath`・`chestTable`・`saveGens`・`oldCols`・`isOld`〕は そのまま 使う
 *
 * 【自分で 決めた 名前・約束】 developer は これに 合わせる〔ちがう 形に した ときは、この 1 か所を 直す〕:
 *   ・**座標の きまり**〔どれも 足の y。`Pt`・`Rect` の y は 足の マスの y ＝ 足の 下の ブロックが 床〕:
 *       `hall` ＝ 大広間の 床〔17×17。`y` ＝ 立つ 足の y〕。かべ・天井〔あつさ 1〕は `hall` の 外がわ 1 マス・天井は 床から `hall.height` の 上。その 外がわ `ring` マスは ふつうの いし
 *       `gate` ＝ 門の 12 マスの 横の はんい〔かべの 面。x0..x1・z0..z1 の どちらかが 1 マス〕。縦は `y` から `gate.height` マス。`gate` の 面は `hall` の かべの 面の 1 マス
 *       `altar` ＝ 祭壇の 下の 段の 上〔7×5〕の はんい。`y` ＝ 下の 段の 上に 立つ 足の y ＝ `hall.y + 1`。上の 段〔5×3〕は 下の 段の まん中で、立つ 足の y は `altar.y + 1`
 *       `passage` ＝ あやしい 横穴の 中央の 足の マスの 並び〔口 → 門の 前。長さ ＝ `passage.length`。いつも 同じ 向き・同じ y〕。口の 1 マス目は 本道・ひろばの かべの 穴
 *       `chest.cells` ＝ 宝箱の 2 マス〔上の 段の 上。足の y ＝ `altar.y + 1`〕・`chest.front` ＝ 前〔門の ほう〕
 *       `spawns[].at` ＝ 妖怪の 足の マス〔大広間の 床の 上〕
 *   ・**やかたの ブロック** ＝ `yakataTable().lookBlocks[look]` の 4 つ〔`kabe`・`yuka`・`dan`・`taimatsu`〕。id は developer が 決める〔テストは 表から 読む〕
 *   ・`caveAt(x, y, z) === 'yakata'` ＝ あやしい 横穴・大広間〔の 空気〕・祭壇〔の 上〕。`shaftPath` の `part: 'yakata'` ＝ あやしい 横穴・大広間・祭壇の 上の 足の マス
 *   ・**古い 列の 一覧**: `OldCols.yakata`〔1F の 一覧。colKey の 集まり〕。保存の 版の 名前は `Gens.YAKATA_GEN`〔8〕・`SaveManager.YAKATA_GEN`・窓口 `oldCols('yakata')`・`isOld('yakata', cx, cz)`・
 *       `saveGens().yakata`・`StreamRestore.oldCols.yakata`〔`mine1fSave.test.ts`〕
 *   ・**挑戦の 係**〔`createMineHook({ seed, world, chest, yakata: YakataPorts })`〕。`h.open(x, y, z, who = 1)` ＝ 右クリック〔宝箱の どちらの マスでも。`who` は あける 人〕。
 *       `h.yakataStep()` ＝ ゲームの 1 ステップ〔毎ステップ 1 回。妖怪の 更新の あと〕。かち・まけ・消えた 妖怪の 数えは ここで ポートを 見て 決める〔`YakataPorts`〕
 *   ・`h.yakataLocked(x, y, z): boolean` ＝ やかたの ブロックが 今 こわせないか〔まだ・挑戦の 間の やかたの ブロックと ふさいだ かべ ＝ true。かった あと・ほかの マス ＝ false〕。
 *       DigSystem の つなぎ: `new DigSystemImpl(..., { yakata: { locked } })`・`DigBlockedReason` に 'yakata'・ログの しらせ `LogSignal` 'yakataLocked'〔`src/dig/mineYakata.test.ts`〕
 *   ・YokaiManager: `spawn(kind, x, y, z, { title, free: true, graceSteps })`〔`SpawnOptions` に `free`・`graceSteps` を 足す〕・`YokaiManagerOptions.quietFor?: (who) => boolean`〔true の 人の まわりでは 自動の 出現の ためしを しない〕・
 *       `noSpawnAt` は 今の まま〔やかたの 床で true〕〔`src/yokai/ai/mineYakataSpawn.test.ts`〕
 *   ・光: `WorldLight.setYakataBoxes(boxes)`・`WorldLight.yakataBoxes()`・`WorldLight.yakataTint(x, y, z)`・`brightness` は やかたの 中の 式〔`mineYakataLight.test.ts`〕
 *   ・音: `src/fx/yakataSound.ts`〔`YAKATA_SOUND_URLS`・`YakataSound`〕・`src/fx/bgm/yakataScene.ts`〔`createYakataScene`〕〔`src/fx/yakataSound.test.ts`・`yakataScene.test.ts`〕
 *   ・距離は 横〔x・z〕。座標・向きは 窓口に 聞く
 *
 * 【テスト側の 読み】〔仕様に 書いて ない 所だけ。1 行ずつ。developer が ちがう 読みなら テストを 直して 台帳に 書く〕
 *   ・`yakataFoes(id)` は 7 ひきの 種類・二つ名・出る 場所の 候補を シードで きめた 答え〔あける 前でも 同じ〕。あけた 人の 近く〔横 4 マス 以内〕を のぞく えらびで 場所が かわる 分は、実際の 妖怪の 種類・二つ名の 並びで くらべ 場所は 候補の マス〔12 か所〕の どれかで 見る。
 *   ・「横 N マス」「N マス 以内」の きょりは 床の 面〔x・z〕の ふつうの きょり〔√〕。まわり 2 マス・4 マスの 余白は チェビシェフ〔四角〕。
 *   ・1E の 道の まわり 2 マスに かからない 例外は あやしい 横穴の 口の 3 マス ＋ その 先 2 マス〔= 横穴の 最初の 5 マス〕だけ。
 *   ・宝箱を あける 人〔`who`〕は 窓口の `open(x, y, z, who)` の 引数と ポートの `run(who, fn)`〔持ち物・おとし物は その 人の もの〕の 両方で 決まる。
 *   ・`hit` ＝ くじの 当たり〔置けず なしに した ときも true〕・`placed` ＝ 実際に 置けた。`yakata` が null ＝ 当たりでも 置けない ときを ふくむ。
 *   ・口の はなれ: あやしい 横穴の 口は ほかの 口〔本道・ひろばの かべの 口〕と 6 マス 以上・1 つの ひろばから 出る 物は あわせて 1 つ まで。
 */

// ------------------------------------------------------------------ 窓口の 型〔仕様 §6.1〕

export type Look = 'maou' | 'otera';
export const LOOKS: readonly Look[] = ['maou', 'otera'];
export type Zone = 'left' | 'right' | 'front';
export const ZONES: readonly Zone[] = ['left', 'right', 'front'];
type Rank = 'oyabun' | 'taisho';
export type YokaiKindId = string;

export interface Rect {
  x0: number;
  y: number;
  z0: number;
  x1: number;
  z1: number;
}
interface YakataChest {
  x: number;
  y: number;
  z: number;
  cells: Pt[];
  front: 'n' | 'e' | 's' | 'w';
  tier: Tier;
}
export interface Yakata {
  id: string;
  hit: boolean;
  look: Look;
  passage: Pt[];
  gate: Rect;
  hall: Rect;
  altar: Rect;
  chest: YakataChest;
  spawns: { at: Pt; zone: Zone }[];
}
/** 1F の 足しを ふくむ 坑道 */
export interface YakataShaft extends Omit<BokenShaft, 'work'> {
  yakata?: Yakata | null;
  /** 計画の 仕事〔ためした 回数〕: 1E の 5 つ ＋ `yakata`〔ためした 候補の 数。上限は `shaftShapeTable().limit.tries.yakata`。F17〕 */
  work?: { entrance: number; floors: number; sides: number; eda: number; maze: number; yakata: number };
}
interface YakataRoll {
  shaft: string;
  hit: boolean;
  placed: boolean;
  look: Look | null;
}
interface Foe {
  kind: YokaiKindId;
  rank: Rank;
  at: Pt;
}
type YakataStateName = 'mada' | 'chosen' | 'katta';
interface YakataStateInfo {
  state: YakataStateName;
  left: number;
  foes: number[];
  floating: { item: string; count: number }[] | null;
}
export interface YakataTable {
  chance: number;
  looks: Record<Look, number>;
  lookBlocks: Record<Look, { kabe: string; yuka: string; dan: string; taimatsu: string }>;
  dim: { from: number; to: number; shade: number; foe: number };
  lookTint: Record<Look, [number, number, number]>;
  oyabun: number;
  taisho: number;
  nushi: number;
  graceSteps: number;
  spawn: { perZone: number; minPerZone: number; fromChest: [number, number]; apart: number; awayFromOpener: number };
  passage: { width: number; height: number; length: [number, number]; torchEvery: number };
  gate: { width: number; height: number };
  hall: { size: number; height: number; pillars: number };
  altar: { lower: [number, number]; upper: [number, number] };
  maxTorches: number;
  minLight: number;
  ring: number;
}
export interface YakataPlan {
  yakata: Yakata;
  foes: Foe[];
  chestPreview: { item: string; count: number }[];
}
interface YakataSoundTable {
  swapSec: number;
  challengeDelaySec: number;
  challengeFadeSec: number;
  ambienceUnderDb: number;
  endFadeSec: number;
  chestAfterFanfareSec: number;
  backSec: number;
}

// ------------------------------------------------------------------ 挑戦の 係の ポート

export interface YakataPlayer {
  who: 1 | 2;
  x: number;
  y: number;
  z: number;
  dead: boolean;
}
export interface YakataYokaiRow {
  id: number;
  kind: YokaiKindId;
  title: string;
  x: number;
  y: number;
  z: number;
}
export type YakataEvent =
  | { type: 'enter'; who: 1 | 2 }
  | { type: 'start'; who: 1 | 2; foes: number[] }
  | { type: 'count'; left: number }
  | { type: 'win'; who: 1 | 2 }
  | { type: 'lose' }
  | { type: 'achievement'; kind: 'found' | 'won' }
  | { type: 'say'; text: string }
  | { type: 'notice'; text: 'start' | 'win' }
  | { type: 'celebrate'; what: 'confetti' | 'fireworks' }
  | { type: 'sfx'; name: 'yakataGateClose' | 'yakataGateOpen' | 'titleAppear' | 'fanfare' }
  | { type: 'locked'; x: number; y: number; z: number };
export interface YakataPorts {
  /** ゲームに いる 人〔1P・2P〕。足の 位置と やられて いるか */
  players(): YakataPlayer[];
  yokai: {
    /** 二つ名つきで 出す〔ふつうの きまりの 外・graceSteps の あいだ 攻撃しない〕。出た id */
    spawn(kind: YokaiKindId, x: number, y: number, z: number, o: { title: Rank; free: true; graceSteps: number }): number;
    /** 今 生きて いる 妖怪〔たおされた・消えた 妖怪は 入らない〕 */
    list(): YakataYokaiRow[];
    /** そっと 去らせる〔おとし物 なし〕 */
    leave(ids: readonly number[]): void;
  };
  /** その 人の 手に して fn を 呼ぶ〔`createChestRouter().run`〕。かった とき 中身を あけた 人の 持ち物へ 入れる ため */
  run(who: 1 | 2, fn: () => void): void;
  /** できごと〔画面・音・実績は つなぎ込みが これを 見て 出す〕 */
  emit(e: YakataEvent): void;
}

// ------------------------------------------------------------------ 窓口

/** 仕様 §6.1 の 1F の 窓口 */
export interface MineHookF extends Omit<MineHookE, 'shafts' | 'saveGens' | 'oldCols' | 'isOld' | 'open'> {
  shafts(x0: number, z0: number, x1: number, z1: number): YakataShaft[];
  yakataRolls(x0: number, z0: number, x1: number, z1: number): YakataRoll[];
  yakataTable(): YakataTable;
  yakataSoundTable(): YakataSoundTable;
  yakataFoes(id: string): Foe[];
  yakataState(id: string): YakataStateInfo;
  yakataPlanFor(shaftId: string, opt?: { looks?: Record<Look, number> }): YakataPlan | null;
  yakataStep(): void;
  yakataLocked(x: number, y: number, z: number): boolean;
  open(x: number, y: number, z: number, who?: 1 | 2): void;
  saveGens(): { current: number; meta: number; kodo: number | null; heya: number | null; boken?: number | null; yakata?: number | null };
  oldCols(kind: 'kodo' | 'heya' | 'boken' | 'yakata'): number;
  isOld(kind: 'kodo' | 'heya' | 'boken' | 'yakata', cx: number, cz: number): boolean;
}

interface OldColsF extends OldCols {
  yakata?: ReadonlySet<number>;
}
interface HookOptionsF {
  oldCols?: OldColsF;
  world?: unknown;
  metaGen?: () => number | null;
  tansuHas?: (x: number, y: number, z: number) => boolean;
  chest?: unknown;
  yakata?: YakataPorts;
  player?: () => Pt;
}
/** 窓口を 作る。`oldCols` は 古い 保存を 開いた とき〔`yakata` を ふくむ〕の 一覧 */
export function hookF(seed: number, o: HookOptionsF = {}): MineHookF {
  return createMineHook({ seed, ...o } as never) as unknown as MineHookF;
}

/** 窓口が ある〔ない うちは 赤〕ことを 先に 見て、ない 名前を ぜんぶ 言って 落とす */
export function needYakataHook(h: MineHookF, names: readonly (keyof MineHookF)[]): void {
  const missing = names.filter((n) => typeof (h as unknown as Record<string, unknown>)[n] !== 'function');
  if (missing.length > 0) throw new Error(`__rikkun.mine の 窓口〔1F〕が まだ ない: ${missing.join('・')}`);
}

// ------------------------------------------------------------------ 表を 読む〔数は ここを 通して 1 か所〕

const tableMemo = new Map<number, YakataTable>();
/** やかたの 表。窓口が まだ 無い ときは「窓口が ない」で 落ちる */
export function tableOf(seed = SEEDS_20[0]!): YakataTable {
  const hit = tableMemo.get(seed);
  if (hit) return hit;
  const h = hookF(seed);
  needYakataHook(h, ['yakataTable']);
  const t = h.yakataTable();
  tableMemo.set(seed, t);
  return t;
}

// ------------------------------------------------------------------ 標本

/** シードの 並び〔20 シードの あと もっと 足す〕 */
export const SEED_POOL_F: readonly number[] = [...SEEDS_20, ...Array.from({ length: 180 }, (_, i) => 90_000 + i * 7919)];
/** くじを 数える 範囲〔スタートの まわり 横 ± この マス〕 */
export const ROLL_HALF = 3072;

export interface RollSample {
  seed: number;
  roll: YakataRoll;
}
/** `yakataRolls` を シード ごとに よんで あつめる。`enough` が true に なるまで シードを 足す〔窓口が 1F の 前なら 6 シードで 見きり〕 */
export function rollSample(enough: (all: readonly RollSample[]) => boolean, pool: readonly number[] = SEED_POOL_F): { all: RollSample[]; seeds: number } {
  const all: RollSample[] = [];
  let seeds = 0;
  for (const seed of pool) {
    if (enough(all)) break;
    seeds++;
    const h = hookF(seed);
    needYakataHook(h, ['yakataRolls']);
    const sp = spawnOf(seed);
    for (const roll of h.yakataRolls(sp.x - ROLL_HALF, sp.z - ROLL_HALF, sp.x + ROLL_HALF - 1, sp.z + ROLL_HALF - 1)) all.push({ seed, roll });
  }
  return { all, seeds };
}

export interface YakataSampleRow {
  seed: number;
  hook: MineHookF;
  shaft: YakataShaft;
  yakata: Yakata;
}
/**
 * やかたの ある 坑道〔`Shaft.yakata` が null でない〕を あつめる〔計画だけ。ブロックは 作らない〕。シード 1 つに つき スタートに 近い 順に `perSeed` こ まで。
 * `want` が true に なるまで シードを 足す。窓口が 1F の 前〔`yakata` が 無い〕でも 投げず、標本が 空に なる〔使う 側が「やかたが ない」で 落ちる〕。
 */
export function yakataSample(want: (all: readonly YakataSampleRow[]) => boolean, o: { perSeed?: number; half?: number; pool?: readonly number[] } = {}): YakataSampleRow[] {
  const perSeed = o.perSeed ?? 6;
  const half = o.half ?? 1536;
  const out: YakataSampleRow[] = [];
  let tried = 0;
  for (const seed of o.pool ?? SEED_POOL_F) {
    if (want(out)) break;
    // 1F の 前は 何シード 見ても 空 → 4 シードで 見きりを つける
    if (tried >= 4 && out.length === 0) break;
    tried++;
    const hook = hookF(seed);
    const sp = spawnOf(seed);
    const rows = hook
      .shafts(sp.x - half, sp.z - half, sp.x + half - 1, sp.z + half - 1)
      .filter((s) => s.yakata)
      .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z))
      .slice(0, perSeed);
    for (const shaft of rows) out.push({ seed, hook, shaft, yakata: shaft.yakata! });
  }
  return out;
}

// ------------------------------------------------------------------ 形の 小道具

export const cheb2 = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
export const rectCells = (r: Rect, dy = 0): Pt[] => {
  const out: Pt[] = [];
  for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) out.push({ x, y: r.y + dy, z });
  return out;
};
export const rectW = (r: Rect): number => r.x1 - r.x0 + 1;
export const rectD = (r: Rect): number => r.z1 - r.z0 + 1;
export const rectCenter = (r: Rect): { x: number; z: number } => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
/** 門から 大広間の 中心へ むかう 向き〔単位 ベクトル。軸 ぞろい〕 */
export function gateDir(y: Yakata): { dx: number; dz: number } {
  const g = rectCenter(y.gate);
  const h = rectCenter(y.hall);
  return Math.abs(h.x - g.x) >= Math.abs(h.z - g.z) ? { dx: Math.sign(h.x - g.x), dz: 0 } : { dx: 0, dz: Math.sign(h.z - g.z) };
}
/** 下の 段の 上の 上の 段〔5×3。下の 段の まん中〕の はんい。向きを 見て 表の 大きさで 作る */
export function upperRect(y: Yakata, T: YakataTable): Rect {
  const a = y.altar;
  const d = gateDir(y);
  const [long, short] = T.altar.upper;
  const [w, dd] = d.dx !== 0 ? [short, long] : [long, short];
  const c = rectCenter(a);
  const x0 = Math.floor(c.x - (w - 1) / 2);
  const z0 = Math.floor(c.z - (dd - 1) / 2);
  return { x0, y: a.y + 1, z0, x1: x0 + w - 1, z1: z0 + dd - 1 };
}
/** 光の 見え方に わたす やかたの 箱〔世界の 座標。両はし ふくむ。`WorldLight.setYakataBoxes`〕。横穴の 箱と 大広間〔かべの 中〕の 箱の 2 つ */
export interface LightBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  look: Look;
}
export function lightBoxesOf(y: Yakata, T: YakataTable): LightBox[] {
  const hall: LightBox = { x0: y.hall.x0, y0: y.hall.y, z0: y.hall.z0, x1: y.hall.x1, y1: y.hall.y + T.hall.height - 1, z1: y.hall.z1, look: y.look };
  const xs = y.passage.map((p) => p.x);
  const zs = y.passage.map((p) => p.z);
  const half = Math.floor(T.passage.width / 2);
  const pass: LightBox = { x0: Math.min(...xs) - half, y0: y.passage[0]!.y, z0: Math.min(...zs) - half, x1: Math.max(...xs) + half, y1: y.passage[0]!.y + T.passage.height - 1, z1: Math.max(...zs) + half, look: y.look };
  return [hall, pass];
}
/** やかたの ブロックの id 4 つ〔look の 組〕 */
export const blockIdsOf = (T: YakataTable, look: Look): string[] => {
  const b = T.lookBlocks[look];
  return [b.kabe, b.yuka, b.dan, b.taimatsu];
};
/** `shaftPath` から やかたの 足の マス */
export const yakataPathCells = (path: readonly PathCell[]): PathCell[] => path.filter((c) => (c.part as string) === 'yakata');
