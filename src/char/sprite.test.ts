// CHAR-2 AC22・AC23・AC25: 読みこみの差しかえ口・読む時と重さ・板の描画の数
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Lighting } from '../sky/lighting';
import { PALETTE_RGB } from './palette';
import { createCharSprite, type CharSprite } from './index';
import type { LoadImage } from './loader';
import type { SpriteStepInput } from './motion';

const COLS = 2;
const W = 256 * COLS;
const H = 256 * 24;
const ONE = W * H;

function fakeImage(): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < 24 * COLS; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const c = PALETTE_RGB[(row + col) % 20]!;
    for (let y = 10; y < 40; y++) {
      for (let x = 30; x < 60; x++) {
        const o = ((row * 256 + y) * W + col * 256 + x) * 4;
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = 255;
      }
    }
  }
  return { width: W, height: H, data } as unknown as ImageData;
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
};

interface Gate {
  name: string;
  release: () => void;
}
/** 読みこみ口: 呼ばれた名前を 記録する。gated な名前は release されるまで おわらない */
function makeLoader(opts: { hang?: string[]; fail?: string[]; gated?: string[] } = {}) {
  const calls: string[] = [];
  const gates: Gate[] = [];
  const loadImage: LoadImage = (url) => {
    const name = /([a-z_]+)\.png$/.exec(url)![1]!;
    calls.push(name);
    if (opts.hang?.includes(name)) return new Promise(() => undefined);
    if (opts.fail?.includes(name)) return Promise.reject(new Error('no png'));
    if (opts.gated?.includes(name)) {
      return new Promise((res) => {
        gates.push({ name, release: () => res(fakeImage()) });
      });
    }
    return Promise.resolve(fakeImage());
  };
  return { loadImage, calls, gates };
}

function make(loadImage: LoadImage, extra: { initTexture?: (t: THREE.Texture) => void } = {}) {
  const parent = new THREE.Group();
  const sprite = createCharSprite({
    parent,
    camera: new THREE.PerspectiveCamera(),
    lighting: new Lighting(),
    basePath: './models/char/',
    loadJson: async () => ({ modelH: 1.7 }),
    loadImage,
    // 本物の renderer.initTexture は 上げたあとに onUpdate を呼ぶ
    initTexture: (t) => t.onUpdate?.(t as never),
    ...extra,
  });
  return { sprite, parent };
}

const step = (s: CharSprite, o: Partial<SpriteStepInput> & { vx?: number }): void =>
  s.step({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: o.vx ?? 0, y: 0, z: 0 },
    onGround: true,
    inWater: false,
    running: false,
    facingDeg: 0,
    ...o,
  } as SpriteStepInput);
const katana = (stance: 'chudan' | 'jodan' | 'gedan' = 'chudan', vx = 0): Partial<SpriteStepInput> & { vx: number } => ({
  weapon: 'katana',
  vx,
  blade: { stance, tech: null, phase: 'idle', frame: 0, lengths: null },
  bow: null,
});
const bowHold = (vx = 0, drawing = false, drawTicks = 0, shot = false): Partial<SpriteStepInput> & { vx: number } => ({
  weapon: 'bow',
  vx,
  blade: null,
  bow: { drawing, drawTicks, shot },
});

const KATANA_ORDER = ['katana_thrust', 'katana_walk_chudan', 'katana_kesa', 'katana_walk_jodan', 'katana_kiriage', 'katana_walk_gedan'];
const BOW_ORDER = ['bow_shot', 'bow_hold_walk', 'bow_walk', 'bow_rapid'];

afterEach(() => vi.restoreAllMocks());

