import { SEA_Y } from '../../contracts';
import { SHAFT_CONFIG } from './mineShaftConfig';
import { isBodyIndex, isSolidIndex, ptKey, standable, type GenCols, type PathCell, type Pt } from './mineShaftKit';
import { heightAt } from './terrain';
import { blockIdsOf, cheb2, gateDir, rectCells, rectCenter, rectD, rectW, upperRect, LOOKS, type Look, type Rect, type Yakata, type YakataShaft, type YakataTable, type Zone } from './mineYakataKit';

/**
 * MINE-1F を ブロックで しらべる 道具〔F2・F21 の 一部。約束は mineYakataKit.ts の 冒頭〕。直した ほうが よい 所を 文で 返す〔空なら 合格〕。
 * 数は ぜんぶ やかたの 表〔`yakataTable()`〕から 読む〔#311〕。
 */

const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SIX: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const COMPASS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;

const inRect = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, y: r.y, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m });

/** やかたの ブロックの 番号〔look の 4 つ〕を 文字で */
const idsSet = (T: YakataTable, look: Look): Set<string> => new Set(blockIdsOf(T, look));
const otherLook = (look: Look): Look => LOOKS.find((l) => l !== look)!;

/** あやしい 横穴が すすむ 向き〔口 → 門〕 */
function passageDir(y: Yakata): { dx: number; dz: number } {
  const a = y.passage[0]!;
  const b = y.passage[y.passage.length - 1]!;
  return Math.abs(b.x - a.x) >= Math.abs(b.z - a.z) ? { dx: Math.sign(b.x - a.x), dz: 0 } : { dx: 0, dz: Math.sign(b.z - a.z) };
}

/** 門の 12 マス〔表の はば × 高さ〕 */
export function gateCells(y: Yakata, T: YakataTable): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < T.gate.height; k++) out.push(...rectCells(y.gate, k));
  return out;
}

/** やかたの 空気の 場所〔あやしい 横穴の 中央 ＋ まわり 1 の はば・大広間の 中〕を 体の 通る マスで しらべる ための 箱 */
export function yakataBox(y: Yakata, T: YakataTable): { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number } {
  const xs = [y.hall.x0 - 1 - T.ring, y.hall.x1 + 1 + T.ring, ...y.passage.map((p) => p.x - 2), ...y.passage.map((p) => p.x + 2)];
  const zs = [y.hall.z0 - 1 - T.ring, y.hall.z1 + 1 + T.ring, ...y.passage.map((p) => p.z - 2), ...y.passage.map((p) => p.z + 2)];
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), y0: y.hall.y - 1 - T.ring, y1: y.hall.y + T.hall.height + 1 + T.ring };
}

/** やかたの 本体〔横穴・大広間・祭壇〕の 足の マス〔ほかの 道との かさなりを 見る〕 */
function footprint(y: Yakata, T: YakataTable): { air: Pt[]; solid: Rect } {
  const air: Pt[] = [...y.passage.slice(3)];
  return { air, solid: grow(y.hall, 1 + T.ring) };
}

// ------------------------------------------------------------------ F2 形

