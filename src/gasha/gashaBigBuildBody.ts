/**
 * #308 gashaBig.ts を 分けた もの: 胴体の 見た目（背骨・ろっ骨・セーラー服）・胴体の 当たり・背中の 穴から コアまでの 道。
 * 箱の 並べる 順・乱数を 使う 順は もとの まま。
 */
import { CylinderGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { Node, BONE, BONE_D, INK, C, vec } from './gashaBigBuilder';
import { JointName } from './gashaBigTypes';
import type { BuildCtx } from './gashaBigBuildCtx';

/** 胴体（背骨・ろっ骨・ぼろぼろセーラー服）。箱は ついて 動く 関節ごとに 分ける。ここには 当たりを 置かない（拡大が 左右で ちがう ため） */
export function buildTorso(c: Pick<BuildCtx, 'rnd' | 'moss' | 'tj' | 'vJoint' | 'KT' | 'SHOLE' | 'TX0' | 'TX1' | 'CEIL'>): void {
  const { rnd, moss, tj, vJoint, KT, SHOLE, TX0, TX1, CEIL } = c;
  {
    // 背中の ぬの（x ±4.5、y 12〜36）。背中の 穴の ぶんだけ あける（穴の 左右の はば TX0〜TX1、高さ 床〜天井）
    const px = (x0: number, x1: number, y0: number, y1: number): void => { if (x1 - x0 > 0.2 && y1 - y0 > 0.2) tj('Spine01').box(x1 - x0, y1 - y0, 1.0, (x0 + x1) / 2, (y0 + y1) / 2, -5.0, 0x5a463c); };
    px(-4.5, Math.min(4.5, TX0 - 0.2), 12, 36);
    px(TX0 - 0.2, 4.5, 12, KT.floorY - 0.5); px(TX0 - 0.2, 4.5, CEIL + 0.5, 36);
  }
  for (let i = 0; i < 20; i++) {
    const y = 3 + i * 2.05, w = 3.3 + (i % 2) * 0.6, t = tj(vJoint(i));
    t.box(w, 1.8, 3.2, 0, y, -7.2, i % 2 ? BONE : BONE_D);
    t.box(1.2, 1.3, 2.4, 0, y, -9.0, i % 2 ? BONE_D : BONE);
    if (i > 6 && i < 17) moss(t, 0.8 * (i % 3 - 1), y + 0.8, -8.6, 1, 1);
  }
  for (let i = 0; i < 3; i++) tj('neck').box(2.6, 1.5, 2.6, 0, 38.5 + i * 1.6, -6.2 + i * 0.4, i % 2 ? BONE : BONE_D);
  const RIB_LV = 7;
  for (let i = 0; i < RIB_LV; i++) {
    const y = 15.5 + i * 2.75, a = 8 + 3.6 * Math.sin(Math.PI * (i + 1.1) / (RIB_LV + 1.6)), bb = a * 0.72;
    const t = tj(i < 2 ? 'Spine01' : 'Spine02');
    for (const s of [-1, 1]) {
      let prev: Vector3 | null = null, prevIn = false;
      for (let k = 0; k <= 7; k++) {
        const phi = 0.12 + (k / 7) * Math.PI * 0.82;
        const p = vec(s * a * Math.sin(phi), y - (k > 5 ? 0.4 : 0) - 0.12 * k, bb * Math.cos(phi) * (phi > 1.6 ? 0.92 : 1) + 0.3);
        // 背中の 穴の 道に かかる ろっ骨は とぎれさせる（穴の 左右 ＋ 1、床〜天井）
        const inHole = (p.x > TX0 - 1.2 && p.x < TX1 + 1.2 && p.y > KT.floorY - 1.2 && p.y < CEIL + 1.2 && p.z < KT.endZ)
          || (!!SHOLE && s > 0 && p.x > TX1 - 0.5 && p.y > SHOLE.y0 - 1.0 && p.y < SHOLE.y1 + 1.0 && p.z > SHOLE.z0 - 1.2 && p.z < SHOLE.z1 + 1.2); // 左の 小さな 穴の まわりの ろっ骨も とぎれさせる
        if (prev && !inHole && !prevIn) t.seg(prev, p, 1.8, 1.75, k % 2 ? BONE : BONE_D);
        prev = p; prevIn = inHole;
      }
      t.box(1.9, 1.9, 1.9, s * 1.3, y, bb + 0.5, BONE_D);
    }
  }
  const chest = tj('Spine02');
  chest.box(2.4, 20, 1.5, 0, 24, 6.7, BONE);
  chest.box(1.6, 17, 1.2, 0, 24, 7.5, BONE_D);
  chest.box(24, 2.2, 2.4, 0, 34.5, 1.4, BONE);
  for (const s of [-1, 1]) {
    const sh = tj(s > 0 ? 'LeftShoulder' : 'RightShoulder');
    sh.box(6, 2, 8, s * 11.5, 34.7, -3, BONE_D); // けんこうこつ
    sh.box(6.5, 3.6, 8.5, s * 11, 35.4, -3, C.top); // かたの ぬの
    moss(sh, s * 12, 37, -1.5, 3, 3);
  }
  moss(chest, -3, 36, 1.4, 4, 3); moss(chest, 7, 36, 0.5, 3, 3);
  // ぼろぼろセーラー服
  const cl = C.top, cd = C.topDark;
  const rag = (p: Node, w: number, h: number, d: number, x: number, y: number, z: number, c: number, teeth = 3, rot?: [number, number, number]): void => {
    const g = p.group(x, y, z, rot);
    g.box(w, h, d, 0, 0, 0, c);
    for (let i = 0; i < teeth; i++) g.box(w / teeth * 0.7, 0.8 + rnd() * 2.2, d, -w / 2 + (i + 0.5) * (w / teeth), -h / 2 - 0.4 - (i % 2) * 0.8, 0, c);
  };
  rag(tj('Spine'), 6.2, 9, 0.7, -5.3, 14, -8.6, cl, 3); rag(tj('Spine'), 6.2, 7, 0.7, 5.3, 13, -8.6, cl, 3);
  rag(tj('Spine01'), 2.2, 5, 0.8, -14.5, 21, -1.5, cl, 2, [0, -1.2, 0.1]);
  rag(tj('Spine01'), 2.2, 6, 0.8, 14.8, 20, -1.5, cl, 2, [0, 1.2, -0.08]);
  rag(tj('Spine'), 4.0, 4, 0.8, -4.5, 11.5, 7.4, cl, 3, [0, 0, 0.15]);
  rag(tj('Spine'), 5.5, 3, 0.8, 5.0, 10.5, 7.6, cl, 3, [0, 0, -0.2]);
  for (const s of [-1, 1]) {
    chest.seg(vec(s * 11.8, 37.0, 0.5), vec(s * 0.8, 29.5, 8.3), 4.2, 0.9, cd);
    chest.seg(vec(s * 11.8, 37.3, 0.5), vec(s * 1.4, 30.2, 8.7), 0.9, 0.6, C.stripe, 0.0, 0.95);
    chest.seg(vec(s * 11.3, 36.4, 1.5), vec(s * 0.6, 28.8, 8.8), 0.9, 0.6, C.stripe, 0.1, 0.95);
  }
  chest.box(15, 0.9, 9.5, 0, 37.6, -4.2, cd);
  chest.box(15.4, 0.5, 0.7, 0, 37.9, -9.0, C.stripe);
  {
    const g = chest.group(0, 29.4, 9.4, [-0.1, 0, 0]);
    g.box(3.2, 3.2, 1.8, 0, 0, 0.3, C.scarf2);
    g.box(4.6, 2.8, 1.2, -3.6, 0.4, 0, C.scarf, [0, 0, 0.3]); g.box(4.6, 2.8, 1.2, 3.6, 0.4, 0, C.scarf, [0, 0, -0.3]);
    g.box(1.8, 6.5, 0.9, -1.1, -4.4, 0.1, C.scarf, [0, 0, 0.12]); g.box(1.8, 5.0, 0.9, 1.2, -3.8, 0.1, C.scarf2, [0, 0, -0.12]);
  }
  // 缶バッジ と 鈴
  chest.geom(new CylinderGeometry(1.7, 1.7, 0.5, 10), 0xffd84a, new Matrix4().compose(vec(-7.0, 33.2, 9.2), new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)), vec(1, 1, 1)));
  chest.box(1.2, 0.3, 0.3, -7.0, 33.2, 9.5, INK); chest.box(0.3, 0.3, 0.3, -7.6, 33.8, 9.5, INK); chest.box(0.3, 0.3, 0.3, -6.4, 33.8, 9.5, INK);
  chest.box(1.2, 1.2, 0.4, -7.0, 31.2, 9.4, 0xf27aa8);
  chest.box(2.0, 2.0, 2.0, 6.6, 31.6, 9.0, 0xffd23a); chest.box(2.0, 0.35, 2.05, 6.6, 31.6, 9.0, 0xc9a020); chest.box(0.5, 0.5, 2.1, 6.6, 31.0, 9.0, 0x6a4a10);
  chest.box(1.2, 0.6, 0.6, 6.6, 33.0, 9.0, 0xf27aa8);
}

