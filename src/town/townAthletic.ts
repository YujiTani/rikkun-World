import { Builder, T } from './townBuilder';

/**
 * TOWN-1 1B-2 試作: アスレチック（忍者の しゅぎょう場）の 置き方の 表（見本 `town/art/v5/proto/athletic2.py`。東の 列・手前。ローカル座標 u ＝ 西→東・v ＝ 奥→手前）。
 * コース: くい 12 本の うねる 列 → 丸太わたり → 石段 → あみの やぐら → つり橋 → もう 1 つの やぐら → 赤い すべり台 → 池の とび石 → ゴールの やぐら（太鼓と 旗）。
 * 高さ h ＝ その 上に 立つ ときの 足の 高さ（マス。地面 ＝ 0）。となりの 台との あきは 1 マス・高さの 差は 1 まで（ジャンプ 1.25 で とどく）。
 * ゆれる 丸太・たわむ 橋は 動かない 物で 作る。落ちても 地面（落下で 体力は へらない）から やりなおせる。
 * 表は townAthletic.test.ts が「スタートから ゴールまで ジャンプで つながる」を しらべる。
 */
export const ATHLETIC = {
  /** かこい（竹がき 2 だん）の はんい */
  fence: { u0: 72, u1: 97, v0: 57, v1: 87 },
  /** 門（北がわ v 57）: u 82〜85 が あく。柱は u 81・86（かんばんは なし） */
  gate: { u0: 82, u1: 85, v: 57 },
  /** 西の ぬけ道（u 72・v 73〜74 が あく） */
  westGap: { u: 72, v0: 73, v1: 74 },
  /** スタート（門を 入った 地面）と ゴール（ゴールの やぐらの ゆか） */
  start: { u: 83, v: 58, h: 0 },
  goal: { u: 77, v: 81, h: 4 },
  /** くい 12 本（うねる 列。u, v, h）。となりの くいとの あきは 1 マスと 2 マスを まぜる（2 マスの あきは 同じ 高さ か 下がる 所だけ） */
  stakes: [
    [83, 60, 1], [80, 60, 1], [78, 60, 2],
    [78, 62, 2], [80, 62, 3], [83, 62, 3],
    [83, 64, 3], [81, 64, 2], [78, 64, 2],
    [78, 66, 3], [81, 66, 3], [83, 66, 2],
  ],
  /** 丸太わたり（v 66・u 85〜88・高さ 2。ならべた 丸太） */
  logs: { v: 66, u0: 85, u1: 88, h: 2 },
  /** 石段（丸太の 先から やぐらへ） */
  steps: [[89, 66, 3], [90, 66, 4]],
  /** あみの やぐら（u 91〜93・v 66〜68・ゆか 高さ 5）と もう 1 つの やぐら（v 74〜76）。橋は u 92・v 69〜73 */
  tower1: { u0: 91, u1: 93, v0: 66, v1: 68, h: 5 },
  tower2: { u0: 91, u1: 93, v0: 74, v1: 76, h: 5 },
  bridge: { u: 92, v0: 69, v1: 73, h: 5 },
  /** 赤い すべり台（だんで 下がる。u, v, h） */
  slide: [[94, 75, 4], [95, 75, 3], [96, 75, 2]],
  /** 池（地面と 同じ 高さの 水）と とび石（v 81・高さ 1）と ゴールへの だん */
  pond: { u0: 74, u1: 94, v0: 79, v1: 85 },
  stones: [[92, 81, 1], [90, 81, 1], [88, 81, 1], [86, 81, 1], [84, 81, 1]],
  goalSteps: [[82, 81, 2], [80, 81, 3]],
  /** ゴールの やぐら（u 76〜78・v 80〜82・ゆか 高さ 4）。太鼓は 西はしの まん中 */
  goalTower: { u0: 76, u1: 78, v0: 80, v1: 82, h: 4 },
  /** とちゅうの 黄色い 小旗（地面。u, v） */
  smallFlags: [[85, 60], [77, 61], [85, 63], [77, 65], [85, 69], [89, 64]],
} as const;

