// CHAR-5 AC5(板の 大きさ)・AC6(男の子の 場面)・AC7(男の子で 始める)・AC8(char.set の 切りかえ)・色見本
// 窓口（実装は これに 合わせる。仕様 §4.4・§4.6）:
//   createCharSprite({ ..., kind?: 'girl'|'boy' })（なければ girl）
//   sprite.setChar(kind, basePath)   … char.set の 中身。前の キャラの 絵を ぜんぶ おろし、新しい キャラを 読みはじめる
//   sprite.info().kind / .palette    … 板が 今 出している キャラと 色見本 22 色
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Lighting } from '../sky/lighting';
import { PALETTE_RGB } from './palette';
import { parryCellOf } from './parryCells';
import { createCharSprite, type CharSprite } from './index';
import type { LoadImage } from './loader';
import type { SpriteStepInput } from './motion';

const GIRL = './models/char/girl/';
const BOY = './models/char/boy/';
const W = 512;
const H = 256 * 24;
const ONE = W * H;
const LIMIT = 67108864;
const BASE4 = ['idle', 'walk', 'run', 'jump'];
const KATANA6 = ['katana_thrust', 'katana_walk_chudan', 'katana_kesa', 'katana_walk_jodan', 'katana_kiriage', 'katana_walk_gedan'];
const BOW4 = ['bow_shot', 'bow_hold_walk', 'bow_walk', 'bow_rapid'];
const PARRY2 = ['parry', 'parryKime'];
const WEAPON_ONLY = [...KATANA6, ...BOW4, ...PARRY2];

const BOY_PALETTE: number[][] = (JSON.parse(readFileSync('art/char-sheets/boy/palette.json', 'utf8')).colors as number[][]).map((c) => c.map((v) => Math.round(v * 255)));
const srgbToLinear = (v8: number): number => {
  const c = v8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

function fakeImage(colors: readonly (readonly number[])[] = PALETTE_RGB): ImageData {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < 24 * 2; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const c = colors[(row + col) % 20]!;
    for (let y = 10; y < 40; y++) {
      for (let x = 30; x < 60; x++) {
        const o = ((row * 256 + y) * W + col * 256 + x) * 4;
        data[o] = c[0]!;
        data[o + 1] = c[1]!;
        data[o + 2] = c[2]!;
        data[o + 3] = 255;
      }
    }
  }
  return { width: W, height: H, data } as unknown as ImageData;
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0));
};

interface Gate {
  url: string;
  release: () => void;
}
/** 呼ばれた 場所を ぜんぶ 記録する。gate:true の間は 絵の 読みこみが おわらない */
function makeIO(opts: { gate?: boolean; image?: () => ImageData } = {}) {
  const calls: string[] = [];
  const gates: Gate[] = [];
  const state = { gate: opts.gate ?? false };
  const loadImage: LoadImage = (url) => {
    calls.push(url);
    if (state.gate) return new Promise((res) => gates.push({ url, release: () => res((opts.image ?? fakeImage)()) }));
    return Promise.resolve((opts.image ?? fakeImage)());
  };
  const loadJson = async (url: string): Promise<unknown> => {
    calls.push(url);
    if (url.includes('/boy/')) return { modelH: 1.63, palette: BOY_PALETTE };
    return { modelH: 1.7 }; // palette なし = 女の子の 色見本
  };
  return { loadImage, loadJson, calls, gates, state, pngs: () => calls.filter((u) => u.endsWith('.png')) };
}
const name = (u: string): string => /([A-Za-z_]+)\.png$/.exec(u)![1]!;

function make(io: ReturnType<typeof makeIO>, kind: 'girl' | 'boy' = 'girl') {
  const parent = new THREE.Group();
  const sprite = createCharSprite({
    parent,
    camera: new THREE.PerspectiveCamera(),
    lighting: new Lighting(),
    basePath: kind === 'boy' ? BOY : GIRL,
    kind,
    loadJson: io.loadJson,
    loadImage: io.loadImage,
    initTexture: (t) => t.onUpdate?.(t as never),
  });
  const mesh = parent.getObjectByName('charSprite') as THREE.Mesh;
  return { sprite, parent, mesh };
}

