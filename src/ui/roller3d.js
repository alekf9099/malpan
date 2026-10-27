// 3D 굴림 도구 (three.js). 윷가락 4개 · 주사위 2개 · 기물 주사위를 입체로 그린다.
//
//   load()                            three.js 를 불러온다. 실패하면(오프라인 첫 실행 등) false — 화면은 2D 굴림으로 돌아간다
//   toss(overlay, board, roll, who)   판 위 캔버스에 던져서 튀고 굴러 결과 면으로 멈춘다
//   still(container, board, roll)     굴림 칸에 놓인 모습(결과 또는 대기)을 그림 한 장으로 그린다
//
// 그림체는 판·캐릭터와 맞춘다: 2D 윷가락·주사위와 같은 팔레트, 캐릭터 렌더(tools/render-chars.html)와 같은 조명,
// 윤곽에 먹선, 그림자는 판 위 말처럼 납작한 타원. 사실적인 나뭇결·흐린 그림자는 쓰지 않는다.
//
// 결과는 규칙(core)이 이미 정해 두었다. 정해진 면이 위로 오는 끝 자세를 먼저 정하고,
// 거기로 날아가 떨어지는 궤적(포물선 + 잦아드는 튕김 + 회전)을 맞춘다. 물리 엔진은 쓰지 않는다.

import { PIECE_SVG } from './roller.js';
import { FACES } from '../core/boards/chess.js';

let THREE = null, RoundedBox = null;
let renderer = null;
const tex = {};

const INK = '#22201D';
const SHADOW = 'rgba(34, 32, 29, .28)';
// 2D 그림(art.js 윷가락, roller.js 주사위)과 같은 색
const WOOD = { flat: '#F1D9A8', flatLine: '#D9B57A', back: '#A8652F', backLine: '#C98A4F', mark: '#C8342A' };
const DIE = { face: '#FFFDF7', pip: INK, one: '#E0533D', chess: '#F5D35E', queen: '#F08A2E' };
const OUTLINE = 2.6; // 먹선 두께(CSS px)

export async function load() {
  if (THREE) return true;
  try {
    THREE = await import('three');
    ({ RoundedBoxGeometry: RoundedBox } = await import('three/addons/geometries/RoundedBoxGeometry.js'));
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    await makeTextures();
    return true;
  } catch (err) {
    console.warn('3D 굴림을 못 불러와 2D 로 그린다', err);
    THREE = null;
    return false;
  }
}
export const ready = () => !!THREE;

// ── 무늬(캔버스 텍스처) ─────────────────────────────────────

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 윷가락 면: 2D 윷가락처럼 단색 바탕에 결 두 줄(밝은 면) 또는 밝은 띠 한 줄(둥근 등) */
function stickFace(g, w, h, flat, marked) {
  g.fillStyle = flat ? WOOD.flat : WOOD.back;
  g.fillRect(0, 0, w, h);
  g.lineCap = 'round';
  if (flat) {
    g.strokeStyle = WOOD.flatLine; g.lineWidth = h * 0.07;
    for (const [y, a] of [[0.32, 0.05], [0.64, -0.04]]) {
      g.beginPath(); g.moveTo(w * 0.12, h * y); g.quadraticCurveTo(w * 0.5, h * (y + a * 4), w * 0.88, h * y); g.stroke();
    }
  } else {
    g.strokeStyle = WOOD.backLine; g.globalAlpha = 0.85; g.lineWidth = h * 0.16;
    g.beginPath(); g.moveTo(w * 0.06, h * 0.5); g.lineTo(w * 0.94, h * 0.5); g.stroke();
    g.globalAlpha = 1;
  }
  if (marked) {
    // 빽도 표시: 붉은 X (2D 윷가락과 같은 자리 — 한쪽 끝)
    g.strokeStyle = WOOD.mark; g.lineWidth = h * 0.13;
    const cx = w * 0.86, cy = h / 2, r = h * 0.24;
    g.beginPath(); g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r); g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r); g.stroke();
  }
}

const PIPS = {
  1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]]
};

function svgImage(svg) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = no;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

