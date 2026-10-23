import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { AnimalState, AnimalView, CoopInfo, CoopPlacePreview, KitInfo } from '../../contracts';
import { AnimalFx } from '../../fx/animalFx';
import { AnimalRenderer } from './AnimalRenderer';
import { MODEL_SCALE, getAnimalModel } from './chickenModel';
import { getCoopModel, getEggModel, getNestEggsModel } from './coopSpec';
import type { KitIconRow } from './kitIcons';

const view = (id: number, o: Partial<AnimalView> = {}): AnimalView => ({
  id, x: id * 0.8, y: 9, z: 0, yaw: 0, headYaw: 0, state: 'idle' as AnimalState, stateTicks: 0, friend: false, hearts: 0, targeted: false, ...o,
});
type Src = NonNullable<ConstructorParameters<typeof AnimalRenderer>[0]['source']>;
function setup(kits: Array<KitInfo & { hatchT: number }> = [], coops: CoopInfo[] = [], drawCoops = false) {
  const fx = new AnimalFx({ sound: { playTones: () => {} } });
  const src: Src = { forEachKit: (fn) => kits.forEach(fn), forEachCoop: (fn) => coops.forEach(fn) };
  const r = new AnimalRenderer({ fx, source: src, drawCoops });
  const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 200);
  cam.position.set(0, 10, 8);
  cam.lookAt(0, 9, 0);
  return { fx, r, cam };
}
const kit = (x: number, o: Partial<KitInfo & { hatchT: number }> = {}): KitInfo & { hatchT: number } => ({ x, y: 9, z: -4, egg: 'egg', left: 3000, wobble: 0, hatchT: 0, ...o });
const coop = (id: number, x: number, o: Partial<CoopInfo> = {}): CoopInfo => ({ id, x, y: 9, z: -12, dir: 0, gate: { x, z: -14 }, kids: [], nest: { egg: 0, gold: 0 }, ...o });

/** 見えている 骨つき メッシュ（その 形 の geometry を もつ もの） */
function visibleMeshes(root: THREE.Object3D, geo: THREE.BufferGeometry): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh) || o.geometry !== geo) return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return;
    out.push(o);
  });
  return out;
}
const rigScale = (m: THREE.Object3D): number => (m.parent as THREE.Object3D).scale.x;