const step = (s: CharSprite, o: Partial<SpriteStepInput> & { vx?: number; vy?: number } = {}): void =>
  s.step({
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: o.vx ?? 0, y: o.vy ?? 0, z: 0 },
    onGround: true,
    inWater: false,
    running: false,
    facingDeg: 0,
    weapon: 'none',
    blade: null,
    bow: null,
    ...o,
  } as SpriteStepInput);
type Phase = 'idle' | 'switch' | 'startup' | 'active' | 'recovery';
const katana = (o: { vx?: number; stance?: 'chudan' | 'jodan' | 'gedan'; tech?: 'thrust' | 'kesa' | 'kiriage' | null; phase?: Phase; frame?: number } = {}): Partial<SpriteStepInput> & { vx: number } => ({
  weapon: 'katana',
  vx: o.vx ?? 0,
  blade: { stance: o.stance ?? 'chudan', tech: o.tech ?? null, phase: o.phase ?? 'idle', frame: o.frame ?? 0, lengths: null },
  bow: null,
});
const bow = (vx = 0, drawing = false, drawTicks = 0, shot = false): Partial<SpriteStepInput> & { vx: number } => ({
  weapon: 'bow',
  vx,
  blade: null,
  bow: { drawing, drawTicks, shot },
});

/** gpuBytes = 今の キャラの 読みおえた 絵の 合計（ちょうど）で 上限 以下 */
function exact(sprite: CharSprite): void {
  const i = sprite.info();
  const ready = Object.values(i.status).filter((s) => s === 'ready').length;
  expect(i.gpuBytes).toBe(ready * ONE);
  expect(i.gpuBytes).toBeLessThanOrEqual(LIMIT);
}

afterEach(() => vi.restoreAllMocks());

describe('AC5 板の 大きさ（男の子 1.63・女の子 1.7）', () => {
  it('男の子: 2.2086 ±0.001・中心の 高さ 1.0491 ±0.001。kind boy', async () => {
    const io = makeIO();
    const { sprite, mesh } = make(io, 'boy');
    await flush();
    step(sprite);
    expect(sprite.info().kind).toBe('boy');
    expect(mesh.scale.x).toBeCloseTo(2.2086, 3);
    expect(mesh.scale.y).toBeCloseTo(2.2086, 3);
    expect(mesh.position.y).toBeCloseTo(1.0491, 3);
  });
  it('女の子: 2.1176・1.0059（今のまま）。kind girl', async () => {
    const { sprite, mesh } = make(makeIO(), 'girl');
    await flush();
    expect(sprite.info().kind).toBe('girl');
    expect(mesh.scale.x).toBeCloseTo(2.1176, 3);
    expect(mesh.position.y).toBeCloseTo(1.0059, 3);
  });
  it('kind を 渡さないと girl', async () => {
    const parent = new THREE.Group();
    const io = makeIO();
    const sprite = createCharSprite({ parent, camera: new THREE.PerspectiveCamera(), lighting: new Lighting(), basePath: GIRL, loadJson: io.loadJson, loadImage: io.loadImage });
    expect(sprite.info().kind).toBe('girl');
    sprite.dispose();
  });
  it('char.set の あと 新しい キャラの modelH の 大きさ', async () => {
    const { sprite, mesh } = make(makeIO(), 'girl');
    await flush();
    sprite.setChar('boy', BOY);
    await flush();
    expect(mesh.scale.x).toBeCloseTo(2.2086, 3);
    expect(mesh.position.y).toBeCloseTo(1.0491, 3);
    sprite.setChar('girl', GIRL);
    await flush();
    expect(mesh.scale.x).toBeCloseTo(2.1176, 3);
    expect(mesh.position.y).toBeCloseTo(1.0059, 3);
  });
});

