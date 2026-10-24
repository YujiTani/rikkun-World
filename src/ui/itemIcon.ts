import type { ItemId } from '../contracts';
import { isMaterialItem, materialPixels } from './itemArt';
import { clockPixels, hammerPixels, isM4Item, m4ItemPixels } from './itemArtM4';
import { farmExtraPixels, isM7Item, m7ItemPixels, type FarmExtraIcon } from './itemArtM7';
import { isM72Item, m72ItemPixels } from './itemArtM72';
import { eggPixels, mushiAmiPixels, mushiPixels } from './itemArtLive1';
import { kinTamagoPixels, toriyaPixels } from './itemArtLive2';
import { isLive3Item, live3ItemPixels } from './itemArtLive3';
import { isW7Item, w7ItemPixels } from './itemArtW7';
import { goldItemPixels, isGoldItem } from './itemArtGold';
import { isNinjaItem, ninjaItemPixels } from './itemArtNinja';
import { isSamuraiItem, samuraiItemPixels } from './itemArtSamurai';
import { bucketItemPixels, isBucketItem } from './bucketArt';
import { axeItemPixels, isAxeItem } from './itemArtBal';
import { tansuPixels } from '../storage/tansuArt';
import { BLOCK_TILES, TILE_SIZE, getTilePixels, type Rgba, type TileName } from '../world/blocks/textures';

/** 16x16 のドット絵（コードで描く）。pixels[y * 16 + x]、y = 0 が上 */
export type Pixels = Rgba[];

const CLEAR: Rgba = [0, 0, 0, 0];
const RED: Rgba = [0xe5, 0x39, 0x35, 255];

/** アイテムの絵 = ブロックの横の面の 16x16 */
export function itemIconPixels(item: ItemId): Pixels {
  if (item === 'yokai_orb') return orbPixels();
  if ((item as string) === 'tansu') return tansuPixels('icon').map(hexToRgba);
  if (isMaterialItem(item)) return materialPixels(item);
  if (isAxeItem(item)) return axeItemPixels(item);
  if (isM4Item(item)) return m4ItemPixels(item);
  if (isNinjaItem(item)) return ninjaItemPixels(item); // NINJA-1: オーナー OK 済みの 絵
  if (isSamuraiItem(item)) return samuraiItemPixels(item); // SAMURAI-1: オーナー OK 済みの 絵
  if (item === 'egg') return eggPixels();
  if (item === 'mushi') return mushiPixels();
  if (item === 'mushi_ami') return mushiAmiPixels();
  if (item === 'toriya') return toriyaPixels();
  if (item === 'kin_tamago') return kinTamagoPixels();
  if (isGoldItem(item)) return goldItemPixels(item);
  if (isLive3Item(item)) return live3ItemPixels(item);
  if (isW7Item(item)) return w7ItemPixels(item);
  if (isM7Item(item)) return m7ItemPixels(item);
  if (isM72Item(item)) return m72ItemPixels(item);
  if (isBucketItem(item)) return bucketItemPixels(item);
  const tiles = item in BLOCK_TILES ? BLOCK_TILES[item as keyof typeof BLOCK_TILES] : undefined;
  // はたけ は 上の面（すじの もよう）を 絵にする
  const name: TileName = tiles ? tiles[item === 'farmland' || item === 'farmland_wet' ? 0 : 2] : 'stone';
  return getTilePixels(name).slice();
}