/** 横穴・門・大広間・祭壇・宝箱・出る 場所の 形〔表の とおり〕 */
export function shapeProblemsF(g: GenCols, s: YakataShaft, T: YakataTable, chestAt: (x: number, y: number, z: number) => { table: string; tier: number; opened: boolean } | null): string[] {
  const y = s.yakata!;
  const bad: string[] = [];
  const mine = idsSet(T, y.look);
  const other = idsSet(T, otherLook(y.look));
  const B = T.lookBlocks[y.look];
  const hall = y.hall;
  const H = T.hall.height;

  // --- あやしい 横穴
  const P = y.passage;
  if (P.length < T.passage.length[0] || P.length > T.passage.length[1]) bad.push(`横穴の 長さ ${P.length}〔${T.passage.length.join('〜')}〕`);
  const d = passageDir(y);
  if (d.dx === 0 && d.dz === 0) bad.push('横穴の 向きが きまらない');
  P.forEach((c, i) => {
    if (c.y !== P[0]!.y) bad.push(`横穴 ${i} 番目 y ${c.y}〔平ら: ${P[0]!.y}〕`);
    if (i > 0 && (c.x - P[i - 1]!.x !== d.dx || c.z - P[i - 1]!.z !== d.dz)) bad.push(`横穴 ${i} 番目で 曲がる・とぶ`);
  });
  const half = Math.floor(T.passage.width / 2);
  const lat = { x: d.dz, z: d.dx }; // よこの 向き
  P.forEach((c, i) => {
    for (let o = -half; o <= half; o++) {
      const x = c.x + lat.x * o;
      const z = c.z + lat.z * o;
      for (let k = 0; k < T.passage.height; k++) if (!isBodyIndex(g.at(x, c.y + k, z))) bad.push(`横穴 ${i} 番目 (${x}, ${c.y + k}, ${z}) が 体の 通る マスでない: ${g.id(x, c.y + k, z)}`);
      for (const dy of [-1, -2]) if (!isSolidIndex(g.at(x, c.y + dy, z))) bad.push(`横穴 ${i} 番目の 床の 下 (${x}, ${c.y + dy}, ${z}) が 固くない`);
      if (i >= 1 && !isSolidIndex(g.at(x, c.y + T.passage.height, z))) bad.push(`横穴 ${i} 番目の 天井 (${x}, ${c.y + T.passage.height}, ${z}) が 固くない`);
    }
    if (i >= 3) {
      // 口の あと: かべ・天井・床は ふつうの いし〔坑道の わくも やかたの ブロックも ない〕
      for (const o of [-half - 1, half + 1]) {
        const x = c.x + lat.x * o;
        const z = c.z + lat.z * o;
        for (let k = 0; k < T.passage.height; k++) {
          const id = g.id(x, c.y + k, z);
          if (!isSolidIndex(g.at(x, c.y + k, z))) bad.push(`横穴 ${i} 番目の かべ (${x}, ${c.y + k}, ${z}) が 固くない: ${id}`);
          if (mine.has(id) || other.has(id) || id === 'kodo_waku') bad.push(`横穴 ${i} 番目の かべ (${x}, ${c.y + k}, ${z}) が ふつうの いしでない: ${id}`);
        }
      }
      const fl = g.id(c.x, c.y - 1, c.z);
      if (mine.has(fl) || other.has(fl) || fl === 'kodo_waku') bad.push(`横穴 ${i} 番目の 床が ふつうの いしでない: ${fl}`);
    }
  });
  // 口に あやしい かべの 柱 2 本〔口の 3 マスの まわり。高さ いっぱい〕
  const cols = new Set<string>();
  for (const c of P.slice(0, 3)) {
    for (let o = -half - 1; o <= half + 1; o++) {
      const x = c.x + lat.x * o;
      const z = c.z + lat.z * o;
      let full = 0;
      for (let k = 0; k < T.passage.height; k++) if (g.id(x, c.y + k, z) === B.kabe) full++;
      if (full >= T.passage.height - 1) cols.add(`${x},${z}`);
    }
  }
  if (cols.size < 2) bad.push(`口に あやしい かべの 柱が ${cols.size} 本〔2 本〕`);

  // --- 門
  const gc = gateCells(y, T);
  const gw = Math.max(rectW(y.gate), rectD(y.gate));
  const gd = Math.min(rectW(y.gate), rectD(y.gate));
  if (gw !== T.gate.width || gd !== 1) bad.push(`門の はば ${rectW(y.gate)}×${rectD(y.gate)}〔${T.gate.width}×1〕`);
  if (gc.length !== T.gate.width * T.gate.height) bad.push(`門の マスが ${gc.length}〔${T.gate.width * T.gate.height}〕`);
  for (const c of gc) if (!isBodyIndex(g.at(c.x, c.y, c.z))) bad.push(`門 (${c.x}, ${c.y}, ${c.z}) が 空いて いない: ${g.id(c.x, c.y, c.z)}`);
  if (y.gate.y !== hall.y) bad.push(`門の 床の 高さ ${y.gate.y}〔大広間と 同じ ${hall.y}〕`);
  if (P[0]!.y !== hall.y) bad.push(`横穴の 高さ ${P[0]!.y}〔大広間と 同じ ${hall.y}〕`);

  // --- 大広間
  if (rectW(hall) !== T.hall.size || rectD(hall) !== T.hall.size) bad.push(`大広間の 床 ${rectW(hall)}×${rectD(hall)}〔${T.hall.size}×${T.hall.size}〕`);
  const altarCells = new Set(rectCells(y.altar).map((c) => `${c.x},${c.z}`));
  // 柱は あとで 数える〔床から 天井まで あやしい かべ〕。柱の 場所を 集める
  const pillarCells: Pt[] = [];
  for (const c of rectCells(hall)) {
    if (!isSolidIndex(g.at(c.x, c.y - 1, c.z)) || !isSolidIndex(g.at(c.x, c.y - 2, c.z))) bad.push(`大広間の 床の 下 (${c.x}, ${c.y - 1}〜${c.y - 2}, ${c.z}) が 固くない`);
    if (g.id(c.x, c.y - 1, c.z) !== B.yuka) bad.push(`大広間の 床 (${c.x}, ${c.y - 1}, ${c.z}) が ${g.id(c.x, c.y - 1, c.z)}〔${B.yuka}〕`);
    if (g.id(c.x, c.y + H, c.z) !== B.kabe) bad.push(`大広間の 天井 (${c.x}, ${c.y + H}, ${c.z}) が ${g.id(c.x, c.y + H, c.z)}〔${B.kabe}〕`);
    if (g.id(c.x, c.y + 3, c.z) === B.kabe) pillarCells.push(c);
    else if (!altarCells.has(`${c.x},${c.z}`)) {
      for (let k = 0; k < H; k++) if (!isBodyIndex(g.at(c.x, c.y + k, c.z))) bad.push(`大広間の 空気 (${c.x}, ${c.y + k}, ${c.z}) が ${g.id(c.x, c.y + k, c.z)}`);
    }
  }
  // かべ〔外がわ 1 マス〕: 門 いがい あやしい かべ
  const gateSet = new Set(gc.map(ptKey));
  const wall = grow(hall, 1);
  for (let x = wall.x0; x <= wall.x1; x++) {
    for (let z = wall.z0; z <= wall.z1; z++) {
      if (x !== wall.x0 && x !== wall.x1 && z !== wall.z0 && z !== wall.z1) continue;
      for (let k = 0; k < H; k++) {
        if (gateSet.has(ptKey({ x, y: hall.y + k, z }))) continue;
        if (g.id(x, hall.y + k, z) !== B.kabe) bad.push(`大広間の かべ (${x}, ${hall.y + k}, ${z}) が ${g.id(x, hall.y + k, z)}〔${B.kabe}〕`);
      }
    }
  }
  // そのまわり: ふつうの いし〔門の ある 面は 横穴が 通る ので しらべない〕
  const gd2 = gateDir(y);
  for (let r = 2; r <= 1 + T.ring; r++) {
    const w2 = grow(hall, r);
    for (let x = w2.x0; x <= w2.x1; x++) {
      for (let z = w2.z0; z <= w2.z1; z++) {
        if (x !== w2.x0 && x !== w2.x1 && z !== w2.z0 && z !== w2.z1) continue;
        const toGate = (x - rectCenter(hall).x) * gd2.dx * -1 + (z - rectCenter(hall).z) * gd2.dz * -1;
        if (toGate > T.hall.size / 2) continue; // 門の ある 面
        for (let k = 0; k < H; k++) {
          const id = g.id(x, hall.y + k, z);
          if (!isSolidIndex(g.at(x, hall.y + k, z))) bad.push(`外がわの いし (${x}, ${hall.y + k}, ${z}) が 固くない: ${id}`);
          else if (mine.has(id) || other.has(id)) bad.push(`外がわの いし (${x}, ${hall.y + k}, ${z}) が やかたの ブロック: ${id}`);
        }
      }
    }
  }
  // 柱: 2×2 が 表の 数・床から 天井まで あやしい かべ
  const seen = new Set<string>();
  let pillars = 0;
  for (const c of pillarCells) {
    const k = `${c.x},${c.z}`;
    if (seen.has(k)) continue;
    const comp: Pt[] = [];
    const stack = [c];
    seen.add(k);
    while (stack.length > 0) {
      const a = stack.pop()!;
      comp.push(a);
      for (const [dx, dz] of FOUR) {
        const n = { x: a.x + dx, y: a.y, z: a.z + dz };
        const nk = `${n.x},${n.z}`;
        if (seen.has(nk) || !pillarCells.some((p) => p.x === n.x && p.z === n.z)) continue;
        seen.add(nk);
        stack.push(n);
      }
    }
    pillars++;
    const xs = comp.map((p) => p.x);
    const zs = comp.map((p) => p.z);
    if (comp.length !== 4 || Math.max(...xs) - Math.min(...xs) !== 1 || Math.max(...zs) - Math.min(...zs) !== 1) bad.push(`柱が 2×2 でない〔${comp.length} マス〕`);
    for (const p of comp) for (let k2 = 0; k2 < H; k2++) if (g.id(p.x, hall.y + k2, p.z) !== B.kabe) bad.push(`柱 (${p.x}, ${hall.y + k2}, ${p.z}) が ${g.id(p.x, hall.y + k2, p.z)}`);
  }
  if (pillars !== T.hall.pillars) bad.push(`柱が ${pillars} 本〔${T.hall.pillars}〕`);
  // 門から 祭壇までの まん中の 道 はば 5 を あける
  const hc = rectCenter(hall);
  const lane = 2; // 仕様 §4.2: 門から 祭壇までの まん中の 道は はば 5〔中心 ± 2〕
  for (let t = -Math.floor(T.hall.size / 2); t <= Math.floor(T.hall.size / 2); t++) {
    for (let o = -lane; o <= lane; o++) {
      const x = Math.round(hc.x + gd2.dx * t + gd2.dz * o);
      const z = Math.round(hc.z + gd2.dz * t + gd2.dx * o);
      if (altarCells.has(`${x},${z}`)) continue;
      if (!isBodyIndex(g.at(x, hall.y, z))) bad.push(`まん中の 道 (${x}, ${hall.y}, ${z}) に 物が ある: ${g.id(x, hall.y, z)}`);
    }
  }
  // 出入り口は 門だけ: 門を とじた ときの 大広間の 空気が 大広間の 外に もれない
  const inside = (x: number, yy: number, z: number): boolean => inRect(hall, x, z) && yy >= hall.y && yy < hall.y + H;
  const start = { x: Math.round(hc.x - gd2.dx * 2), y: hall.y, z: Math.round(hc.z - gd2.dz * 2) };
  const seen3 = new Set<string>([ptKey(start)]);
  const queue: Pt[] = [start];
  let leaked: Pt | null = null;
  while (queue.length > 0 && !leaked) {
    const a = queue.pop()!;
    for (const [dx, dy, dz] of SIX) {
      const n = { x: a.x + dx, y: a.y + dy, z: a.z + dz };
      const k = ptKey(n);
      if (seen3.has(k) || gateSet.has(k) || isSolidIndex(g.at(n.x, n.y, n.z))) continue;
      seen3.add(k);
      if (!inside(n.x, n.y, n.z)) {
        leaked = n;
        break;
      }
      queue.push(n);
    }
  }
  if (leaked) bad.push(`大広間の 空気が 門の ほかから 外へ つながる (${leaked.x}, ${leaked.y}, ${leaked.z}): ${g.id(leaked.x, leaked.y, leaked.z)}`);

  // --- 祭壇 2 段
  const lower = y.altar;
  const [lw, ld] = T.altar.lower;
  const sizes = `${rectW(lower)}×${rectD(lower)}`;
  if (!((rectW(lower) === lw && rectD(lower) === ld) || (rectW(lower) === ld && rectD(lower) === lw))) bad.push(`祭壇の 下の 段 ${sizes}〔${lw}×${ld}〕`);
  if (lower.y !== hall.y + 1) bad.push(`祭壇の 下の 段の 上の 足の y ${lower.y}〔${hall.y + 1}〕`);
  const up = upperRect(y, T);
  for (const c of rectCells(lower)) {
    if (g.id(c.x, lower.y - 1, c.z) !== B.dan) bad.push(`祭壇の 下の 段 (${c.x}, ${lower.y - 1}, ${c.z}) が ${g.id(c.x, lower.y - 1, c.z)}〔${B.dan}〕`);
    if (!inRect(up, c.x, c.z)) for (let k = 0; k < 4; k++) if (!isBodyIndex(g.at(c.x, lower.y + k, c.z))) bad.push(`祭壇の 下の 段の 上 (${c.x}, ${lower.y + k}, ${c.z}) が 空気でない: ${g.id(c.x, lower.y + k, c.z)}`);  // 4 ＝ 仕様 §4.2 の「祭壇の 足から 上 4 マスは 空気」の 数〔表の 項目では ない〕
  }
  const chestSet = new Set(y.chest.cells.map(ptKey));
  for (const c of rectCells(up)) {
    if (g.id(c.x, up.y - 1, c.z) !== B.dan) bad.push(`祭壇の 上の 段 (${c.x}, ${up.y - 1}, ${c.z}) が ${g.id(c.x, up.y - 1, c.z)}〔${B.dan}〕`);
    for (let k = 0; k < 4; k++) if (!chestSet.has(ptKey({ x: c.x, y: up.y + k, z: c.z })) && !isBodyIndex(g.at(c.x, up.y + k, c.z))) bad.push(`祭壇の 上の 段の 上 (${c.x}, ${up.y + k}, ${c.z}) が 空気でない`);  // 4 ＝ 同じ〔仕様 §4.2〕
  }
  // 祭壇は おくの かべぎわの まん中
  const ac = rectCenter(lower);
  const along = (ac.x - hc.x) * gd2.dx + (ac.z - hc.z) * gd2.dz;
  const lateral = Math.abs((ac.x - hc.x) * gd2.dz + (ac.z - hc.z) * gd2.dx);
  const extent = gd2.dx !== 0 ? rectW(lower) : rectD(lower);
  const gap = T.hall.size / 2 - (along + extent / 2);
  if (along <= 0) bad.push('祭壇が 門の 反対がわに ない');
  if (gap < 0 || gap > 2) bad.push(`祭壇と おくの かべの すきま ${gap}〔0〜2〕`);
  if (lateral > 1) bad.push(`祭壇が まん中に ない〔横に ${lateral}〕`);

  // --- 宝箱
  const ch = y.chest;
  if (ch.cells.length !== 2) bad.push(`宝箱の マス ${ch.cells.length}〔2〕`);
  if (ch.tier !== 4) bad.push(`宝箱の 段 ${ch.tier}〔4〕`);
  for (const c of ch.cells) {
    if (c.y !== up.y) bad.push(`宝箱 (${c.x}, ${c.y}, ${c.z}) の 足の y〔${up.y}〕`);
    if (!inRect(up, c.x, c.z)) bad.push(`宝箱 (${c.x}, ${c.z}) が 上の 段の 上に ない`);
    const info = chestAt(c.x, c.y, c.z);
    if (!info || info.table !== 'yakata' || info.tier !== 4) bad.push(`宝箱 (${c.x}, ${c.y}, ${c.z}) の chestAt: ${JSON.stringify(info)}`);
    else if (info.opened) bad.push(`宝箱 (${c.x}, ${c.y}, ${c.z}) が あいて いる〔まだ の やかた〕`);
  }
  const fv = COMPASS[ch.front];
  if (fv[0] !== -gd2.dx || fv[1] !== -gd2.dz) bad.push(`宝箱の 前 ${ch.front} が 門の ほうでない`);
  const uc = rectCenter(up);
  const cc = { x: ch.cells.reduce((a, c) => a + c.x, 0) / ch.cells.length, z: ch.cells.reduce((a, c) => a + c.z, 0) / ch.cells.length };
  if (cheb2(cc, uc) > 1) bad.push(`宝箱が 上の 段の まん中に ない〔${cc.x}, ${cc.z} / ${uc.x}, ${uc.z}〕`);

  // --- 出る 場所の 候補
  const total = T.spawn.perZone * 3;
  if (y.spawns.length !== total) bad.push(`出る 場所の 候補 ${y.spawns.length}〔${total}〕`);
  const byZone: Record<Zone, { at: Pt }[]> = { left: [], right: [], front: [] };
  for (const sp of y.spawns) byZone[sp.zone].push(sp);
  for (const z of ['left', 'right', 'front'] as const) if (byZone[z].length !== T.spawn.perZone) bad.push(`${z} の 候補 ${byZone[z].length}〔${T.spawn.perZone}〕`);
  const sign = (p: Pt): number => Math.sign((p.x - cc.x) * gd2.dz + (p.z - cc.z) * gd2.dx);
  const ls = new Set(byZone.left.map((s2) => sign(s2.at)));
  const rs = new Set(byZone.right.map((s2) => sign(s2.at)));
  if (ls.size !== 1 || rs.size !== 1 || [...ls][0] === [...rs][0] || ls.has(0) || rs.has(0)) bad.push(`左と 右の 候補が 祭壇の 左右に 分かれて いない〔${[...ls]}・${[...rs]}〕`);
  for (const sp of byZone.front) if ((sp.at.x - cc.x) * -gd2.dx + (sp.at.z - cc.z) * -gd2.dz <= 0) bad.push(`front の 候補 (${sp.at.x}, ${sp.at.z}) が 宝箱より 門の ほうに ない`);
  y.spawns.forEach((sp, i) => {
    const a = sp.at;
    const tag = `候補 ${i}〔${sp.zone}〕(${a.x}, ${a.y}, ${a.z})`;
    if (a.y !== hall.y || !inRect(hall, a.x, a.z)) bad.push(`${tag} が 大広間の 床に ない`);
    for (let k = 0; k < 3; k++) if (!isBodyIndex(g.at(a.x, a.y + k, a.z))) bad.push(`${tag}: 足から 上 ${k} が 空気でない`);
    if (!isSolidIndex(g.at(a.x, a.y - 1, a.z))) bad.push(`${tag}: 床が 固くない`);
    const dist = Math.hypot(a.x - cc.x, a.z - cc.z);
    if (dist < T.spawn.fromChest[0] - 1e-9 || dist > T.spawn.fromChest[1] + 1e-9) bad.push(`${tag}: 宝箱から ${dist.toFixed(1)}〔${T.spawn.fromChest.join('〜')}〕`);
    for (let j = i + 1; j < y.spawns.length; j++) {
      const b = y.spawns[j]!.at;
      if (Math.hypot(a.x - b.x, a.z - b.z) < T.spawn.apart - 1e-9) bad.push(`${tag} と 候補 ${j} が ${T.spawn.apart} マス 以内`);
    }
  });

  // --- ブロックの 組: ほかの 組が 1 こも まざらない
  const box = yakataBox(y, T);
  let mixed = 0;
  let own = 0;
  for (let x = box.x0; x <= box.x1; x++) {
    for (let z = box.z0; z <= box.z1; z++) {
      for (let yy = box.y0; yy <= box.y1; yy++) {
        const id = g.id(x, yy, z);
        if (other.has(id)) mixed++;
        else if (mine.has(id)) own++;
      }
    }
  }
  if (mixed > 0) bad.push(`ほかの 組〔${otherLook(y.look)}〕の ブロックが ${mixed} こ まざって いる`);
  if (own === 0) bad.push(`${y.look} の ブロックが 1 こも ない`);
  return bad;
}