describe('AC23 読む時と重さ', () => {
  it('持つ前は 武器の絵を 読まない。gpuBytes は はじめの 4 つ。cpuBytes 0', async () => {
    const L = makeLoader();
    const { sprite } = make(L.loadImage);
    await flush();
    for (let i = 0; i < 10; i++) step(sprite, { vx: 4 });
    expect(L.calls.sort()).toEqual(['idle', 'jump', 'run', 'walk']);
    const i = sprite.info();
    expect(i.gpuBytes).toBe(4 * ONE);
    expect(i.cpuBytes).toBe(0);
    for (const n of ['idle', 'walk', 'run', 'jump']) expect(i.status[n as 'idle']).toBe('ready');
    for (const n of [...KATANA_ORDER, ...BOW_ORDER]) expect(i.status[n as 'idle']).toBe('none');
  });

  it('刀を持つと 6 まいを 順に 1 まいずつ（次は 前がおわってから）。gpuBytes は 読みおえた分だけ', async () => {
    const L = makeLoader({ gated: KATANA_ORDER });
    const { sprite } = make(L.loadImage);
    await flush();
    step(sprite, katana());
    await flush();
    expect(L.calls.slice(4)).toEqual(['katana_thrust']);
    expect(sprite.info().status.katana_thrust).toBe('loading');
    expect(sprite.info().status.katana_walk_chudan).toBe('none');
    for (let k = 0; k < 6; k++) {
      expect(sprite.info().gpuBytes).toBe((4 + k) * ONE);
      L.gates[k]!.release();
      await flush();
      expect(L.calls.slice(4)).toEqual(KATANA_ORDER.slice(0, Math.min(6, k + 2)));
    }
    expect(sprite.info().gpuBytes).toBe(10 * ONE);
    expect(sprite.info().cpuBytes).toBe(0);
    // 持ちかえても 読み直さない
    step(sprite, bowHold());
    step(sprite, katana());
    await flush();
    expect(L.calls.filter((c) => c === 'katana_thrust')).toHaveLength(1);
  });

  it('弓を持つと 弓の組 4 まいを 順に', async () => {
    const L = makeLoader();
    const { sprite } = make(L.loadImage);
    await flush();
    step(sprite, bowHold());
    await flush();
    expect(L.calls.slice(4)).toEqual(BOW_ORDER);
    expect(sprite.info().gpuBytes).toBe(8 * ONE);
  });

  it('はじめの組が 読み終わる前に 刀を持ったら、そのあとに読む', async () => {
    const L = makeLoader({ gated: ['run'] });
    const { sprite } = make(L.loadImage);
    await flush();
    step(sprite, katana());
    await flush();
    expect(L.calls).not.toContain('katana_thrust');
    L.gates[0]!.release();
    await flush();
    expect(L.calls).toContain('katana_thrust');
  });

  it('GPU へ上げたら 板の CPU の写しは 0（texture の data も すてる）', async () => {
    const ups: THREE.Texture[] = [];
    const L = makeLoader();
    const { sprite } = make(L.loadImage, { initTexture: (t) => ups.push(t) });
    await flush();
    expect(ups.length).toBe(4);
    // 上がる前は 写しを持っている（cpuBytes が 本当の値）
    expect(sprite.info().cpuBytes).toBe(4 * ONE);
    for (const t of ups) t.onUpdate?.(t as never);
    expect(sprite.info().cpuBytes).toBe(0);
    for (const t of ups) expect((t.image as { data: unknown }).data).toBeNull();
  });
});

describe('AC22 読めない絵は 代わりの絵', () => {
  it('刀の組が 読み終わらない: 立つ = idle の 0 コマ・歩く = walk', async () => {
    const L = makeLoader({ hang: KATANA_ORDER });
    const { sprite } = make(L.loadImage);
    await flush();
    step(sprite, katana());
    let i = sprite.info();
    expect([i.scene, i.motion, i.frame, i.want.motion, i.want.frame]).toEqual(['kamae', 'idle', 0, 'katana_thrust', 0]);
    for (let k = 0; k < 20; k++) step(sprite, katana('chudan', 4));
    i = sprite.info();
    expect(i.scene).toBe('kamaeWalk');
    expect(i.motion).toBe('walk');
    expect(i.want.motion).toBe('katana_walk_chudan');
    expect(i.frame).toBe(i.want.frame);
  });

  it('katana_walk_jodan だけ 読めない: 上段で歩くと walk、立つと katana_kesa の 0', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const L = makeLoader({ fail: ['katana_walk_jodan'] });
    const { sprite } = make(L.loadImage);
    await flush();
    step(sprite, katana('jodan'));
    await flush();
    step(sprite, katana('jodan', 4));
    expect(sprite.info().motion).toBe('walk');
    step(sprite, katana('jodan'));
    expect([sprite.info().motion, sprite.info().frame]).toEqual(['katana_kesa', 0]);
    expect(sprite.info().status.katana_walk_jodan).toBe('failed');
    expect(sprite.info().status.katana_walk_chudan).toBe('ready');
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('katana_walk_jodan'))).toHaveLength(1);
    for (let k = 0; k < 5; k++) step(sprite, katana('jodan', 4));
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('katana_walk_jodan'))).toHaveLength(1);
  });

  it('bow_rapid が ないと 連射は bow_shot の コマ。bow_hold_walk が ないと bow_walk', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const L = makeLoader({ fail: ['bow_rapid', 'bow_hold_walk'] });
    const { sprite } = make(L.loadImage);
    await flush();
    step(sprite, bowHold());
    await flush();
    for (let k = 1; k <= 45; k++) step(sprite, bowHold(0, true, k));
    step(sprite, bowHold(0, false, 0, true));
    for (let k = 0; k < 9; k++) step(sprite, bowHold());
    step(sprite, bowHold(0, true, 8)); // a = 10 で 引きはじめ → 連射
    let i = sprite.info();
    expect(i.want.motion).toBe('bow_rapid');
    expect(i.motion).toBe('bow_shot');
    expect(i.frame).toBe(1); // bow_shot の 引く表で drawTicks 8
    step(sprite, bowHold(4));
    i = sprite.info();
    expect(i.motion).toBe('bow_walk');
    expect(i.want.motion).toBe('bow_hold_walk');
  });

  it('bow_shot が ないと 弓の 立つ・引くは idle', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const L = makeLoader({ fail: ['bow_shot'] });
    const { sprite } = make(L.loadImage);
    await flush();
    step(sprite, bowHold());
    await flush();
    expect([sprite.info().motion, sprite.info().frame]).toEqual(['idle', 0]);
    step(sprite, bowHold(0, true, 30));
    expect([sprite.info().motion, sprite.info().frame]).toEqual(['idle', 0]);
  });
});