/** 柱を 立てた やぐらを 作る（ゆかは dy h−1。下に 4 本の 柱と あみ。上に 4 すみの 柱） */
function tower(b: Builder, t: { u0: number; u1: number; v0: number; v1: number; h: number }, flag: boolean): void {
  const top = t.h - 1;
  b.fill(t.u0, t.v0, top, t.u1, t.v1, top, T('yukaita'));
  for (const u of [t.u0, t.u1]) for (const v of [t.v0, t.v1]) {
    b.fill(u, v, 0, u, v, top - 1, T('hashira'));
    b.fill(u, v, top + 1, u, v, top + 2, T('hashira'));
  }
  const mu = (t.u0 + t.u1) / 2;
  const mv = (t.v0 + t.v1) / 2;
  b.fill(mu, t.v0, 0, mu, t.v0, top - 1, T('takegaki'));
  b.fill(mu, t.v1, 0, mu, t.v1, top - 1, T('takegaki'));
  b.fill(t.u0, mv, 0, t.u0, mv, top - 1, T('takegaki'));
  b.fill(t.u1, mv, 0, t.u1, mv, top - 1, T('takegaki'));
  if (flag) b.put(t.u1, t.v1, top + 3, T('hata'));
}

export function buildAthletic(b: Builder): void {
  const A = ATHLETIC;
  const F = A.fence;
  // 竹がきの かこい（2 だん）。門と 西の ぬけ道は あける
  for (let u = F.u0; u <= F.u1; u++) for (const v of [F.v0, F.v1]) if (!(v === A.gate.v && u >= A.gate.u0 && u <= A.gate.u1)) b.fill(u, v, 0, u, v, 1, T('takegaki'));
  for (let v = F.v0; v <= F.v1; v++) for (const u of [F.u0, F.u1]) if (!(u === A.westGap.u && v >= A.westGap.v0 && v <= A.westGap.v1)) b.fill(u, v, 0, u, v, 1, T('takegaki'));
  // 門: 朱の 柱・はり（かんばんは なし）
  for (const u of [A.gate.u0 - 1, A.gate.u1 + 1]) b.fill(u, A.gate.v, 0, u, A.gate.v, 2, T('shubashira'));
  b.fill(A.gate.u0 - 1, A.gate.v, 3, A.gate.u1 + 1, A.gate.v, 3, T('hashira'));
  for (const u of [A.gate.u0 - 3, A.gate.u1 + 3]) b.fill(u, A.gate.v, 0, u, A.gate.v, 1, T('noboru_g'));
  // くい（高さ h ＝ 下から h こ つむ）・丸太わたり・石段
  for (const [u, v, h] of A.stakes) b.fill(u, v, 0, u, v, h - 1, T('kui'));
  for (let u = A.logs.u0; u <= A.logs.u1; u++) b.fill(u, A.logs.v, 0, u, A.logs.v, A.logs.h - 1, T('maruta_dai'));
  for (const [u, v, h] of A.steps) b.fill(u, v, 0, u, v, h - 1, T('itabari'));
  // やぐら 2 つ・つり橋（ゆかの 板・てすり）・すべり台
  tower(b, A.tower1, true);
  tower(b, A.tower2, false);
  const br = A.bridge;
  b.fill(br.u, br.v0, br.h - 1, br.u, br.v1, br.h - 1, T('yukaita'));
  for (const u of [br.u - 1, br.u + 1]) b.fill(u, br.v0, br.h, u, br.v1, br.h, T('tesuri'));
  for (const [u, v, h] of A.slide) b.fill(u, v, 0, u, v, h - 1, T('shubashira'));
  // 池（地面と 同じ 高さ・はすと こい）・とび石・ゴールの だん・ゴールの やぐらと 太鼓と 旗
  const P = A.pond;
  b.fill(P.u0, P.v0, -1, P.u1, P.v1, -1, (u, v) => T((u * 7 + v * 3) % 11 === 0 ? 'ike_hasu' : (u * 5 + v) % 13 === 0 ? 'ike_koi' : 'ike'));
  for (const [u, v, h] of A.stones) b.fill(u, v, 0, u, v, h - 1, T('fuchi'));
  for (const [u, v, h] of A.goalSteps) b.fill(u, v, 0, u, v, h - 1, T('itabari'));
  const G = A.goalTower;
  tower(b, G, false);
  b.put(G.u0, 81, G.h, T('taiko'));
  b.put(G.u0, G.v0, G.h, T('hata'));
  b.put(G.u0, G.v1, G.h, T('hata'));
  // とちゅうの 黄色い 小旗・ベンチ（見物）
  for (const [u, v] of A.smallFlags) b.put(u, v, 0, T('hata_ki'));
  b.put(73, 62, 0, `${T('bench')}@v`);
  b.put(73, 66, 0, `${T('bench')}@v`);
}
