import { Builder, T } from './townBuilder';

/**
 * TOWN-1 1B-2 試作: 屋台 3 つの 置き方の 表（広場の 北、用水路と ひろばの あいだ。前 ＝ ひろばがわ（v が 大きい 方）。ローカル座標）。
 * 1 つずつ 形・色が ちがう: だんごや（赤い のれん・かたながれ屋根）、ごはんや（あい色の のれん・かべと 山の 屋根）、買いとりの やたい（黄色い しましまの テント）。
 * ストーリー: /mnt/project-files/town/STORIES.md。屋台は あかりを 足さない（ちょうちんの 上限 12 は 建物で 使いきって いる）。
 */
const Y = {
  /** 屋台の まえの 石だたみ（v 32〜33。ひろばへ つなぐ） */
  pave: { u0: 36, u1: 64, v0: 32, v1: 33 },
  /** だんごや: u 37〜41（はば 5）・v 29〜31・前の カウンター v 32 */
  dango: { u0: 37, u1: 41, v0: 29, v1: 31 },
  /** ごはんや: u 46〜52（はば 7）・v 29〜31・前の カウンター v 31 */
  gohan: { u0: 46, u1: 52, v0: 29, v1: 31 },
  /** 買いとりの やたい: u 56〜62（はば 7）・v 29〜32・前の カウンター v 32 */
  yatai: { u0: 56, u1: 62, v0: 29, v1: 32 },
} as const;

/** かんばん（左から）: 1 ブロックずつの 字を ならべ、両はしに ふたを 置く */
function sign(b: Builder, set: string, chars: readonly string[], u0: number, v: number, dy: number): void {
  chars.forEach((ch, i) => b.put(u0 + i, v, dy, T(`sign_${set}_${ch}`)));
  for (const u of [u0 - 1, u0 + chars.length]) b.put(u, v, dy, T(`sign_${set}_end`));
}

/** だんごや: 赤い しまの ひさしが 前へ 下がる かたながれ（うしろが 高い）。赤い のれん・だんごの くし・赤い のぼり */
function dango(b: Builder): void {
  const D = Y.dango;
  b.fill(D.u0, D.v0, -1, D.u1, D.v1, -1, T('yukaita'));
  for (const u of [D.u0, D.u1]) {
    b.fill(u, D.v0, 0, u, D.v0, 3, T('hashira'));
    b.fill(u, D.v1, 0, u, D.v1, 2, T('hashira'));
  }
  b.fill(D.u0 + 1, D.v0, 0, D.u1 - 1, D.v0, 3, T('koitabari'));
  // 屋根: うしろ v 28 が 高く、前へ 1/3 ずつ 下がる
  for (let v = D.v0 - 1; v <= D.v1 + 1; v++) for (let u = D.u0 - 1; u <= D.u1 + 1; u++) b.roof(u, v, 14 - (v - (D.v0 - 1)), 'shima');
  // 前: のれん（赤）・カウンターと だんご・のぼり
  b.fill(D.u0 + 1, D.v1, 2, D.u1 - 1, D.v1, 2, T('noren_shu'));
  b.fill(D.u0, D.v1 + 1, 0, D.u1, D.v1 + 1, 0, T('yukaita'));
  for (const u of [D.u0 + 1, D.u1 - 1]) b.put(u, D.v1 + 1, 1, T('dango_gushi'));
  b.put(D.u0 + 2, D.v1 + 1, 1, T('hako'));
  b.put(D.u0 + 1, D.v0 + 1, 0, T('taru'));
  b.put(D.u1 - 1, D.v0 + 1, 0, T('hako'));
  b.put(D.u0 + 2, D.v0 + 1, 0, T('dango_gushi'));
  sign(b, 'dango', SIGN_DANGO, D.u0 + 1, D.v1 + 1, 3);
  for (const u of [D.u0 - 1, D.u1 + 1]) b.fill(u, D.v1 + 1, 0, u, D.v1 + 1, 1, T('noboru_aka'));
}
const SIGN_DANGO = ['da', 'n', 'go'] as const;
const SIGN_GOHAN = ['go', 'ha', 'n'] as const;
const SIGN_YATAI = ['ya', 'ta', 'i'] as const;