describe('AC25 板は 描画 1・三角形 2 のまま', () => {
  it('刀を持ってわざのあいだも 板は 1 まいの Mesh・三角形 2', async () => {
    const L = makeLoader();
    const { sprite, parent } = make(L.loadImage);
    await flush();
    step(sprite, katana());
    await flush();
    for (let f = 1; f <= 20; f++) {
      step(sprite, { ...katana(), blade: { stance: 'chudan', tech: 'thrust', phase: 'recovery', frame: f + 6, lengths: null } });
      sprite.render();
    }
    expect(parent.children).toHaveLength(1);
    const mesh = parent.children[0] as THREE.Mesh;
    expect(mesh.isMesh).toBe(true);
    expect((mesh.geometry.index?.count ?? 0) / 3).toBe(2);
    expect(Array.isArray(mesh.material)).toBe(false);
  });
});

describe('テスト用: 動きの はじめにもどす（restartMotion）', () => {
  it('立っている時間が ちがっても、もどしたあとの 数ステップで 同じコマ', async () => {
    const frameAfterRestart = async (standSteps: number): Promise<number> => {
      const { sprite } = make(makeLoader().loadImage);
      await flush();
      for (let i = 0; i < standSteps; i++) step(sprite, {});
      sprite.restartMotion();
      for (let i = 0; i < 30; i++) step(sprite, {});
      const f = sprite.info().want.frame;
      sprite.dispose();
      return f;
    };
    // 立ちはじめから 100 ステップなら 3 コマ目に進んでいる（45 ステップに 1 コマ）。もどせば 30 ステップ後は 0 コマ
    const a = await frameAfterRestart(3);
    const b = await frameAfterRestart(100);
    expect(a).toBe(0);
    expect(b).toBe(0);
  });
});

describe('影の板が 使う cardCell（段・向きを 指定して いまの動き・コマの 四角を 引く）', () => {
  it('格子の絵: 段 0・向き dir の 行、いまのコマ。絵が まだ なければ false', async () => {
    const { sprite, parent } = make(makeLoader().loadImage);
    const mesh = parent.getObjectByName('charSprite') as THREE.Mesh;
    const cardCell = mesh.userData.cardCell as (t: number, d: number, rect: THREE.Vector4, crop: THREE.Vector4) => boolean;
    const rect = new THREE.Vector4();
    const crop = new THREE.Vector4();
    expect(cardCell(0, 3, rect, crop)).toBe(false);
    await flush();
    step(sprite, {});
    sprite.render();
    expect(cardCell(0, 3, rect, crop)).toBe(true);
    expect(rect.toArray()).toEqual([0, 3 / 24, 1 / COLS, 1 / 24]);
    expect(crop.toArray()).toEqual([0, 0, 1, 1]);
    expect(cardCell(1, 5, rect, crop)).toBe(true);
    expect(rect.y).toBe(13 / 24);
  });

  it('切りつめた絵: packed の 四角と 詰めたときの ずれ。uSize は 板と同じ入れ物', async () => {
    const PW = 10;
    const cells: number[][] = [];
    for (let i = 0; i < 24; i++) cells.push([0, i * 10, PW, 10, i, 2]);
    const loadImage: LoadImage = async (url) => {
      if (!/idle\.png$/.test(url)) throw new Error('no png');
      const data = new Uint8ClampedArray(PW * 240 * 4);
      const c = PALETTE_RGB[0]!;
      for (let i = 0; i < PW * 240; i++) data.set([c[0], c[1], c[2], 255], i * 4);
      return { width: PW, height: 240, data } as unknown as ImageData;
    };
    const parent = new THREE.Group();
    const sprite = createCharSprite({
      parent,
      camera: new THREE.PerspectiveCamera(),
      lighting: new Lighting(),
      basePath: './models/char/',
      loadJson: async () => ({ modelH: 1.7, motions: { idle: { frames: 1, fps: 0, packed: { width: PW, height: 240, cells } } } }),
      loadImage,
      initTexture: (t) => t.onUpdate?.(t as never),
    });
    await flush();
    step(sprite, {});
    sprite.render();
    const mesh = parent.getObjectByName('charSprite') as THREE.Mesh;
    const cardCell = mesh.userData.cardCell as (t: number, d: number, rect: THREE.Vector4, crop: THREE.Vector4) => boolean;
    const rect = new THREE.Vector4();
    const crop = new THREE.Vector4();
    expect(cardCell(0, 3, rect, crop)).toBe(true);
    expect(rect.toArray()).toEqual([0, 30 / 240, 10 / PW, 10 / 240]);
    expect(crop.toArray()).toEqual([3 / 256, 2 / 256, 10 / 256, 10 / 256]);
    const mat = mesh.material as THREE.ShaderMaterial;
    expect((mat.uniforms.uSize!.value as THREE.Vector2).toArray()).toEqual([PW, 240]);
  });
});
