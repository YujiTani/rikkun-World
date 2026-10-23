// WEAPON-9 PR-1 AC52: 雷神剣・風神剣・虹の 手持ちの 絵（public/models/char/girl/{raijin,fujin,niji}/）と、刃の がわ（体から 遠い がわ）
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { decodePng } from '../../scripts/pack-char-atlas.mjs';

const ROOT = resolve(__dirname, '../..');
const OUT = resolve(ROOT, 'public/models/char/girl');
const MOTIONS = ['katana_kesa', 'katana_kiriage', 'katana_thrust', 'katana_walk_chudan', 'katana_walk_gedan', 'katana_walk_jodan'];

describe('AC52 専用の 手持ちの 絵', () => {
  for (const w of ['raijin', 'fujin', 'niji']) {
    it(`${w}: atlas.json と 6 つの 動きの 絵が ある・絵は 中身が ある`, () => {
      const atlas = JSON.parse(readFileSync(resolve(OUT, w, 'atlas.json'), 'utf8'));
      for (const m of MOTIONS) {
        expect(atlas.motions[m]?.packed, `${w} ${m} の packed`).toBeTruthy();
        const p = resolve(OUT, w, `${m}.png`);
        expect(existsSync(p), `${w}/${m}.png`).toBe(true);
        const img = decodePng(readFileSync(p));
        expect(img.width).toBe(atlas.motions[m].packed.width);
        expect(img.height).toBe(atlas.motions[m].packed.height);
        let opaque = 0;
        for (let i = 3; i < img.data.length; i += 4 * 97) if (img.data[i]! > 0) opaque++;
        expect(opaque, `${w}/${m}.png に 絵が ある`).toBeGreaterThan(100);
      }
    });
  }

  it('雷神剣・風神剣・虹は 別々の 絵（同じ 絵を 使いまわさない）', () => {
    const h = (w: string) => readFileSync(resolve(OUT, w, 'katana_thrust.png')).toString('base64').length + ':' + readFileSync(resolve(OUT, w, 'katana_thrust.png')).subarray(-64).toString('hex');
    expect(new Set([h('raijin'), h('fujin'), h('niji')]).size).toBe(3);
  });
});

// 刃の がわ: build.py の edge_normal は 体の 中心 bc から はなれる がわ。右向き・左向き・上下で 入れかわらない
function edgeNormals(): { a: number[]; n: number[]; base: number[]; bc: number[] }[] | null {
  const py = `
import sys, json
sys.path.insert(0, ${JSON.stringify(resolve(ROOT, 'art/WEAPON-9/held'))})
import numpy as np, build
out = []
base = [128.0, 128.0]
for bc in ([100.0, 160.0], [160.0, 90.0], [128.0, 200.0]):
    for a in ([1, 0], [-1, 0], [0, -1], [0, 1], [0.6, -0.8], [-0.6, -0.8], [0.8, 0.6], [-0.8, 0.6]):
        n = build.edge_normal(np.array(a, np.float32), base, bc)
        out.append({"a": a, "n": [float(n[0]), float(n[1])], "base": base, "bc": bc})
print(json.dumps(out))
`;
  try {
    return JSON.parse(execFileSync('python3', ['-I', '-c', py], { encoding: 'utf8' }));
  } catch (e) {
    // python か numpy が ない 環境では 見ない。それ以外（edge_normal が ない など）は 落とす
    const msg = String((e as { stderr?: unknown; code?: unknown }).stderr ?? '') + String((e as { code?: unknown }).code ?? '');
    if (/ENOENT|ModuleNotFoundError/.test(msg)) return null;
    throw e;
  }
}

describe('AC52 刃の がわ（虹・雷神剣）', () => {
  const rows = edgeNormals();
  it.skipIf(rows === null)('edge_normal は いつも 刃の 軸と 直角で、体の 中心から はなれる がわ', () => {
    for (const r of rows!) {
      const dot = r.n[0]! * r.a[0]! + r.n[1]! * r.a[1]!;
      expect(Math.abs(dot), `直角 a=${r.a}`).toBeLessThan(1e-4);
      const away = r.n[0]! * (r.bc[0]! - r.base[0]!) + r.n[1]! * (r.bc[1]! - r.base[1]!);
      expect(away, `体から とおい がわ a=${r.a} bc=${r.bc}`).toBeLessThanOrEqual(0);
    }
  });
  it.skipIf(rows === null)('右向き・左向き（a と -a）で 刃の がわが 体に 対して 同じ（入れかわらない）', () => {
    const key = (r: { a: number[]; bc: number[] }) => `${r.a.join(',')}|${r.bc.join(',')}`;
    const m = new Map(rows!.map((r) => [key(r), r]));
    for (const r of rows!) {
      const o = m.get(key({ a: r.a.map((x) => -x), bc: r.bc }));
      if (!o) continue;
      // a を 逆に しても 法線は 体の 反対がわを 向く（= 同じ 符号で 遠い）
      expect(Math.sign(r.n[0]! * (r.bc[0]! - r.base[0]!) + r.n[1]! * (r.bc[1]! - r.base[1]!))).toBe(Math.sign(o.n[0]! * (o.bc[0]! - o.base[0]!) + o.n[1]! * (o.bc[1]! - o.base[1]!)));
    }
  });
});
