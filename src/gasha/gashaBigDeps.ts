/**
 * #308 gashaBig.ts を 分けた もの: がしゃどくろ（第一形態）を ゲームに 入れる 口（GashaBigDeps = ゲームから もらう 物、GashaBigHandle = 外へ 見せる 操作）。
 */
import type { Camera, Group, Material, Object3D, Scene } from 'three';
import type { BodyBlocksPort } from '../dig/bodyBlocks';
import type { BoxLike, HitSources } from './gashaBigHit';
import type { GeyserInfo } from './gashaGeyser';
import type { ShockHit } from './gashaBigShock';
import type { BigSfxEnv } from './gashaBigSfx';
import type { EruptFx } from './gashaBigEruptFx';
import type { WorldHit } from './gashaBigWorld';

export interface GashaBigDeps {
  scene: Scene;
  camera: Camera;
  /** プレイヤーの いま の 位置と 向き（度） */
  player(): { x: number; y: number; z: number; yawDeg: number };
  /** 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
  groundY(x: number, z: number): number;
  /** プレイヤーの 当たりに「追加の 固いマス」を 足す（isSolidForPlayer に 重ねる） */
  addPlayerSolid(fn: (x: number, y: number, z: number) => boolean): void;
  /** 毎ステップ（1/60 秒）呼ばれる 処理を 登録する（はって 進む・目の 色・のっている 人）。なければ うごかない */
  onUpdate?(fn: (dt: number) => void): void;
  /** のっている プレイヤーを 動かす（位置の ずれ、向き（度）の ずれ）。なければ 運ばない */
  carryPlayer?(dx: number, dy: number, dz: number, dYawDeg: number): void;
  /** 昼夜の 明るさの 係（sky/lighting.ts）。あれば 体の 材料を 登録して 夜は 暗くする（目の 光は 暗くしない） */
  lighting?: { registerTree(root: Object3D, group: 'doll'): number; unregister?(material: Material): void };
  /** 効果音を 鳴らす 口の 差しかえ（テスト用。なければ 本物の WebAudio） */
  sfxEnv?: BigSfxEnv;
  /** ゲームの ミキサーの 効果音バス（main.ts の mixer.output()）。わたすと 効果音は ここを 通る（設定の 音量・ミュートが 効く）。なければ 自前の AudioContext */
  sfxOut?(): { ctx: AudioContext; destination: AudioNode } | null;
  /** BGM の ミキサーの 口（少女と おなじ）。なければ BGM は 流さない */
  bgmOut?(): { ctx: AudioContext; bus: AudioNode } | null;
  /** ふだんの BGM を 止める（少女と おなじ。曲が 流れて いる 間） */
  suppressBgm?(on: boolean, fade?: { outSec?: number; inSec?: number; delaySec?: number }): void;
  /** 出現する 高さを 決める 地面の 高さ（置いた ブロック込み。立つ 面は +1）。なければ groundY。出現した 高さを 保って 浮いて 進む ので、地ならしは しない（FIX-BRIEF-2 §3-1） */
  placeGroundY?(x: number, z: number): number;
  /** プレイヤーの 攻撃を 受ける 口（刀・弓・波・雷など。つなぎは gashaBigHitWire.ts）。なければ 本物の 攻撃は 当たらない（`__gashaBig.damage` だけ 効く） */
  hit?: HitSources;
  /** NINJA-1: 刀・パンチが 部位に 当たった（忍びの手甲の 追い打ち用。BigHit の onStrike） */
  onStrike?(info: { part: string; source: string }): void;
  /** 間欠泉（gashaGeyser.ts）の 口: プレイヤーの 体（足もと・速さ・地面）。4 つ そろった ときだけ 間欠泉が わく */
  playerBody?(): { position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; onGround?: boolean };
  setPlayerVelocity?(v: { x: number; y: number; z: number }): void;
  /** SAMURAI-1 §4.4: 「とばされにくさ」の 倍率（羽織 0.3。main.ts が `() => knockbackMulOf(armor)` を わたす。なければ 1）。打撃・衝撃波・小さい 衝撃・払いの 横の 速さだけ。コアの ふり落とし・とどめの はじきには かけない */
  knockbackMul?(): number;
  /** SAMURAI-1 §4.5: 明珍手甲の「防御力 無視」の 数（着て いなければ 0）。刀・波・雷・ドームの 当たりだけ（BigHit の defIgnore）。main.ts が `() => tekkoDefIgnoreOf(armor)` を わたす */
  defIgnore?(): number;
  nudgePlayer?(dx: number, dz: number): void;
  /** 落下ダメージを 受けない（combat の noFall に 重ねる） */
  setNoFall?(on: boolean): void;
  /** 間欠泉の つち（ブロック `geyser_dirt`）の 口: ブロックの 名前・置きかえ・読みこんだ 列の 間欠泉の つちを ぜんぶ 渡す。そろって いれば 間欠泉が わく */
  blockAt?(x: number, y: number, z: number): string;
  setGeyserBlock?(x: number, y: number, z: number): boolean;
  /** 間欠泉の つちを もとの ブロックに もどす(片づけ。自分が 作った 分だけ)。なければ もどさない */
  restoreGeyserBlock?(x: number, y: number, z: number, id: string): boolean;
  scanGeyserBlocks?(found: (x: number, y: number, z: number) => void): void;
  /** 保存に だけ 元の ブロックで 書く マスの 一覧の 取り出し口を 渡す（ボスが 作った 間欠泉の つち。保存の しくみ側が 保存の たびに 呼ぶ） */
  onSaveOverrides?(get: () => Array<{ x: number; y: number; z: number; live: string; save: string }>): void;
  /** 忍者の足袋（レア装備。落下ダメージ 0）を 持ち物に 入れて 着る。開始時に 1 回 呼ぶ。なければ 渡さない */
  giveNinjaTabi?(): void;
  /** true なら 起動時に 足袋を 自動で 着せない（ふだんの ゲームでは ごほうび。試作は 着せる）。`giveTabi()` で 後からも 着せられる */
  noTabi?: boolean;
  /** 体力が 0 に なった（置いてから 1 回だけ。次の place() で また 数える）。実績・ごほうびは コアを こわした とき(onCoreBroken)に 呼んだ 側が 出す */
  onDefeated?(): void;
  /** ヒットストップ(#276。ticks ステップ 世界を 止める)。とどめの 一撃で 使う。なければ 止めない */
  hitStop?(ticks: number): void;
  /** 画面の ゆれ(0〜1)。とどめの 一撃で 使う。なければ ゆらさない */
  shake?(amount: number): void;
  /** とどめの あと: コアを たたいた(n 回目・のこり left 回。at = コアの 場所)。ここから アイテムを ばらまく */
  onCoreHit?(e: { x: number; y: number; z: number; n: number; left: number }): void;
  /** とどめの あと: コアを こわした(体が くずれはじめる)。実績・大きな ごほうびは ここから */
  onCoreBroken?(e: { x: number; y: number; z: number }): void;
  /** くずれおわって 体が 消えた(片づけは 呼んだ 側が despawn() する) */
  onVanished?(): void;
  /** 体力 1/2 で 噴火を して 固まった(ぴたっと 止まった しゅんかん。BGM は ここで ぶつっと 切る)。ふだんの ゲームは release.ts が 少女を 呼ぶ */
  onHeld?(): void;
  /** 手が 地面を たたいた ときの 打撃・衝撃波・小さい 衝撃の ダメージ（プレイヤーの combat.damage。当たったら true）。なければ ダメージなし（ひるみだけ） */
  hurt?(amount: number, from: { x: number; y: number; z: number }): boolean;
  /** ひるみ（試作だけ）: fn() が true の 間は プレイヤーの 入力を 止める（lock.playInputEnabled に 重ねる） */
  blockPlayerInput?(fn: () => boolean): void;
  /** 描く 前の 処理（画面の ゆれ）。なければ ゆらさない */
  onBeforeRender?(fn: () => void): void;
  /** 「うごきを へらす」の 人は ゆらさない */
  reducedMotion?(): boolean;
  /** たたきつけた 手の 下と まわりを こわす 口: ブロックを 空気に する（blockAt と そろって いる ときだけ こわす）と、こわした マス（くだける つぶ・音。ぬりかべの onBlocks と おなじ） */
  setBlockAir?(x: number, y: number, z: number): boolean;
  onCrushBlocks?(cells: { x: number; y: number; z: number; from: string; to: 'air' }[]): void;
  /** ガラスの 雲が 割れた（ブロックの 中心の 世界の 座標）。小さな かけらと 音を 出す 口 */
  onGlassBreak?(cells: { x: number; y: number; z: number }[]): void;
  /** コアに 当たった 予兆（大きな 音）/ 遠くへ とばされる 瞬間（風の 音） */
  onCoreWarn?(): void;
  onCoreThrow?(): void;
  /** 体の 上に 置く ブロックの 口（DigSystem の bodyBlocks に つなぐ）。開始時に 1 回 呼ばれる */
  onBodyBlocks?(port: BodyBlocksPort): void;
}

