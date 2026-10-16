import { blockHash, cellHash, createPalette, dentable, mix, onExposedSurface, onSecondLayer } from './common';
import { LOOK_N, type KindSpec, type Look } from './types';

/**
 * 仮の見た目（id: placeholder）。VOX-0 の見た目そのまま。いちばん かんたんな Look の見本として読める。
 * 土・石・鉱石・木・はっぱだけ、へこみやつぶで でこぼこさせている。
 */
const N = LOOK_N;
const pal = createPalette();
const set = pal.set;

const GRASS = set('#5FA83A', '#4F9830', '#74BC48', '#6AB03F');
const DIRT = set('#8B5A2B', '#7A4E25', '#9C6A38', '#6E4620');
const SAND = set('#E3D49A', '#D8C888', '#EEE0AE');
const STONE = set('#8E8E8E', '#7C7C7C', '#A2A2A2', '#6F6F6F');
const COAL = set('#1E1E1E', '#2B2B2B');
const IRON = set('#D9A27A', '#C98B5E');
const LOG_BARK = set('#6B4423', '#5A3A1D', '#7A5230');
const LOG_RING = set('#B98A52', '#A67A45');
const LEAVES = set('#2F7D32', '#3D9140', '#256B2A', '#4DA550');
const BEDROCK = set('#3A3A3A', '#2A2A2A', '#4A4A4A');
const FURNACE = set('#8E8E8E', '#757575', '#A5A5A5');
const KAWARA = set('#4A5F7A', '#3E5169', '#566E8C');
const BRICK = set('#A84A3A', '#92402F', '#BC5846');
const TANSU = set('#A0703C', '#8C6032', '#B58048');
const FARMLAND = set('#5B3B1F', '#4C3019', '#6A4626');
const SPRINKLER = set('#7F9FB8', '#6A8AA3', '#93B1C8');

type Fill = KindSpec['fill'];
let salt = 0;

/** 表面 1 段を所々へこませる 固い種類 */
function solid(base: number[]): KindSpec {
  const s = salt++;
  const fill: Fill = (bx, by, bz, exposed, out) => {
    const h = blockHash(s, bx, by, bz);
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++, i++) {
          const c = cellHash(h, x, y, z);
          let color = base[(c >>> 8) % base.length];
          if (onExposedSurface(x, y, z, exposed) && dentable(x, y, z, exposed) && (c >>> 16) % 7 === 0) color = 0;
          else if (onSecondLayer(x, y, z, exposed) && (c >>> 20) % 9 === 0) color = base[base.length - 1]; // 色むら
          out[i] = color;
        }
      }
    }
  };
  return { base: base[0], fill };
}

/** 石に 2×2×2 のかたまりのつぶ */
function ore(base: number[], speck: number[]): KindSpec {
  const s = salt++;
  const fill: Fill = (bx, by, bz, exposed, out) => {
    const h = blockHash(s, bx, by, bz);
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++, i++) {
          const c = cellHash(h, x, y, z);
          let color = base[(c >>> 8) % base.length];
          if (onExposedSurface(x, y, z, exposed) && dentable(x, y, z, exposed) && (c >>> 16) % 7 === 0) {
            color = 0;
          } else {
            const cell = mix(h, ((y >> 1) * 5 + (z >> 1)) * 5 + (x >> 1));
            if (cell % 5 === 0) color = speck[(cell >>> 8) % speck.length];
          }
          out[i] = color;
        }
      }
    }
  };
  return { base: base[0], fill };
}

/** くさ: 上が見えるとき 列ごとに高さ 7〜9（でこぼこ）、横の上の方は緑、下は土 */
function grass(): KindSpec {
  const s = salt++;
  const fill: Fill = (bx, by, bz, exposed, out) => {
    const h = blockHash(s, bx, by, bz);
    const top = (exposed & 1) !== 0;
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++, i++) {
          const c = cellHash(h, x, y, z);
          const colH = top && dentable(x, N - 1, z, exposed) ? 7 + (cellHash(h, x, 0, z) % 3) : N;
          let color: number;
          if (y >= colH) color = 0;
          else if (y >= 6 || (y === 5 && c % 3 === 0)) color = GRASS[(c >>> 8) % GRASS.length];
          else {
            color = DIRT[(c >>> 8) % DIRT.length];
            if (onExposedSurface(x, y, z, exposed) && y < 5 && (c >>> 16) % 11 === 0 && dentable(x, y, z, exposed)) color = 0;
          }
          out[i] = color;
        }
      }
    }
  };
  return { base: GRASS[0], fill };
}

/** 木: たて縞の木目、上下は年輪 */
function log(): KindSpec {
  const s = salt++;
  const fill: Fill = (bx, by, bz, exposed, out) => {
    const h = blockHash(s, bx, by, bz);
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++, i++) {
          const c = cellHash(h, x, y, z);
          const ring = Math.max(Math.abs(x - 4), Math.abs(z - 4));
          let color: number;
          if (y === 0 || y === N - 1) color = LOG_RING[ring % 2];
          else {
            color = LOG_BARK[(ring + (c >>> 28)) % LOG_BARK.length];
            if (onExposedSurface(x, y, z, exposed) && dentable(x, y, z, exposed) && (c >>> 16) % 13 === 0) color = 0;
          }
          out[i] = color;
        }
      }
    }
  };
  return { base: LOG_BARK[0], fill };
}

/** はっぱ: 3 割が すきま。となりの面をかくさない */
function leaves(): KindSpec {
  const s = salt++;
  const fill: Fill = (bx, by, bz, _exposed, out) => {
    const h = blockHash(s, bx, by, bz);
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++, i++) {
          const c = cellHash(h, x, y, z);
          out[i] = (c >>> 16) % 10 < 3 ? 0 : LEAVES[(c >>> 8) % LEAVES.length];
        }
      }
    }
  };
  return { base: LEAVES[0], occludes: false, fill };
}

export const placeholderLook: Look = {
  id: 'placeholder',
  label: 'かり',
  palette: pal.rgb(),
  sky: 0x9ad0f5,
  // 霧はほぼ なし（VOX-0 のまま。上空まで見える）
  fog: { color: 0x9ad0f5, near: 120, far: 400 },
  kinds: {
    grass: grass(),
    dirt: solid(DIRT),
    sand: solid(SAND),
    stone: solid(STONE),
    coal_ore: ore(STONE, COAL),
    iron_ore: ore(STONE, IRON),
    log: log(),
    leaves: leaves(),
    bedrock: solid(BEDROCK),
    furnace: solid(FURNACE),
    kawara: solid(KAWARA),
    brick: solid(BRICK),
    tansu: solid(TANSU),
    farmland: solid(FARMLAND),
    farmland_wet: solid(FARMLAND),
    sprinkler: solid(SPRINKLER),
  },
};
