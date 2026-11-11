import { describe, expect, it } from 'vitest';
import { SEAT_TUNING } from '../house/seat';
import { p2CameraPose, type P2Pose } from './p2Pose';

/**
 * COOP-1 5e（docs/design/COOP-1.md 1.15 §3.7 (f)・AC143）: 2P が すわって いる あいだ、目が さがるのは 2P の カメラだけ（1P の カメラは かわらない）。
 * 1P の `CameraRig.apply` は すわって いる 間 `feet.y - eyeDrop()` から 目・まわる 中心を 決める。2P の 半分も 同じ 考え方に する（式の コピーは しない）。
 *
 * ---- 実装への 約束（src/duo/p2Pose.ts。仕様 §8 の 5e の 行は「duo/p2Camera.ts」と 書いて あるが、カメラの 位置を 決めて いる のは p2Pose.ts の `p2CameraPose`）----
 *   p2CameraPose(feet, yawDeg, pitchDeg, distance, isSolid, out, eyeDrop = 0): P2Pose
 *     最後に 省ける 引数 `eyeDrop`（マス。すわって いる 間の `SeatSystem.eyeDrop()`、立って いれば 0）。
 *     **先に** `feet.y - eyeDrop` を 引いた 足もとから 肩の 点・うしろへの 光線を 決める（壁の 当たりも 下げた 足もとで 見る。eyeDrop を 渡さない／0 は 今の 動きと 同じ）。浮動小数の 誤差は 許す（テストは 9 けた）。
 *   配線（テストは しない）: game/wire/duoView.ts の 2P の `p2CameraPose` 呼び出しに `seatFor(2)?.eyeDrop() ?? 0` を 渡す。
 */

const out = (): P2Pose => ({ x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0 });
const FEET = { x: 10, y: 5, z: 10 };

describe('AC143: 2P の カメラの 目の 高さ', () => {
  it('eyeDrop を わたすと、壁が なければ カメラの 高さだけが eyeDrop さがる（横・向きは かわらない）', () => {
    const d = SEAT_TUNING.eyeDrop;
    const stand = p2CameraPose(FEET, 90, 0, 5, () => false, out());
    const sit = p2CameraPose(FEET, 90, 0, 5, () => false, out(), d);
    expect(stand.y - sit.y).toBeCloseTo(d, 9);
    expect(sit.x).toBeCloseTo(stand.x, 9);
    expect(sit.z).toBeCloseTo(stand.z, 9);
    expect(sit.yawDeg).toBe(stand.yawDeg);
    expect(sit.pitchDeg).toBe(stand.pitchDeg);
  });

  it('足もとを eyeDrop さげた 場合と 同じ（1P の CameraRig が `feet.y - eyeDrop` から 決めるのと 同じ 考え方）', () => {
    const d = SEAT_TUNING.eyeDrop;
    const a = p2CameraPose(FEET, 30, -20, 6, () => false, out(), d);
    const b = p2CameraPose({ ...FEET, y: FEET.y - d }, 30, -20, 6, () => false, out());
    for (const k of ['x', 'y', 'z', 'yawDeg', 'pitchDeg'] as const) expect(a[k], k).toBeCloseTo(b[k], 9);
  });

  it('eyeDrop を わたさない・0 は 今の まま（立って いる 2P と 1 人の とき）', () => {
    const a = p2CameraPose(FEET, 77, 12, 5, () => false, out());
    const b = p2CameraPose(FEET, 77, 12, 5, () => false, out(), 0);
    expect(b).toEqual(a);
  });
});