/** 当たり（胴体・胸・セーラー服・スカーフ・首・肩） */
export function buildTorsoHits(c: Pick<BuildCtx, 'torso' | 'K' | 'KT' | 'SH' | 'SHOLE' | 'TX0' | 'TX1' | 'CEIL' | 'G0' | 'G1'>): void {
  const { torso, K, KT, SH, SHOLE, TX0, TX1, CEIL, G0, G1 } = c;
  // --- 当たり（胴体・胸・セーラー服・スカーフ・首・肩）: 見える 体の 面を ぜんぶ 固くする。中も 固い（歩いて 入れない）。
  //     箱は 胴体の 座標（ひねりなし。拡大と かたむきは 親の Group が 持つ）で、ついて 動く 関節ごとに 分ける。1 ブロックより うすい 箱は 作らない。
  //     リブの すきま・ぼろぼろの すそ・おまもり などの 小さな かざりは 外側の 箱に ふくまれる（見た目との ずれは 0.5 ブロック いない）。
  {
    const th = (j: JointName) => torso.at(j);
    th('Hips').hit('spineLow', 3.9, 6.8, 4.0, 0, 5.5, -7.6); // 背骨の 下（こしの 骨）
    // おなか・すその ぼろぼろ（ほねは すかすかでも 中は 固い）。道の 穴（G0〜G1）の ところは 下まで ぬける: 穴の 前 / 後ろ は 全幅、穴の 左右の かべ
    const WZ0 = -9.6, WZ1 = 8.4, WY0 = 8.2, WY1 = 16.0;
    const wslab = (name: string, x0: number, x1: number, z0: number, z1: number): void => { if (x1 - x0 > 0.2 && z1 - z0 > 0.2) th('Spine').hit(name, x1 - x0, WY1 - WY0, z1 - z0, (x0 + x1) / 2, (WY0 + WY1) / 2, (z0 + z1) / 2); };
    wslab('torsoWaist', -8.4, 8.4, WZ0, G0); // 穴の 手前（道の 床の つづき）
    wslab('waistGapL', TX1, 8.4, G0, G1); wslab('waistGapR', -8.4, TX0, G0, G1); // 穴の 左右の かべ
    wslab('waistFrontL', TX1, 8.4, G1, WZ1); wslab('waistFrontR', -8.4, TX0, G1, WZ1);
    th('Spine01').hit('spineMid', 3.9, 13.5, 4.0, 0, 24.25, -7.6); // 背骨（ろっ骨の うしろに とび出す ぶん）
    // ろっ骨 1〜2 だんめ・3〜6 だんめ（いちばん ひろい 所）は 道（トンネル）の ぶんだけ あける: 道の 左 / 右。道は 床〜天井。天井の 上は chestMid2
    const slab = (name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, j: JointName = 'Spine02'): void => th(j).hit(name, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    slab('chestLow', TX1, 11.4, 14.6, 19.6, -8.975, 9.075, 'Spine01'); slab('chestLowR', -11.4, TX0, 14.6, 19.6, -8.975, 9.075, 'Spine01');
    slab('chestMid1R', -12.5, TX0, 19.6, CEIL, -8.05, 9.85);
    if (!SHOLE) slab('chestMid1', TX1, 12.5, 19.6, CEIL, -8.05, 9.85);
    else {
      // 左がわの 小さな 穴（K.sideHole）: かべを 穴の まわり 4 つに 分ける。うすい 箱は 作らない
      const part = (name: string, y0: number, y1: number, z0: number, z1: number): void => { if (y1 - y0 > 0.2 && z1 - z0 > 0.2) slab(name, TX1, 12.5, y0, y1, z0, z1); };
      part('chestMid1', 19.6, CEIL, -8.05, SHOLE.z0); // うしろ（背中がわ）
      part('chestMid1Front', 19.6, CEIL, SHOLE.z1, 9.85); // まえ
      part('chestMid1Low', 19.6, SHOLE.y0, SHOLE.z0, SHOLE.z1); // 穴の 下（穴の 下の はしが 19.6 なら なし）
      part('chestMid1Up', SHOLE.y1, CEIL, SHOLE.z0, SHOLE.z1); // 穴の 上（天井まで あけて あれば なし）
      // 穴に 入れない ための 見えない 壁（名前が chest で はじまらない = 矢・刀には 当たらない 'cloud' あつかい。人の 足・体だけ ぶつかる）
      if (SH.guard) th('Spine02').hit('holeGuard', 1.6, SHOLE.y1 - SHOLE.y0, SHOLE.z1 - SHOLE.z0, TX1 + 0.8, (SHOLE.y0 + SHOLE.y1) / 2, (SHOLE.z0 + SHOLE.z1) / 2);
    }
    slab('chestMid2', -12.4, 12.4, CEIL, 30.5, -8.05, 10.45); // 道の 天井から 胸の 上まで（ぜんぶ ふさぐ）
    slab('chestCoreEnd', TX0, TX1, KT.floorY, CEIL, KT.endZ, 10.45); // コアの 向こうの かべ（道の つきあたり）
    slab('chestCoreFloor', TX0, TX1, KT.floorY - KT.floorThick, KT.floorY, KT.backZ, -7.5); // 背中の 外へ のびる 床（穴の 入り口の だん）
    slab('chestFarFloor', TX0, TX1, KT.floorY - KT.floorThick, KT.floorY, G1, KT.endZ); // 穴の むこうがわの 小さな 床（コアの 下）
    th('Spine02').hit('core', K.size, K.size, K.size, K.pos[0], K.pos[1], K.pos[2]); // コア（たたくと ふり落とされる）
    th('Spine02').hit('chestUp', 21.8, 2.9, 16.3, 0, 31.95, 0.85); // 7 だんめ ＋ セーラーの えり（前の V）
    th('Spine02').hit('chestTop', 15.4, 4.8, 14.2, 0, 35.7, -2.6); // 肩の あいだ・えりの 上の 面（ここが 胴体の 上）
    th('Spine02').hit('collarbone', 24.6, 2.6, 4.6, 0, 34.7, 2.0); // さこつ（肩の 先まで）
    th('neck').hit('neck', 3.8, 5.3, 5.5, 0, 40.35, -6.85); // 首（背骨の つづき）
    for (const s of [-1, 1]) th(s > 0 ? 'LeftShoulder' : 'RightShoulder').hit(`shoulderCloth${s < 0 ? 'R' : 'L'}`, 5.2, 2.4, 8.7, s * 7.2, 36.05, -3); // かたの ぬの・けんこうこつ
  }
}

/** 背中の 穴・体の 中の 道（トンネル）・心臓の コア（見た目。当たりは 胴体の 当たり） */
export function buildTunnel(c: Pick<BuildCtx, 'tj' | 'K' | 'KT' | 'SH' | 'SHOLE' | 'TX0' | 'TX1' | 'CEIL' | 'G0' | 'G1'>): void {
  const { tj, K, KT, SH, SHOLE, TX0, TX1, CEIL, G0, G1 } = c;
  // --- 背中の 穴・体の 中の 道（トンネル）・心臓の コア（見た目。当たりは 上の 胴体の 当たり）
  {
    const t = tj('Spine02');
    const W = KT.width, H = CEIL - KT.floorY, zA = -8.1, zB = KT.endZ, L = zB - zA;
    const DARK_IN = 0x1b1116, FLOOR = 0x4d3d38, PIT = 0x120a0e;
    const zc = (z0: number, z1: number) => (z0 + z1) / 2;
    // 中の かべ・床・天井（暗い 内がわ）。床は 穴（G0〜G1）の ところだけ ない
    t.box(W, 0.4, G0 - zA, KT.x, KT.floorY - 0.2, zc(zA, G0), FLOOR);
    t.box(W, 0.4, zB - G1, KT.x, KT.floorY - 0.2, zc(G1, zB), FLOOR);
    t.box(0.4, H, L, TX0 + 0.2, KT.floorY + H / 2, zc(zA, zB), DARK_IN);
    if (!SHOLE) t.box(0.4, H, L, TX1 - 0.2, KT.floorY + H / 2, zc(zA, zB), DARK_IN);
    else {
      // 左の かべは 小さな 穴の ぶんだけ あける（外から コアが 見える）
      const lw = (y0: number, y1: number, z0: number, z1: number): void => { if (y1 - y0 > 0.1 && z1 - z0 > 0.1) t.box(0.4, y1 - y0, z1 - z0, TX1 - 0.2, (y0 + y1) / 2, (z0 + z1) / 2, DARK_IN); };
      lw(KT.floorY, CEIL, zA, SHOLE.z0); lw(KT.floorY, CEIL, SHOLE.z1, zB); lw(KT.floorY, SHOLE.y0, SHOLE.z0, SHOLE.z1); lw(SHOLE.y1, CEIL, SHOLE.z0, SHOLE.z1);
    }
    t.box(W, 0.4, L, KT.x, CEIL - 0.2, zc(zA, zB), DARK_IN);
    t.box(W, H, 0.4, KT.x, KT.floorY + H / 2, zB - 0.2, 0x2b1a20);
    // 穴の かべ（下へ 深く 暗く ぬける。腰の 下の 骨まで）
    for (const sx of [TX0 + 0.2, TX1 - 0.2]) t.box(0.4, 8.0, G1 - G0, sx, KT.floorY - 4.0, zc(G0, G1), PIT);
    t.box(W, 8.0, 0.4, KT.x, KT.floorY - 4.0, G0 + 0.2, PIT); // 手前の 穴の かべ
    t.box(W, 8.0, 0.4, KT.x, KT.floorY - 4.0, G1 - 0.2, PIT); // むこうの 穴の かべ
    // 穴の ふちの ほね（かけた 骨の 歯）
    for (const [z, sgn] of [[G0, -1], [G1, 1]] as const) {
      t.box(W - 0.4, 0.6, 0.9, KT.x, KT.floorY + 0.3, z + sgn * -0.2, BONE);
      for (const dx of [-1.5, -0.3, 1.1]) t.box(0.8, 0.7 + (dx > 0 ? 0.5 : 0), 0.8, KT.x + dx, KT.floorY - 0.5, z + sgn * 0.3, BONE_D);
    }
    // 道の ろっ骨（アーチ）: 床の 骨の いたと、かべ・天井に 沿う 骨を 一定の 間かくで（床の 骨は 穴の ところは なし）
    for (let z = zA + 1.5; z < zB - 0.5; z += 3.0) {
      if (z < G0 - 0.6 || z > G1 + 0.6) t.box(W - 0.6, 0.5, 1.0, KT.x, KT.floorY + 0.1, z, BONE_D);
      t.box(0.8, H - 0.4, 1.0, TX0 + 0.55, KT.floorY + H / 2, z, BONE);
      if (!SHOLE || z < SHOLE.z0 - 0.6 || z > SHOLE.z1 + 0.6) t.box(0.8, H - 0.4, 1.0, TX1 - 0.55, KT.floorY + H / 2, z, BONE);
      t.box(W - 0.6, 0.8, 1.0, KT.x, CEIL - 0.5, z, BONE);
    }
    // 穴の ふち（背中の がわ）と 外へ のびる 床の だん
    t.box(W + 2.4, 1.4, 2.0, KT.x, CEIL + 0.7, zA - 0.7, BONE); // 上
    t.box(1.4, H + 1.4, 2.0, TX1 + 0.7, KT.floorY + H / 2 + 0.7, zA - 0.7, BONE_D); // 左
    t.box(1.4, H + 1.4, 2.0, TX0 - 0.7, KT.floorY + H / 2 + 0.7, zA - 0.7, BONE_D); // 右
    t.box(W + 2.4, KT.floorThick, KT.backZ - zA + 1.0, KT.x, KT.floorY - KT.floorThick / 2, (KT.backZ + zA - 1.0) / 2 + 0.2, BONE); // 外へ のびる 床
    // 左の 小さな 穴の ふち（骨の わく。見た目だけ）。外へ 少し 出して 穴が 目立つ ように
    if (SHOLE && SH.rim) {
      const cy = (SHOLE.y0 + SHOLE.y1) / 2, cz = (SHOLE.z0 + SHOLE.z1) / 2, hh = SHOLE.y1 - SHOLE.y0, ww = SHOLE.z1 - SHOLE.z0, rx = TX1 + 1.4, th = 0.9;
      t.box(2.6, th, ww + 2 * th, rx, SHOLE.y1 + th / 2, cz, BONE); t.box(2.6, th, ww + 2 * th, rx, SHOLE.y0 - th / 2, cz, BONE_D);
      t.box(2.6, hh, th, rx, cy, SHOLE.z0 - th / 2, BONE); t.box(2.6, hh, th, rx, cy, SHOLE.z1 + th / 2, BONE_D);
      t.glowBox(0.3, hh, ww, TX1 - 0.1, cy, (SHOLE.z0 + SHOLE.z1) / 2, 0x8aeaff, 0.16); // 中の コアの 光が もれる（穴が 目立つ）
    }
    // コア: とぎれた 道の むこうで 光る（しん と まわりの 光）
    const cp = K.pos;
    void cp; // コアの 見た目は 別の メッシュ（ふり落としの 予兆で ゆらして 半透明に するため。下の coreVis）
    t.glowBox(W - 0.6, H - 0.6, 0.3, KT.x, KT.floorY + H / 2, zB - 0.6, 0x8aeaff, 0.22);
    // 肩から 穴の 外の だんへ おりる 雲の 段は 肩の 雲を つくる ところ（KW が きまって から）
  }
}
