/**
 * #293 試作: 攻撃 2「両手で 払う」の 当たり（腕と 手の 箱だけ）。画面・DOM には さわらない（ユニットテストで 動かせる）。
 *  払って いる 側の 腕（名前の おわりが L / R の 手・前わん・上わんの 先）の 箱の かたちに そって、プレイヤーの 足もとが 箱の 上（横）に あり、
 *  地面からの 高さが armHeight より 低ければ 当たる（ジャンプ 約 1.25 では こえられない）。地面から boxHeight より 高い 箱（かた・上わんの つけね）は 当たらない（ふところは 安全）。
 * 数は gashaBigTuning.ts の sweep。
 */
export interface ArmBox {
  name: string;
  /** 箱の 中心（世界の 座標） */
  c: ArrayLike<number>;
  /** 3 本の 軸（9 つ） */
  ax: ArrayLike<number>;
  half: ArrayLike<number>;
  ext: ArrayLike<number>;
}

export interface ArmTune { armHeight: number; boxHeight: number; hitMargin: number }

const ARM = /^(hand|foreArm|upperArmMid)/;

/** 払って いる 側の 腕の 箱か */
export function isArmBox(name: string, side: 'Left' | 'Right'): boolean {
  return ARM.test(name) && name.endsWith(side === 'Left' ? 'L' : 'R');
}

/** プレイヤー（足もと p）が 払っている 腕に 当たるか。ground = その 場所の 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
export function armHit(boxes: readonly ArmBox[], side: 'Left' | 'Right', p: { x: number; y: number; z: number }, ground: (x: number, z: number) => number, K: ArmTune): boolean {
  const stand = ground(Math.floor(p.x), Math.floor(p.z)) + 1;
  if (p.y - stand >= K.armHeight) return false; // 高く ジャンプ中: こえた
  for (const b of boxes) {
    if (!isArmBox(b.name, side)) continue;
    if (b.c[1]! - stand > K.boxHeight) continue; // 高い 箱（かたの ほう）は 当たらない
    const dx = p.x - b.c[0]!, dz = p.z - b.c[2]!;
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const u = dx * b.ax[k * 3]! + dz * b.ax[k * 3 + 2]!; // 箱の 中心の 高さの 横断面で 見る
      if (Math.abs(u) > b.half[k]! + K.hitMargin) ok = false;
    }
    if (ok) return true;
  }
  return false;
}
