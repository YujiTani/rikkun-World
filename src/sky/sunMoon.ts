import type { TimeSettings } from '../time/config';

export interface BodyPose {
  visible: boolean;
  /** 0 = 東の地平線、π/2 = 真上、π = 西の地平線 */
  angle: number;
}

/**
 * おひさま は ひる から ゆうがた の終わりまで、おつきさま は よる から あさ の終わりまで、
 * 東から西へ一度だけ通る。
 */
export function sunMoonPose(dayTick: number, s: TimeSettings): { sun: BodyPose; moon: BodyPose } {
  const sunEnd = s.dayTicks + s.duskTicks;
  const moonLen = s.nightTicks + s.dawnTicks;
  if (dayTick < sunEnd) {
    return { sun: { visible: true, angle: (Math.PI * dayTick) / sunEnd }, moon: { visible: false, angle: 0 } };
  }
  return {
    sun: { visible: false, angle: 0 },
    moon: { visible: true, angle: (Math.PI * (dayTick - sunEnd)) / moonLen },
  };
}

/** 角度 → カメラからの向き（東 = +X、上 = +Y）。out に入れて返す */
export function skyDirection(angle: number, tilt: number, out: { x: number; y: number; z: number }) {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const len = Math.hypot(x, y, tilt);
  out.x = x / len;
  out.y = y / len;
  out.z = tilt / len;
  return out;
}
