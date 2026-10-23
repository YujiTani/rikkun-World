import type { CameraRig } from './CameraRig';

/** テスト用の窓口（M1-02 §6.1）。camera.get / camera.overview と player.doll 用の関数 */
export function createCameraHook(rig: CameraRig) {
  return {
    camera: {
      get: () => rig.getInfo(),
      overview: (on: boolean) => rig.overview(on),
      /** スクショ用: キャラ を かくす（けしゴム。ふだん は 使わない） */
      hideDoll: (on: boolean) => rig.hideDoll(on),
      /** WEAPON-2 */
      dollPose: () => rig.dollPose(),
      firstPersonTip: () => rig.firstPersonTip(),
      fov: () => rig.fov(),
      bowPose: () => rig.bowPose(),
      bowHand: () => rig.bowHand(),
      /** WEAPON-9: カメラだけ 体の 向きから ずらす（度。0 でもどる） */
      yawOffset: (deg: number) => {
        rig.testYawOffsetDeg = Number.isFinite(deg) ? deg : 0;
      },
    },
    /** `player.doll` に入れる関数 */
    doll: () => ({
      visible: rig.doll.visible,
      parts: rig.doll.parts,
      heldItem: rig.heldItemNow(),
      heldScreen: rig.heldScreen(),
      armAngle: rig.doll.armAngle,
      legAngle: rig.doll.legAngle,
      /** うでの層の今の動き（何もなければ 'none'）・からだの層の動き・うでの層の何ステップ目か（§2.9） */
      armAnim: rig.doll.armAnim,
      bodyAnim: rig.doll.bodyAnim,
      animTick: rig.doll.animTick,
      /** 着ている防具の見た目 */
      armor: { head: rig.doll.armorWorn('head'), body: rig.doll.armorWorn('body'), arms: rig.doll.armorWorn('arms'), legs: rig.doll.armorWorn('legs') },
      /** 切ったあとの白い弧 */
      arc: rig.doll.arcShown,
    }),
  };
}
