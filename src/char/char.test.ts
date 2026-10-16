import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Lighting } from '../sky/lighting';
import { PALETTE_RGB, quantizeRgba } from './palette';
import { MotionMachine, type SpriteStepInput } from './motion';
import { bearingDeg, dirIndex, tierFor } from './view';
import { createCharSprite, type CharSprite } from './index';
import type { LoadImage } from './loader';

const input = (o: Partial<SpriteStepInput> & { vx?: number; vy?: number }): SpriteStepInput => ({
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: o.vx ?? 0, y: o.vy ?? 0, z: 0 },
  onGround: o.onGround ?? true,
  inWater: o.inWater ?? false,
  running: o.running ?? false,
  facingDeg: o.facingDeg ?? 0,
});

describe('方向と段 (AC16)', () => {
  it('facing 0 で yaw → 方向', () => {
    const dirOf = (yaw: number): number => dirIndex((yaw + 180) % 360, 0);
    expect([0, 45, 90, 135, 180, 225, 270, 315].map(dirOf)).toEqual([4, 5, 6, 7, 0, 1, 2, 3]);
    expect(dirOf(22)).toBe(4);
    expect(dirOf(23)).toBe(5);
  });
  it('bearing は yaw と同じ数え方', () => {
    expect(bearingDeg(0, 1)).toBeCloseTo(180);
    expect(bearingDeg(1, 0)).toBeCloseTo(90);
  });
  it('段は 60 度でちょうど切りかわる', () => {
    expect([59.9, 60, -59.9, -60, 0].map(tierFor)).toEqual([0, 1, 0, 2, 0]);
  });
});

describe('動きとコマ (AC22-28)', () => {
  it('idle は 45 ステップごとに 1 コマ、8 で 0 にもどる', () => {
    const m = new MotionMachine();
    const frames: number[] = [];
    for (let i = 1; i <= 45 * 8; i++) {
      m.step(input({}));
      if (i % 45 === 0 || i % 45 === 44) frames.push(m.frame);
    }
    expect(m.motion).toBe('idle');
    expect(frames.filter((_, i) => i % 2 === 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 0]);
  });
  it('歩く 4.0 は 60 ステップで 10 コマ、走る 5.6 は 12、水中 2.0 は 5', () => {
    const run = (v: number, running: boolean): number => {
      const m = new MotionMachine();
      for (let i = 0; i < 60; i++) m.step(input({ vx: v, running }));
      return m.frame;
    };
    expect(run(4, false)).toBe(2); // 10 mod 8
    expect(run(5.6, true)).toBe(4); // 12 mod 8
    expect(run(2, false)).toBe(5);
  });
  it('step(6) で v=4.0 の歩くコマが ちょうど 1 進む', () => {
    const m = new MotionMachine();
    for (let i = 0; i < 6; i++) m.step(input({ vx: 4 }));
    expect(m.motion).toBe('walk');
    expect(m.frame).toBe(1);
  });
  it('歩く ⇔ 走る でコマを引きつぐ', () => {
    const m = new MotionMachine();
    for (let i = 0; i < 20; i++) m.step(input({ vx: 4 }));
    const f = m.frame;
    m.step(input({ vx: 5.6, running: true }));
    expect(m.motion).toBe('run');
    expect(Math.abs(m.frame - f)).toBeLessThanOrEqual(1);
  });
  it('平らな地面のジャンプ: 1,2,3,4,5,6,7 の順、0 は出ない', () => {
    const m = new MotionMachine();
    const seq: string[] = [];
    let y = 0;
    let vy = 8.37;
    let air = 0;
    m.step(input({}));
    for (let i = 0; i < 80; i++) {
      vy -= 28 / 60;
      y += vy / 60;
      const onGround = y <= 0;
      if (onGround) {
        y = 0;
        vy = 0;
      } else air++;
      m.step(input({ onGround, vy: i === 0 ? 8.37 : vy }));
      seq.push(m.motion === 'jump' ? String(m.frame) : m.motion);
    }
    const rle = seq.filter((s, i) => s !== seq[i - 1]);
    expect(rle.slice(0, 8)).toEqual(['1', '2', '3', '4', '5', '6', '7', 'idle']);
    expect(seq.slice(0, 3)).toEqual(['1', '1', '1']);
    expect(seq.filter((s) => s === '6').length).toBe(4);
    expect(seq.filter((s) => s === '7').length).toBe(2);
    expect(seq).not.toContain('0');
    expect(air).toBeGreaterThan(30);
  });
  it('がけから おちる: 3〜5、ちゃくち 6・7 は出ない（空中 16）', () => {
    const m = new MotionMachine();
    const seen = new Set<number>();
    for (let i = 0; i < 16; i++) {
      m.step(input({ onGround: false, vy: -i * 0.5 }));
      if (m.motion === 'jump') seen.add(m.frame);
    }
    for (let i = 0; i < 10; i++) {
      m.step(input({}));
      expect(m.motion).toBe('idle');
    }
    expect([...seen].every((f) => f >= 3 && f <= 5)).toBe(true);
    expect(seen.size).toBeGreaterThan(0);
  });
  it('みずの中では jump にならない', () => {
    const m = new MotionMachine();
    for (let i = 0; i < 30; i++) {
      m.step(input({ onGround: false, inWater: true, vy: i === 0 ? 5 : -1 }));
      expect(m.motion).not.toBe('jump');
    }
  });
});

