// 애니메이션 도우미. Web Animations API 를 쓰되, 탭이 가려져 타임라인이 멈춰도
// 정해진 시간이 지나면 반드시 끝나도록 타이머와 경주시킨다(연출이 멈추면 게임이 멈춘다).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function tween(el, keyframes, opts = {}) {
  const duration = opts.duration ?? 300;
  const a = el.animate(keyframes, { duration, easing: opts.easing || 'ease-out', fill: opts.fill || 'none', delay: opts.delay || 0 });
  return Promise.race([a.finished.catch(() => {}), sleep(duration + (opts.delay || 0) + 60)]).then(() => a);
}

/**
 * 말을 from 에서 to 로 포물선 점프. 요소는 이미 to 자리에 놓인 상태여야 한다(transform 으로 거꾸로 띄워 온다).
 * 뜰 때 늘어나고 내려앉을 때 찌그러진다.
 */
export function hop(el, from, to, { height = 26, duration = 190, squash = true } = {}) {
  const dx = from[0] - to[0], dy = from[1] - to[1];
  const frames = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = dx * (1 - t), y = dy * (1 - t) - height * 4 * t * (1 - t);
    const sy = i === 0 ? 0.86 : i === steps ? 0.8 : 1.08;
    const sx = i === 0 ? 1.12 : i === steps ? 1.18 : 0.94;
    frames.push({ transform: `translate(${x}px, ${y}px) scale(${squash ? sx : 1}, ${squash ? sy : 1})`, offset: t });
  }
  frames.push({ transform: 'translate(0, 0) scale(1, 1)' });
  frames[frames.length - 2].offset = 0.9;
  frames[frames.length - 1].offset = 1;
  return tween(el, frames, { duration, easing: 'linear' });
}

/** 하늘에서 떨어져 내려앉기 — 새 말 등장, 보따리 등장 */
export function drop(el, { height = 160, duration = 420 } = {}) {
  return tween(el, [
    { transform: `translateY(${-height}px) scale(.9, 1.15)`, opacity: 0 },
    { transform: 'translateY(-10px) scale(.95, 1.08)', opacity: 1, offset: 0.62 },
    { transform: 'translateY(0) scale(1.25, .72)', offset: 0.78 },
    { transform: 'translateY(-6px) scale(.95, 1.06)', offset: 0.9 },
    { transform: 'translateY(0) scale(1, 1)' }
  ], { duration, easing: 'cubic-bezier(.4,0,.6,1)' });
}

/** 잡힌 말 날려 보내기: 회전하며 판 밖으로 */
export function knockOut(el, dir = 1) {
  return tween(el, [
    { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
    { transform: `translate(${dir * 50}px, -90px) rotate(${dir * 260}deg) scale(1.1)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dir * 120}px, 40px) rotate(${dir * 620}deg) scale(.4)`, opacity: 0 }
  ], { duration: 650, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
}

/** 납작 눌렸다가 튀어 오르기 — 업힐 때 아래 말, 잡을 때 공격하는 말 */
export function squish(el, amount = 0.6) {
  return tween(el, [
    { transform: 'scale(1,1)' },
    { transform: `scale(${1 + (1 - amount)}, ${amount})`, offset: 0.35 },
    { transform: 'scale(.9, 1.15)', offset: 0.7 },
    { transform: 'scale(1,1)' }
  ], { duration: 320 });
}

export function shake(el, power = 6, duration = 380) {
  const f = [];
  for (let i = 0; i <= 8; i++) {
    const k = (1 - i / 8) * power;
    f.push({ transform: `translate(${(i % 2 ? -1 : 1) * k}px, ${(i % 3 - 1) * k * 0.5}px)` });
  }
  f.push({ transform: 'translate(0,0)' });
  return tween(el, f, { duration, easing: 'linear' });
}

/** 화면 전체를 잠깐 하얗게 — 큰 타격의 순간 */
export function flash(container, color = 'rgba(255,253,247,.75)') {
  const f = document.createElement('div');
  f.style.cssText = `position:absolute;inset:0;z-index:90;pointer-events:none;background:${color}`;
  container.appendChild(f);
  return tween(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 }).then(() => f.remove());
}

/** 요소를 from 화면 좌표에서 to 화면 좌표로 날린다(엽전·점수 숫자). 끝나면 지운다. */
export function fly(el, from, to, { duration = 600, arc = 60, delay = 0 } = {}) {
  el.style.position = 'absolute';
  el.style.left = to[0] + 'px';
  el.style.top = to[1] + 'px';
  const dx = from[0] - to[0], dy = from[1] - to[1];
  const frames = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const e = 1 - (1 - t) * (1 - t);
    frames.push({ transform: `translate(-50%,-50%) translate(${dx * (1 - e)}px, ${dy * (1 - e) - arc * 4 * t * (1 - t)}px) scale(${1 + 0.3 * Math.sin(Math.PI * t)})`, opacity: t > 0.9 ? 0.4 : 1 });
  }
  return tween(el, frames, { duration, easing: 'linear', delay }).then(() => el.remove());
}
