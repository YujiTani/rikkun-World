import { PerspectiveCamera, WebGLRenderer } from 'three';
import { CHUNK_SIZE } from '../../world/VoxelWorld';
import { ALL_LOOKS, DEFAULT_LOOK_ID, currentLook, findLook, setCurrentLook } from './looks';
import { CharSprite } from './charSprite';
import { MICRO_RADII, PROTO_MODES, ProtoScene, TERRAIN_MODES, type ProtoMode, type TerrainMode } from './ProtoScene';

/** 9×9×9 の試しの場面（VOX-0）。ゲーム本体とは別ページ。計測の入口は window.__voxelProto */

export interface Measurement {
  mode: ProtoMode;
  /** 見た目（Look）の id */
  look: string;
  /** 地面の作り方（block = 今まで / micro = 小ブロック単位） */
  terrain: TerrainMode;
  /** hybrid のとき、小ブロックの形で描く距離 */
  microRadius: number | null;
  triangles: { start: number; sky: number };
  drawCalls: { start: number; sky: number };
  geometryBytes: { start: number; sky: number };
  chunks: { start: { micro: number; box: number; far: number }; sky: { micro: number; box: number; far: number } };
  buildAllMs: number;
  buildSkyExtraMs: number;
  rebuildChunkMs: { median: number; max: number; samples: number };
  renderCpuMs: { start: number; sky: number };
  renderWithFinishMs: { start: number; sky: number };
}

type PoseName = 'start' | 'sky' | 'close';

function readMode(): ProtoMode {
  const m = new URLSearchParams(location.search).get('mode');
  return (PROTO_MODES as readonly string[]).includes(m ?? '') ? (m as ProtoMode) : 'hybrid';
}

const container = document.getElementById('game')!;
const bar = document.getElementById('bar')!;
const statsEl = document.getElementById('stats')!;

const renderer = new WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const camera = new PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 400);
camera.rotation.order = 'YXZ';

function readLook(): string {
  return findLook(new URLSearchParams(location.search).get('look'))?.id ?? DEFAULT_LOOK_ID;
}
setCurrentLook(readLook()); // 3D テクスチャを作る前に 決めておく
const proto = new ProtoScene(readMode());
const terrainParam = new URLSearchParams(location.search).get('terrain');
if (terrainParam === 'micro' || terrainParam === 'block') proto.terrain = terrainParam;
else proto.terrain = 'micro'; // VOX-2: オーナーに見てもらう間は 小ブロック地形 を最初に出す
const rParam = Number(new URLSearchParams(location.search).get('r'));
if ((MICRO_RADII as readonly number[]).includes(rParam)) proto.microRadius = rParam;
const spawn = proto.island.spawn();

// ---- カメラ
/** 1 回の applyCamera で作るチャンクの数（遊ぶとき 2。計測・ポーズ切りかえは無制限） */
let updateBudget = Number.POSITIVE_INFINITY;
let yaw = 0;
let pitch = 0;
const pos = { x: 0, y: 0, z: 0 };
let orbit = new URLSearchParams(location.search).get('auto') === '1';
let orbitAngle = 0;
const CENTER = { x: proto.world.size.x / 2, y: 14, z: proto.world.size.z / 2 };

function lookAt(tx: number, ty: number, tz: number): void {
  const dx = tx - pos.x;
  const dy = ty - pos.y;
  const dz = tz - pos.z;
  yaw = Math.atan2(-dx, -dz);
  pitch = Math.atan2(dy, Math.hypot(dx, dz));
}

function setPose(name: PoseName): void {
  orbit = false;
  syncOrbitButton();
  if (name === 'start') {
    pos.x = spawn.x;
    pos.y = spawn.y + 4; // VOX-1: 9 -> 4（キャラが 5 ブロック先の地面に見えるように）
    pos.z = spawn.z;
    const far = Math.hypot(CENTER.x - spawn.x, CENTER.z - spawn.z) > 6;
    if (far) lookAt(CENTER.x, CENTER.y, CENTER.z);
    else {
      yaw = 0;
      pitch = (-20 * Math.PI) / 180;
    }
    pitch = Math.min(pitch, (-12 * Math.PI) / 180);
  } else if (name === 'sky') {
    pos.x = CENTER.x;
    pos.y = 125;
    pos.z = CENTER.z;
    yaw = 0;
    pitch = (-89 * Math.PI) / 180;
  } else {
    pos.x = spawn.x;
    pos.y = spawn.y + 2.6;
    pos.z = spawn.z + 3.2;
    yaw = 0;
    pitch = (-32 * Math.PI) / 180;
  }
  applyCamera();
}