async function makeTextures() {
  tex.flat = canvasTex(512, 64, (g, w, h) => stickFace(g, w, h, true, false));
  tex.flatMarked = canvasTex(512, 64, (g, w, h) => stickFace(g, w, h, true, true));
  tex.back = canvasTex(512, 64, (g, w, h) => stickFace(g, w, h, false, false));
  for (let n = 1; n <= 6; n++) {
    tex['pip' + n] = canvasTex(256, 256, (g, w) => {
      g.fillStyle = DIE.face; g.fillRect(0, 0, w, w);
      for (const [x, y] of PIPS[n]) {
        g.fillStyle = n === 1 ? DIE.one : DIE.pip;
        g.beginPath(); g.arc(x * w / 100, y * w / 100, (n === 1 ? 14 : 10) * w / 100, 0, Math.PI * 2); g.fill();
      }
    });
  }
  for (const f of FACES) {
    const img = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256"><g fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round">${PIECE_SVG[f]}</g></svg>`);
    tex['chess-' + f] = canvasTex(256, 256, (g, w) => {
      g.fillStyle = f === 'queen' ? DIE.queen : DIE.chess; g.fillRect(0, 0, w, w);
      g.drawImage(img, w * 0.13, w * 0.1, w * 0.74, w * 0.74);
    });
  }
}

// ── 물체 ───────────────────────────────────────────────────

const STICK_L = 2.6, STICK_R = 0.26;
const mat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.75, metalness: 0 });

/** 윷가락: 반원기둥. 평평한 면이 +Y 를 보면 "젖혀진" 것(밝은 면) */
function makeStick(i) {
  const g = new THREE.Group();
  // 길이 방향 X, 둥근 등이 −Y, 평평한 면이 y=0
  const geo = new THREE.CylinderGeometry(STICK_R, STICK_R, STICK_L, 32, 1, false, Math.PI / 2, Math.PI);
  geo.rotateZ(Math.PI / 2);
  geo.rotateX(-Math.PI / 2);
  const round = new THREE.Mesh(geo, mat(tex.back));
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(STICK_L, STICK_R * 2), mat(i === 0 ? tex.flatMarked : tex.flat));
  flat.rotation.x = -Math.PI / 2;
  const capMat = new THREE.MeshStandardMaterial({ color: WOOD.backLine, roughness: 0.8 });
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(STICK_R, 24, Math.PI, Math.PI), capMat);
    cap.position.x = sx * STICK_L / 2;
    cap.rotation.y = sx * Math.PI / 2;
    g.add(cap);
  }
  g.add(round, flat);
  // 젖혀지면(평평한 면 위) 둥근 등이 바닥에 닿아 원점이 반지름만큼 뜨고, 엎어지면 평평한 면이 바닥
  g.userData = { rest: { up: STICK_R, down: 0.01 }, shadow: [0.36, 1.25] };
  return g;
}

function makeDie(faceTex, s = 1) {
  // BoxGeometry 재질 순서: +X −X +Y −Y +Z −Z
  const m = new THREE.Mesh(new RoundedBox(1, 1, 1, 6, 0.2), faceTex.map(mat));
  m.scale.setScalar(s);
  m.userData = { rest: { up: 0.5 * s, down: 0.5 * s }, shadow: [0.62 * s, 0.3 * s] };
  return m;
}

// 주사위 면 배치(마주보는 면 합 7): +X=2 −X=5 +Y=1 −Y=6 +Z=3 −Z=4
const DIE_ORDER = [2, 5, 1, 6, 3, 4];
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
// 그 면의 그림 "위쪽"이 물체 좌표에서 어느 방향인지(BoxGeometry 의 UV 기준, tools/roller-test.html 로 확인)
const TEX_UP = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];

/** 면 slot 이 위(+Y)를 보고, 그 면 그림이 카메라 쪽에서 똑바로 읽히도록 하는 자세 */
function faceUp(slot, yaw = 0) {
  const n = new THREE.Vector3(...NORMALS[slot]);
  const q = new THREE.Quaternion().setFromUnitVectors(n, new THREE.Vector3(0, 1, 0));
  const up = new THREE.Vector3(...TEX_UP[slot]).applyQuaternion(q);
  const turn = Math.atan2(up.x, up.z) - Math.atan2(0, -1); // 그림 위쪽을 −Z(화면 위)로
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -turn + yaw);
  return qy.multiply(q);
}

// ── 장면 ───────────────────────────────────────────────────

/** 조명은 캐릭터 렌더와 같게: 따뜻한 하늘빛 + 왼쪽 위 해 */
function scene(aspect, dist, lookY = 0) {
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a68, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-2, 5, 3);
  sc.add(sun);
  const cam = new THREE.PerspectiveCamera(28, aspect, 0.1, 100);
  cam.position.set(0, dist * 0.86 + lookY, dist * 0.5);
  cam.lookAt(0, lookY, 0);
  return { sc, cam };
}

/** 판 종류와 결과로 물체들과 각각의 끝 자세를 만든다. roll 이 없으면 대기 모습. */
function build(board, roll, rnd = Math.random) {
  const items = [];
  if (board.roller === 'sticks') {
    const flats = roll?.faces?.length === 4 ? roll.faces : [true, false, true, true];
    flats.forEach((flat, i) => {
      const o = makeStick(i);
      // 2D 윷가락처럼 길이 방향을 앞뒤(Z)로 눕혀 나란히 놓는다
      const yaw = Math.PI / 2 + (rnd() - 0.5) * 0.35;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, flat ? 0 : Math.PI, 'YXZ'));
      const pos = new THREE.Vector3((i - 1.5) * 0.74 + (rnd() - 0.5) * 0.08, flat ? o.userData.rest.up : o.userData.rest.down, (rnd() - 0.5) * 0.5);
      items.push({ o, q, pos });
    });
  } else if (board.roller === 'dice') {
    const faces = roll?.faces?.length === 2 ? roll.faces : [5, 3];
    faces.forEach((v, i) => {
      const o = makeDie(DIE_ORDER.map((n) => tex['pip' + n]));
      const q = faceUp(DIE_ORDER.indexOf(v), (rnd() - 0.5) * 0.9);
      items.push({ o, q, pos: new THREE.Vector3(i ? 0.85 : -0.85, 0.5, (rnd() - 0.5) * 0.4) });
    });
  } else {
    const face = roll?.value || 'knight';
    const o = makeDie(FACES.map((f) => tex['chess-' + f]), 1.35);
    const q = faceUp(FACES.indexOf(face), (rnd() - 0.5) * 0.4);
    items.push({ o, q, pos: new THREE.Vector3(0, 0.5 * 1.35, 0) });
  }
  return items;
}

/** 물체 높이의 가운데 — 카메라가 바닥이 아니라 물체를 보도록 */
const midY = (board) => (board.roller === 'chess' ? 0.67 : board.roller === 'dice' ? 0.5 : 0.15);

/** 물체들이 화면 폭의 cover 만큼 차지하도록 카메라 거리를 정한다 */
function distFor(board, aspect, cover) {
  const [sx, sy] = board.roller === 'chess' ? [1.7, 1.7] : board.roller === 'dice' ? [2.9, 1.4] : [2.9, 2.8];
  // 시야각 28° 일 때 거리 d 에서 보이는 세로 폭 ≈ 0.5 · d, 가로 폭 ≈ 0.5 · d · aspect. 둘 다 넘치지 않게
  return Math.max(sx / (cover * 0.5 * aspect), sy / (Math.min(0.85, cover * 1.6) * 0.5));
}

const dpr = () => Math.min(2, window.devicePixelRatio || 1);
function size(w, h) {
  renderer.setPixelRatio(dpr());
  renderer.setSize(w, h, false);
}

// ── 먹선·그림자 합성 ─────────────────────────────────────────

const inkBuf = document.createElement('canvas');

/**
 * WebGL 그림(src)을 2D 캔버스(dst)에 옮기며 그림체를 입힌다:
 * 바닥에 납작한 타원 그림자 → 윤곽을 둥글게 번진 먹선 → 원래 그림. 캐릭터 스프라이트와 같은 방식.
 */
function inked(dst, src, cam, items) {
  const W = src.width, H = src.height, k = dpr();
  if (dst.width !== W || dst.height !== H) { dst.width = W; dst.height = H; }
  const g = dst.getContext('2d');
  g.clearRect(0, 0, W, H);
  // 그림자: 물체 바로 아래 바닥점을 화면에 찍고, 높이 뜰수록 작고 옅게
  g.fillStyle = SHADOW;
  for (const it of items) {
    const p = it.o.position;
    const c = new THREE.Vector3(p.x, 0, p.z).project(cam);
    const e = new THREE.Vector3(p.x + 1, 0, p.z).project(cam);
    const unit = Math.abs(e.x - c.x) * W / 2;
    const lift = Math.max(0, p.y - it.o.userData.rest.up);
    const fade = 1 / (1 + lift * 0.7);
    const [rx, ry] = it.o.userData.shadow;
    g.globalAlpha = fade;
    g.beginPath();
    g.ellipse((c.x + 1) * W / 2, (1 - c.y) * H / 2 + unit * 0.06, rx * unit * (0.6 + 0.4 * fade), ry * unit * (0.6 + 0.4 * fade), 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // 먹선
  if (inkBuf.width !== W || inkBuf.height !== H) { inkBuf.width = W; inkBuf.height = H; }
  const ig = inkBuf.getContext('2d');
  ig.globalCompositeOperation = 'source-over';
  ig.clearRect(0, 0, W, H);
  ig.drawImage(src, 0, 0);
  ig.globalCompositeOperation = 'source-in';
  ig.fillStyle = INK;
  ig.fillRect(0, 0, W, H);
  const r = OUTLINE * k;
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    g.drawImage(inkBuf, Math.cos(t) * r, Math.sin(t) * r);
  }
  g.drawImage(src, 0, 0);
}

// ── 던지기 ──────────────────────────────────────────────────

const ease = (t) => 1 - (1 - t) ** 3;

/**
 * overlay(판 영역) 위에 캔버스를 깔고 던진다. 끝나면 결과가 잠깐 머물다 사라진다.
 * 도깨비가 던질 때는 작고 빠르게.
 */
export async function toss(overlay, board, roll, who = 'me', at = null) {
  const fast = who === 'opp';
  const w = overlay.clientWidth, h = overlay.clientHeight;
  size(w, h);
  const { sc, cam } = scene(w / h, distFor(board, w / h, fast ? 0.3 : 0.42));
  const items = build(board, roll);
  // 시작 자세: 화면 아래쪽 앞에서 위로 던져 올린다. 각자 다른 회전축으로 몇 바퀴 돈다
  for (const it of items) {
    it.start = new THREE.Vector3(it.pos.x * 0.4 + (Math.random() - 0.5) * 1.5, 0.8, 2.4 + Math.random() * 0.6);
    it.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    it.turns = (board.roller === 'sticks' ? 3 : 2) + Math.floor(Math.random() * 2);
    it.delay = Math.random() * 0.08;
    it.bounced = false;
    sc.add(it.o);
  }
  const view = document.createElement('canvas');
  view.className = 'roll3d';
  overlay.appendChild(view);
  const T = fast ? 620 : 980;
  const t0 = performance.now();
  const peak = board.roller === 'sticks' ? 2.0 : 1.7; // 너무 높으면 카메라 쪽으로 다가와 커 보인다
  const pose = (now) => {
    let allDone = true;
    for (const it of items) {
      const t = Math.min(1, Math.max(0, ((now - t0) / T) - it.delay) / (1 - it.delay));
      if (t < 1) allDone = false;
      // 앞 60%: 포물선 비행, 뒤 40%: 두 번 잦아드는 튕김
      const fly = Math.min(1, t / 0.6);
      const p = new THREE.Vector3().lerpVectors(it.start, it.pos, ease(fly));
      if (t < 0.6) p.y = it.start.y + (it.pos.y - it.start.y) * fly + peak * 4 * fly * (1 - fly);
      else { const b = (t - 0.6) / 0.4; p.y = it.pos.y + Math.abs(Math.sin(b * Math.PI * 2)) * 0.55 * (1 - b) ** 2; }
      it.o.position.copy(p);
      // 회전: 남은 회전량을 끝 자세 쪽으로 풀어간다
      const left = (1 - ease(Math.min(1, t / 0.85))) * it.turns * Math.PI * 2;
      it.o.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(it.spin, left).multiply(it.q));
      if (!it.bounced && t >= 0.6) { it.bounced = true; overlay.dispatchEvent(new CustomEvent('rollhit')); }
    }
    renderer.render(sc, cam);
    inked(view, renderer.domElement, cam, items);
    return allDone;
  };
  // 확인용(tools/roller-test.html): at(0~1) 을 주면 그 순간 한 장만 그리고 멈춘다
  if (at !== null) { pose(t0 + at * T); dispose(sc); return; }
  await new Promise((done) => {
    const frame = () => { if (pose(performance.now()) || performance.now() - t0 > T + 400) done(); else requestAnimationFrame(frame); };
    // 창이 가려져 requestAnimationFrame 이 멈춰도 끝나도록
    setTimeout(done, T + 900);
    requestAnimationFrame(frame);
  });
  for (const it of items) { it.o.position.copy(it.pos); it.o.quaternion.copy(it.q); }
  renderer.render(sc, cam);
  inked(view, renderer.domElement, cam, items);
  // 결과를 잠깐 보여주고 사라진다
  setTimeout(() => { view.style.opacity = '0'; setTimeout(() => view.remove(), 300); }, fast ? 280 : 520);
  dispose(sc);
}

/** 굴림 칸에 놓인 모습. 한 장 그림으로 그려 넣는다(WebGL 맥락을 여러 개 만들지 않으려고). */
export function still(container, board, roll) {
  const w = Math.max(120, container.clientWidth || 340), h = Math.max(60, container.clientHeight || 86);
  size(w, h);
  const ly = midY(board);
  const { sc, cam } = scene(w / h, distFor(board, w / h, board.roller === 'chess' ? 0.4 : 0.6), ly);
  // 굴림 칸은 납작하니 조금 더 위에서 내려다본다
  cam.position.set(0, ly + (cam.position.y - ly) * 1.08, cam.position.z * 0.62);
  cam.lookAt(0, ly, 0);
  let k = 1;
  const items = build(board, roll, () => { k = (k * 16807) % 2147483647; return k / 2147483647; });
  for (const it of items) { it.o.position.copy(it.pos); it.o.quaternion.copy(it.q); sc.add(it.o); }
  renderer.render(sc, cam);
  const out = document.createElement('canvas');
  inked(out, renderer.domElement, cam, items);
  container.innerHTML = `<img class="roll-still" alt="" src="${out.toDataURL()}">`;
  dispose(sc);
}

function dispose(sc) {
  sc.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    }
  });
}
