import type { HookNamespace } from '../contracts';
import { normalizeYaw, type PlayerController } from './PlayerController';

const DEG = Math.PI / 180;

type Vec = Partial<{ x: number; y: number; z: number }>;

/** `window.__rikkun.player` の中身（get / set）。doll は T4 が足す */
export function createPlayerHook(controller: PlayerController): HookNamespace {
  const hook = {
    get: () => {
      const s = controller.state;
      const yaw = s.yawDeg * DEG;
      return {
        position: { ...s.position },
        velocity: { ...s.velocity },
        yaw: normalizeYaw(s.yawDeg),
        pitch: s.pitchDeg,
        forward: { x: Math.sin(yaw), z: -Math.cos(yaw) },
        onGround: s.onGround,
        facing: normalizeYaw(s.facingDeg ?? s.yawDeg),
        running: s.running ?? false,
      };
    },
    set: (v: { position?: Vec; velocity?: Vec; yaw?: number; pitch?: number; facing?: number }) => {
      controller.set({
        position: v.position,
        velocity: v.velocity,
        yawDeg: v.yaw,
        pitchDeg: v.pitch,
        facingDeg: v.facing,
      });
    },
  };
  return hook as unknown as HookNamespace;
}