function applyCamera(): void {
  character?.face(pos.x, pos.z);
  camera.position.set(pos.x, pos.y, pos.z);
  camera.rotation.set(pitch, yaw, 0);
  proto.update(Math.round(pos.x), Math.round(pos.z), updateBudget);
}

// ---- キャラ（?char=0 で消す）。スタート地点のカメラの 5 ブロック先の地面に、カメラのほうを向いて立つ
let character: CharSprite | null = null;
function placeCharacter(): void {
  if (new URLSearchParams(location.search).get('char') === '0') return;
  setPose('start');
  const cx = pos.x - Math.sin(yaw) * 5;
  const cz = pos.z - Math.cos(yaw) * 5;
  let gy = 0;
  for (let y = proto.world.size.y - 1; y >= 0; y--) {
    if (proto.world.isSolid(Math.floor(cx), y, Math.floor(cz))) {
      gy = y + 1;
      break;
    }
  }
  character = new CharSprite(proto.scene, cx, gy, cz, { x: Math.sin(yaw), z: Math.cos(yaw) });
}

// ---- 操作（試作なので Action 経由でない）
const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons === 0) return;
  yaw -= e.movementX * 0.004;
  pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.004));
});
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

function move(dt: number): void {
  if (orbit) {
    orbitAngle += dt * 0.25;
    pos.x = CENTER.x + Math.cos(orbitAngle) * 62;
    pos.z = CENTER.z + Math.sin(orbitAngle) * 62;
    pos.y = 48;
    lookAt(CENTER.x, CENTER.y, CENTER.z);
    return;
  }
  const speed = 24 * dt;
  let f = 0;
  let s = 0;
  let u = 0;
  if (keys.has('KeyW')) f += 1;
  if (keys.has('KeyS')) f -= 1;
  if (keys.has('KeyD')) s += 1;
  if (keys.has('KeyA')) s -= 1;
  if (keys.has('Space')) u += 1;
  if (keys.has('ShiftLeft') || keys.has('ShiftRight')) u -= 1;
  pos.x += (-Math.sin(yaw) * f + Math.cos(yaw) * s) * speed;
  pos.z += (-Math.cos(yaw) * f - Math.sin(yaw) * s) * speed;
  pos.y += u * speed;
}

// ---- 画面の上のボタンと数字（大人が見る画面なので漢字）
const modeButtons = new Map<ProtoMode, HTMLButtonElement>();
function addButton(label: string, on: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', on);
  bar.appendChild(b);
  return b;
}
function setMode(mode: ProtoMode): void {
  proto.setMode(mode);
  const url = new URL(location.href);
  url.searchParams.set('mode', mode);
  history.replaceState(null, '', url);
  for (const [m, b] of modeButtons) b.classList.toggle('on', m === mode);
  proto.update(Math.round(pos.x), Math.round(pos.z));
}
for (const m of PROTO_MODES) modeButtons.set(m, addButton(m, () => setMode(m)));
const radiusButtons = MICRO_RADII.map((r) =>
  addButton(`r=${r}`, () => {
    proto.setMicroRadius(r);
    syncRadius();
    applyCamera();
  }),
);
function syncRadius(): void {
  MICRO_RADII.forEach((r, i) => radiusButtons[i].classList.toggle('on', r === proto.microRadius));
}
syncRadius();
const terrainButtons = new Map<TerrainMode, HTMLButtonElement>();
function setTerrain(t: TerrainMode): void {
  proto.setTerrain(t);
  const url = new URL(location.href);
  url.searchParams.set('terrain', t);
  history.replaceState(null, '', url);
  for (const [k, b] of terrainButtons) b.classList.toggle('on', k === t);
  proto.update(Math.round(pos.x), Math.round(pos.z), updateBudget);
}
for (const t of TERRAIN_MODES) terrainButtons.set(t, addButton(`ちけい: ${t === 'micro' ? 'こまかい' : 'ブロック'}`, () => setTerrain(t)));
for (const [k, b] of terrainButtons) b.classList.toggle('on', k === proto.terrain);
const lookButtons = new Map<string, HTMLButtonElement>();
function setLook(id: string): void {
  const look = findLook(id);
  if (!look) throw new Error(`知らない look: ${id}`);
  proto.setLook(id);
  const url = new URL(location.href);
  url.searchParams.set('look', id);
  history.replaceState(null, '', url);
  for (const [k, b] of lookButtons) b.classList.toggle('on', k === id);
  proto.update(Math.round(pos.x), Math.round(pos.z), updateBudget);
}
for (const l of ALL_LOOKS) lookButtons.set(l.id, addButton(`みため: ${l.label}`, () => setLook(l.id)));
for (const [k, b] of lookButtons) b.classList.toggle('on', k === currentLook().id);
const orbitBtn = addButton('ぐるっとまわる', () => {
  orbit = !orbit;
  syncOrbitButton();
});
function syncOrbitButton(): void {
  orbitBtn.classList.toggle('on', orbit);
}
addButton('スタート', () => setPose('start'));
addButton('上空', () => setPose('sky'));
addButton('このチャンクを作り直す', () => {
  proto.rebuildChunk(Math.floor(pos.x / CHUNK_SIZE), Math.floor(pos.z / CHUNK_SIZE));
});