describe('LIVE-2 形の えらび（stage・breed・grow）', () => {
  it('ひよこ・マッチョ・マッチョひよこ は それぞれの 形と 大きさ（0.62・0.72・1.15 倍）', () => {
    const { r, cam } = setup();
    r.update([view(1, { stage: 'chick', friend: true }), view(2, { stage: 'chick', breed: 'macho', friend: true }), view(3, { stage: 'adult', breed: 'macho', friend: true }), view(4, { stage: 'adult', friend: true })], cam);
    for (const [kind, id] of [['chick', 1], ['machoChick', 2], ['macho', 3], ['chicken', 4]] as const) {
      const ms = visibleMeshes(r.group, getAnimalModel(kind, true).geo);
      expect(ms, kind).toHaveLength(1);
      expect(rigScale(ms[0]), kind).toBeCloseTo(MODEL_SCALE[kind], 5);
      void id;
    }
  });

  it('やせい の ひよこ も リボン つき（ひよこ・マッチョ は いつも しるし あり）。小屋 の 子 も', () => {
    const { r, cam } = setup();
    r.update([view(1, { stage: 'chick' }), view(2, { stage: 'adult', home: 3 }), view(3)], cam);
    expect(visibleMeshes(r.group, getAnimalModel('chick', true).geo)).toHaveLength(1);
    expect(visibleMeshes(r.group, getAnimalModel('chicken', true).geo)).toHaveLength(1);
    expect(visibleMeshes(r.group, getAnimalModel('chicken', false).geo)).toHaveLength(1);
  });

  it('大人 に なる 動き: growT 0.5 の 前 は ひよこ の 形、あと は 大人 の 形（同じ 子 の ままで 入れかわる）', () => {
    const { r, cam } = setup();
    const v = view(1, { stage: 'chick', friend: true, state: 'grow', growT: 0.2 });
    r.update([v], cam);
    expect(visibleMeshes(r.group, getAnimalModel('chick', true).geo)).toHaveLength(1);
    r.update([{ ...v, growT: 0.7 }], cam);
    expect(visibleMeshes(r.group, getAnimalModel('chick', true).geo)).toHaveLength(0);
    expect(visibleMeshes(r.group, getAnimalModel('chicken', true).geo)).toHaveLength(1);
    // 大人 の 形 に なった 直後 は ひよこ の 見た目 の 大きさ に そろう（つなぎめ が とばない）
    r.update([{ ...v, growT: 0.5 }], cam);
    const m = visibleMeshes(r.group, getAnimalModel('chicken', true).geo)[0];
    expect(rigScale(m)).toBeCloseTo(MODEL_SCALE.chick * 1.25, 1);
    // stage が 先に 'adult' に なっても 前半 は ひよこ
    r.update([{ ...v, stage: 'adult', growT: 0.1 }], cam);
    expect(visibleMeshes(r.group, getAnimalModel('chick', true).geo)).toHaveLength(1);
  });

  it('かえる: ひよこ は から の 中 で 小さく はじまる（hatchT 0.1）→ 終わりで 元の 大きさ', () => {
    const { r, cam } = setup();
    const v = view(1, { stage: 'chick', friend: true, state: 'hatch', hatchT: 0.1 });
    r.update([v], cam);
    const g = getAnimalModel('chick', true).geo;
    expect(rigScale(visibleMeshes(r.group, g)[0])).toBeLessThan(MODEL_SCALE.chick * 0.7);
    r.update([{ ...v, hatchT: 1 }], cam);
    expect(rigScale(visibleMeshes(r.group, g)[0])).toBeCloseTo(MODEL_SCALE.chick, 3);
  });

  it('コロン（rollT）: 体 が 前 へ まわる。おわれば もとに', () => {
    const { r, cam } = setup();
    const g = getAnimalModel('chick', true).geo;
    const v = view(1, { stage: 'chick', friend: true });
    r.update([{ ...v, rollT: 0.5 }], cam);
    const mesh = visibleMeshes(r.group, g)[0];
    const body = mesh.skeleton.bones[mesh.skeleton.bones.findIndex((b) => b.name === 'body')];
    expect(Math.abs(body.rotation.x)).toBeGreaterThan(2.5);
    r.update([v], cam);
    expect(body.rotation.x).toBeCloseTo(0, 5);
  });

  it('首・とさか・しっぽ の ない ひよこ でも 骨 は 正しい 場所 に 入る（NaN なし）', () => {
    const { r, cam } = setup();
    r.update([view(1, { stage: 'chick', friend: true, state: 'eat', stateTicks: 12 }), view(2, { stage: 'chick', breed: 'macho', state: 'sleep', stateTicks: 30 })], cam);
    r.group.traverse((o) => {
      if (o instanceof THREE.Bone) expect([o.position.x, o.position.y, o.position.z, o.rotation.x, o.scale.x].every(Number.isFinite)).toBe(true);
    });
  });
});