describe('色見本（キャラごと。atlas.json の palette）', () => {
  const uni = (mesh: THREE.Mesh): THREE.Vector3[] => (mesh.material as THREE.ShaderMaterial).uniforms.uPalette!.value as THREE.Vector3[];
  const same = (v: THREE.Vector3, rgb: readonly number[]): boolean => [v.x, v.y, v.z].every((x, k) => Math.abs(x - srgbToLinear(rgb[k]!)) < 1e-9);

  it('男の子: info().palette と 板の 色の 表が atlas.json の palette（22 色）', async () => {
    const { sprite, mesh } = make(makeIO(), 'boy');
    await flush();
    expect(sprite.info().palette).toEqual(BOY_PALETTE);
    expect(uni(mesh)).toHaveLength(32); // WEAPON-9: 0 番 ＋ 22 色 ＋ 手に 持つ 絵の ための 9 席
    BOY_PALETTE.forEach((c, i) => expect(same(uni(mesh)[i + 1]!, c)).toBe(true));
  });
  it('女の子: palette のない atlas.json は 今の PALETTE_RGB', async () => {
    const { sprite, mesh } = make(makeIO(), 'girl');
    await flush();
    expect(sprite.info().palette).toEqual(PALETTE_RGB.map((c) => [...c]));
    PALETTE_RGB.forEach((c, i) => expect(same(uni(mesh)[i + 1]!, c)).toBe(true));
  });
  it('char.set で 板の 色の 表も そのキャラのものに かわる', async () => {
    const { sprite, mesh } = make(makeIO(), 'girl');
    await flush();
    sprite.setChar('boy', BOY);
    await flush();
    BOY_PALETTE.forEach((c, i) => expect(same(uni(mesh)[i + 1]!, c)).toBe(true));
    sprite.setChar('girl', GIRL);
    await flush();
    PALETTE_RGB.forEach((c, i) => expect(same(uni(mesh)[i + 1]!, c)).toBe(true));
  });
  it('男の子の 絵は 男の子の 色見本で 色番号に して readCell で もどる（女の子の 色見本では ない）', async () => {
    const dot = BOY_PALETTE[5]!; // 女の子の 6 番目とは ちがう色
    expect(PALETTE_RGB.some((c) => c[0] === dot[0] && c[1] === dot[1] && c[2] === dot[2])).toBe(false);
    const img = (): ImageData => {
      const d = new Uint8ClampedArray(W * H * 4);
      d.set([...dot, 255], (10 * W + 30) * 4);
      return { width: W, height: H, data: d } as unknown as ImageData;
    };
    const { sprite } = make(makeIO({ image: img }), 'boy');
    await flush();
    const cell = await sprite.readCell('idle', 0, 0, 0);
    expect([...cell.slice((10 * 256 + 30) * 4, (10 * 256 + 30) * 4 + 4)]).toEqual([...dot, 255]);
  });
});

