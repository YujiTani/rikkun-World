import * as THREE from 'three';
import type { Rect } from '../duo/viewRects';
import { clampToHalf, fullRect, ndcToHalf } from './halfProject';
import './machoMarks.css';

/**
 * LIVE-4（docs/design/LIVE-4.md §3.2）: マッチョ の「！」（ねらい を きめた しゅんかん・20 ステップ）と、
 * ねらって いる 妖怪 の 上 の マッチョ の 顔（わ つき。アート 案 C の 決定 16:10）。HTML で 画面 に 重ねる（描画回数 は ふえない）。
 * 字 は 使わない（「！」 の 記号 だけ）。点滅 しない。
 */

/** 顔 14×12 ドット（`art/live4/tools/face.py` の 2「わ つき」） */
export const FACE_ROWS = ['....##..##....', '...#rr##rr#...', '...#rrrrrr#...', '..##rrrrrr##..', '.##wwwwwwwww#.', '#wbbbwwwwbbbw#', '#wwkkwwwwkkww#', '#wwkkwyywkkww#', '#wwwwyyyywwww#', '#wwwwwrrwwwww#', '.#wwwwrrwwww#.', '..##########..'] as const;
export const FACE_PALETTE: Readonly<Record<string, string>> = { '#': '#2A1E14', w: '#F5F1E6', b: '#2E2438', k: '#2E2438', y: '#F2B33D', r: '#E8553D' };
/** 1 ドット の 大きさ（CSS ピクセル） */
export const FACE_DOT = 3;
/** 「！」 を 出す ステップ と、ぽんっ と 出る 長さ */
export const BANG_TICKS = 20;
export const BANG_POP = 6;
/** 二つ名 の 名前 が 出て いる とき に 顔 を 上 へ ずらす 高さ（ピクセル）。名前 の 高さ ＋ すきま */
export const FACE_LIFT_TITLED = 36;
export const FACE_LIFT = 4;

/** 「！」 の 大きさ の 倍率（age = ねらい を きめて から の ステップ）。ぽんっ と 大きく 出て ふつう に もどる */
export function bangScale(age: number): number {
  if (age < 0 || age >= BANG_TICKS) return 0;
  if (age < BANG_POP) return 0.3 + 0.95 * (age / BANG_POP);
  if (age < BANG_POP + 4) return 1.25 - 0.25 * ((age - BANG_POP) / 4);
  return 1;
}

export interface MachoMarkInput {
  /** 「！」: マッチョ の 足もと と、ねらい を きめて から の ステップ */
  bang: { x: number; y: number; z: number; age: number } | null;
  /** 顔: ねらわれて いる 妖怪 の バー の すぐ 上 の 点 */
  face: { x: number; y: number; z: number; titled: boolean } | null;
}

const v = new THREE.Vector3();
const at = { x: 0, y: 0 };
const box = { x: 0, y: 0 };

function faceCanvas(): HTMLCanvasElement {
  const s = FACE_DOT;
  const pad = 3 * s;
  const n = FACE_ROWS[0]!.length * s + 2 * pad;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  c.className = 'macho-face';
  const g = c.getContext('2d');
  if (!g) return c;
  g.lineWidth = s;
  g.strokeStyle = '#3D5A9E';
  g.beginPath();
  g.arc(n / 2, n / 2, n / 2 - s / 2, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = Math.max(1, s / 2);
  g.strokeStyle = '#FFFFFF';
  g.beginPath();
  g.arc(n / 2, n / 2, n / 2 - s - g.lineWidth / 2, 0, Math.PI * 2);
  g.stroke();
  FACE_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = FACE_PALETTE[row[x]!];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(pad + x * s, pad + s / 2 + y * s, s, s);
    }
  });
  return c;
}

/** 毎ステップ `update`（使い回しの 要素 2 つ）。メニュー を 開いて いる あいだ・ねらい が ない とき は かくす */
export class MachoMarks {
  private readonly bangEl: HTMLDivElement;
  private readonly faceEl: HTMLCanvasElement;

  constructor(parent: HTMLElement) {
    this.bangEl = document.createElement('div');
    this.bangEl.className = 'macho-bang';
    this.bangEl.textContent = '!';
    this.bangEl.hidden = true;
    this.faceEl = faceCanvas();
    this.faceEl.hidden = true;
    parent.append(this.bangEl, this.faceEl);
  }

  /** half = 投げる 半分の 矩形（2 人の とき 1P の 半分。COOP-1 5f-2 #21）。省くと 画面ぜんたい */
  update(input: MachoMarkInput, camera: THREE.Camera, visible: boolean, half: Rect | null = null): void {
    camera.updateMatrixWorld();
    const hf = half ?? fullRect(window.innerWidth, window.innerHeight);
    const place = (el: HTMLElement, x: number, y: number, z: number, lift: number, scale: number, clip = false): boolean => {
      v.set(x, y, z).project(camera);
      if (v.z > 1 || v.z < -1) return false;
      // 画面 の そと の 妖怪 の しるし は 出さない（はしに はりつけ ない）
      if (clip && (Math.abs(v.x) > 1 || Math.abs(v.y) > 1)) return false;
      const ew = el.offsetWidth || 36;
      const eh = el.offsetHeight || 44;
      ndcToHalf(hf, v.x, v.y, at);
      const p = clampToHalf(hf, at.x, at.y - lift, ew, eh, 4, 4, box);
      el.style.transform = `translate(${(p.x - ew / 2).toFixed(1)}px, ${(p.y - eh).toFixed(1)}px) scale(${scale.toFixed(3)})`;
      el.style.transformOrigin = '50% 100%';
      return true;
    };
    const f = visible ? input.face : null;
    this.faceEl.hidden = !(f && place(this.faceEl, f.x, f.y, f.z, f.titled ? FACE_LIFT_TITLED : FACE_LIFT, 1, true));
    const b = visible ? input.bang : null;
    const sc = b ? bangScale(b.age) : 0;
    this.bangEl.hidden = !(b && sc > 0 && place(this.bangEl, b.x, b.y + 1.55, b.z, 0, sc));
  }
}