describe('LIVE-2.1 こたつ の たまご（中 の 3D の 絵 は 出さない。天板 の 上 の 表示 だけ）', () => {
  const rowOf = (x: number, eggs: number, z = -4): KitIconRow => ({
    x, y: 9, z, size: 2,
    slots: [0, 1, 2].map((i) => (i < eggs ? { egg: 'egg' as const, fill: 0.3, wobble: 0 as const } : { egg: null, fill: 0, wobble: 0 as const })),
  });
  const iconMeshes = (r: AnimalRenderer): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    r.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o instanceof THREE.SkinnedMesh) && o.geometry instanceof THREE.PlaneGeometry && o.visible && (o.material as THREE.MeshBasicMaterial).map?.magFilter === THREE.NearestFilter) out.push(o);
    });
    return out;
  };

  it('こたつ の 中 の たまご の 3D の 物 は いつも 0（forEachKit に たまご が あっても）', () => {
    const { r, cam } = setup([kit(0), kit(2, { wobble: 2 }), kit(4, { egg: 'gold' })]);
    r.update([], cam);
    for (const [g, c] of [[false, false], [false, true], [true, false], [true, true]] as const) expect(visibleMeshes(r.group, getEggModel(g, c).geo)).toHaveLength(0);
    expect(r.stats().draws).toBe(0);
  });

  it('setKitIcons: 1 台 1 回。天板 の 上 0.5 マス・こたつ の はば（2 マス）に おさまる・カメラ の ほう を 向く。空 で 消える', () => {
    const { r, cam } = setup();
    r.update([], cam);
    expect(iconMeshes(r)).toHaveLength(0);
    r.setKitIcons([rowOf(0, 2), rowOf(4, 3)]);
    cam.position.set(3, 14, 8);
    cam.lookAt(2, 9, -4);
    cam.updateMatrixWorld(true);
    r.update([], cam);
    const ms = iconMeshes(r);
    expect(ms).toHaveLength(2);
    expect(r.stats().draws).toBe(2); // こたつ 2 台 で +2
    const w = ms[0].position;
    expect([w.x, w.z]).toEqual([1, -3]); // 2×2 の まん中
    expect(w.y).toBeGreaterThanOrEqual(9 + 1.5); // 天板（高さ 1）の 上 0.5 マス から 上
    expect(w.y).toBeLessThan(9 + 1.5 + 1);
    expect((ms[0].geometry as THREE.PlaneGeometry).parameters.width).toBeLessThanOrEqual(2); // わく 3 つ が 2 マス に おさまる
    expect(ms[0].quaternion.angleTo(cam.quaternion)).toBeLessThan(1e-6);
    r.setKitIcons([]);
    r.update([], cam);
    expect(iconMeshes(r)).toHaveLength(0);
    expect(r.stats().draws).toBe(0);
  });

  it('絵 は 見た目 が かわった とき だけ 作り直す（同じ 鍵 では 同じ 絵 の まま）', () => {
    const { r, cam } = setup();
    r.setKitIcons([rowOf(0, 1)]);
    r.update([], cam);
    const tex = (iconMeshes(r)[0].material as THREE.MeshBasicMaterial).map as THREE.DataTexture;
    const v0 = tex.version;
    r.update([], cam);
    expect(tex.version).toBe(v0);
    r.setKitIcons([rowOf(0, 2)]);
    r.update([], cam);
    expect(tex.version).toBeGreaterThan(v0);
  });

  it('いちばん 多い とき: 6 台 まで 描く（それ いじょう は 描かない）', () => {
    const { r, cam } = setup();
    r.setKitIcons([0, 1, 2, 3, 4, 5, 6, 7].map((i) => rowOf(i * 3, 1)));
    r.update([], cam);
    expect(iconMeshes(r)).toHaveLength(6);
  });
});

describe('LIVE-2.1 着地点 の 丸', () => {
  const ringMeshes = (r: AnimalRenderer): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    r.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.visible && o.rotation.x === -Math.PI / 2 && (o.material as THREE.MeshBasicMaterial).map) out.push(o);
    });
    return out;
  };
  it('なげられる 所 に 直径 0.8 の 丸 が 1 つ（描画 +1）。固い 所・だっこ して いない で 消える', () => {
    const { r, cam } = setup();
    r.update([], cam);
    expect(ringMeshes(r)).toHaveLength(0);
    r.setThrowSpot({ x: 5.5, y: 9, z: 3.5, ok: true, home: null, toss: true });
    r.update([], cam);
    const m = ringMeshes(r);
    expect(m).toHaveLength(1);
    expect(m[0].scale.x).toBeCloseTo(0.8, 5);
    expect([m[0].position.x, m[0].position.z]).toEqual([5.5, 3.5]);
    expect(r.stats().draws).toBe(1);
    r.setThrowSpot({ x: 5.5, y: 9, z: 3.5, ok: false, home: null, toss: true });
    r.update([], cam);
    expect(ringMeshes(r)).toHaveLength(0);
    r.setThrowSpot(null);
    r.update([], cam);
    expect(r.stats().draws).toBe(0);
  });
  it('とりごや の 中 は いえ の しるし の 絵 に かわる', () => {
    const { r, cam } = setup();
    r.setThrowSpot({ x: 5.5, y: 9, z: 3.5, ok: true, home: null, toss: true });
    r.update([], cam);
    const plain = (ringMeshes(r)[0].material as THREE.MeshBasicMaterial).map;
    r.setThrowSpot({ x: 5.5, y: 9, z: 3.5, ok: true, home: 2, toss: true });
    r.update([], cam);
    expect((ringMeshes(r)[0].material as THREE.MeshBasicMaterial).map).not.toBe(plain);
  });
});

