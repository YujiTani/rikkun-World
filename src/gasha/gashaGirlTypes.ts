/**
 * #308 gashaGirl.ts を 分けた もの: 少女の 外との つなぎの 型（呼ぶ 側が 渡す もの・返す もの）。gashaGirl.ts から 再公開する。
 */
import type { Camera, Group, Scene } from 'three';
import type { BoxLike } from './gashaBigHit';

export interface GashaGirlDeps {
  scene: Scene;
  camera: Camera;
  onUpdate(fn: (dt: number) => void): void;
  /** 描く 直前（カメラを 上書きする 用） */
  onBeforeRender(fn: () => void): void;
  player(): { x: number; y: number; z: number; yawDeg: number; vx: number; vz: number };
  /** プレイヤーに ダメージ（妖怪の 攻撃と 同じ PlayerCombat.damage。むてき時間・ノックバックつき）。入ったら true */
  hurt(amount: number, from: { x: number; y: number; z: number }): boolean;
  hp(): number;
  maxHp(): number;
  /** パリィに 聞く（妖怪と おなじ 口）。by: 設置系 'attack'、弾系 'fireball'。dirDeg は プレイヤー足もと → 当たった 物 */
  parry(h: { dirDeg: number | null; by: 'attack' | 'fireball'; amount: number }): { result: 'success' | 'early' | 'fail' | 'none'; amount: number };
  /** ゲームの BGM の ミキサー（BGM 音量の 設定に のる）。まだ 音が 使えない ときは null */
  bgmOut(): { ctx: AudioContext; bus: AudioNode } | null;
  /** ゲームの ミキサーの 効果音バス（main.ts の mixer.output()）。わたすと 効果音は ここを 通る（設定の 音量・ミュートが 効く）。なければ 自前の AudioContext */
  sfxOut?(): { ctx: AudioContext; destination: AudioNode } | null;
  /** ふだんの BGM を 止める（少女の 間） */
  suppressBgm(on: boolean, fade?: { outSec?: number; inSec?: number; delaySec?: number }): void;
  groundY(x: number, z: number): number;
  solid(x: number, y: number, z: number): boolean;
}

export interface GashaGirlOpts {
  /** true: 読みこんだ あと ねかせて おく（ふだんの ゲーム）。summon() で はじまる。なければ すぐ はじまる（?proto=gashaGirl） */
  dormant?: boolean;
  /** dormant: 5 回の 魔法の あと 少女が 座る 場所(大きな 姿の かたの 上。足もとの 世界の 座標と 向き)。なければ null(その 場に 座る) */
  perchSpot?(): { x: number; y: number; z: number; yawDeg: number } | null;
  /** dormant: 座っている 少女の 当たりの 箱を 大きな 姿の 当たりに 足す(名前 girl)。null で はずす。箱の 中身は 少女が 毎コマ 更新する */
  setHitBox?(box: BoxLike | null): void;
}

/** ふだんの ゲームから 少女を 動かす 口 */
export interface GirlController {
  /** 少女の 戦いを はじめる（2 秒 何もいない → 背面か 横へ ワープして 詠唱）。dormant のときだけ */
  summon(): void;
  /** 止めて かくす（エフェクト・弾・BGM の 頼み・文字を 消す）。dormant のときだけ */
  dismiss(): void;
  /** 少女の 戦いの 最中か（ねかせて いる 間は false） */
  active(): boolean;
  /** とどめ(大きな 姿の 体力 0): 魔法・弾・当たりの 箱を ぜんぶ 消して、その場に 座りこむ。動かない・無敵。ねている 間は 何も しない */
  finish(): void;
  /** コアが こわれた: 座った まま 透けて 粉に なって 消えて いく(finish() の あとだけ) */
  crumble(): void;
  /** いまの 場面: off(ねている)/ laugh(笑い声)/ orbit(飛びまわる)/ pose(決めポーズ)/ girl(戦い)/ perch(かたに 座って 休む)/ down(とどめで 座りこむ)/ crumble(消えて いく) */
  stage(): 'off' | 'laugh' | 'orbit' | 'pose' | 'girl' | 'perch' | 'down' | 'crumble';
  handle: GashaGirlHandle;
}

export interface GashaGirlHandle {
  place(opts?: { groundY?: number; shift?: number; side?: boolean }): void;
  figures: Group[];
  labels(riky: { x: number; y: number; z: number }, w: number, h: number): { x: number; y: number }[];
  phase(): string;
  /** 立ち姿の 数えなおし（撮影用） */
  standNow(): void;
  setSeed(n: number): void;
  warpNow(spell?: number): void;
  camera(mode: 'overview' | 'default' | 'look' | 'close' | 'idle' | 'idleSide' | 'pose' | 'poseSide'): void;
  /** 立ち姿で とめておく（idle.gif 用） */
  holdStand(on: boolean): void;
  /** 回数・止めた回数の 数えなおし（撮影用） */
  resetTurns(): void;
  /** 次に 使う 魔法を 決める（1〜4。撮影用） */
  nextSpell(n: number): void;
  /** 次の 魔法 1 の ワープ先が 左横か（シードの さきよみ） */
  predictSide(): 'left' | 'back';
  info(): Record<string, number | string | boolean>;
  /** 戦いの 数を 上書き（gashaGirlTuning.ts の TUNE と おなじ 形） */
  tune(o: unknown): void;
  /** テスト用: パリィの 結果を 決めうち（null で ふつう） */
  forceParry(r: 'success' | 'early' | null): void;
}
