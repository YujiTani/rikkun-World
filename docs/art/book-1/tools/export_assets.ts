// BOOK-1 挿絵の 素材を ゲームの コードから 書き出す（build_book_art.mjs が 開く。ゲームには 入らない）
// アイテム・ブロックの 16×16 の 絵、マウス、まきもの、妖怪の 3D の 形、キーの 割り当て。
import * as THREE from 'three';
import { anyIconUrl } from '../../../../src/ui/itemIcon';
import { getTilePixels, type TileName } from '../../../../src/world/blocks/textures';
import { mouseUrl } from '../../../../src/ui/craftPanel.art';
import { scrollIconUrl } from '../../../../src/ui/log/icons';
import { Chochin, Karakasa } from '../../../../src/yokai';
import { DEFAULT_KEY_BINDINGS, DEFAULT_MOUSE_BINDINGS } from '../../../../src/input/actions';

const ICONS = ['katana', 'naginata', 'yumi', 'ya', 'kabuto', 'yoroi', 'kote', 'suneate', 'wood_pickaxe', 'kuwa', 'seed_tomato', 'seed_onion', 'seed_pumpkin', 'farmland', 'farmland_wet', 'tomato', 'onion', 'dirt', 'stone', 'log', 'coal_ore', 'oil', 'furnace', 'tansu', 'hammer', 'bokuto', 'torch', 'watering_can', 'sprinkler', 'bucket', 'water_bucket'];
const TILES = ['log_side', 'leaves', 'crop_tomato_0', 'crop_tomato_1', 'crop_tomato_2', 'crop_tomato_3', 'wild_tomato', 'wild_onion', 'kakashi', 'kakashi_head'];

function tileUrl(name: string): string {
  const px = getTilePixels(name as TileName);
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d')!;
  const im = g.createImageData(16, 16);
  px.forEach((p, i) => im.data.set(p, i * 4));
  g.putImageData(im, 0, 0);
  return c.toDataURL();
}

/** 妖怪の 3D の 形を とうめいの 背景に 1 まい（正面 ななめ） */
function yokaiUrl(y: { root: THREE.Object3D }, yaw: number): string {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(256, 256);
  r.setClearColor(0, 0);
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xffffff, 0x777788, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 1.5);
  d.position.set(-2, 4, 5);
  s.add(d);
  s.add(y.root);
  y.root.rotation.y = yaw;
  y.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(y.root);
  const c = box.getCenter(new THREE.Vector3());
  const sz = box.getSize(new THREE.Vector3());
  const m = Math.max(sz.x, sz.y) * 0.55;
  const cam = new THREE.OrthographicCamera(-m, m, m, -m, 0.1, 100);
  cam.position.set(c.x, c.y, c.z + 20);
  cam.lookAt(c);
  r.render(s, cam);
  const u = r.domElement.toDataURL();
  r.dispose();
  return u;
}

const png: Record<string, string> = {};
for (const id of ICONS) png['icon_' + id] = anyIconUrl(id as never);
for (const t of TILES) png['tile_' + t] = tileUrl(t);
png.mouse_left = mouseUrl('left');
png.mouse_right = mouseUrl('right');
png.scroll = scrollIconUrl();
png.yokai_chochin = yokaiUrl(new Chochin(), 0);
png.yokai_karakasa = yokaiUrl(new Karakasa(), 0.5);

// 行動 → キーの code の ならび（書いてある じゅん）。マウスは 行動 → ボタンの 番号
const keys: Record<string, string[]> = {};
for (const [code, action] of Object.entries(DEFAULT_KEY_BINDINGS)) (keys[action] ??= []).push(code);
const mouse: Record<string, number> = {};
for (const [btn, action] of Object.entries(DEFAULT_MOUSE_BINDINGS)) mouse[action] = Number(btn);

(window as unknown as { __bookAssets: unknown }).__bookAssets = { png, bindings: { keys, mouse } };
