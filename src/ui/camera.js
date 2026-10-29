// 카메라 — 화면보다 큰 판 캔버스를 이동·확대해서 보여준다.
//   frame(points)   점들이 모두 들어오도록 맞춘다(고를 때)
//   follow(point)   한 점을 가운데에 두고 가까이 본다(말이 움직일 때)
//   overview()      처음 볼 곳(setHome 으로 정한 사각형 — 출발역 언저리). 없으면 판 전체
//   whole()         서울 노선도 전체
// 손가락(마우스)으로 끌면 둘러볼 수 있다. 끌었을 때는 클릭으로 치지 않는다.

let view = null, cam = null, size = { w: 1, h: 1 };
const state = { cx: 0, cy: 0, s: 1 };
let dragged = false;
let home = null;   // [[x0, y0], [x1, y1]] — 처음 보여 줄 곳
let wired = false;
export const MAX_ZOOM = 1.0;
// 노선도가 크기 때문에, 고를 때·따라갈 때 이보다 멀어지면 역 이름이 안 읽힌다(서울 전체는 whole()로만)
export const MIN_ZOOM = 0.4;
let FOLLOW_ZOOM = 0.55;
/** 따라갈 때 배율(순환선 판은 판이 작아 조금 멀리서) */
export function setFollowZoom(z = 0.55) { FOLLOW_ZOOM = z; }

export function attach(viewEl, camEl, canvas) {
  view = viewEl;
  cam = camEl;
  size = canvas;
  cam.style.width = canvas.w + 'px';
  cam.style.height = canvas.h + 'px';
  enableDrag();
}

const vw = () => view.clientWidth;
const vh = () => view.clientHeight;
export const fitScale = () => Math.min(vw() / size.w, vh() / size.h) * 0.98;

function clamp() {
  const s = state.s;
  const halfW = vw() / (2 * s), halfH = vh() / (2 * s);
  // 판이 화면보다 작으면 가운데, 크면 판 밖으로 너무 나가지 않게
  state.cx = size.w <= 2 * halfW ? size.w / 2 : Math.min(size.w - halfW + 20, Math.max(halfW - 20, state.cx));
  state.cy = size.h <= 2 * halfH ? size.h / 2 : Math.min(size.h - halfH + 20, Math.max(halfH - 20, state.cy));
}

function apply(ms = 450) {
  clamp();
  const tx = vw() / 2 - state.cx * state.s, ty = vh() / 2 - state.cy * state.s;
  cam.style.transition = ms ? `transform ${ms}ms cubic-bezier(.3,.7,.3,1)` : 'none';
  cam.style.transform = `translate(${tx}px, ${ty}px) scale(${state.s})`;
  // 라벨은 화면에서 같은 크기로 보이도록 카메라 배율을 되돌린다
  cam.style.setProperty('--inv', 1 / state.s);
}

/** 화면 크기가 바뀌었을 때: 보던 곳은 그대로, 배율만 화면에 맞게 다시 제한한다. */
export function refit() {
  if (!view) return;
  state.s = Math.max(state.s, fitScale());
  apply(0);
}

export function setHome(rect) { home = rect; }

export function overview(ms) {
  if (!home) { whole(ms); return; }
  const [[x0, y0], [x1, y1]] = home;
  frame([[x0, y0], [x1, y1]], { maxZoom: 0.8, pad: 60, ms });
}

export function whole(ms) {
  state.s = fitScale();
  state.cx = size.w / 2;
  state.cy = size.h / 2;
  apply(ms);
}

/** 지금 서울 전체를 보고 있나 */
export const showingWhole = () => state.s <= fitScale() + 0.02;

/** 점들이 모두 화면에 들어오게. 너무 가까이 붙지 않도록 maxZoom 까지만, 글자가 읽히도록 MIN_ZOOM 아래로는 내려가지 않는다. */
export function frame(points, { maxZoom = MAX_ZOOM, minZoom = MIN_ZOOM, pad = 80, ms } = {}) {
  if (!points.length) { overview(ms); return; }
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad;
  const y0 = Math.min(...ys) - pad - 40, y1 = Math.max(...ys) + pad;
  state.s = Math.max(fitScale(), minZoom, Math.min(maxZoom, vw() / (x1 - x0), vh() / (y1 - y0)));
  state.cx = (x0 + x1) / 2;
  state.cy = (y0 + y1) / 2;
  apply(ms);
}

export function follow([x, y], ms = 260) {
  state.s = Math.max(state.s, FOLLOW_ZOOM);
  state.cx = x;
  state.cy = y - 30;
  apply(ms);
}

export const zoomedIn = () => state.s > fitScale() + 0.05;

/** 캔버스 좌표 → 판 화면(view) 안의 좌표. 효과 층에 띄울 때 쓴다. */
export function toView([x, y]) {
  return [vw() / 2 + (x - state.cx) * state.s, vh() / 2 + (y - state.cy) * state.s];
}

export const scale = () => state.s;

let start = null;
function enableDrag() {
  if (view.dataset.wired) return;
  view.dataset.wired = '1';
  view.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, cx: state.cx, cy: state.cy };
    dragged = false;
  });
  // 끈 다음에 따라오는 click 은 삼킨다 — 둘러보다가 칸이 눌리지 않게
  view.addEventListener('click', (e) => {
    if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; }
  }, true);
  if (wired) return;
  wired = true;
  window.addEventListener('pointermove', (e) => {
    if (!start) return;
    const k = view.getBoundingClientRect().width / view.offsetWidth; // 화면 맞춤 배율
    const dx = (e.clientX - start.x) / k, dy = (e.clientY - start.y) / k;
    if (!dragged && Math.hypot(dx, dy) < 7) return;
    dragged = true;
    state.cx = start.cx - dx / state.s;
    state.cy = start.cy - dy / state.s;
    apply(0);
  });
  window.addEventListener('pointerup', () => { start = null; });
}