describe('AC6 男の子の 場面（案 B）', () => {
  async function boy() {
    const io = makeIO();
    const m = make(io, 'boy');
    await flush();
    return { io, ...m };
  }
  const onlyBase = (io: ReturnType<typeof makeIO>, sprite: CharSprite): void => {
    for (const n of io.pngs().map(name)) expect(BASE4).toContain(n);
    const st = sprite.info().status;
    for (const n of WEAPON_ONLY) expect(st[n as 'idle']).toBe('none');
  };
  const changes = (sprite: CharSprite, make1: () => Partial<SpriteStepInput> & { vx: number }, n = 60): number => {
    let c = 0;
    let prev = sprite.info().frame;
    for (let i = 0; i < n; i++) {
      step(sprite, make1());
      const f = sprite.info().frame;
      if (f !== prev) c++;
      prev = f;
    }
    return c;
  };

  it('刀（中段）を 持って 立つ → stand・idle。W (4.0) → walk で 60 ステップに 10 ±1 コマ。シフト+W → run。ジャンプ → jump（刀を持っていても）', async () => {
    const { io, sprite } = await boy();
    step(sprite, katana());
    await flush(); // 女の子なら ここで 刀の組が 読まれる。男の子は 読まない
    let i = sprite.info();
    expect([i.scene, i.motion]).toEqual(['stand', 'idle']);
    for (let k = 0; k < 15; k++) step(sprite, katana({ vx: 4 }));
    i = sprite.info();
    expect([i.scene, i.motion]).toEqual(['walk', 'walk']);
    const c = changes(sprite, () => katana({ vx: 4 }));
    expect(c).toBeGreaterThanOrEqual(9);
    expect(c).toBeLessThanOrEqual(11);
    for (let k = 0; k < 15; k++) step(sprite, { ...katana({ vx: 5.6 }), running: true });
    i = sprite.info();
    expect([i.scene, i.motion]).toEqual(['run', 'run']);
    for (let k = 0; k < 10; k++) step(sprite, { ...katana(), onGround: false, vy: k < 5 ? 8 : -5 });
    i = sprite.info();
    expect([i.scene, i.motion]).toEqual(['jump', 'jump']);
    onlyBase(io, sprite);
  });

  it('素手のときも 同じ 決まり（stand・walk・run・jump）', async () => {
    const { sprite } = await boy();
    step(sprite);
    expect(sprite.info().motion).toBe('idle');
    for (let k = 0; k < 15; k++) step(sprite, { vx: 4 });
    expect(sprite.info().motion).toBe('walk');
    step(sprite, { onGround: false, vy: 8 });
    expect(sprite.info().motion).toBe('jump');
  });

  for (const tech of [
    { name: '大けさぎり(jodan・kesa)', stance: 'jodan', tech: 'kesa', total: 106 },
    { name: '突き(chudan・thrust)', stance: 'chudan', tech: 'thrust', total: 42 },
    { name: '切り上げ(gedan・kiriage)', stance: 'gedan', tech: 'kiriage', total: 60 },
  ] as const) {
    it(`${tech.name}: startup・active・recovery の どのステップも stand・idle（歩いていても）`, async () => {
      const { io, sprite } = await boy();
      for (let f = 1; f <= tech.total; f++) {
        const phase: Phase = f <= 10 ? 'startup' : f <= tech.total - 20 ? 'active' : 'recovery';
        step(sprite, katana({ vx: f % 2 ? 4 : 0, stance: tech.stance, tech: tech.tech, phase, frame: f }));
        const i = sprite.info();
        expect([i.scene, i.motion]).toEqual(['stand', 'idle']);
        expect(i.frame).toBeLessThan(8);
      }
      step(sprite, katana({ vx: 4, stance: tech.stance }));
      expect(sprite.info().motion).toBe('walk'); // わざが おわれば もとの 決まり
      onlyBase(io, sprite);
    });
  }

  it('弓を 引いて 立つ → idle。引きながら W → walk。矢を うった あとも 弓の 絵は 出ない', async () => {
    const { io, sprite } = await boy();
    step(sprite, bow());
    await flush(); // 女の子なら ここで 弓の組が 読まれる。男の子は 読まない
    expect(sprite.info().motion).toBe('idle');
    for (let k = 1; k <= 45; k++) {
      step(sprite, bow(0, true, k));
      expect(sprite.info().motion).toBe('idle');
    }
    for (let k = 0; k < 15; k++) step(sprite, bow(4, true, 50 + k));
    expect(sprite.info().motion).toBe('walk');
    step(sprite, bow(0, false, 0, true));
    for (let k = 0; k < 20; k++) {
      step(sprite, bow());
      expect(['idle', 'walk']).toContain(sprite.info().motion);
    }
    onlyBase(io, sprite);
  });

  it('パリィ F1〜40 と きめの 8 ステップ → stand・idle（歩いていても）。パリィの 絵は 読まない', async () => {
    const { io, sprite } = await boy();
    step(sprite, katana({ vx: 4 }));
    for (let f = 1; f <= 40; f++) {
      step(sprite, katana({ vx: 4 }));
      sprite.setParry(parryCellOf(f <= 3 ? 'ready' : f <= 34 ? 'guard' : 'recover', f));
      const i = sprite.info();
      expect([i.scene, i.motion]).toEqual(['stand', 'idle']);
    }
    for (let f = 1; f <= 8; f++) {
      step(sprite, katana({ vx: 4 }));
      sprite.setParry(parryCellOf('kime', f));
      expect(sprite.info().motion).toBe('idle');
    }
    sprite.setParry(null);
    step(sprite, katana({ vx: 4 }));
    expect(sprite.info().motion).toBe('walk');
    sprite.preloadParry();
    await flush();
    onlyBase(io, sprite);
    expect(io.pngs().map(name).sort()).toEqual([...BASE4].sort());
  });

  it('女の子は 今のまま（刀を 持つと kamae・katana_thrust）', async () => {
    const io = makeIO();
    const { sprite } = make(io, 'girl');
    await flush();
    step(sprite, katana());
    await flush();
    expect(sprite.info().scene).toBe('kamae');
    expect(sprite.info().motion).toBe('katana_thrust');
  });
});

