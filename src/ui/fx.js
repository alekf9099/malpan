// 파티클·스티커 효과. 전부 #fx 층에 붙였다가 끝나면 지운다.

import { tween } from './anim.js';

let layer = null;
export function useLayer(el) { layer = el; }

function spawn(cls, x, y, html = '') {
  const el = document.createElement('div');
  el.className = cls;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.innerHTML = html;
  layer.appendChild(el);
  return el;
}

/** 내려앉을 때 흙먼지 */
export function dust(x, y, n = 6) {
  for (let i = 0; i < n; i++) {
    const p = spawn('fx-dust', x, y);
    const a = (i / n) * Math.PI * 2, d = 18 + Math.random() * 14;
    tween(p, [
      { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0.9 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d * 0.45 - 6}px)) scale(1.3)`, opacity: 0 }
    ], { duration: 420 }).then(() => p.remove());
  }
}

const CONFETTI = ['#E0533D', '#2F6BD8', '#F2B33D', '#3E9B6A', '#FFFDF7'];

/** 폭죽: 골인·라운드 통과 */
export function confetti(x, y, n = 26, spread = 1) {
  for (let i = 0; i < n; i++) {
    const p = spawn('fx-confetti', x, y);
    p.style.background = CONFETTI[i % CONFETTI.length];
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3 * spread;
    const v = 70 + Math.random() * 90;
    const tx = Math.cos(a) * v, ty = Math.sin(a) * v;
    tween(p, [
      { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
      { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${300 + Math.random() * 360}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${tx * 1.2}px), calc(-50% + ${ty + 120}px)) rotate(${720}deg)`, opacity: 0 }
    ], { duration: 1000 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.4,1)' }).then(() => p.remove());
  }
}

/** 별 튀기기: 잡기 */
export function stars(x, y, n = 8) {
  for (let i = 0; i < n; i++) {
    const p = spawn('fx-star', x, y, '<svg viewBox="0 0 20 20"><path d="M10 1l2.6 5.6 6.1.7-4.5 4.2 1.2 6.1L10 14.6 4.6 17.6l1.2-6.1L1.3 7.3l6.1-.7z" fill="#F2B33D" stroke="#22201D" stroke-width="1.6" stroke-linejoin="round"/></svg>');
    const a = (i / n) * Math.PI * 2, d = 34 + Math.random() * 18;
    tween(p, [
      { transform: 'translate(-50%,-50%) scale(.3) rotate(0)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1) rotate(180deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d * 1.3}px), calc(-50% + ${Math.sin(a) * d * 1.3 + 10}px)) scale(.6) rotate(260deg)`, opacity: 0 }
    ], { duration: 600 }).then(() => p.remove());
  }
}

/** 충격파 고리 */
export function ring(x, y, color = '#FFFDF7') {
  const p = spawn('fx-ring', x, y);
  p.style.borderColor = color;
  return tween(p, [
    { transform: 'translate(-50%,-50%) scale(.2, .12)', opacity: 1 },
    { transform: 'translate(-50%,-50%) scale(2.4, 1.4)', opacity: 0 }
  ], { duration: 450, easing: 'cubic-bezier(.1,.7,.3,1)' }).then(() => p.remove());
}

/** 만화 스티커("퍽!", "골인!", "업었다!") */
export function pow(x, y, text, color = '#F2B33D', ink = '#22201D', rot = -10) {
  const p = spawn('fx-pow', x, y, text);
  // 화면 가장자리에서 글자가 잘리지 않게 안쪽으로 당긴다(돌림 때문에 여유를 조금 더 둔다)
  const half = p.offsetWidth / 2 + 14, W = layer.clientWidth;
  if (W > 2 * half) p.style.left = Math.min(W - half, Math.max(half, x)) + 'px';
  p.style.top = Math.max(p.offsetHeight / 2 + 30, y) + 'px';
  p.style.background = color;
  p.style.color = ink;
  return tween(p, [
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(2.2)`, opacity: 0 },
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.92)`, opacity: 1, offset: 0.22 },
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.7 },
    { transform: `translate(-50%,-80%) rotate(${rot}deg) scale(1)`, opacity: 0 }
  ], { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)' }).then(() => p.remove());
}

/** 반짝이: 업기·흥 */
export function sparkle(x, y, n = 6, color = '#FFFDF7') {
  for (let i = 0; i < n; i++) {
    const p = spawn('fx-spark', x + (Math.random() - 0.5) * 40, y - Math.random() * 30);
    p.style.background = color;
    tween(p, [
      { transform: 'translate(-50%,-50%) scale(0) rotate(45deg)', opacity: 1 },
      { transform: 'translate(-50%,-50%) scale(1) rotate(45deg)', opacity: 1, offset: 0.4 },
      { transform: 'translate(-50%,-150%) scale(0) rotate(45deg)', opacity: 0 }
    ], { duration: 520 + Math.random() * 200, delay: i * 40 }).then(() => p.remove());
  }
}