/** あやしい たいまつ: 数の 上限・横穴は 3 マスごと 左右 こうご・大広間に 4 本 いじょう */
export function torchProblemsF(g: GenCols, s: YakataShaft, T: YakataTable): string[] {
  const y = s.yakata!;
  const bad: string[] = [];
  const box = yakataBox(y, T);
  const torch = T.lookBlocks[y.look].taimatsu;
  const found: Pt[] = [];
  for (let x = box.x0; x <= box.x1; x++) for (let z = box.z0; z <= box.z1; z++) for (let yy = box.y0; yy <= box.y1; yy++) if (g.id(x, yy, z) === torch) found.push({ x, y: yy, z });
  if (found.length > T.maxTorches) bad.push(`あやしい たいまつ ${found.length} 本〔${T.maxTorches} 本 まで〕`);
  const hallBox = grow(y.hall, 1);
  const inHall = found.filter((p) => inRect(hallBox, p.x, p.z));
  if (inHall.length < 4) bad.push(`大広間の あやしい たいまつ ${inHall.length} 本〔4 本 以上〕`);  // 4 本 ＝ 仕様 §4.10 の 光る ブロックの 下限〔大広間の 明るさ。表の 項目では ない〕
  // 横穴: 3 マスごと 左右 こうご
  const d = passageDir(y);
  const lat = { x: d.dz, z: d.dx };
  const P = y.passage;
  const inPass = found
    .filter((p) => !inRect(hallBox, p.x, p.z))
    .map((p) => ({ i: (p.x - P[0]!.x) * d.dx + (p.z - P[0]!.z) * d.dz, o: (p.x - P[0]!.x) * lat.x + (p.z - P[0]!.z) * lat.z }))
    .filter((p) => p.i >= 0 && p.i < P.length)
    .sort((a, b) => a.i - b.i);
  if (inPass.length < 3 || inPass.length > 6) bad.push(`横穴の たいまつ ${inPass.length} 本〔3〜6〕`);  // 3〜6 ＝ 仕様 §4.2 の 表の 数〔横穴の たいまつ〕
  for (let k = 1; k < inPass.length; k++) {
    if (inPass[k]!.i - inPass[k - 1]!.i !== T.passage.torchEvery) bad.push(`横穴の たいまつの あいだ ${inPass[k]!.i - inPass[k - 1]!.i}〔${T.passage.torchEvery}〕`);
    if (Math.sign(inPass[k]!.o) === Math.sign(inPass[k - 1]!.o) || inPass[k]!.o === 0) bad.push(`横穴の たいまつが 左右 こうごに ならない〔${k - 1} と ${k}〕`);
  }
  return bad;
}

