import type { Vec3, YokaiWorld } from '../contracts';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import type { SlashFx } from './slashFx';

/**
 * NINJA-1 §4.3: 小太刀の 追い打ちの 絵（今の 斬撃を 小さく 白く）。1P（wire/creatures.ts）と 2P（wire/duoPlay.ts。COOP-1 4b）で 同じ 物を 使う。
 * 追い打ちの 当たりと 同じ ステップに（delay 0）、妖怪の 中心の 高さで カメラ側の 手前に 出す（体に かくれない・遠ざけない）。
 * from = 打った 人の 足もと（斬撃の 向きの もと。読むたびに いまの 位置）。
 */
export function queueKodachiSlash(fx: Pick<SlashFx, 'queueSlash'>, camera: { position: Vec3 }, yokai: Pick<YokaiWorld, 'list'>, from: Vec3, yokaiId: number): void {
  const y = yokai.list().find((q) => q.id === yokaiId);
  if (!y) return;
  const dx = y.position.x - from.x;
  const dz = y.position.z - from.z;
  const uDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const T = NINJA_TUNING;
  fx.queueSlash({
    tech: 'kiriage',
    step: 1,
    uDeg,
    pos: () => y.position,
    reach: T.tekkoSlashReach,
    delay: 0,
    back: 0,
    center: () => {
      const c = camera.position;
      const vx = c.x - y.position.x;
      const vz = c.z - y.position.z;
      const vl = Math.hypot(vx, vz) || 1;
      return { x: y.position.x + (vx / vl) * T.tekkoSlashFront, y: y.position.y + T.tekkoSlashHeight, z: y.position.z + (vz / vl) * T.tekkoSlashFront };
    },
  });
}
