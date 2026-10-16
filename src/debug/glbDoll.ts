// CHAR-1 のお試し: URL に ?char=<名前> を付けると、三人称の箱人形のかわりに public/models/<名前>.glb を出す。
// 見た目が世界から浮くかを見るためだけのもの。刀・弓・防具・手に持つものは まだ つながない。
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { BlockDoll } from '../camera/BlockDoll';
import type { Lighting } from '../sky/lighting';

/** 箱人形の背の高さ（あし 0.6 + からだ 0.7 + あたま 0.5） */
const DOLL_HEIGHT = 1.8;

export interface GlbDoll {
  update(dt: number): void;
}

export function charParam(search: string): string | null {
  const v = new URLSearchParams(search).get('char');
  return v && /^[a-z0-9_-]+$/i.test(v) ? v : null;
}

/**
 * ?char=sprite / ?char=sprite256: 2D のドット絵を、カメラのほうを向く板として立たせる（たて軸だけ回す）。
 * カメラから見た向きで 8 方向の絵を切りかえる。右がわの絵は左がわの絵を反転して使う。
 * ななめの絵（<名前>_frontleft / _backleft）がないときは、正面・後ろの絵で代わりにする。
 */
export function attachSpriteDoll(doll: BlockDoll, lighting: Lighting, camera: THREE.Camera, name: string): GlbDoll {
  const blockParts = [...doll.group.children];
  const loader = new THREE.TextureLoader();
  const ready = new Set<THREE.Texture>();
  const tex = (v: string): THREE.Texture => {
    const t = loader.load(`./models/${name}_${v}.png`, () => ready.add(t), undefined, () => undefined);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  };
  const mirror = (t: THREE.Texture): THREE.Texture => {
    const m = t.clone();
    m.repeat.x = -1;
    m.offset.x = 1;
    return m;
  };
  const front = tex('front');
  const back = tex('back');
  const left = tex('left');
  const frontLeft = tex('frontleft');
  const backLeft = tex('backleft');
  // 0 = 正面 から 時計まわり（カメラが人形の右へまわる向き）に 45 度ずつ
  const dirs: { tex: THREE.Texture; flip: boolean; fallback: number | null }[] = [
    { tex: front, flip: false, fallback: null },
    { tex: frontLeft, flip: true, fallback: 0 },
    { tex: left, flip: true, fallback: null },
    { tex: backLeft, flip: true, fallback: 4 },
    { tex: back, flip: false, fallback: null },
    { tex: backLeft, flip: false, fallback: 4 },
    { tex: left, flip: false, fallback: null },
    { tex: frontLeft, flip: false, fallback: 0 },
  ];
  const flipped = new Map<THREE.Texture, THREE.Texture>();
  const mat = new THREE.MeshBasicMaterial({ map: front, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, DOLL_HEIGHT), mat);
  plane.position.y = DOLL_HEIGHT / 2;
  doll.group.add(plane);
  lighting.registerTree(plane, 'doll');
  const local = new THREE.Vector3();
  const q = new URLSearchParams(location.search);
  const turn = (q.get('charFront') === '1' ? Math.PI : 0) + (Number(q.get('charTurn')) || 0) * (Math.PI / 180);
  let shown = false;
  let dirNow = -1;
  const hiddenByUs = new Map<THREE.Object3D, boolean>();

  return {
    update() {
      const show = doll.getMode() === 'third';
      if (show !== shown) {
        shown = show;
        plane.visible = show;
        for (const c of blockParts) {
          if (show) {
            hiddenByUs.set(c, c.visible);
            c.visible = false;
          } else if (hiddenByUs.has(c)) {
            c.visible = hiddenByUs.get(c)!;
          }
        }
        if (!show) hiddenByUs.clear();
      }
      if (!show) return;
      // カメラを人形の座標で見る（人形の前 = -Z、右 = +X）
      doll.group.updateMatrixWorld(true);
      doll.group.worldToLocal(local.copy(camera.position));
      plane.rotation.y = Math.atan2(local.x, local.z);
      // 人形の前から見て、カメラが右へ何度まわったか（0 = 正面）
      let a = Math.atan2(local.x, -local.z) + turn;
      a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      let i = Math.round(a / (Math.PI / 4)) % 8;
      if (!ready.has(dirs[i]!.tex) && dirs[i]!.fallback !== null) i = dirs[i]!.fallback!;
      const d = dirs[i]!;
      // 絵ごとに はばが ちがうので、板の はばを 絵に合わせる（読みこみが あとになっても 合うように 毎回）
      const img = d.tex.image as { width?: number; height?: number } | undefined;
      if (img?.width && img.height) plane.scale.x = (DOLL_HEIGHT * img.width) / img.height;
      if (i === dirNow) return;
      dirNow = i;
      let t = d.tex;
      if (d.flip) {
        if (!flipped.has(t)) flipped.set(t, mirror(t));
        t = flipped.get(t)!;
      }
      mat.map = t;
      mat.needsUpdate = true;
    },
  };
}

