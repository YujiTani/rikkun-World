/**
 * #308 gashaBig.ts を 分けた もの: あたまの 見た目と 当たり（頭がい・目・歯・ヘアバンド・ツインテール・ヘアリボン・矢とネックレス）。
 */
import { CylinderGeometry, Euler, ExtrudeGeometry, Matrix4, OctahedronGeometry, Quaternion } from 'three';
import { Node, BONE, BONE_D, BONE_DK, DARK, MOSS, INK, HAIR, C, vec, octShape } from './gashaBigBuilder';
import { TUNE as T } from './gashaBigTuning';
import type { BuildCtx } from './gashaBigBuildCtx';

/** あたま（関節 Head）: 頭がい・目・歯・髪・ヘアリボン・矢。頭の 向き（ラジアン）を 返す */
export function buildHead(c: Pick<BuildCtx, 'b' | 'headPos' | 'moss'>): number {
  const { b, headPos, moss } = c;
  const headYaw = (T.place.headYawDeg * Math.PI) / 180;
  const head = b.root('Head').group(headPos.x, headPos.y, headPos.z, [0.17, headYaw, 0], undefined, 'YXZ');
  {
    const R = 9.5, bt = 3.0, bs = 1.4, dep = 9.4;
    const geo = new ExtrudeGeometry(octShape(R, 3.6), { depth: dep, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelOffset: 0, bevelSegments: 3, curveSegments: 4 });
    head.geom(geo, BONE, new Matrix4().compose(vec(0, 5 + bt, -0.2), new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0)), vec(1, 1, 1)));
    geo.dispose();
  }
  // てっぺんの 小さな 穴（中から うっすら 光る）
  head.box(3.4, 1.0, 3.4, 0, 14.6, -0.4, 0x2a1d1a);
  head.box(3.3, 2.6, 3.3, 0, 16.2, -0.4, 0x3a2a2c);
  head.glowBox(3.2, 0.25, 3.2, 0, 17.5, -0.4, 0x8aeaff, 0.45);
  head.geom(new OctahedronGeometry(0.8), 0xcffaff, new Matrix4().makeTranslation(0, 17.0, -0.4), 'bright');
  for (const [w, d, x, z] of [[4.0, 0.3, 0, -2.2], [4.0, 0.3, 0, 1.4], [0.3, 4.0, -2.0, -0.4], [0.3, 4.0, 2.0, -0.4]] as const) head.glowBox(w, 0.15, d, x, 20.45, z, 0xbff4ff, 0.55);
  // 後頭部の 大きな 欠け（奥に コア）
  {
    const zb = -10.3, cy = 10.2;
    for (const [w, h, x, y] of [[5.0, 5.0, 0, cy], [6.4, 2.6, 0.2, cy + 0.4], [3.0, 6.6, -0.8, cy - 0.2], [2.0, 3.2, 3.2, cy - 1.6], [2.2, 2.0, -3.0, cy + 2.2]] as const) head.box(w, h, 0.4, x, y, zb - 0.1, 0x241612);
    const rimBox = (w: number, h: number, x: number, y: number, d: number, c = BONE_D) => head.box(w, h, d, x, y, zb - d / 2 - 0.1, c);
    rimBox(4.2, 1.8, -3.0, cy + 3.9, 2.6); rimBox(3.0, 1.2, 0.6, cy + 3.6, 1.6); rimBox(2.6, 2.2, 3.4, cy + 4.1, 2.4); rimBox(2.2, 1.0, 5.2, cy + 2.9, 1.4);
    rimBox(2.0, 3.0, -4.9, cy + 1.2, 2.2); rimBox(1.4, 1.6, -4.2, cy - 1.6, 1.2); rimBox(2.2, 2.4, -5.4, cy - 3.0, 2.6);
    rimBox(2.6, 1.4, -2.4, cy - 3.9, 1.8); rimBox(2.4, 1.0, 1.2, cy - 3.4, 1.0); rimBox(3.2, 1.8, 3.8, cy - 4.0, 2.6); rimBox(1.8, 2.6, 5.3, cy - 1.6, 1.6); rimBox(1.2, 1.4, 4.4, cy + 0.6, 1.0);
    for (const [x, y, w, h] of [[-7.2, cy + 5.6, 1.6, 0.6], [-8.4, cy + 6.4, 1.2, 0.6], [-9.2, cy + 7.4, 0.8, 1.2], [7.4, cy + 4.6, 1.6, 0.6], [8.8, cy + 5.4, 1.2, 0.6], [9.6, cy + 6.6, 0.8, 1.4],
      [-7.0, cy - 5.4, 1.4, 0.6], [-8.2, cy - 6.4, 1.0, 1.2], [6.8, cy - 5.6, 1.6, 0.6], [8.2, cy - 6.6, 1.0, 1.2], [-1.0, cy + 6.6, 0.6, 1.4], [0.2, cy + 7.8, 0.6, 1.2]] as const) head.box(w, h, 0.5, x, y, zb - 0.1, BONE_DK);
    head.box(1.5, 1.2, 1.2, -6.4, cy + 4.6, zb - 0.5, BONE, [0, 0.3, 0.5]); head.box(1.2, 1.0, 1.0, 6.8, cy - 4.2, zb - 0.4, BONE, [0, -0.3, 0.6]); head.box(1.0, 1.0, 1.0, 1.8, cy + 5.4, zb - 0.6, BONE, [0.3, 0.3, 0.2]);
    // （コアは 心臓へ うつした。欠けの 見た目だけ のこす）
    // 後ろの 大きな ヘアリボン。羽の 上は 平らな あしば
    const rb = head.group(0, 3.6, -11.6);
    const RP = 0xf6a6c8, RL = 0xc3a4f2, RD = 0xd8789f;
    rb.box(4.6, 4.2, 3.6, 0, 0, 0, RD); rb.box(4.8, 0.5, 3.8, 0, 1.0, 0, RL);
    for (const sd of [-1, 1]) {
      rb.box(7.0, 3.0, 8.5, sd * 5.3, 0.6, -2.2, RP); rb.box(7.0, 0.5, 8.5, sd * 5.3, 2.15, -2.2, RL);
      rb.box(7.5, 3.4, 12.0, sd * 11.6, 0.8, -3.6, RP); rb.box(7.5, 0.5, 12.0, sd * 11.6, 2.5, -3.6, RL);
      rb.box(1.0, 3.4, 12.0, sd * 15.7, 0.8, -3.6, RD); rb.box(6.4, 1.0, 10.0, sd * 11.0, -1.2, -3.6, RD);
      rb.box(3.0, 8.0, 1.6, sd * 3.0, -5.0, -3.0, RP, [0, 0, sd * 0.25]); rb.box(3.0, 6.0, 1.6, sd * 6.0, -4.2, -3.4, RL, [0, 0, sd * 0.45]);
      // 当たり（リボンの 羽の 上の 面）
      rb.hit(`ribbonWing${sd < 0 ? 'R' : 'L'}`, 7.5, 3.4 + 0.5, 12.0, sd * 11.6, 0.8 + 0.25, -3.6);
      rb.hit(`ribbonWing2${sd < 0 ? 'R' : 'L'}`, 7.0, 3.0 + 0.5, 8.5, sd * 5.3, 0.6 + 0.25, -2.2);
      // たれる リボン 2 本（うすい ので 2.4 の あつみで）
      rb.hit(`ribbonTail${sd < 0 ? 'R' : 'L'}0`, 3.0, 8.0, 2.4, sd * 3.0, -5.0, -3.0, [0, 0, sd * 0.25]);
      rb.hit(`ribbonTail${sd < 0 ? 'R' : 'L'}1`, 3.0, 6.0, 2.4, sd * 6.0, -4.2, -3.4, [0, 0, sd * 0.45]);
    }
    rb.hit('ribbonKnot', 4.8, 4.2, 3.8, 0, 0.5, 0);
  }
  // 頭がいの 当たり
  //   頭がい 本体 ＋ てっぺんの 穴の まわりの わく ＋ よこ（こめかみ）＋ あご・ほお。てっぺんの 穴（コアが 見える ところ）と
  //   後ろの 欠け（コアを ねらう ところ）は 箱を おかない: 穴の 底（光る 板）まで のぞける・矢が 通る。
  head.hit('skull', 20.0, 12.5, 20.8, 0, 11.25, 0.4);
  head.hit('skullTop0', 8.2, 2.9, 19.6, -5.9, 18.95, -0.1); // てっぺんの わく（穴の 左）
  head.hit('skullTop1', 8.2, 2.9, 19.6, 5.9, 18.95, -0.1); // （穴の 右）
  head.hit('skullTop2', 3.6, 2.9, 8.1, 0, 18.95, 5.65); // （穴の 前）
  head.hit('skullTop3', 3.6, 2.9, 7.9, 0, 18.95, -5.95); // （穴の 後ろ）
  for (const s of [-1, 1]) head.hit(`skullTemple${s < 0 ? 'R' : 'L'}`, 2.4, 6.0, 8.0, s * 10.6, 7.0, 0); // こめかみ
  head.hit('skullJaw', 16.8, 5.9, 16.9, 0, 2.35, 2.05); // あご・ほお・歯
  // ほお骨・あご
  head.box(15.5, 5.4, 15.5, 0, 2.6, 1.4, BONE_D);
  head.box(13.5, 3.2, 14.2, 0, 1.0, 1.6, BONE_D);
  head.box(18, 1.2, 3, 0, 5.2, 8.4, BONE);
  for (const s of [-1, 1]) { head.box(3.4, 3.4, 3.4, s * 8.4, 5.5, 8.0, BONE); head.box(2.4, 6, 8, s * 10.6, 7, 0, BONE_D); }
  // 目（くらい 穴 と 光る 目。色は 外から かえる）
  for (const s of [-1, 1]) {
    const x = s * 4.9, y = 9.6;
    head.box(6.4, 7.0, 1.4, x, y, 10.0, 0x241612);
    head.box(5.0, 5.6, 0.4, x, y, 10.75, 0x120a08);
    const rotX = new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0));
    head.geom(new CylinderGeometry(1.5, 1.5, 0.7, 10), 0xffffff, new Matrix4().compose(vec(x, y - 0.2, 11.0), rotX, vec(1, 1, 1)), 'eyes');
    head.geom(new CylinderGeometry(2.4, 2.4, 0.3, 10), 0xffffff, new Matrix4().compose(vec(x, y - 0.2, 11.15), rotX, vec(1, 1, 1)), 'eyeHalo');
    for (let k = 0; k < 3; k++) head.box(0.55, 1.9, 0.5, x + s * (3.0 + k * 0.1), y + 3.2 - k * 1.0, 10.8, INK, [0, 0, -s * (0.9 + k * 0.35)]);
    head.box(5.4, 0.7, 0.5, x, y + 3.5, 10.8, INK);
    head.box(3.0, 1.3, 0.3, s * 7.8, 5.7, 10.2, 0xf4a3b2);
    head.box(7.6, 1.1, 0.6, x - s * 0.2, y + 4.6, 10.6, INK, [0, 0, s * 0.42], 'brow'); // 怒った とき だけ 見せる まゆ
  }
  head.box(0.9, 1.5, 0.5, -0.8, 5.9, 10.2, DARK, [0, 0, 0.2]); head.box(0.9, 1.5, 0.5, 0.8, 5.9, 10.2, DARK, [0, 0, -0.2]);
  head.box(9.0, 2.6, 0.8, 0, 2.6, 9.6, DARK);
  for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 1.3; head.box(1.15, 1.15, 0.9, x, 3.2 + 0.07 * x * x, 10.0, 0xfffbee); }
  for (let i = 0; i < 4; i++) { const x = (i - 1.5) * 1.3; head.box(1.15, 1.0, 0.9, x, 1.7 + 0.05 * x * x, 10.0, 0xfffbee); }
  head.box(0.5, 0.5, 0.9, -5.0, 4.2, 9.9, DARK); head.box(0.5, 0.5, 0.9, 5.0, 4.2, 9.9, DARK);
  moss(head, -5, 18.6, 3, 5, 4); moss(head, -2, 20.4, -5, 3, 3); moss(head, 6, 19.4, -4, 3, 3); moss(head, 7, 17.5, 5, 4, 3); moss(head, -9.5, 11, -2, 3, 3); moss(head, 4, 17.8, -6, 4, 3); moss(head, 10.6, 12, 2, 3, 2);
  head.box(4.5, 1.2, 4.5, -7.8, 17.2, -4, MOSS[1]!); head.box(3, 1.0, 3, -8.5, 16.5, -2, MOSS[0]!);
  // ヘアバンド
  {
    const geo = new ExtrudeGeometry(octShape(11.35, 9.5), { depth: 1.9, bevelEnabled: false });
    head.geom(geo, C.band, new Matrix4().compose(vec(0, 14.4 - 0.95, -0.2), new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0)), vec(1, 1, 1)));
    geo.dispose();
    for (let i = 0; i < 5; i++) head.box(1.2, 1.1, 0.3, -8 + i * 4, 14.4, 10.6, C.band2);
    for (let i = 0; i < 5; i++) head.box(0.3, 1.1, 1.2, 10.6, 14.4, -8 + i * 4, C.band2);
  }
  // ツインテール（黒）＋ ポンポン
  {
    const pc = 0xf27aa8;
    for (const s of [-1, 1]) {
      const pts = [vec(s * 11.8, 13, -3), vec(s * 14.5, 5, -3.5), vec(s * 15.5, -5, -2), vec(s * 15, -14, 1.5)];
      for (let i = 0; i < 3; i++) {
        head.seg(pts[i]!, pts[i + 1]!, 3.2 - i * 0.5, 3.4 - i * 0.5, HAIR);
        head.segHit(`hairTail${s < 0 ? 'R' : 'L'}${i}`, pts[i]!, pts[i + 1]!, 3.2 - i * 0.5, 3.4 - i * 0.5); // 当たり（ツインテールの たれ髪）
      }
      head.hit(`hairTailEnd${s < 0 ? 'R' : 'L'}`, 2.0, 2.4, 2.0, s * 14.4, -15.4, 2.2);
      head.hit(`hairPom${s < 0 ? 'R' : 'L'}0`, 3.2, 3.2, 3.2, s * 11.8, 13.6, -3);
      head.hit(`hairPom${s < 0 ? 'R' : 'L'}1`, 3.4, 3.4, 3.4, s * 15.0, -1.5, -2.8);
      head.box(2.0, 2.4, 2.0, s * 14.4, -15.4, 2.2, HAIR);
      head.box(3.2, 3.2, 3.2, s * 11.8, 13.6, -3, pc); head.box(2.2, 2.2, 3.6, s * 11.8, 13.6, -3, 0xffd0e0);
      head.box(3.4, 3.4, 3.4, s * 15.0, -1.5, -2.8, pc);
      moss(head, s * 13, 14.8, -3, 1, 1);
    }
    head.box(2.4, 2.0, 0.8, 8.4, 16.6, 8.4, 0xffd84a, [0, 0, 0.4]); head.box(2.4, 2.0, 0.8, 11, 16.6, 8, 0xffd84a, [0, 0, -0.4]);
  }
  // 左目（キャラの 左 = +x）に ささった 大きな 矢 ＋ ネックレス
  {
    const P0 = vec(4.9, 9.6, 8.5), d = vec(0.85, 0.38, 0.4).normalize();
    const g = head.group(P0.x, P0.y, P0.z);
    const qa = new Quaternion().setFromUnitVectors(vec(0, 0, 1), d);
    const ga = new Node(b, 'Head', g.m.clone().multiply(new Matrix4().makeRotationFromQuaternion(qa)));
    ga.box(1.5, 1.5, 28, 0, 0, 12, 0xc99358); ga.box(0.6, 0.6, 28, 0.5, 0.5, 12, 0xe0b27a);
    ga.box(2.2, 2.2, 0.8, 0, 0, 26.2, 0x8a5a2a);
    for (let k = 0; k < 3; k++) {
      const gp = ga.group(0, 0, 22.6, [0, 0, (k * Math.PI * 2) / 3 + 0.4]);
      gp.box(0.35, 2.8, 6.0, 0, 1.9, 0, k === 0 ? 0xffffff : C.stripe);
      gp.box(0.35, 1.0, 2.4, 0, 3.6, -1.8, k === 0 ? 0xf1e6cb : 0xffffff);
    }
    const dn = vec(0, -1, 0).applyQuaternion(qa.clone().invert()).normalize();
    const N = 18, a0 = vec(0, 0, 9), a1 = vec(0, 0, 18), sag = 9;
    for (let i = 0; i <= N; i++) {
      const t = i / N, c = a0.clone().lerp(a1, t).addScaledVector(dn, sag * 4 * t * (1 - t) + 1.0);
      ga.box(0.9, 0.9, 0.9, c.x, c.y, c.z, C.beads[i % 2]!, [0, 0, i]);
    }
    const mid = a0.clone().lerp(a1, 0.5).addScaledVector(dn, sag + 2.4);
    ga.box(3.0, 3.0, 1.0, mid.x, mid.y, mid.z, C.pendant, [0, 0, Math.PI / 4]);
    ga.box(1.4, 1.4, 1.2, mid.x, mid.y, mid.z, 0xffffff);
    ga.box(1.9, 1.9, 0.7, 0, 0, 9, C.beads[0]); ga.box(1.9, 1.9, 0.7, 0, 0, 18, C.beads[0]);
  }
  return headYaw;
}
