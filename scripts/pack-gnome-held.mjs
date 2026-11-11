// LEGEND-4 PR4: ノームの斧の 手持ちの 絵（女の子）を 切りつめて 棚づめする。
//   使い方: node scripts/pack-gnome-held.mjs   （art/LEGEND-4/held/gnome/*.png -> public/models/char/girl/gnome/）
// 入れる 絵は 2 まい だけ: axe_sweep（よこなぎ 14 コマ。ゲームの 中では katana_thrust の 名前）と katana_walk_chudan（かまえ歩き 8 コマ）。
// ほかの 刀の 絵は 今の 絵を そのまま 使う（sprite.ts: スキンに ない 動きは もとの 絵）。色: 色見本 22 色 ＋ 斧の 9 色（motion-atlas.json の extras.gnome）。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, packMotion } from './pack-char-atlas.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = JSON.parse(readFileSync(resolve(root, 'art/LEGEND-4/held/motion-atlas.json'), 'utf8'));
const extras = src.extras.gnome;
const outDir = resolve(root, 'public/models/char/girl/gnome');
mkdirSync(outDir, { recursive: true });
const JOBS = [
  { from: 'axe_sweep', to: 'katana_thrust', frames: src.motions.axe_sweep.frames },
  { from: 'katana_walk_chudan', to: 'katana_walk_chudan', frames: src.skins.gnome.katana_walk_chudan.frames },
];
const motions = {};
for (const j of JOBS) {
  const { png, packed } = packMotion(decodePng(readFileSync(resolve(root, `art/LEGEND-4/held/gnome/${j.from}.png`))), j.frames);
  writeFileSync(resolve(outDir, `${j.to}.png`), encodePng(png));
  motions[j.to] = { frames: j.frames, packed };
  console.log(j.to, `${png.width}x${png.height}`);
}
writeFileSync(resolve(outDir, 'atlas.json'), JSON.stringify({ extras, motions }) + '\n');
