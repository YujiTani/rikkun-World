/**
 * やかたの 挑戦の 係の 出入り口（MINE-1F §4.7・§6.1）。つなぎ込み〔src/game/wire〕が 本物を わたす。形は テストの 道具〔mineYakataKit.ts〕と 同じ。
 */
export type YakataRank = 'oyabun' | 'taisho';

export interface YakataPlayer {
  who: 1 | 2;
  x: number;
  y: number;
  z: number;
  dead: boolean;
}
export interface YakataYokaiRow {
  id: number;
  kind: string;
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
  | { type: 'locked'; x: number; y: number; z: number }
  | { type: 'gate'; what: 'close' | 'open'; gate: { x: number; y: number; z: number; w: number; d: number; h: number } }
  | { type: 'float'; cells: { item: string; x: number; y: number; z: number }[] | null };

export interface YakataPorts {
  /** ゲームに いる 人〔1P・2P〕。足の 位置と やられて いるか */
  players(): YakataPlayer[];
  yokai: {
    /** 二つ名つきで 出す〔ふつうの きまりの 外・graceSteps の あいだ 攻撃しない〕。出た id */
    spawn(kind: string, x: number, y: number, z: number, o: { title: YakataRank; free: true; graceSteps: number }): number;
    /** 今 生きて いる 妖怪〔たおされた・消えた 妖怪は 入らない〕 */
    list(): YakataYokaiRow[];
    /** その id の 妖怪が 今 生きて いるか〔毎ステップ よぶ ので 何も 作らない〕 */
    has?(id: number): boolean;
    /** そっと 去らせる〔おとし物 なし〕 */
    leave(ids: readonly number[]): void;
  };
  /** その 人の 手に して fn を 呼ぶ〔`createChestRouter().run`〕 */
  run(who: 1 | 2, fn: () => void): void;
  /** 門を とじた とき 門の マスに いる 人を 大広間の 中へ 押し出す〔足の 位置を おく。なければ 何も しない〕 */
  movePlayer?(who: 1 | 2, to: { x: number; y: number; z: number }): void;
  /** できごと〔画面・音・実績は つなぎ込みが これを 見て 出す〕 */
  emit(e: YakataEvent): void;
}
