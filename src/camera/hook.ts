import type { CameraRig } from './CameraRig';

/** テスト用の窓口（M1-02 §6.1）。camera.get / camera.overview と player.doll 用の関数 */
export function createCameraHook(rig: CameraRig) {
  return {
    camera: {
      get: () => rig.getInfo(),
      overview: (on: boolean) => rig.overview(on),
    },
    /** `player.doll` に入れる関数 */
    doll: () => ({
      visible: rig.doll.visible,
      parts: rig.doll.parts,
      heldItem: rig.heldItemNow(),
      heldScreen: rig.heldScreen(),
      armAngle: rig.doll.armAngle,
      legAngle: rig.doll.legAngle,
    }),
  };
}