describe('LIVE-2 小屋', () => {
  it('ふだん（drawCoops なし）: すばこ の たまご だけ。たまご 0 の 小屋 は 描かない', () => {
    const { r, cam } = setup([], [coop(1, 0), coop(2, 6, { nest: { egg: 3, gold: 1 } })]);
    r.update([], cam);
    expect(visibleMeshes(r.group, getCoopModel().geo)).toHaveLength(0);
    expect(visibleMeshes(r.group, getNestEggsModel(3, 1).geo)).toHaveLength(1);
    expect(r.stats().draws).toBe(1);
    expect(r.stats().triangles).toBeGreaterThan(0);
  });

  it('drawCoops: 小屋 の 形 を 1 回 ＋ たまご 1 回。むき（北・東・南・西）で まわる。大きさ = 16/9', () => {
    const cs = [0, 1, 2, 3].map((d) => coop(d + 1, d * 7, { dir: d as 0 | 1 | 2 | 3, nest: { egg: 1, gold: 0 } }));
    const { r, cam } = setup([], cs, true);
    r.update([], cam);
    const ms = visibleMeshes(r.group, getCoopModel().geo);
    expect(ms).toHaveLength(4);
    expect(r.stats().draws).toBe(8);
    const yaws = ms.map((m) => Math.round((m.parent!.parent!.parent as THREE.Group).rotation.y * 180 / Math.PI)); // mesh → rig → coop root → 小屋
    expect(yaws).toEqual([0, -90, 180, 90]);
    expect((ms[0].parent!.parent as THREE.Group).scale.x).toBeCloseTo(16 / 9, 5);
    // 小屋 の 中心 = マス の まん中、足もと = y
    const w = (ms[0].parent!.parent!.parent as THREE.Group).getWorldPosition(new THREE.Vector3());
    expect([w.x, w.y, w.z]).toEqual([0.5, 9, -11.5]);
    expect(r.stats().triangles).toBeGreaterThan(4 * getCoopModel().tris);
  });

  it('すばこ の たまご の 数 が かわると 形 が かわる（見える 数 12 まで）', () => {
    const c = coop(1, 0, { nest: { egg: 2, gold: 0 } });
    const { r, cam } = setup([], [c]);
    r.update([], cam);
    expect(visibleMeshes(r.group, getNestEggsModel(2, 0).geo)).toHaveLength(1);
    c.nest.egg = 20;
    c.nest.gold = 3;
    r.update([], cam);
    expect(visibleMeshes(r.group, getNestEggsModel(2, 0).geo)).toHaveLength(0);
    expect(visibleMeshes(r.group, getNestEggsModel(20, 3).geo)).toHaveLength(1);
    c.nest.egg = 0;
    c.nest.gold = 0;
    r.update([], cam);
    expect(r.stats().draws).toBe(0);
  });
});

