import { ImpactBus, type ImpactLogEntry } from '../fx/impact';
import type { DuoCamFx } from './camFx';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md §3.6「手ごたえ」・§8 の `impactFor(who)`・§12.0 の `duo.impact`・AC97・AC113）:
 * 当たりの 止め・ゆれを「だれの 物か」で ふりわける。three を 使わない。テストは impactRoute.test.ts。
 * 1 人の とき: 世界を 止め、1P の カメラが ゆれる（今の まま）。2 人の とき: 世界は 止めず、その人の カメラだけ 止める・ゆらす。
 */

export interface ImpactRouteDeps {
  /** 2P が いるか（shared.duoJoined） */
  joined: () => boolean;
  /** 1 人の とき 世界を 止める（game.hitStop） */
  worldStop: (ticks: number) => void;
  /** 世界の 止めの のこり（game.hitStopLeft）。1 人の ときの `duo.impact(1).stopLeft` */
  worldStopLeft: () => number;
  /** その人の カメラ（1P は CameraRig を 包む 物、2P は P2CamFx） */
  camFx: (who: 1 | 2) => DuoCamFx;
  /** ゆれを 出すか（FX_SETTINGS.fxShake が 0 でない）。0 でも 止めは 出す */
  shakeOn: () => boolean;
  /** game.tick */
  tick: () => number;
}

/** `duo.impact(who)` の 形 */
export interface ImpactView {
  trauma: number;
  stopLeft: number;
  log: ImpactLogEntry[];
}

export interface ImpactRoute {
  /** 作った ImpactBus を 使い回す（呼ぶ たびに 新しい 物を 作らない。2 人 ↔ 1 人に かわっても 同じ） */
  impactFor(who: 1 | 2): ImpactBus;
  /** ステップの おわりに 1 回（2 つとも） */
  flush(): void;
  /** `duo.impact(who)`。log は コピー。1 人の とき who 2 は null */
  view(who: 1 | 2): ImpactView | null;
}

export function createImpactRoute(d: ImpactRouteDeps): ImpactRoute {
  const make = (who: 1 | 2): ImpactBus =>
    new ImpactBus({
      stop: (n) => {
        if (d.joined()) d.camFx(who).freeze(n);
        else if (who === 1) d.worldStop(n);
      },
      shake: (a) => {
        if (!d.shakeOn()) return;
        if (d.joined() || who === 1) d.camFx(who).addTrauma(a);
      },
      tick: d.tick,
    });
  const buses = { 1: make(1), 2: make(2) } as const;
  return {
    impactFor: (who) => buses[who],
    flush() {
      buses[1].flush();
      buses[2].flush();
    },
    view(who) {
      const joined = d.joined();
      if (!joined && who === 2) return null;
      const fx = d.camFx(who);
      return {
        trauma: fx.trauma(),
        stopLeft: joined ? fx.stopLeft() : d.worldStopLeft(),
        log: buses[who].log.map((l) => ({ ...l })),
      };
    },
  };
}
