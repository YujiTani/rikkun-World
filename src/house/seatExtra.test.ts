import { describe, expect, it } from 'vitest';
import type { BlockId, PlayerState } from '../contracts';
import { ActionState } from '../input/actions';
import { furnCells } from '../world/blocks/houseBlocks';
import { SEAT_TUNING, SeatSystem } from './seat';

/**
 * HOUSE-1D（#341）: 先行テスト（seat.test.ts）が 見ない 所。軽い にせものの 体で、座る 係の とりきめだけ 確かめる。
 *  ・座る 前から 押して いた 移動キーは はなす まで 立つ もとに ならない（はなして 押しなおせば 立つ）
 *  ・体が 動かされたら（もどされた・テレポート）立つ
 *  ・座って いる 間だけ カメラの 目が さがる・人形は「地面に 立って いる」（onGround）
 *  ・立つ ステップに、step.ts が 書き直した 欄は そのまま（のけぞりの noMoveInput などを 消さない）
 */

const FEET = 5;

function rig() {
  const state: PlayerState = {
    position: { x: 3.5, y: FEET, z: 3.5 },
    velocity: { x: 1, y: 2, z: 3 },
    yawDeg: 0,
    pitchDeg: 0,
    onGround: false,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const motion = { stopNow: false, hoverY: null as number | null, faceDeg: null as number | null };
  const actions = new ActionState();
  let flinch = false;
  const blocks = new Map<string, BlockId>();
  for (const c of furnCells('chair', 2, 10, 10)) blocks.set(`${c.x},${FEET},${c.z}`, c.id);
  const world = { getBlock: (x: number, y: number, z: number): BlockId | 'outside' => blocks.get(`${x},${y},${z}`) ?? 'air' };
  const seat = new SeatSystem({ world, controller: { state, motion }, actions, combat: { flinching: () => flinch, heal: () => 0 } });
  return { state, motion, actions, seat, setFlinch: (v: boolean) => (flinch = v) };
}

describe('座る 係の とりきめ（AC28）', () => {
  it('座る 前から 押して いた 移動キーは はなす まで 立つ もとに ならない。はなして 押しなおすと 立つ', () => {
    const r = rig();
    r.actions.press('moveForward'); // 歩いて きて そのまま 右クリック
    r.actions.endFrame();
    expect(r.seat.use(10, FEET, 10)).toBe(true);
    for (let i = 0; i < 5; i++) {
      r.seat.update();
      r.actions.endFrame();
    }
    expect(r.seat.seat(), '押しっぱなしの まま').not.toBeNull();
    r.actions.release('moveForward');
    r.seat.update();
    r.actions.endFrame();
    expect(r.seat.seat(), 'はなした だけ').not.toBeNull();
    r.actions.press('moveForward');
    r.seat.update();
    expect(r.seat.seat(), '押しなおした').toBeNull();
  });

  it('座って いる 間は 移動キーを 押しっぱなしでも 人形は 足ぶみしない（moving・running が false）', () => {
    const r = rig();
    r.actions.press('moveForward');
    r.actions.endFrame();
    r.seat.use(10, FEET, 10);
    r.seat.update();
    r.state.moving = true; // controller.update が 入力から 立てる
    r.state.running = true;
    r.seat.afterUpdate();
    expect(r.seat.seat()).not.toBeNull();
    expect(r.state.moving).toBe(false);
    expect(r.state.running).toBe(false);
  });

  it('体が 動かされたら 立つ（やられて もどされた など）', () => {
    const r = rig();
    r.seat.use(10, FEET, 10);
    r.seat.update();
    expect(r.seat.seat()).not.toBeNull();
    r.state.position.x += 2;
    r.seat.update();
    expect(r.seat.seat()).toBeNull();
  });

  it('座って いる 間だけ カメラの 目が さがり、人形は 地面に 立って いる ことに なる', () => {
    const r = rig();
    expect(r.seat.eyeDrop()).toBe(0);
    r.seat.use(10, FEET, 10);
    r.seat.update();
    r.state.onGround = false; // controller.update が うかせて いる
    r.seat.afterUpdate();
    expect(r.state.onGround).toBe(true);
    expect(r.seat.eyeDrop()).toBe(SEAT_TUNING.eyeDrop);
    r.actions.press('jump');
    r.seat.update();
    expect(r.seat.eyeDrop()).toBe(0);
    r.state.onGround = false;
    r.seat.afterUpdate();
    expect(r.state.onGround, '立って いる 間は さわらない').toBe(false);
  });

  it('座って いる 間は 速さ 0・うかせて 止める。立つ ステップは 自分が 書いた 欄だけ もどし、step.ts が 書き直した 欄は のこす', () => {
    const r = rig();
    r.seat.use(10, FEET, 10);
    r.seat.update();
    expect(r.motion).toMatchObject({ stopNow: true, hoverY: FEET + SEAT_TUNING.seatHeight });
    expect(r.state.velocity).toEqual({ x: 0, y: 0, z: 0 });
    // 立つ ステップ: step.ts が 先に 書き直して いる（stopNow ＝ false・hoverY ＝ null）→ そのまま
    r.motion.stopNow = false;
    r.motion.hoverY = 1.5; // 別の 係（シャイニングの うかぶ）が 書いた 高さ
    r.setFlinch(true);
    r.seat.update();
    expect(r.seat.seat()).toBeNull();
    expect(r.motion.stopNow).toBe(false);
    expect(r.motion.hoverY, '別の 係の 値は 消さない').toBe(1.5);
  });

  it('立つと 自分が 書いた ままの 欄は もとに もどる（step.ts が 書き直さない 場では）', () => {
    const r = rig();
    r.seat.use(10, FEET, 10);
    r.seat.update();
    r.actions.press('moveLeft');
    r.seat.update();
    expect(r.seat.seat()).toBeNull();
    expect(r.motion).toEqual({ stopNow: false, hoverY: null, faceDeg: null });
  });
});
