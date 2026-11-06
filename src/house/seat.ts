import type { BlockId, PlayerState, Vec3 } from '../contracts';
import type { Action } from '../input/actions';
import { furnUseOf } from '../world/blocks/furnUse';
import { furnInfo } from '../world/blocks/houseBlocks';

/**
 * 座る・おふろに 入る（HOUSE-1D #341。仕様 docs/design/HOUSE-1.md §2.12・AC28。DOM・three なし）。
 * ・いす・まるいす：右クリックで 座る（kind 'sit'）。おふろ：右クリックで 入る（kind 'bath'。座ると 同じ 形で 体力が 回復する）。
 * ・座って いる 間は 位置と 向きを 固定する。立つ もと：移動キー 4 つ・ジャンプ（押して すぐ はなしても）／妖怪に 当たって のけぞる／体が 動かされた／やられた。
 * ・絵は 今の 立ち絵の まま（座る コマは 作らない）。カメラの 目の 高さだけ `eyeDrop()` ぶん さげる（CameraRig が 読む）。
 * ・プレイヤーの 更新（controller.update）の 前に 毎ステップ `update()`（src/game/step.ts の noMoveInput の 行の あと）。
 */

/** 座る 係の 数（1 か所の 表） */
export const SEAT_TUNING = {
  /** おふろ：入って いる 間、何ステップに 1 回 回復するか（ステップ。60 ＝ 1 秒） */
  bathHealEverySteps: 60,
  /** おふろ：1 回に ふえる 体力（体力。上限は PlayerCombat の playerMaxHp で 止まる） */
  bathHealAmount: 1,
  /** 座った ときの 足もとの 高さ（マス。ブロックの 底から。いすの 座面 ＝ 5/9、おふろの お湯の 面 ＝ 5/9 に 合わせる） */
  seatHeight: 5 / 9,
  /** 座って いる 間、カメラの 目を さげる 高さ（マス。立った ときの 目 1.62 → 約 1.1） */
  eyeDrop: 0.5,
  /** 体が これより 動かされたら 立つ（マス。やられて もどされた・テレポートなど） */
  moveEpsilon: 1e-3,
} as const;

export type SeatKind = 'sit' | 'bath';

export interface SeatInfo {
  kind: SeatKind;
  block: Vec3;
  position: Vec3;
}

/** 立つ もとに なる キー（移動キー 4 つ・ジャンプ。ほかの キー〔右クリック・ホットバー〕では 立たない） */
const STAND_ACTIONS = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump'] as const satisfies readonly Action[];

/** プレイヤーの 動きの 窓口の うち 座る 係が 書く 欄だけ（PlayerController.motion の 一部） */
interface SeatMotion {
  stopNow: boolean;
  hoverY: number | null;
  faceDeg: number | null;
}

interface SeatDeps {
  world: { getBlock(x: number, y: number, z: number): BlockId | 'outside' };
  /** 本物の PlayerController（state・motion） */
  controller: { readonly state: PlayerState; readonly motion: SeatMotion };
  actions: { isHeld(a: Action): boolean; wasPressed(a: Action): boolean };
  /** 本物の PlayerCombatImpl */
  combat: { flinching(): boolean; heal(amount: number): number; dead?(): boolean };
}

interface Sitting {
  kind: SeatKind;
  block: Vec3;
  position: Vec3;
  /** 向き（度。いすの 前） */
  face: number;
  /** 入ってから 数えた ステップ（おふろの 回復の もと） */
  steps: number;
  /** 座った とき すでに 押されて いた キー（はなす まで 立つ もとに しない）。STAND_ACTIONS の 並びの ビット */
  held: number;
}

export class SeatSystem {
  private cur: Sitting | null = null;
  /** 自分が 書く 前の 値（立つ ステップに、自分が 書いた 欄だけ もどす ため） */
  private readonly orig: SeatMotion = { stopNow: false, hoverY: null, faceDeg: null };
  private wrote = false;

  constructor(private readonly d: SeatDeps) {}

  /** ブロック (x, y, z) への 右クリック。座れる／入れる 家具なら 座って true。そうでなければ 何も かえず false */
  use(x: number, y: number, z: number): boolean {
    const id = this.d.world.getBlock(x, y, z);
    if (id === 'outside') return false;
    const use = furnUseOf(id);
    if (use !== 'sit' && use !== 'bath') return false;
    const cur = this.cur;
    if (cur && cur.block.x === x && cur.block.y === y && cur.block.z === z) return true; // もう 座って いる
    const rot = furnInfo(id)!.rot;
    let held = 0;
    for (let i = 0; i < STAND_ACTIONS.length; i++) if (this.d.actions.isHeld(STAND_ACTIONS[i]!)) held |= 1 << i;
    const position = { x: x + 0.5, y: y + SEAT_TUNING.seatHeight, z: z + 0.5 };
    this.cur = { kind: use, block: { x, y, z }, position, face: (rot * 90 + 180) % 360, steps: 0, held };
    this.place(this.cur);
    return true;
  }