describe('AC7 男の子で 始める', () => {
  it('読みこみ口は boy/ の atlas.json と 4 まいの PNG だけ（girl/ は 1 つも）。順は たつ・あるく → はしる・ジャンプ', async () => {
    const io = makeIO();
    const { sprite } = make(io, 'boy');
    await flush();
    expect(sprite.info().kind).toBe('boy');
    expect(io.calls.every((u) => u.startsWith(BOY))).toBe(true);
    expect(io.calls.some((u) => u.includes('/girl/'))).toBe(false);
    expect(io.calls).toContain(`${BOY}atlas.json`);
    const pngs = io.pngs().map(name);
    expect(pngs).toHaveLength(4);
    expect(pngs.slice(0, 2).sort()).toEqual(['idle', 'walk']);
    expect(pngs.slice(2).sort()).toEqual(['jump', 'run']);
    const i = sprite.info();
    expect(i.loaded).toBe(true);
    expect(i.gpuBytes).toBe(4 * ONE);
    for (const n of BASE4) expect(i.status[n as 'idle']).toBe('ready');
  });
  it('刀・弓を 持ち、わざ・矢・パリィを 出しても gpuBytes は 変わらず、読みこみ口も 増えない', async () => {
    const io = makeIO();
    const { sprite } = make(io, 'boy');
    await flush();
    const n0 = io.calls.length;
    step(sprite, katana());
    step(sprite, katana({ stance: 'jodan', tech: 'kesa', phase: 'startup', frame: 3 }));
    step(sprite, bow(0, true, 20));
    step(sprite, bow(0, false, 0, true));
    sprite.setParry(parryCellOf('guard', 5));
    sprite.preloadParry();
    await flush();
    expect(io.calls).toHaveLength(n0);
    expect(sprite.info().gpuBytes).toBe(4 * ONE);
  });
});

