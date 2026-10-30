// HOUSE-1B 試作: 家具の 絵（ボタン用の ななめ絵・方眼用の 真上からの 絵）。見本と 同じ 材料（MeshData）を ゲームの レンダラーで 小さな 画像に 描いて data URL に する。
// 見本（preview.ts）の 描画の 数には 数えない（ひらく とき 1 回 作って しまっておく）。
import {
  Box3, Color, Mesh, OrthographicCamera, Scene, Vector3, WebGLRenderTarget,
  type MeshBasicMaterial, type WebGLRenderer,
} from 'three';
import { toGeometry } from '../../world/render/rendererGeometry';
import { furnitureOnly, lanternOnly } from './previewMesh';
import { FURN_ART, K_LANTERN, type FurnKind, type Rot } from './tuning';

/** 家具の 絵 1 まい ぶん（普通・置ける〔白っぽい〕・置けない〔赤〕） */
export interface FurnImage {
  normal: string;
  ok: string;
  ng: string;
  /** 絵の よこ・たて（px） */
  w: number;
  h: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const TOP_PX_PER_CELL = FURN_ART.topPxPerCell;
const ICON_PX = FURN_ART.isoPx;

/** 8 ビットの 線形 → sRGB（アイコンを 画面と 同じ 色に する） */
const SRGB_LUT = Uint8ClampedArray.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
});

export class FurnitureIcons {
  private readonly cache = new Map<string, FurnImage>();

  constructor(private readonly renderer: WebGLRenderer, private readonly material: MeshBasicMaterial) {}