// ---- 小さな絵（2 コマ × 24 行）----
const COLS = 2;
function fakeImage(missing = false): LoadImage {
  return async () => {
    if (missing) throw new Error('no png');
    const w = 256 * COLS;
    const h = 256 * 24;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let row = 0; row < 24; row++) {
      for (let col = 0; col < COLS; col++) {
        const c = PALETTE_RGB[(row + col) % 20]!;
        for (let y = 10; y < 90; y++) {
          for (let x = 30; x < 100; x++) {
            const o = ((row * 256 + y) * w + col * 256 + x) * 4;
            data[o] = c[0];
            data[o + 1] = c[1];
            data[o + 2] = c[2];
            data[o + 3] = 255;
          }
        }
      }
    }
    return { width: w, height: h, data } as unknown as ImageData;
  };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

function make(opts: { img?: LoadImage; perMotion?: Record<string, LoadImage> } = {}): {
  sprite: CharSprite;
  camera: THREE.PerspectiveCamera;
  lighting: Lighting;
  parent: THREE.Group;
} {
  const parent = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  const lighting = new Lighting();
  const base = opts.img ?? fakeImage();
  const sprite = createCharSprite({
    parent,
    camera,
    lighting,
    basePath: './models/char/',
    loadJson: async () => ({ modelH: 1.7 }),
    loadImage: async (url) => {
      const key = /([a-z_]+)\.png$/.exec(url)![1]!;
      return (opts.perMotion?.[key] ?? base)(url);
    },
  });
  return { sprite, camera, lighting, parent };
}

function place(camera: THREE.PerspectiveCamera, parent: THREE.Object3D, pos: [number, number, number], look: [number, number, number]): void {
  camera.position.set(...pos);
  camera.lookAt(...look);
  camera.updateMatrixWorld(true);
  parent.updateMatrixWorld(true);
}