/** 明るさ: 横穴は ブロックの 光 6 以上・大広間の 床と 祭壇の 立てる マスは `minLight` 以上 */
export function lightProblemsF(g: GenCols, s: YakataShaft, T: YakataTable): string[] {
  const y = s.yakata!;
  const bad: string[] = [];
  const box = yakataBox(y, T);
  const light = g.lit({ x0: box.x0, x1: box.x1, z0: box.z0, z1: box.z1 }, 8);
  for (const [i, c] of y.passage.entries()) {
    const l = light.blockLight(c.x, c.y, c.z);
    if (l < 6) bad.push(`横穴 ${i} 番目 (${c.x}, ${c.y}, ${c.z}) の ブロックの 光 ${l}〔6 以上〕`);  // 6 ＝ 仕様 §4.2・F2 の「光 6 以上」
  }
  const need = (c: Pt, what: string): void => {
    const l = light.blockLight(c.x, c.y, c.z);
    if (l < T.minLight) bad.push(`${what} (${c.x}, ${c.y}, ${c.z}) の ブロックの 光 ${l}〔${T.minLight} 以上〕`);
  };
  for (const c of rectCells(y.hall)) {
    if (isSolidIndex(g.at(c.x, c.y, c.z))) continue;
    need(c, '大広間の 床');
  }
  for (const c of rectCells(y.altar)) {
    if (isSolidIndex(g.at(c.x, c.y, c.z))) continue; // 祭壇の 上の 段の 固い ブロックは 光 0。立てる マス〔固くない 所〕だけ 見る
    need(c, '祭壇の 下の 段');
  }
  for (const c of rectCells(upperRect(y, T))) {
    if (y.chest.cells.some((q) => q.x === c.x && q.z === c.z)) continue;
    need(c, '祭壇の 上の 段');
  }
  return bad;
}