function hexToRgba(c: string): Rgba {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

const ORB: Record<string, Rgba> = {
  '.': [0, 0, 0, 0],
  O: [0x6b, 0x3f, 0xa8, 255], // ふち（こいむらさき）
  P: [0x9c, 0x6a, 0xde, 255], // むらさき #9C6ADE
  W: [255, 255, 255, 255], // つや
  K: [0x11, 0x11, 0x11, 255], // 目
  M: [0x5a, 0x2d, 0x91, 255], // くち
};

/** ようかいだま: むらさきの丸・左上に白いつや・黒い点の目 2 こ（にこにこ） */
const ORB_ROWS = [
  '................',
  '.....OOOOOO.....',
  '...OOPPPPPPOO...',
  '..OPWWPPPPPPPO..',
  '..OPWPPPPPPPPO..',
  '.OPPPPPPPPPPPPO.',
  '.OPPPPPPPPPPPPO.',
  '.OPPPKKPPKKPPPO.',
  '.OPPPKKPPKKPPPO.',
  '.OPPPPPPPPPPPPO.',
  '.OPPPMPPPPMPPPO.',
  '..OPPPMMMMPPPO..',
  '..OOPPPPPPPPOO..',
  '...OOOPPPPOOO...',
  '.....OOOOOO.....',
  '................',
];

/** ようかいだま の 16x16（アイテムの絵） */
export function orbPixels(): Pixels {
  const p: Pixels = [];
  for (const row of ORB_ROWS) for (const ch of row) p.push(ORB[ch] ?? CLEAR);
  return p;
}

function blank(): Pixels {
  return new Array<Rgba>(TILE_SIZE * TILE_SIZE).fill(CLEAR);
}

function put(p: Pixels, x: number, y: number, c: Rgba): void {
  if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return;
  p[y * TILE_SIZE + x] = c;
}

function line(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    put(p, Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
  }
}

/** 赤い ✕（右下 7x7） */
function redCross(p: Pixels): void {
  line(p, 9, 9, 15, 15, RED);
  line(p, 15, 9, 9, 15, RED);
  line(p, 10, 9, 15, 14, RED);
  line(p, 14, 9, 9, 14, RED);
}

/** ふくろ */
function bag(): Pixels {
  const p = blank();
  const cloth: Rgba = [0xc9, 0x9a, 0x5b, 255];
  const shade: Rgba = [0x9c, 0x72, 0x3d, 255];
  const rope: Rgba = [0x5a, 0x3a, 0x1a, 255];
  // からだ
  for (let y = 5; y <= 14; y++) {
    const half = y < 8 ? 3 + (y - 5) : 6;
    for (let x = 8 - half; x < 8 + half; x++) put(p, x, y, x < 8 - half + 1 || y > 12 ? shade : cloth);
  }
  // 口をしばるひも
  for (let x = 5; x <= 10; x++) put(p, x, 5, rope);
  line(p, 6, 3, 7, 5, cloth);
  line(p, 9, 3, 8, 5, cloth);
  put(p, 7, 4, rope);
  put(p, 8, 4, rope);
  return p;
}

export type SignalKind = 'needTool' | 'full' | 'noArrow';

/** 合図のアイコン: いしの つるはし＋赤い ✕ / ふくろ＋赤い ✕ / や＋赤い ✕（M4 で つるはし と や を足した） */
export function signalIconPixels(kind: SignalKind): Pixels {
  const p = kind === 'needTool' ? m4ItemPixels('stone_pickaxe') : kind === 'noArrow' ? m4ItemPixels('ya') : bag();
  // ✕ の下に白っぽい下地を引いて見やすくする
  redCross(p);
  return p;
}

/** 16x16 のドット絵を canvas に描く（ぼかさない。大きさは CSS で決める） */
export function drawPixels(canvas: HTMLCanvasElement, pixels: readonly Rgba[]): void {
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(TILE_SIZE, TILE_SIZE);
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i];
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = c[3];
  }
  ctx.putImageData(img, 0, 0);
}

const iconCache = new Map<string, string>();

/** アイテムの絵を data URL にして使いまわす（img で出すため。DOM のある所でだけ呼ぶ） */
export function itemIconUrl(item: ItemId): string {
  let url = iconCache.get(item);
  if (!url) {
    const c = document.createElement('canvas');
    drawPixels(c, itemIconPixels(item));
    url = c.toDataURL();
    iconCache.set(item, url);
  }
  return url;
}

const extraCache = new Map<string, string>();

/** アイテムでない小さな絵（かなづち・時計）を data URL にして使いまわす */
export function extraIconUrl(kind: 'hammer' | 'clock' | FarmExtraIcon): string {
  let url = extraCache.get(kind);
  if (!url) {
    const c = document.createElement('canvas');
    drawPixels(c, kind === 'hammer' ? hammerPixels() : kind === 'clock' ? clockPixels() : farmExtraPixels(kind));
    url = c.toDataURL();
    extraCache.set(kind, url);
  }
  return url;
}

/** アイテムの id か 'hammer' / 'clock' の絵の URL */
export function anyIconUrl(icon: ItemId | 'hammer' | 'clock' | FarmExtraIcon): string {
  return icon === 'hammer' || icon === 'clock' || icon === 'droplet' || icon === 'moon' ? extraIconUrl(icon) : itemIconUrl(icon);
}
