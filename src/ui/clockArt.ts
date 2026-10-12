import type { Rgba } from '../world/blocks/textures';
import type { ClockScene } from './clockModel';
import { drawPixels } from './itemIcon';

/** 時計の絵（16×16 のドット絵。コードで描く）。空の色・太陽・月・地平線 */
const SKY: Record<ClockScene, { top: string; bottom: string }> = {
  sunrise: { top: '#FF9EB5', bottom: '#FFC48A' },
  morning: { top: '#6FC3FF', bottom: '#B5E3FF' },
  noon: { top: '#2D7FE0', bottom: '#5CA8F0' },
  afternoon: { top: '#FF9A4D', bottom: '#FFC878' },
  sunset: { top: '#7A4FB0', bottom: '#E8708A' },
  night: { top: '#0F1640', bottom: '#27306B' },
};
const GROUND: Record<ClockScene, string | null> = {
  sunrise: '#3A2A4A',
  morning: null,
  noon: null,
  afternoon: null,
  sunset: '#241838',
  night: null,
};
/** 太陽の中心 (x, y) と半径 */
const SUN: Partial<Record<ClockScene, [number, number, number]>> = {
  sunrise: [8, 11, 4],
  morning: [11, 4, 3],
  noon: [8, 5, 4.4],
  afternoon: [4.5, 6, 3.4],
  sunset: [8, 12, 4.2],
};

const rgb = (h: string): Rgba => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const mix = (a: Rgba, b: Rgba, t: number): Rgba => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)).concat(255) as unknown as Rgba;

/** 16×16（y = 0 が上） */
export function clockScenePixels(scene: ClockScene): Rgba[] {
  const sky = SKY[scene];
  const ground = GROUND[scene];
  const horizon = 12;
  const px: Rgba[] = [];
  const sun = SUN[scene];
  const SUNC = rgb(scene === 'noon' ? '#FFF27A' : '#FFE14D');
  const SUNE = rgb('#FF9D1F');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let c = mix(rgb(sky.top), rgb(sky.bottom), y / 15);
      if (sun) {
        const d = Math.hypot(x + 0.5 - sun[0], y + 0.5 - sun[1]);
        if (d <= sun[2]) c = d > sun[2] - 1 ? SUNE : SUNC;
      }
      if (scene === 'night') {
        const moon = Math.hypot(x + 0.5 - 10, y + 0.5 - 6);
        const cut = Math.hypot(x + 0.5 - 12, y + 0.5 - 5);
        if (moon <= 4 && cut > 3.4) c = rgb('#F5F5DC');
        if ((x === 3 && y === 3) || (x === 6 && y === 10) || (x === 2 && y === 8) || (x === 13 && y === 12) || (x === 7 && y === 2)) c = rgb('#FFFFFF');
      }
      if (ground && y >= horizon) c = rgb(ground);
      px.push(c);
    }
  }
  // 日の出・日没: 地平線より下の太陽は うめた地面でかくれる（半分だけ見える）
  return px;
}

const cache = new Map<ClockScene, string>();
export function clockSceneUrl(scene: ClockScene): string {
  let u = cache.get(scene);
  if (!u) {
    const c = document.createElement('canvas');
    drawPixels(c, clockScenePixels(scene));
    u = c.toDataURL();
    cache.set(scene, u);
  }
  return u;
}