/** 撮影した 1 コマが写す はんい（Blender のカメラ。モデルの高さ MODEL_H に対する たて 2.0、まん中 0.95） */
const ATLAS = { cols: 9, modelH: 1.7, span: 2.0, center: 0.95, walkFps: 9.6 };
/** カメラが キャラより これ以上（度）上・下に あるとき、見下ろし・見上げの絵にする（オーナー決定 2026-10-16） */
const TIER_DEG = 60;

/**
 * ?char=kittywalk: 3D モデルを Blender で 8 方向から撮影して ドット絵にした コマ表（public/models/kitty_walk_atlas.png）を使う。
 * よこ = コマ（0 = 立ち、1〜8 = 歩く）、たて = 向き（0 = 正面 から カメラが右へ 45 度ずつ）。
 * tiers = 3 のときは、たてに 水平（8 行）・見下ろし（8 行）・見上げ（8 行）が ならぶ。
 */
export function attachAtlasDoll(doll: BlockDoll, lighting: Lighting, camera: THREE.Camera, file: string, tiers = 1): GlbDoll {
  const rows = 8 * tiers;
  const blockParts = [...doll.group.children];
  const tex = new THREE.TextureLoader().load(`./models/${file}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.repeat.set(1 / ATLAS.cols, 1 / rows);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const k = DOLL_HEIGHT / ATLAS.modelH;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(ATLAS.span * k, ATLAS.span * k), mat);
  plane.position.y = ATLAS.center * k;
  doll.group.add(plane);
  lighting.registerTree(plane, 'doll');
  const local = new THREE.Vector3();
  const q = new URLSearchParams(location.search);
  const turn = (q.get('charFront') === '1' ? Math.PI : 0) + (Number(q.get('charTurn')) || 0) * (Math.PI / 180);
  const lastPos = new THREE.Vector3();
  let speed = 0;
  let walkT = 0;
  let shown = false;
  const hiddenByUs = new Map<THREE.Object3D, boolean>();

  return {
    update(dt) {
      const show = doll.getMode() === 'third';
      if (show !== shown) {
        shown = show;
        plane.visible = show;
        for (const c of blockParts) {
          if (show) {
            hiddenByUs.set(c, c.visible);
            c.visible = false;
          } else if (hiddenByUs.has(c)) {
            c.visible = hiddenByUs.get(c)!;
          }
        }
        if (!show) hiddenByUs.clear();
      }
      const p = doll.group.position;
      const d = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
      lastPos.copy(p);
      speed += ((dt > 0 ? d / dt : 0) - speed) * Math.min(1, dt * 10);
      if (!show) return;
      doll.group.updateMatrixWorld(true);
      doll.group.worldToLocal(local.copy(camera.position));
      // カメラが どれだけ 上（+）・下（−）から 見ているか（板の まん中から）
      const elev = Math.atan2(local.y - plane.position.y, Math.hypot(local.x, local.z)) * (180 / Math.PI);
      const tier = tiers < 3 ? 0 : elev >= TIER_DEG ? 1 : elev <= -TIER_DEG ? 2 : 0;
      if (tier === 0) {
        plane.rotation.set(0, Math.atan2(local.x, local.z), 0);
      } else {
        // 見下ろし・見上げの絵は ななめから 撮っているので、板も カメラに まっすぐ 向ける
        plane.lookAt(camera.position);
      }
      let a = Math.atan2(local.x, -local.z) + turn;
      a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const dir = Math.round(a / (Math.PI / 4)) % 8;
      let frame = 0;
      if (speed > 0.5) {
        walkT += dt * ATLAS.walkFps * Math.min(2, speed / 4.3);
        frame = 1 + (Math.floor(walkT) % (ATLAS.cols - 1));
      } else {
        walkT = 0;
      }
      tex.offset.set(frame / ATLAS.cols, 1 - (tier * 8 + dir + 1) / rows);
    },
  };
}

export function attachGlbDoll(doll: BlockDoll, lighting: Lighting, name: string): GlbDoll {
  const blockParts = [...doll.group.children];
  const root = new THREE.Group();
  // glTF の前 = +Z、箱人形の前 = -Z。&charFront=1 のときは見た目の確かめ用に こちら（カメラ）を向かせる
  // &charTurn=<度>: さらに たて軸で回す（厚みを ななめから見る用）
  const q = new URLSearchParams(location.search);
  root.rotation.y = (q.get('charFront') === '1' ? 0 : Math.PI) + (Number(q.get('charTurn')) || 0) * (Math.PI / 180);
  root.visible = false;
  doll.group.add(root);

  let mixer: THREE.AnimationMixer | null = null;
  const actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | null = null;
  const lastPos = new THREE.Vector3();
  let speed = 0;
  let loaded = false;
  let shown = false;
  // &charStill=1: 動きを止めて、そのままの形（A ポーズ）で見る
  const still = new URLSearchParams(location.search).get('charStill') === '1';
  const hiddenByUs = new Map<THREE.Object3D, boolean>();

  new GLTFLoader().load(`./models/${name}.glb`, (gltf) => {
    const model = gltf.scene;
    // ゲームは光を使わず MeshBasicMaterial の色で明るさを決めるので、それに合わせる
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (src.map) {
        src.map.colorSpace = THREE.SRGBColorSpace;
        // 小ブロック版は色見本（よこ 1 列の小さい絵）を使うので、色がまざらないようにする
        const w = (src.map.image as { width?: number } | undefined)?.width ?? 0;
        if (w > 0 && w <= 64) {
          src.map.magFilter = THREE.NearestFilter;
          src.map.minFilter = THREE.NearestFilter;
          src.map.generateMipmaps = false;
          src.map.needsUpdate = true;
        }
      }
      mesh.material = new THREE.MeshBasicMaterial({ map: src.map ?? null, color: 0xffffff });
      mesh.frustumCulled = false;
    });
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    model.scale.setScalar(DOLL_HEIGHT / h);
    model.position.y = (-box.min.y * DOLL_HEIGHT) / h;
    root.add(model);
    lighting.registerTree(model, 'doll');

    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions.set(clip.name.toLowerCase(), mixer.clipAction(clip));
    loaded = true;
    console.info(`[char] ${name}.glb を読みこみました。動き: ${gltf.animations.map((c) => c.name).join(', ')}`);
  });

  const find = (key: string): THREE.AnimationAction | null => {
    for (const [n, a] of actions) if (n.includes(key)) return a;
    return null;
  };

  return {
    update(dt) {
      const show = doll.getMode() === 'third' && loaded;
      if (show !== shown) {
        // 切りかわったときだけ さわる（一人称の手元〈fpRoot〉の見え方は BlockDoll にまかせる）
        shown = show;
        root.visible = show;
        for (const c of blockParts) {
          if (show) {
            hiddenByUs.set(c, c.visible);
            c.visible = false;
          } else if (hiddenByUs.has(c)) {
            c.visible = hiddenByUs.get(c)!;
          }
        }
        if (!show) hiddenByUs.clear();
      }
      if (!mixer || still) return;
      const p = doll.group.position;
      const d = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
      lastPos.copy(p);
      speed += ((dt > 0 ? d / dt : 0) - speed) * Math.min(1, dt * 10);
      const next = speed > 5 ? find('run') : speed > 0.5 ? find('walk') : find('idle');
      if (next && next !== current) {
        next.reset().play();
        if (current) next.crossFadeFrom(current, 0.2, false);
        current = next;
      }
      mixer.update(dt);
    },
  };
}
