/** おひさま・おつきさまの数値（M3 §3.2） */
export const SKY_VIEW = {
  sunColor: 0xffe14d,
  moonColor: 0xf5f5dc,
  /** カメラからの距離（かすみ 90 より遠く、カメラの far 500 より近く） */
  distance: 200,
  /** 四角の1辺 */
  size: 32,
  /** 通り道の手前（+Z）へのかたより。ちょうど頭の上を通らないように */
  tilt: 0.25,
} as const;