// ---- ループと数字
const frames: number[] = [];
let running = true;
let last = performance.now();
let hudAt = 0;

function frame(now: number): void {
  if (!running) return;
  const dt = Math.min((now - last) / 1000, 0.1);
  frames.push(now - last);
  if (frames.length > 120) frames.shift();
  last = now;
  move(dt);
  updateBudget = 2;
  applyCamera();
  updateBudget = Number.POSITIVE_INFINITY;
  renderer.render(proto.scene, camera);
  if (now - hudAt > 250) {
    hudAt = now;
    refreshHud();
  }
  requestAnimationFrame(frame);
}

function refreshHud(): void {
  const n = frames.length;
  const avg = n ? frames.reduce((a, b) => a + b, 0) / n : 0;
  const worst = n ? Math.max(...frames) : 0;
  const info = renderer.info;
  statsEl.textContent = [
    `みため: ${currentLook().id}`,
    `ちけい: ${proto.terrain}`,
    `ほうしき: ${proto.mode}${proto.mode === 'hybrid' ? `（r=${proto.microRadius}）` : ''}`,
    `fps: ${avg > 0 ? (1000 / avg).toFixed(1) : '-'} （さいあく ${worst.toFixed(1)} ms）`,
    `三角形: ${info.render.triangles.toLocaleString()}`,
    `描画回数: ${info.render.calls}`,
    `頂点データ: ${(proto.visibleBytes() / 1048576).toFixed(1)} MB`,
    `メッシュ全体を作った時間: ${proto.lastBuild.ms.toFixed(0)} ms（${proto.lastBuild.chunks} チャンク）`,
    `1 チャンクの作り直し: ${proto.lastRebuildMs.toFixed(1)} ms`,
  ].join('\n');
}

// ---- 計測の入口
const median = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

function timeRender(samples: number, finish: boolean): number {
  const gl = renderer.getContext();
  const t: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    renderer.render(proto.scene, camera);
    if (finish) gl.finish();
    t.push(performance.now() - t0);
    if (!finish) gl.finish(); // 次の計測にたまらないように
  }
  return median(t);
}

function measureAt(): { tri: number; calls: number; bytes: number; chunks: { micro: number; box: number; far: number }; cpu: number; fin: number } {
  renderer.render(proto.scene, camera); // 慣らし（シェーダーのコンパイル）
  renderer.getContext().finish();
  renderer.render(proto.scene, camera);
  const tri = renderer.info.render.triangles;
  const calls = renderer.info.render.calls;
  renderer.getContext().finish();
  return {
    tri,
    calls,
    bytes: proto.visibleBytes(),
    chunks: proto.chunkCounts(),
    cpu: timeRender(15, false),
    fin: timeRender(3, true),
  };
}