describe('AC8 切りかえ（char.set）', () => {
  /** 女の子で 16 まい ぜんぶ 読んだ 状態 */
  async function fullGirl(io = makeIO()) {
    const m = make(io, 'girl');
    await flush();
    step(m.sprite, katana());
    step(m.sprite, bow());
    m.sprite.setParry(parryCellOf('guard', 3));
    m.sprite.setParry(null);
    await flush();
    return { io, ...m };
  }

  it('16 まい 読んだ(gpuBytes 16 まい分)あと boy → その ステップの おわりに 女の子は ぜんぶ none・gpuBytes 0・loaded false。読めたら loaded・kind boy・4 まい分', async () => {
    const { io, sprite } = await fullGirl();
    expect(sprite.info().gpuBytes).toBe(16 * ONE);
    io.calls.length = 0;
    sprite.setChar('boy', BOY);
    let i = sprite.info(); // 同じ ステップの おわり（await なし）
    for (const n of [...BASE4, ...WEAPON_ONLY]) expect(i.status[n as 'idle']).toBe('none');
    expect(i.gpuBytes).toBe(0);
    expect(i.loaded).toBe(false);
    expect(i.visible).toBe(false);
    await flush();
    i = sprite.info();
    expect(i.loaded).toBe(true);
    expect(i.kind).toBe('boy');
    expect(i.gpuBytes).toBe(4 * ONE);
    expect(io.calls.every((u) => u.startsWith(BOY))).toBe(true);
    for (const n of WEAPON_ONLY) expect(i.status[n as 'idle']).toBe('none');
  });

  it('もう一度 girl → 女の子の はじめの 4 つだけ。刀を 持っていれば そのあと 刀の 6 まい', async () => {
    const io = makeIO();
    const { sprite } = make(io, 'boy');
    await flush();
    sprite.setChar('girl', GIRL);
    step(sprite);
    await flush();
    expect(sprite.info().gpuBytes).toBe(4 * ONE);
    expect(sprite.info().kind).toBe('girl');
    sprite.setChar('boy', BOY);
    await flush();
    io.calls.length = 0;
    step(sprite, katana()); // 男の子で 刀を 持っている
    await flush();
    expect(sprite.info().gpuBytes).toBe(4 * ONE);
    sprite.setChar('girl', GIRL);
    await flush();
    const names = io.pngs().map(name);
    expect(names.slice(0, 4).sort()).toEqual([...BASE4].sort());
    expect(names.slice(4)).toEqual(KATANA6);
    expect(sprite.info().gpuBytes).toBe(10 * ONE);
    exact(sprite);
  });

  it('同じ キャラを えらんでも 何もしない（おろさない・読まない）', async () => {
    const io = makeIO();
    const { sprite } = make(io, 'boy');
    await flush();
    const n0 = io.calls.length;
    sprite.setChar('boy', BOY);
    await flush();
    expect(io.calls).toHaveLength(n0);
    expect(sprite.info().gpuBytes).toBe(4 * ONE);
    expect(sprite.info().loaded).toBe(true);
  });

  it('読みこみ中に 女 → 男 → 女: さいごは 女の子の 絵だけ。男の子の 絵は GPU に のこらない。どの時点でも gpuBytes は ちょうど', async () => {
    const io = makeIO({ gate: true });
    const { sprite } = make(io, 'girl');
    await flush();
    exact(sprite);
    sprite.setChar('boy', BOY);
    exact(sprite);
    await flush();
    sprite.setChar('girl', GIRL);
    exact(sprite);
    // 止めていた 読みこみを ぜんぶ 順番に 解く（前の キャラの 分も、あとから ふえる分も）
    for (let round = 0; round < 12; round++) {
      io.state.gate = false;
      const pending = io.gates.splice(0);
      for (const g of pending) g.release();
      io.state.gate = true;
      await flush();
      exact(sprite);
    }
    io.state.gate = false;
    await flush();
    const i = sprite.info();
    expect(i.kind).toBe('girl');
    expect(i.loaded).toBe(true);
    expect(i.gpuBytes).toBe(4 * ONE);
    for (const n of WEAPON_ONLY) expect(i.status[n as 'idle']).toBe('none');
    // 男の子の 絵は 板が 持っている 色番号の 写しにも のこらない
    expect(i.cpuBytes).toBeLessThanOrEqual(4 * ONE);
  });

  it('待ち行列に のこっている 前の キャラの 絵は 読まない（女の子の 2 まい目を 待っている間に boy）', async () => {
    const io = makeIO({ gate: true });
    const { sprite } = make(io, 'girl');
    await flush();
    const girlCalls = io.pngs().length; // idle・walk が 読み中
    expect(girlCalls).toBe(2);
    sprite.setChar('boy', BOY);
    io.state.gate = false;
    for (const g of io.gates.splice(0)) g.release();
    await flush();
    expect(io.pngs().slice(girlCalls).every((u) => u.startsWith(BOY))).toBe(true); // 女の子の run・jump は 呼ばれない
    expect(io.pngs().filter((u) => u.startsWith(GIRL))).toHaveLength(2);
    expect(sprite.info().gpuBytes).toBe(4 * ONE);
    expect(sprite.info().kind).toBe('boy');
  });

  it('10 回 切りかえても 同じ（GPU の 絵が ふえつづけない）。破棄した 絵の 数 = 作った 数 - 今ある 数', async () => {
    const disposed: THREE.Texture[] = [];
    const made: THREE.Texture[] = [];
    const orig = THREE.DataTexture.prototype.dispose;
    vi.spyOn(THREE.DataTexture.prototype, 'dispose').mockImplementation(function (this: THREE.DataTexture) {
      disposed.push(this);
      orig.call(this);
    });
    const io = makeIO();
    const parent = new THREE.Group();
    const sprite = createCharSprite({
      parent, camera: new THREE.PerspectiveCamera(), lighting: new Lighting(), basePath: GIRL, kind: 'girl',
      loadJson: io.loadJson, loadImage: io.loadImage,
      initTexture: (t) => { made.push(t); t.onUpdate?.(t as never); },
    });
    await flush();
    for (let k = 0; k < 10; k++) {
      sprite.setChar(k % 2 === 0 ? 'boy' : 'girl', k % 2 === 0 ? BOY : GIRL);
      await flush();
      expect(sprite.info().gpuBytes).toBe(4 * ONE);
      exact(sprite);
    }
    expect(made).toHaveLength(4 * 11);
    expect(disposed.length).toBe(4 * 10);
  });

  it('切りかえは 体・向き・わざの 状態に 触らない: 切りかえた あとも 同じ 入力で 場面が つづく', async () => {
    const { sprite } = await (async () => {
      const m = make(makeIO(), 'girl');
      await flush();
      return m;
    })();
    sprite.setChar('boy', BOY);
    await flush();
    step(sprite, katana({ vx: 4 }));
    expect(sprite.info().scene).toBe('walk');
    sprite.setChar('girl', GIRL);
    await flush();
    expect(sprite.info().kind).toBe('girl');
    step(sprite, katana({ vx: 4 }));
    expect(sprite.info().want.motion).toBe('katana_walk_chudan');
  });
});
