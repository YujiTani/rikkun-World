import * as THREE from 'three';
import { FIXED_DT, PreviewController, SKY_COLOR, STAIR_X } from './controller';
import { Chochin } from '../yokai';
import type { PreviewMotion } from './controller';
import type { PreviewHook } from './hook';

const FOV = 38;
const TARGET = new THREE.Vector3(-2, 1.2, 0);
/** 0 = ふだん、1 = 攻撃のとき（前 8 ブロックまで入るように引く） */
let pull = 0;

const container = document.getElementById('game')!;
const labelsEl = document.getElementById('labels')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY_COLOR);
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

const ctl = new PreviewController();
scene.add(ctl.stage);

// ラベル（名前と番号）
interface LabelEls {
  name: HTMLDivElement;
  num: HTMLDivElement | null;
}
const labelEls: LabelEls[] = ctl.anchors.map((a) => {
  const name = document.createElement('div');
  name.className = 'label';
  name.textContent = a.name;
  labelsEl.appendChild(name);
  let num: HTMLDivElement | null = null;
  if (a.kind === 'yokai') {
    num = document.createElement('div');
    num.className = 'label num';
    num.textContent = String(a.index);
    num.hidden = true;
    labelsEl.appendChild(num);
  }
  return { name, num };
});

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // 左はし（人形）から右はし（ろくろくび）まで入る距離。画面の下はボタンがかかるので少し引く
  const halfW = 9.2;
  const dist = Math.max(halfW / (Math.tan((FOV * Math.PI) / 360) * camera.aspect), 12);
  const d = dist * (1 + 0.55 * pull);
  camera.position.set(TARGET.x, TARGET.y + dist * 0.2 + 3.5 * pull, TARGET.z + d);
  camera.lookAt(TARGET.x, TARGET.y - 0.9 + 0.5 * pull, TARGET.z + 2 * pull);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const v = new THREE.Vector3();
function placeLabels(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctl.anchors.forEach((a, i) => {
    v.copy(a.position);
    // 台の回転とは関係なく、足もとの手前に出す
    v.project(camera);
    const x = ((v.x + 1) / 2) * w;
    const y = ((1 - v.y) / 2) * h;
    const els = labelEls[i]!;
    els.name.style.left = `${x}px`;
    els.name.style.top = `${y}px`;
    if (els.num) {
      els.num.style.left = `${x}px`;
      els.num.style.top = `${y}px`;
    }
  });
}

const buttons = new Map<string, HTMLButtonElement>();
document.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((b) => buttons.set(b.dataset.action!, b));

function refreshUi(): void {
  ctl.anchors.forEach((a, i) => {
    const els = labelEls[i]!;
    els.name.hidden = ctl.silhouette;
    if (els.num) els.num.hidden = !ctl.silhouette;
    void a;
  });
  const set = (k: string, on: boolean): void => buttons.get(k)?.setAttribute('aria-pressed', String(on));
  set('color', !ctl.silhouette);
  set('shadow', ctl.silhouette);
  set('spin', ctl.rotating);
  set('stop', !ctl.rotating && ctl.view === 'free');
  set('front', ctl.view === 'front');
  set('side', ctl.view === 'side');
}

function press(action: string): void {
  switch (action) {
    case 'color':
      ctl.setSilhouette(false);
      break;
    case 'shadow':
      ctl.setSilhouette(true);
      break;
    case 'wait':
    case 'move':
    case 'attack':
    case 'hit':
    case 'die':
      ctl.setMotion(action as PreviewMotion);
      break;
    case 'spin':
      ctl.setRotating(true);
      break;
    case 'stop':
      ctl.setRotating(false);
      break;
    case 'front':
    case 'side':
      ctl.setView(action);
      break;
  }
  refreshUi();
}
for (const [k, b] of buttons) b.addEventListener('click', () => press(k));
refreshUi();

// 固定ステップ
let paused = false;
let acc = 0;
let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!paused) {
    acc += dt;
    while (acc >= FIXED_DT) {
      ctl.update(FIXED_DT);
      acc -= FIXED_DT;
    }
  }
  const want = ctl.attackView ? 1 : 0;
  if (Math.abs(want - pull) > 1e-3) {
    pull += (want - pull) * Math.min(1, dt * 4);
    resize();
  }
  placeLabels();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

const hook: PreviewHook = {
  ready: true,
  yokai: () =>
    ctl.yokai.map((y, i) => ({
      id: y.id,
      name: y.displayName,
      number: i + 1,
      width: y.size.width,
      height: y.size.height,
      depth: y.size.depth,
      minY: y.size.minY,
      colors: y.displayColors(),
      mainColor: y.mainColor,
      motion: y.motion,
      silhouette: y.silhouette,
      scale: y.scale,
      blinking: y.blinking,
      x: ctl.anchors[i + 1]!.position.x,
      face: y.faceState,
      attackPhase: y.attackPhase(),
      hitCount: y.hitCount,
      lastHitBox: y.lastHitBox,
      hitVisible: ctl.hitVisible(i),
      info: y.info(),
      fireballs:
        y instanceof Chochin
          ? y.fireballs.filter((f) => f.alive).map((f) => ({ x: f.position.x, y: f.position.y, z: f.position.z, traveled: f.traveled }))
          : [],
    })),
  karakasaX: () => ctl.karakasaX(),
  stairX: () => STAIR_X,
  attackView: () => ctl.attackView,
  doll: () => {
    const b = new THREE.Box3().setFromObject(ctl.doll.group);
    return {
      width: b.max.x - b.min.x,
      height: b.max.y,
      silhouette: ctl.dollIsSilhouette,
      visible: ctl.doll.group.visible,
    };
  },
  silhouette: () => ctl.silhouette,
  rotating: () => ctl.rotating,
  view: () => ctl.view,
  yawDeg: () => ((ctl.yaw * 180) / Math.PI + 360) % 360,
  labels: () => ({
    names: labelEls.some((l) => !l.name.hidden),
    numbers: labelEls.some((l) => l.num !== null && !l.num.hidden),
  }),
  texts: () => {
    const out: string[] = [document.title];
    document.querySelectorAll('button, .label').forEach((e) => {
      if (!(e as HTMLElement).hidden) out.push(e.textContent ?? '');
    });
    return out;
  },
  pause: () => {
    paused = true;
  },
  resume: () => {
    paused = false;
  },
  step: (n = 1) => {
    for (let i = 0; i < n; i++) ctl.update(FIXED_DT);
  },
  steps: () => ctl.steps,
  press,
};
window.__preview = hook;