describe('LIVE-2 すけた 小屋（置く 前）', () => {
  const pv = (ok: boolean, dir: 0 | 1 | 2 | 3 = 2): CoopPlacePreview => ({ x: 5, y: 9, z: 7, dir, ok });
  const ghostOf = (r: AnimalRenderer): THREE.SkinnedMesh[] => visibleMeshes(r.group, getCoopModel().geo);

  it('入る = 白 40%、入らない = 赤 35%（ななめ しま）。位置・むき・大きさ。null で きえる', () => {
    const { r, cam } = setup();
    r.update([], cam);
    expect(ghostOf(r)).toHaveLength(0);
    r.setCoopGhost(pv(true));
    r.update([], cam);
    let g = ghostOf(r);
    expect(g).toHaveLength(1);
    const mat = g[0].material as THREE.MeshBasicMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.opacity).toBeCloseTo(0.4, 5);
    expect(mat.color.getHex()).toBe(0xffffff);
    const root = g[0].parent!.parent!.parent as THREE.Group;
    expect(root.rotation.y).toBeCloseTo(Math.PI, 5);
    expect((g[0].parent!.parent as THREE.Group).scale.x).toBeCloseTo(16 / 9, 5);
    expect(r.stats().draws).toBe(2); // 小屋 の すけた 形 ＋ たいら に なる 足もと の 板（LIVE-2.1）
    r.setCoopGhost(pv(false, 3));
    r.update([], cam);
    g = ghostOf(r);
    expect((g[0].material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.35, 5);
    expect((g[0].material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(0xffffff);
    expect(((g[0].material as THREE.MeshBasicMaterial).color.r)).toBeGreaterThan((g[0].material as THREE.MeshBasicMaterial).color.g);
    const w = (g[0].parent!.parent!.parent as THREE.Group).getWorldPosition(new THREE.Vector3());
    expect([w.x, w.y, w.z]).toEqual([5.5, 9, 7.5]);
    r.setCoopGhost(null);
    r.update([], cam);
    expect(ghostOf(r)).toHaveLength(0);
    expect(r.stats().draws).toBe(0);
  });

  it('しま の 見え方 は 色だけ に たよらない（入らない 時 は ななめ の しま を shader で 抜く）', () => {
    const { r } = setup();
    r.setCoopGhost(pv(false));
    const mesh = visibleMeshes(r.group, getCoopModel().geo)[0];
    const mat = mesh.material as THREE.MeshBasicMaterial;
    const sh = { uniforms: {} as Record<string, { value: number }>, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    (mat.onBeforeCompile as unknown as (s: typeof sh) => void)(sh);
    expect(sh.uniforms.uBad.value).toBe(1);
    expect(sh.fragmentShader).toContain('discard');
    r.setCoopGhost(pv(true));
    expect(sh.uniforms.uBad.value).toBe(0);
  });
});

describe('LIVE-2 軽さ（いちばん 多い とき）', () => {
  it('29 わ（ふつう 23 ・ひよこ 3・マッチョ 3）＋ こたつ 6 ＋ 小屋 3（たまご 12）: 描画 回数 と 三角形', () => {
    const views: AnimalView[] = [];
    for (let i = 0; i < 29; i++) {
      const o: Partial<AnimalView> = i < 23 ? { friend: true } : i < 26 ? { stage: 'chick', friend: true } : { breed: 'macho', friend: true, stage: 'adult' };
      views.push(view(i + 1, { ...o, x: (i % 10) * 0.9 - 4, z: -1 - Math.floor(i / 10) }));
    }
    const kits = [0, 1, 2, 3, 4, 5].map((i) => kit(i * 2));
    const coops = [0, 1, 2].map((i) => coop(i + 1, i * 7, { nest: { egg: 8, gold: 4 } }));
    const base = setup();
    base.r.update(views, base.cam);
    const withExtra = setup(kits, coops);
    withExtra.r.update(views, withExtra.cam);
    const dDraw = withExtra.r.stats().draws - base.r.stats().draws;
    const dTri = withExtra.r.stats().triangles - base.r.stats().triangles;
    expect(dDraw).toBe(3); // LIVE-2.1: こたつ の 中 の 3D の たまご は 出さない（天板 の 表示 は setKitIcons）
    expect(dDraw).toBeLessThanOrEqual(36);
    // 29 わ の 三角形（DESIGN 16.17・LIVE-2 §4.6）は 20,000 以下。たまご（こたつ 6 ＋ すばこ 12 こ×3）は それとは べつに 数える
    expect(base.r.stats().triangles).toBeLessThanOrEqual(20000);
    expect(dTri).toBeLessThanOrEqual(6500);
  });
});