function measure(): Measurement {
  const wasRunning = running;
  running = false;
  proto.clearAll();
  // スタート地点
  setPose('start');
  proto.clearAll();
  const t0 = performance.now();
  applyCamera();
  const buildAllMs = performance.now() - t0;
  const a = measureAt();
  // 作り直し（スタート地点のチャンクを 20 回）
  const cx = Math.floor(spawn.x / CHUNK_SIZE);
  const cz = Math.floor(spawn.z / CHUNK_SIZE);
  const rb: number[] = [];
  for (let i = 0; i < 20; i++) rb.push(proto.rebuildChunk(cx, cz));
  // 上空
  const t1 = performance.now();
  setPose('sky');
  const buildSkyExtraMs = performance.now() - t1;
  const b = measureAt();
  setPose('start');
  if (wasRunning) {
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  return {
    mode: proto.mode,
    look: currentLook().id,
    terrain: proto.terrain,
    microRadius: proto.mode === 'hybrid' ? proto.microRadius : null,
    triangles: { start: a.tri, sky: b.tri },
    drawCalls: { start: a.calls, sky: b.calls },
    geometryBytes: { start: a.bytes, sky: b.bytes },
    chunks: { start: a.chunks, sky: b.chunks },
    buildAllMs,
    buildSkyExtraMs,
    rebuildChunkMs: { median: median(rb), max: Math.max(...rb), samples: rb.length },
    renderCpuMs: { start: a.cpu, sky: b.cpu },
    renderWithFinishMs: { start: a.fin, sky: b.fin },
  };
}

const hook = {
  ready: true,
  modes: PROTO_MODES,
  getMode: (): ProtoMode => proto.mode,
  setMode,
  terrains: TERRAIN_MODES,
  getTerrain: (): TerrainMode => proto.terrain,
  setTerrain: (t: TerrainMode): void => {
    setTerrain(t);
    applyCamera();
  },
  looks: ALL_LOOKS.map((l) => l.id),
  getLook: (): string => currentLook().id,
  /** 見た目をかえる（3D テクスチャとメッシュを作り直す） */
  setLook: (id: string): void => {
    setLook(id);
    applyCamera();
  },
  /** キャラ: 見ている行（0〜7）と 足もとの位置。?char=0 のときは null */
  getChar: (): { ready: boolean; row: number; x: number; y: number; z: number } | null =>
    character ? { ready: character.ready, row: character.currentRow, ...character.position } : null,
  /** カメラを (x,y,z) に置いて (yawDeg, pitchDeg) を向く（スクショ用）。yaw 0 = -z を向く */
  setCamera: (x: number, y: number, z: number, yawDeg: number, pitchDeg: number): void => {
    orbit = false;
    syncOrbitButton();
    pos.x = x;
    pos.y = y;
    pos.z = z;
    yaw = (yawDeg * Math.PI) / 180;
    pitch = (pitchDeg * Math.PI) / 180;
    applyCamera();
  },
  /** カメラを キャラのまわり（水平 dist ブロック）の 角度 deg（0 = キャラの正面）に置いて キャラを見る */
  orbitChar: (deg: number, dist = 5, height = 2): void => {
    if (!character) return;
    const c = character.position;
    const f = { x: Math.sin(startYaw), z: Math.cos(startYaw) };
    const a = (deg * Math.PI) / 180;
    // 正面から a だけ回した向き（charRow の角度と同じ向き）
    const dx = f.x * Math.cos(a) - f.z * Math.sin(a);
    const dz = f.z * Math.cos(a) + f.x * Math.sin(a);
    orbit = false;
    syncOrbitButton();
    pos.x = c.x + dx * dist;
    pos.z = c.z + dz * dist;
    pos.y = c.y + height;
    lookAt(c.x, c.y + 0.9, c.z);
    applyCamera();
  },
  setMicroRadius: (r: number): void => {
    proto.setMicroRadius(r);
    syncRadius();
    applyCamera();
  },
  measure,
  rebuildChunk: (cx: number, cz: number): number => proto.rebuildChunk(cx, cz),
  setPose,
  /** 1 コマ描いて数字を更新する（止めた状態でスクショを撮るとき） */
  renderOnce: (): void => {
    renderer.render(proto.scene, camera);
    refreshHud();
  },
  setRunning: (v: boolean): void => {
    const was = running;
    running = v;
    if (v && !was) {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  },
  spawn: { x: spawn.x, y: spawn.y, z: spawn.z },
};
declare global {
  interface Window {
    __voxelProto?: typeof hook;
  }
}
window.__voxelProto = hook;

setMode(readMode());
placeCharacter();
const startYaw = yaw;
setPose('start');
requestAnimationFrame(frame);