  /** 座って いる あいだだけ 値。立つと null（毎回 新しく 作る：テスト・窓口用） */
  seat(): SeatInfo | null {
    const s = this.cur;
    return s ? { kind: s.kind, block: { ...s.block }, position: { ...s.position } } : null;
  }

  /** 座って いる しゅるい（なければ null）。毎フレーム 読んで よい */
  sitting(): SeatKind | null {
    return this.cur?.kind ?? null;
  }

  /** おふろの 湯気の 出どころ（お湯の 面の まん中）。入って いなければ null。作り直さず 同じ 物を 返す */
  bathSpot(): Vec3 | null {
    const s = this.cur;
    return s && s.kind === 'bath' ? s.position : null;
  }

  /** カメラの 目を さげる 高さ（マス）。立って いれば 0 */
  eyeDrop(): number {
    return this.cur ? SEAT_TUNING.eyeDrop : 0;
  }

  /** 1 ステップ。controller.update の 前。座って いる 間だけ motion を 書き、立った ステップに 自分が 書いた 欄だけ もどす */
  update(): void {
    const s = this.cur;
    if (!s) return;
    if (this.shouldStand(s)) {
      this.stand();
      return;
    }
    s.steps++;
    if (s.kind === 'bath' && s.steps % SEAT_TUNING.bathHealEverySteps === 0) this.d.combat.heal(SEAT_TUNING.bathHealAmount);
    this.place(s);
  }

  /** controller.update の あと。座って いる 間は うかせて 止めて いる ので、地面に 立って いる ことに する（立ち絵の まま 見せる ため） */
  afterUpdate(): void {
    if (!this.cur) return;
    const st = this.d.controller.state;
    st.onGround = true;
    st.moving = false; // 座る 前から 移動キーを 押した ままでも 足ぶみ しない
    st.running = false;
  }

  private shouldStand(s: Sitting): boolean {
    const c = this.d.combat;
    if (c.flinching() || c.dead?.() === true) return true;
    const p = this.d.controller.state.position;
    const e = SEAT_TUNING.moveEpsilon;
    if (Math.abs(p.x - s.position.x) > e || Math.abs(p.y - s.position.y) > e || Math.abs(p.z - s.position.z) > e) return true;
    let stand = false;
    for (let i = 0; i < STAND_ACTIONS.length; i++) {
      const a = STAND_ACTIONS[i]!;
      const bit = 1 << i;
      if (!this.d.actions.isHeld(a)) s.held &= ~bit; // はなしたら その キーは また 立つ もとに なる
      if (this.d.actions.wasPressed(a) || (this.d.actions.isHeld(a) && (s.held & bit) === 0)) stand = true;
    }
    return stand;
  }

  /** 体を 座る 場所に そろえ、動かない ように motion を 書く */
  private place(s: Sitting): void {
    const st = this.d.controller.state;
    const m = this.d.controller.motion;
    if (!this.wrote || m.stopNow !== true) {
      this.orig.stopNow = m.stopNow;
      this.orig.hoverY = m.hoverY;
      this.orig.faceDeg = m.faceDeg;
    }
    st.position.x = s.position.x;
    st.position.y = s.position.y;
    st.position.z = s.position.z;
    st.velocity.x = st.velocity.y = st.velocity.z = 0;
    st.facingDeg = s.face;
    m.stopNow = true; // 水平の 速さを 0 に
    m.hoverY = s.position.y; // 重力を 使わず その 高さに とどまる（いすの 中に 沈まない）
    m.faceDeg = s.face; // 右クリックを 押しつづけても いすの 向きを 保つ
    this.wrote = true;
  }

  private stand(): void {
    const m = this.d.controller.motion;
    const s = this.cur!;
    // step.ts が 今の ステップに 書き直した 欄は そのまま。自分が 書いた ままの 欄だけ もどす
    if (m.stopNow === true) m.stopNow = this.orig.stopNow;
    if (m.hoverY === s.position.y) m.hoverY = this.orig.hoverY;
    if (m.faceDeg === s.face) m.faceDeg = this.orig.faceDeg;
    this.cur = null;
    this.wrote = false;
  }
}