/** ごはんや: 白かべの 小さな 小屋に あおい かわらの 山の 屋根。あい色の のれん・おひつ・ゆげの でる なべ */
function gohan(b: Builder): void {
  const G = Y.gohan;
  b.fill(G.u0, G.v0, -1, G.u1, G.v1, -1, T('ishidatami_b'));
  b.fill(G.u0, G.v0, 0, G.u1, G.v0, 2, T('shikkui'));
  for (const u of [G.u0, G.u1]) b.fill(u, G.v0 + 1, 0, u, G.v1, 2, T('shikkui'));
  for (const u of [G.u0, G.u1]) b.put(u, G.v0 + 1, 1, T('koushimado'));
  for (const u of [G.u0, G.u1]) b.fill(u, G.v1, 0, u, G.v1, 2, T('hashira'));
  // 山の 屋根（ひさしは 前後に 1 マス）
  const walls = Array.from({ length: G.u1 - G.u0 + 1 }, (_, i) => G.u0 + i);
  for (let v = G.v0 - 1; v <= G.v1 + 1; v++) {
    const t = 12 - Math.abs(v - (G.v0 + 1));
    b.roofRow(G.u0 - 1, G.u1 + 1, v, t, v === G.v0 ? walls : [G.u0, G.u1], ['ao']);
  }
  b.fill(G.u0 - 1, G.v0 + 1, 4, G.u1 + 1, G.v0 + 1, 4, T('munegawara'));
  // 中: かまど（なべ）・前: カウンター（おひつ・なべ）・のれん（あい色）
  for (const u of [G.u0 + 2, G.u1 - 2]) {
    b.put(u, G.v0 + 1, 0, T('koishizumi'));
    b.put(u, G.v0 + 1, 1, T('nabe_yuge'));
  }
  b.fill(G.u0 + 1, G.v1, 0, G.u1 - 1, G.v1, 0, T('yukaita'));
  b.put(G.u0 + 1, G.v1, 1, T('ohitsu'));
  b.put(G.u0 + 3, G.v1, 1, T('nabe_yuge'));
  b.put(G.u1 - 1, G.v1, 1, T('ohitsu'));
  b.fill(G.u0 + 1, G.v1, 2, G.u1 - 1, G.v1, 2, T('noren_ai'));
  sign(b, 'gohan', SIGN_GOHAN, G.u0 + 2, G.v1 + 1, 2);
}

/** 買いとりの やたい: 黄色い しましまの テント（山の 形）。かごに 野菜・おめん・ふうりん */
function yatai(b: Builder): void {
  const A = Y.yatai;
  b.fill(A.u0, A.v0, -1, A.u1, A.v1, -1, T('yukaita'));
  for (const u of [A.u0, A.u1]) for (const v of [A.v0, A.v1]) b.fill(u, v, 0, u, v, 2, T('take'));
  // テント: まん中（u 59）が いちばん 高く、左右へ 1/3 ずつ 下がる
  const mid = (A.u0 + A.u1) / 2;
  for (let v = A.v0 - 1; v <= A.v1 + 1; v++) for (let u = A.u0; u <= A.u1; u++) b.roof(u, v, 13 - Math.abs(u - mid), 'shimaki');
  // うしろの たな（人形・おめん）と 中の ふうりん・カウンターの かご
  for (let u = A.u0 + 1; u <= A.u1 - 1; u++) b.put(u, A.v0, 0, T(u % 2 === 0 ? 'ningyo_a_t' : 'tsubo_a_t'));
  for (const u of [A.u0 + 1, mid, A.u1 - 1]) b.put(u, A.v0, 1, T('omen'));
  for (const u of [mid - 1, mid + 1]) b.put(u, A.v0 + 2, 2, T('furin'));
  b.fill(A.u0 + 1, A.v1, 0, A.u1 - 1, A.v1, 0, T('yukaita'));
  for (const u of [A.u0 + 1, A.u1 - 1]) b.put(u, A.v1, 1, T('kago_m'));
  b.put(mid, A.v1, 1, T('hako'));
  b.put(mid - 1, A.v1, 1, T('kago_m'));
  b.put(mid + 1, A.v1, 1, T('kago_m'));
  sign(b, 'yatai', SIGN_YATAI, mid - 1, A.v1 + 1, 2);
}

export function buildYatai(b: Builder): void {
  const P = Y.pave;
  b.fill(P.u0, P.v0, -1, P.u1, P.v1, -1, (u, v) => T(['ishidatami_a', 'ishidatami_b', 'ishidatami_c'][(u * 7 + v * 3) % 3]!));
  dango(b);
  gohan(b);
  yatai(b);
}