  /** 家具 1 つの 絵。view ＝ 'iso'（ボタン用: ななめ上から。まわりを 切りとって 正方形）、'top'（方眼用: 真上から。1 マス 64px） */
  image(kind: FurnKind | 'lantern', rot: Rot, view: 'iso' | 'top'): FurnImage {
    const key = `${kind}:${rot}:${view}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const made = view === 'top' ? this.renderTop(kind, rot) : this.renderIso(kind);
    this.cache.set(key, made);
    return made;
  }

  private withTarget(w: number, h: number, draw: (r: WebGLRenderer) => void): Uint8ClampedArray {
    const r = this.renderer;
    const keepColor = r.getClearColor(new Color());
    const keepAlpha = r.getClearAlpha();
    const keepTarget = r.getRenderTarget();
    const keepTest = r.getScissorTest();
    const rt = new WebGLRenderTarget(w, h, { samples: 4 });
    r.setRenderTarget(rt);
    r.setScissorTest(false);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    draw(r);
    const raw = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, raw);
    r.setRenderTarget(keepTarget);
    r.setScissorTest(keepTest);
    r.setClearColor(keepColor, keepAlpha);
    rt.dispose();
    // 上下を ひっくりかえし、線形 → sRGB、半透明の ふち（乗算ずみ）を もとの 色に もどす
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((h - 1 - y) * w + x) * 4;
        const o = (y * w + x) * 4;
        const a = raw[s + 3]!;
        if (a === 0) continue;
        const k = 255 / a;
        out[o] = SRGB_LUT[Math.min(255, Math.round(raw[s]! * k))]!;
        out[o + 1] = SRGB_LUT[Math.min(255, Math.round(raw[s + 1]! * k))]!;
        out[o + 2] = SRGB_LUT[Math.min(255, Math.round(raw[s + 2]! * k))]!;
        out[o + 3] = a;
      }
    }
    return out;
  }

  private meshOf(kind: FurnKind | 'lantern', rot: Rot): { mesh: Mesh; w: number; d: number } {
    if (kind === K_LANTERN) return { mesh: new Mesh(toGeometry(lanternOnly()), this.material), w: 1, d: 1 };
    const f = furnitureOnly(kind, rot);
    return { mesh: new Mesh(toGeometry(f.mesh), this.material), w: f.w, d: f.d };
  }

  private renderTop(kind: FurnKind | 'lantern', rot: Rot): FurnImage {
    const { mesh, w, d } = this.meshOf(kind, rot);
    const W = w * TOP_PX_PER_CELL;
    const H = d * TOP_PX_PER_CELL;
    const scene = new Scene();
    scene.add(mesh);
    const cam = new OrthographicCamera(-w / 2, w / 2, d / 2, -d / 2, 0.1, 60);
    cam.up.set(0, 0, -1);
    cam.position.set(w / 2, 20, d / 2);
    cam.lookAt(w / 2, 0, d / 2);
    cam.updateMatrixWorld(true);
    const px = this.withTarget(W, H, (r) => r.render(scene, cam));
    mesh.geometry.dispose();
    return toImages(px, W, H, true);
  }

  private renderIso(kind: FurnKind | 'lantern'): FurnImage {
    const { mesh } = this.meshOf(kind, 0);
    const scene = new Scene();
    scene.add(mesh);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox as Box3;
    const c = box.getCenter(new Vector3());
    const yaw = rad(32);
    const elev = rad(30);
    const dir = new Vector3(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    cam.position.copy(c).addScaledVector(dir, 30);
    cam.lookAt(c);
    cam.updateMatrixWorld(true);
    // かどの 点を カメラの 右・上に 当てて、切りとる 大きさを きめる
    const right = new Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    let half = 0.1;
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const rel = new Vector3(x, y, z).sub(c);
          half = Math.max(half, Math.abs(rel.dot(right)), Math.abs(rel.dot(up)));
        }
      }
    }
    half *= 1.06;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
    const px = this.withTarget(ICON_PX, ICON_PX, (r) => r.render(scene, cam));
    mesh.geometry.dispose();
    return toImages(px, ICON_PX, ICON_PX);
  }
}

/** 絵の ふち（半透明でない 点の うち、まわり rim 点 いない に すきまが ある 点）。上から 見た 絵で 置ける・置けないの わくに 使う */
function rimOf(px: Uint8ClampedArray, w: number, h: number, rim: number): Uint8Array {
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = px[i * 4 + 3]! > 8 ? 1 : 0;
  // 内がわへ rim 点 けずった 形（たて・よこの 2 回）
  const erode = (src: Uint8Array, horiz: boolean): Uint8Array => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let keep = 1;
        for (let k = -rim; k <= rim && keep; k++) {
          const xx = horiz ? x + k : x;
          const yy = horiz ? y : y + k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h || !src[yy * w + xx]) keep = 0;
        }
        out[y * w + x] = keep;
      }
    }
    return out;
  };
  const inner = erode(erode(solid, true), false);
  const ring = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) ring[i] = solid[i] && !inner[i] ? 1 : 0;
  return ring;
}

/** 同じ 絵を 3 つの 色で（普通・置ける〔白〕・置けない〔赤〕）。data URL。withRim ＝ 上から 見た 絵に 色の わくを つける */
function toImages(px: Uint8ClampedArray, w: number, h: number, withRim = false): FurnImage {
  const ring = withRim ? rimOf(px, w, h, FURN_ART.ghostRimPx) : null;
  const url = (mix: readonly [number, number, number] | null, amount: number): string => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const out = new Uint8ClampedArray(px);
    if (mix) {
      for (let i = 0; i < out.length; i += 4) {
        if (out[i + 3] === 0) continue;
        out[i] = out[i]! + (mix[0] - out[i]!) * amount;
        out[i + 1] = out[i + 1]! + (mix[1] - out[i + 1]!) * amount;
        out[i + 2] = out[i + 2]! + (mix[2] - out[i + 2]!) * amount;
      }
      if (ring) {
        for (let i = 0; i < w * h; i++) {
          if (!ring[i]) continue;
          out[i * 4] = mix[0];
          out[i * 4 + 1] = mix[1];
          out[i * 4 + 2] = mix[2];
          out[i * 4 + 3] = 255;
        }
      }
    }
    g.putImageData(new ImageData(out, w, h), 0, 0);
    return c.toDataURL('image/png');
  };
  return { normal: url(null, 0), ok: url(FURN_ART.ghostOk, FURN_ART.ghostOkMix), ng: url(FURN_ART.ghostNg, FURN_ART.ghostNgMix), w, h };
}