describe('板 (AC18-21, 31, 32, 40, 42)', () => {
  it('読みこむまでは出ない、読めたら loaded', async () => {
    const { sprite, camera, parent } = make();
    place(camera, parent, [0, 2.12, 4], [0, 2.12, 0]);
    sprite.render();
    expect(sprite.info().loaded).toBe(false);
    expect(sprite.info().visible).toBe(false);
    await flush();
    sprite.render();
    expect(sprite.info().loaded).toBe(true);
    expect(sprite.info().visible).toBe(true);
  });

  it('大きさ・中心 (AC18)', async () => {
    const { sprite, parent } = make();
    await flush();
    sprite.render();
    const mesh = parent.children[0] as THREE.Mesh;
    const k = 1.8 / 1.7;
    expect(mesh.scale.x).toBeCloseTo(2 * k, 3);
    expect(mesh.position.y).toBeCloseTo(0.95 * k, 3);
  });

  it('GPU メモリ: 色番号 1 バイト (AC31)。使う動きがそろう', async () => {
    const { sprite } = make();
    await flush();
    expect(sprite.info().gpuBytes).toBe(4 * 256 * COLS * 256 * 24);
    // 実物 2048 × 6144 × 4 まいでは 50,331,648 バイト
    expect(4 * 2048 * 6144).toBe(50_331_648);
    expect(50_331_648).toBeLessThanOrEqual(64 * 1024 * 1024);
  });

  it('readCell が 色番号から もとの色にもどる (AC40)', async () => {
    const { sprite } = make();
    await flush();
    const cell = await sprite.readCell('idle', 1, 3, 1);
    const c = PALETTE_RGB[(8 + 3 + 1) % 20]!;
    const o = (20 * 256 + 50) * 4;
    expect([...cell.slice(o, o + 4)]).toEqual([c[0], c[1], c[2], 255]);
    expect(cell[3]).toBe(0);
  });

  it('量子化: とうめいは 0、半とうめいは作らない', () => {
    const idx = quantizeRgba([10, 10, 10, 0, ...PALETTE_RGB[4]!, 255, ...PALETTE_RGB[0]!, 100], 3, 1);
    expect([...idx]).toEqual([0, 5, 0]);
  });

  it('方向・段・かたむき・画面のかたむき (AC16, 17, 42)', async () => {
    const { sprite, camera, parent } = make();
    await flush();
    // 水平: yaw 0（カメラは南 +Z）→ dir 4
    place(camera, parent, [0, 2.12, 4], [0, 2.12, 0]);
    sprite.step(input({ facingDeg: 0 }));
    sprite.render();
    expect(sprite.info().dir).toBe(4);
    expect(sprite.info().tier).toBe(0);
    expect(sprite.info().tiltDeg).toBe(0);
    // pitch -65 の見下ろし
    const p = (65 * Math.PI) / 180;
    for (const yaw of [0, 90]) {
      const y = (yaw * Math.PI) / 180;
      const cam: [number, number, number] = [
        -4 * Math.sin(y) * Math.cos(p),
        2.12 + 4 * Math.sin(p),
        Math.cos(y) * Math.cos(p) * 4,
      ];
      place(camera, parent, cam, [0, 2.12, 0]);
      sprite.render();
      const i = sprite.info();
      expect(i.tier).toBe(1);
      expect(i.elevDeg).toBeCloseTo(70.4, 0);
      expect(i.tiltDeg).toBeCloseTo(70.4, 0);
      expect(i.upDeg).toBeLessThan(1);
    }
    // 真上から（pitch -89）
    place(camera, parent, [0.07, 2.12 + 4, 0], [0, 2.12, 0]);
    sprite.render();
    expect(sprite.info().upDeg).toBeLessThan(1);
    // 見上げ
    parent.position.set(0, 10, 0);
    place(camera, parent, [0, 0, 1.5], [0, 12, 0]);
    sprite.render();
    expect(sprite.info().tier).toBe(2);
  });

  it('カメラが からだの中心から 1.2 未満なら かくす (AC7)', async () => {
    const { sprite, camera, parent } = make();
    await flush();
    place(camera, parent, [0, 1, 1.19], [0, 1, 0]);
    sprite.render();
    expect(sprite.info().visible).toBe(false);
    place(camera, parent, [0, 1, 1.21], [0, 1, 0]);
    sprite.render();
    expect(sprite.info().visible).toBe(true);
  });

  it('明るさと赤み (AC20, 21)', async () => {
    const { sprite, lighting } = make();
    await flush();
    lighting.setLevels(1, 0.5);
    expect(sprite.info().tint).toEqual({ r: 0.5, g: 0.5, b: 0.5 });
    sprite.hurt();
    for (let i = 0; i < 12; i++) {
      sprite.step(input({}));
      expect(sprite.info().tint.g).toBeCloseTo(0.3, 5);
      expect(sprite.info().tint.r).toBeCloseTo(0.5, 5);
    }
    sprite.step(input({}));
    expect(sprite.info().tint.g).toBeCloseTo(0.5, 5);
    // 数え直し
    sprite.hurt();
    for (let i = 0; i < 6; i++) sprite.step(input({}));
    sprite.hurt();
    for (let i = 0; i < 12; i++) sprite.step(input({}));
    expect(sprite.info().tint.g).toBeCloseTo(0.3, 5);
    sprite.step(input({}));
    expect(sprite.info().tint.g).toBeCloseTo(0.5, 5);
  });

  it('はしる・ジャンプの PNG がないとき 代わりの絵 (AC32)', async () => {
    const miss = fakeImage(true);
    const { sprite } = make({ perMotion: { run: miss, jump: miss } });
    await flush();
    expect(sprite.info().loaded).toBe(true);
    for (let i = 0; i < 10; i++) sprite.step(input({ vx: 5.6, running: true }));
    expect(sprite.info().motion).toBe('walk');
    sprite.step(input({ onGround: false, vy: 8 }));
    expect(sprite.info().motion).toBe('idle');
    expect(sprite.needsBoxDoll()).toBe(false);
  });

  it('たつ の PNG もないときは 箱人形 (AC32)', async () => {
    const miss = fakeImage(true);
    const { sprite } = make({ img: miss });
    await flush();
    expect(sprite.needsBoxDoll()).toBe(true);
    expect(sprite.info().loaded).toBe(false);
  });

  it('はしる・ジャンプが読み終わらなくても たつ・あるく で loaded (AC32)', async () => {
    const never: LoadImage = () => new Promise(() => undefined);
    const { sprite } = make({ perMotion: { run: never, jump: never } });
    await flush();
    expect(sprite.info().loaded).toBe(true);
  });

  it('大きさが ちがう絵は 失敗あつかい', async () => {
    const bad: LoadImage = async () => ({ width: 100, height: 100, data: new Uint8ClampedArray(40000) }) as unknown as ImageData;
    const { sprite } = make({ perMotion: { walk: bad } });
    await flush();
    expect(sprite.info().loaded).toBe(true);
    for (let i = 0; i < 10; i++) sprite.step(input({ vx: 4 }));
    expect(sprite.info().motion).toBe('idle');
  });

  it('dir・tier・frame から 絵の場所 uRect が決まり、上下は シェーダーで反転する (C1)', async () => {
    const { sprite, camera, parent } = make();
    await flush();
    const mat = (parent.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('(1.0 - vUv.y)');
    place(camera, parent, [0, 2.12, 4], [0, 2.12, 0]);
    sprite.step(input({ facingDeg: 0 }));
    sprite.render();
    let r = mat.uniforms.uRect!.value as THREE.Vector4;
    expect([r.x, r.y, r.z, r.w]).toEqual([0, 4 / 24, 1 / COLS, 1 / 24]);
    // 見下ろし（段 1）: 行 8 + dir
    place(camera, parent, [0, 7, 1.5], [0, 2.12, 0]);
    sprite.render();
    const info = sprite.info();
    expect(info.tier).toBe(1);
    r = mat.uniforms.uRect!.value as THREE.Vector4;
    expect(r.y).toBeCloseTo((8 + info.dir) / 24, 6);
    // データの行 row * 256 が 色見本の row 番めの色（PNG の上から数えた行）
    const tex = mat.uniforms.uMap!.value as THREE.DataTexture;
    const data = tex.image.data as Uint8Array;
    const row = Math.round(r.y * 24);
    expect(data[(row * 256 + 20) * tex.image.width + 50]).toBe(((row + 0) % 20) + 1);
  });

  it('あるくが読めず たつ で代わるとき frame は 0 (C4)', async () => {
    const miss = fakeImage(true);
    const { sprite } = make({ perMotion: { walk: miss } });
    await flush();
    for (let i = 0; i < 20; i++) sprite.step(input({ vx: 4 }));
    expect(sprite.info().motion).toBe('idle');
    expect(sprite.info().frame).toBe(0);
  });

  it('dispose で板が はずれる', async () => {
    const { sprite, parent } = make();
    await flush();
    sprite.dispose();
    expect(parent.children.length).toBe(0);
  });
});