export interface GashaBigHandle {
  tune(o: unknown): void;
  /** 作りなおして 置く（体力も もどる）。引数なしは プレイヤーの 前 T.place.distance。`{ x, z, yawDeg }` を 渡すと その 場所（体の 中心の 地面の 位置）・向き（度。`info().yawDeg` と おなじ。省くと プレイヤーの 方を 向く）に 置く。ふだんの ゲームは こちら（release.ts） */
  place(at?: { x: number; z: number; yawDeg?: number }): void;
  /** 片づける（体・当たり・間欠泉・体力ゲージ・射線の 割りこみ・攻撃の エフェクト・燃えかす・音を 消し、毎コマの 更新も 止める）。もういちど 出すには place(at) */
  despawn(): void;
  /** 少女に かわる 間だけ 体を かくす（見えない・当たらない・固くない・うごかない。体力・怒り・位置・攻撃の 回数は のこる）。体の 上の 人は 地面へ おろす。false で もどす（その あと tired(sec) で 休ませる） */
  hide(on: boolean): void;
  /** 少女への 切りかえ: 攻撃中なら 片づけて 噴火攻撃を 必ず 出し、上を 向いた まま 固まる(動かない・攻撃しない・追わない。登る・なぐるのは できる。目は 白目)。BGM は 固まった しゅんかんに 切る。固まったら onHeld */
  finale(): void;
  /** 固まって いるか */
  frozen(): boolean;
  /** 少女が 座る 場所(左かたの ぬの の 上。世界の 座標と 向き)。体が なければ null */
  perchSpot(): { x: number; y: number; z: number; yawDeg: number } | null;
  /** コアを まもる 虹色の バリア(少女の 間だけ on)。波紋の 数・半径(テスト用) */
  barrier(): { on: boolean; ripples: number; radius: number };
  /** とどめの あとの 様子(テスト・デバッグ用): 場面・コアの のこり・倒れ具合・赤さ・くずれ具合・かけらの 数 */
  finishInfo(): { phase: string; coreHp: number; coreMax: number; fallK: number; redK: number; crumbleK: number; chunks: number };
  /** 座っている 少女の 当たりの 箱を 足す(名前 girl。null で はずす)。箱の 中身は 少女が 毎コマ 更新する */
  setGirlBox(box: BoxLike | null): void;
  /** 体力の 最大 */
  maxHp(): number;
  /** 怒る（赤い 目。止まって プレイヤーの 方を 向く）/ 白目に もどす。怒りは 攻撃されない まま T.angry.calmSec で 自然に 消える */
  angry(on: boolean): void;
  /** プレイヤーの 攻撃が 当たった ことに する（怒る。20 秒 カウントを はじめから）。段 4 で 本物の 攻撃に つなぐ */
  hit(): void;
  /** いまの 体力 */
  hp(): number;
  /** 部位（hand・foreArm・upperArm・head・core など）に ダメージ（武器の 強さ amount × 部位の 倍率）。与えた 数を 返す。テスト用 */
  damage(part: string, amount: number, at?: { x: number; y: number; z: number } | null, source?: string): number;
  /** 撮影用: コアの 左右の まんなかで 体を 半分に 切って 断面を 見せる（左がわを 消す）/ もどす */
  section(on: boolean): void;
  /** さまよう（はって あるく）のを はじめる / 止める */
  walk(on: boolean): void;
  /** その 場所（ブロックの 座標）へ はって 行く（さまよう とき の 目的地を 上書き） */
  goTo(x: number, z: number): void;
  /** 止まって ふり返る（Crawl and Look Back） */
  lookBack(): void;
  /** 後ろへ さがる（climbing down wall を 倒した 動き）を はじめる / 止める */
  back(on: boolean): void;
  /** 攻撃を すぐ 出す（デバッグ。怒って いなければ 怒らせる）。'slam2'（両手たたきつけ）・'sweep'（両手で 払う）・'beam'（目から 光線）・'eruption'（口から 火山噴火）・'thunder'（自分に 落雷） */
  attack(name: string): void;
  /** つかれて 休みに はいる（デバッグ。sec を 省くと 調整表の 20〜30 秒） */
  tired(sec?: number): void;
  /** 噴火で 落ちた 燃えかすの 場所（テスト・デバッグ用） */
  /** 自分に 落雷で まわりに 落ちた 雷の 場所（この 攻撃の ぶん。テスト用） */
  thunderSpots(): { x: number; z: number }[];
  eruptionEmbers(): { id: number; x: number; y: number; z: number; body: boolean; age: number; from: number }[];
  /** いまの 噴火で 着地した 隕石（テスト・デバッグ用。sparks = 飛び散った 火の 粉の 数） */
  eruptionImpacts(): { id: number; x: number; y: number; z: number; body: boolean; aimed: boolean; sparks: number }[];
  /** 攻撃サイクル・予告・体の ゆれの いま（テスト用） */
  attackInfo(): { mode: string; phase: string; attack: string | null; done: number; count: number; left: number; slam2Count: number; sweepCount: number; sweepActive: string | null; quakeLeft: number; warn: boolean; fx: { warn: boolean; rocks: number; cracks: number }; beamCount: number; beamPhase: string; beamMode: string | null; beamAim: { x: number; y: number; z: number } | null; beamFx: { marks: number; flames: number; smoke: number; beams: number; sparkle: number }; thunder: { count: number; phase: string; cloud: number; elec: number; strikes: number; hits: number; bodyHurts: number; strikeHurts: number; fx: { bolts: number; rings: number; warns: number; arcs: number; cloud: number; flash: number; glow: boolean } }; eruption: { count: number; phase: string; flying: number; sparks: number; landed: number; aimed: number; meteorHurts: number; embers: number; onBody: number; mossHidden: number; glassBroken: number; burntBlocks: number; craterBlocks: number; doused: number; fx: ReturnType<EruptFx['counts']> } };
  /** 長い 休みに はいる（その場で 体を 動かさない。首を ふる くらい）。sec を 書かなければ 調整表の wander.restSec */
  rest(sec?: number): void;
  /** うごきの 中身（モード・速さ・手の ついた 数・1 コマの 仕事の 数 など） */
  motion(): Record<string, unknown>;
  /** ガラスの 雲を 割る: center（世界の 座標）から radius（ブロック）いないの ブロックが 消える。割れた 数を 返す。しばらくして 1 つずつ もどる（火の 攻撃用の 口。テストでも 使う） */
  breakGlass(center: { x: number; y: number; z: number }, radius: number, max?: number): number;
  /** ガラスの 数（ぜんぶ・いま 割れている・もどるのを 待っている） */
  glassInfo(): { total: number; broken: number };
  /** 当たりの 箱の 一覧（世界の 座標。関節の いまの 姿勢） */
  colliders(): WorldHit[];
  /** 関節を うごかした あとに 呼ぶ。当たりの マスを 関節の いまの 姿勢で 作りなおす */
  refreshColliders(): void;
  /** 関節の 名前 → Group（Meshy の 骨と おなじ 名前）。休みの 姿勢では 回転なし */
  joints(): Record<string, Group>;
  /** 見えない 固いマスを 1 つ 聞く */
  solidAt(x: number, y: number, z: number): boolean;
  /** 間欠泉の 一覧（場所・状態。かわる 途中の ものも 入る: state = 'cracking'、stage = ひびの 段） */
  geysers(): GeyserInfo[];
  /** x, z の マスから 間欠泉の つちに かえはじめる（テスト用。sec = ひびの 秒、省くと 調整表。0 で すぐ）。始められたら true */
  spawnGeyser(x: number, z: number, sec?: number): boolean;
  /** 忍者の足袋を 着る（開始時に も 自動で 1 回）。口が なければ 何もしない */
  giveTabi(): void;
  /** 手が 地面を たたいた ときの 当たり（ひるみの のこり・当たった 記録・いまの 輪）。テスト用 */
  shock(): { staggerLeft: number; inputBlocked: boolean; hits: ShockHit[]; impacts: number; shake: number; lastPush: { x: number; y: number; z: number } | null; slams: number; taps: number; phase: string; fx: { rings: number; dust: number }; lastSlam: { x: number; y: number; z: number } | null; lastTap: { x: number; y: number; z: number } | null };
  info(): Record<string, unknown>;
  /** 体の 上に 置いた ブロック（置く・こわす・数。DigSystem の 口と おなじ） */
  bodyBlocks: BodyBlocksPort & { count: number; list(): { id: string; joint: string }[] };
  group: Group;
}