/** 道さがし: 入口から 横穴・大広間の どの 床・祭壇の 立てる マスまで 歩いて 行ける〔`ok` ＝ 入口と 行き来 できる〕。柱・宝箱の マスは 立てない ので 求めない */
export function walkProblemsF(g: GenCols, s: YakataShaft, T: YakataTable, ok: (p: Pt) => boolean): string[] {
  const y = s.yakata!;
  const bad: string[] = [];
  const need = (p: Pt, what: string): void => {
    if (!ok(p)) bad.push(`入口と ${what} (${p.x}, ${p.y}, ${p.z}) が 行き来 できない`);
  };
  for (const c of y.passage) need(c, '横穴');
  for (const c of rectCells(y.hall)) if (standable(g, c.x, c.y, c.z)) need(c, '大広間の 床');
  for (const c of rectCells(y.altar)) if (standable(g, c.x, c.y, c.z)) need(c, '祭壇の 下の 段');
  for (const c of rectCells(upperRect(y, T))) if (standable(g, c.x, c.y, c.z)) need(c, '祭壇の 上の 段');
  return bad;
}

/** やかたの ブロックが やかたの 外の 道〔ほかの 1E の 道〕と かさならない・海の 下 10 に かからない・区画の 中 */
export function placeProblemsF(seed: number, s: YakataShaft, path: readonly PathCell[], T: YakataTable): string[] {
  const y = s.yakata!;
  const bad: string[] = [];
  const f = footprint(y, T);
  const others = path.filter((c) => (c.part as string) !== 'yakata');
  for (const c of others) {
    // 1E の 道の まわり 2 マス〔たて・よこ・高さ〕
    if (c.x >= f.solid.x0 - 2 && c.x <= f.solid.x1 + 2 && c.z >= f.solid.z0 - 2 && c.z <= f.solid.z1 + 2 && c.y >= y.hall.y - 1 - T.ring - 2 && c.y <= y.hall.y + T.hall.height + 1 + T.ring + 2) bad.push(`1E の 道 (${c.x}, ${c.y}, ${c.z}) が 大広間〔まわり ${T.ring}〕に かかる`);
  }
  const P = y.passage.slice(3);
  const half = Math.floor(T.passage.width / 2);
  for (const p of P) {
    for (const c of others) if (Math.abs(c.x - p.x) <= half + 2 && Math.abs(c.z - p.z) <= half + 2 && c.y >= p.y - 3 && c.y <= p.y + T.passage.height + 2) bad.push(`1E の 道 (${c.x}, ${c.y}, ${c.z}) が 横穴 (${p.x}, ${p.z}) に かかる`);
  }
  const b = yakataBox(y, T);
  // 区画の 中〔ふちから 2 マス 以上 内がわ〕
  const m256 = (v: number): number => ((v % 256) + 256) % 256; // 負の 座標でも 0〜255
  const inner = (x0: number, z0: number, x1: number, z1: number): boolean =>
    Math.floor(x0 / 256) === Math.floor(x1 / 256) && Math.floor(z0 / 256) === Math.floor(z1 / 256) && m256(x0) >= 2 && m256(z0) >= 2 && 255 - m256(x1) >= 2 && 255 - m256(z1) >= 2;
  if (!inner(b.x0, b.z0, b.x1, b.z1)) bad.push(`やかたが 区画の 中〔ふちから 2 マス 以上 内がわ〕に ない: ${b.x0},${b.z0} 〜 ${b.x1},${b.z1}`);
  // 海の 下 10 マス・天井の 上の 石〔坑道の 道と 同じ: SHAFT_CONFIG.cover〕
  const C = SHAFT_CONFIG.cover;
  const roofY = y.hall.y + T.hall.height + 1;
  for (const [x, z] of [[y.hall.x0, y.hall.z0], [y.hall.x1, y.hall.z0], [y.hall.x0, y.hall.z1], [y.hall.x1, y.hall.z1], [rectCenter(y.hall).x | 0, rectCenter(y.hall).z | 0]] as const) {
    const ground = heightAt(seed, x, z);
    const need = ground <= SEA_Y - 1 ? C.sea : C.ground;
    if (ground - roofY < need) bad.push(`大広間 (${x}, ${z}): 天井 y ${roofY} の 上 ${ground - roofY} マス〔${need} 以上〕`);
  }
  return bad.slice(0, 6);
}

