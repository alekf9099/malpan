// 화면 컨트롤러. 규칙은 core 가 전부 처리하고, 여기서는 core 가 돌려준 이벤트를 순서대로 연출한다.

import { createRun, startRound, settleRound, nextRound, buy, sellCharm, moveCharm, rerollShop, ROUNDS, MAX_CHARMS, SHOP_REROLL_COST, pFlatOf } from '../core/run.js';
import { throwYut, reroll, applyMove, legalMoves, threats, HEUNG_MAX, TREASURE_COINS } from '../core/round.js';
import { START, HOME, COORDS } from '../core/board.js';
import { NAMES, BACKDO, DO, GAE, GEOL, YUT, MO, distribution } from '../core/sticks.js';
import { TILES, STICKS, charmById } from '../core/items.js';
import { character, kindOf, stick, charmCard, tileArt, stickArt, coin, boardSvg, nodeXY, HEROES, bundle, traitBadge } from './art.js';
import { Sound } from './sound.js';

const app = document.getElementById('app');
const G = { run: null, busy: false, flats: [true, false, true, true], throwsMax: 0, stampEl: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel) => app.querySelector(sel);
const R = () => G.run.round;

const STAMP_COLOR = { [BACKDO]: 'ink', [DO]: 'white', [GAE]: 'green', [GEOL]: 'blue', [YUT]: '', [MO]: 'yellow' };

// ── 타이틀 ───────────────────────────────────────────────────

function title() {
  app.innerHTML = `
    <div class="title">
      <div class="logo">윷판을<br><span>뒤집어라</span></div>
      <div class="sub">윷 던지고, 업고, 잡고 — 점수를 쌓아 도깨비를 이겨라</div>
      <div class="cast">${HEROES.map((k) => character(k)).join('')}${character('dokkaebiRed')}</div>
      <button class="btn" id="start" style="width:220px;height:64px;font-size:28px">한 판 시작</button>
      <div class="sub" style="font-size:12.5px;margin-top:18px">6라운드 · 3·6라운드는 도깨비 대장</div>
    </div>`;
  $('#start').onclick = () => {
    Sound.unlock(); Sound.click();
    const fixed = parseInt(new URLSearchParams(location.search).get('seed'), 10);
    G.run = createRun(Number.isNaN(fixed) ? (Date.now() & 0x7fffffff) : fixed);
    startRound(G.run);
    buildGame();
    roundIntro();
  };
}

// ── 게임 화면 골격 ───────────────────────────────────────────

function buildGame() {
  app.innerHTML = `
    <div class="top" id="top"></div>
    <div class="scoreboard" id="score">
      <div class="score-row"><div class="score-now" id="scoreNow">0</div><div class="score-goal">목표<b id="target">0</b></div></div>
      <div class="bar" id="bar"><i style="width:0%"></i></div>
      <div class="heung" id="heung"></div>
      <div class="calc" id="calc"><div class="chips" id="chips">0</div><div class="x">×</div><div class="mult" id="mult">1</div></div>
    </div>
    <div class="board-wrap" id="board"><div id="mat"></div><div id="layer"></div></div>
    <div class="trays" id="trays"></div>
    <div class="throw-zone" id="sticks"></div>
    <div class="controls">
      <button class="btn main" id="throw">던지기</button>
      <div class="side"><button class="btn small white" id="reroll"></button></div>
    </div>
    <div class="throws" id="pips"></div>
    <div class="hint" id="hint"></div>
    <div class="charms" id="charms"></div>`;
  $('#throw').onclick = onThrow;
  $('#reroll').onclick = onReroll;
  G.throwsMax = R().throwsLeft;
  drawSticks(G.flats, false);
  refresh();
}

function refresh() {
  drawHeung();
  drawBundles();
  drawTop();
  drawScore(R().score);
  drawBoard();
  syncPieces();
  drawTrays();
  drawControls();
  drawCharms();
}

function drawTop() {
  const r = R();
  $('#top').innerHTML = `
    <span class="pill">${r.number} / ${ROUNDS.length} 라운드</span>
    ${r.boss ? `<span class="pill boss">대장 · ${r.boss.name}</span>` : ''}
    <span style="flex:1"></span>
    <span class="pill">${coin()} ${G.run.coins}</span>
    <button class="btn small white icon-btn" id="snd" aria-label="소리">${Sound.isOn() ? '♪' : '✕'}</button>`;
  $('#snd').onclick = () => { Sound.toggle(); Sound.unlock(); drawTop(); };
}

/** 흥 게이지: 칸 5개. 켜진 만큼 모든 이동에 배수가 더해진다. */
function drawHeung(flash, h = R().heung) {
  const el = $('#heung');
  el.className = 'heung' + (h >= HEUNG_MAX ? ' max' : '') + (flash === 'lost' ? ' lost' : '');
  el.innerHTML = `<span class="lbl">흥</span><span class="pips">${Array.from({ length: HEUNG_MAX }, (_, i) => `<i class="${i < h ? 'on' : ''}"></i>`).join('')}</span>` +
    `<span class="val">${h ? `배수 +${h}` : '잡기·업기·골인·보따리로 오른다'}</span>`;
  if (!h) el.querySelector('.val').style.color = 'var(--ink-3)';
  $('#score').classList.toggle('hot', h >= HEUNG_MAX);
}

function drawBundles() {
  $('#layer').querySelectorAll('.bundle').forEach((b) => b.remove());
  for (const t of R().treasures) addBundle(t.node, t.ttl, false);
}

function addBundle(node, ttl, animate) {
  const b = document.createElement('div');
  b.className = 'bundle';
  b.dataset.node = node;
  if (!animate) b.style.animation = 'none';
  b.innerHTML = bundle(34) + `<span class="ttl">${ttl}</span>`;
  place(b, node);
  $('#layer').appendChild(b);
}

function drawScore(value) {
  const r = R();
  $('#scoreNow').textContent = value.toLocaleString();
  $('#target').textContent = r.target.toLocaleString();
  const pct = Math.min(100, (100 * value) / r.target);
  $('#bar').classList.toggle('done', value >= r.target);
  $('#bar i').style.width = pct + '%';
}

function drawBoard() {
  $('#mat').innerHTML = boardSvg(R().tiles);
}

// ── 말 ───────────────────────────────────────────────────────

function pieceEl(id) {
  let el = $('#layer').querySelector(`[data-piece="${id}"]`);
  if (!el) {
    el = document.createElement('div');
    el.className = 'piece';
    el.dataset.piece = id;
    const p = R().pieces.find((q) => q.id === id);
    el.innerHTML = character(kindOf(id)) + '<span class="count" hidden></span>' +
      (p?.trait ? `<span class="trait">${traitBadge(p.trait)}</span>` : '<span class="warn" hidden>!</span>');
    $('#layer').appendChild(el);
  }
  return el;
}

function place(el, node) {
  const [x, y] = nodeXY(node);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

/** 상태 그대로 말을 놓는다. 같은 칸의 말은 맨 위 하나만 보이고 숫자 배지를 단다. */
function syncPieces() {
  const r = R();
  $('#layer').querySelectorAll('.target').forEach((t) => t.remove());
  const byNode = {};
  for (const p of r.pieces) {
    const el = pieceEl(p.id);
    el.classList.remove('movable', 'caught', 'hop');
    el.onclick = null;
    if (p.node === START || p.node === HOME) { el.style.display = 'none'; continue; }
    (byNode[p.node] ||= []).push(p);
  }
  for (const [node, list] of Object.entries(byNode)) {
    list.forEach((p, i) => {
      const el = pieceEl(p.id);
      el.style.display = i === 0 ? '' : 'none';
      place(el, node);
      const badge = el.querySelector('.count');
      badge.hidden = i !== 0 || list.length < 2;
      badge.textContent = '×' + list.length;
    });
  }
  // 다음 도깨비 차례에 잡힐 수 있는 내 말에 경고(15% 이상)
  const danger = threats(r);
  for (const p of r.pieces.filter((q) => q.owner === 'me')) {
    const warn = pieceEl(p.id).querySelector('.warn');
    if (warn) warn.hidden = !(danger[p.node] >= 0.15);
  }
  if (r.phase === 'move' && !G.busy) showOptions();
}

/** 둘 수 있는 수를 판 위에 표시한다: 움직일 말이 꿈틀대고, 도착 칸에 예상 점수가 뜬다. */
function showOptions() {
  const moves = legalMoves(R());
  const best = Math.max(...moves.map((m) => m.preview.score.total));
  const used = {};
  moves.forEach((m, i) => {
    if (m.kind === 'stack') {
      const top = R().pieces.find((p) => p.id === m.pieceIds[0] && p.node === m.from);
      const el = pieceEl(top.id);
      el.classList.add('movable');
      el.onclick = () => doMove(i);
    }
    const dest = m.preview.dest === HOME ? 'o0' : m.preview.dest;
    const t = document.createElement('div');
    t.className = 'target';
    const [x, y] = nodeXY(dest);
    const off = (used[dest] = (used[dest] || 0) + 1) - 1;
    t.style.left = x + off * 18 + 'px';
    t.style.top = y + 'px';
    const pv = m.preview;
    const label = pv.dest === HOME ? '골인 ' : pv.captured ? '잡기 ' : pv.treasure ? '보따리 ' : pv.joined ? '업기 ' : '';
    const risk = pv.dest === HOME ? '' : pv.danger >= 0.05
      ? `<i class="risk">${Math.round(pv.danger * 100)}%</i>`
      : '<i class="risk safe">안전</i>';
    // 라벨은 판 바깥쪽으로 비켜 띄운다 — 오른쪽 변의 칸이면 왼쪽에, 위 변이면 아래에
    const [cx, cy] = COORDS[dest];
    const side = cx > 0.9 ? 'left' : cx < 0.1 ? 'right' : cy < 0.1 ? 'below' : 'above';
    t.innerHTML = `<span class="gain ${side} ${pv.score.total === best ? 'hot' : ''}">${label}+${pv.score.total}${risk}</span>`;
    t.onclick = () => doMove(i);
    $('#layer').appendChild(t);
  });
}

function drawTrays() {
  const r = R();
  const mine = r.pieces.filter((p) => p.owner === 'me');
  const opp = r.pieces.filter((p) => p.owner === 'opp');
  const newIdx = r.phase === 'move' && !G.busy ? legalMoves(r).findIndex((m) => m.kind === 'new') : -1;
  const waiting = mine.filter((p) => p.node === START);
  const minis = waiting.map((p, i) =>
    `<span class="mini ${i === 0 && newIdx >= 0 ? 'ready' : ''}" data-new="${i === 0 && newIdx >= 0 ? newIdx : ''}">${character(kindOf(p.id), 30)}</span>`).join('');
  const home = mine.filter((p) => p.node === HOME).length;
  const oppWait = opp.filter((p) => p.node === START).length;
  $('#trays').innerHTML = `
    <div class="tray newbtn"><span class="label">대기</span>${minis || '<span class="label">—</span>'}</div>
    <div class="tray"><span class="label">도깨비 대기 ${oppWait}</span><span class="label">골인</span><b style="font-family:var(--display);font-size:20px">${home}/${mine.length}</b></div>`;
  const ready = $('#trays [data-new]:not([data-new=""])');
  if (ready) ready.onclick = () => doMove(Number(ready.dataset.new));
}

function drawSticks(flats, toss) {
  $('#sticks').innerHTML = flats.map((f, i) => stick(f, i === 0)).join('');
  if (toss) $('#sticks').querySelectorAll('.stick').forEach((s, i) => {
    s.style.animationDelay = i * 30 + 'ms';
    s.classList.add('toss');
  });
}

function drawControls() {
  const r = R();
  const canThrow = !G.busy && r.phase === 'throw';
  const tb = $('#throw');
  tb.disabled = !canThrow;
  tb.textContent = r.extra > 0 && r.phase === 'throw' ? '한 번 더!' : '던지기';
  tb.classList.toggle('yellow', r.extra > 0 && r.phase === 'throw');
  const rb = $('#reroll');
  rb.disabled = G.busy || r.phase !== 'move' || r.rerolls <= 0;
  rb.innerHTML = `다시 던지기<br><span style="font-family:var(--display);font-size:20px">×${r.rerolls}</span>`;
  const used = G.throwsMax - r.throwsLeft;
  $('#pips').innerHTML = Array.from({ length: G.throwsMax }, (_, i) => `<i class="${i < used ? 'used' : ''}"></i>`).join('') +
    Array.from({ length: r.extra }, () => '<i class="extra"></i>').join('');
  $('#hint').textContent = G.busy ? '' : r.phase === 'move' ? '노란 칸을 누르세요 — 숫자는 예상 점수, 빨간 %는 잡힐 확률'
    : r.phase === 'throw' ? `던질 기회 ${r.throwsLeft}번${r.extra ? ` + 한 번 더 ${r.extra}` : ''}` : '';
}

function drawCharms(container = $('#charms'), inShop = false) {
  const ids = G.run.charms;
  container.innerHTML = Array.from({ length: MAX_CHARMS }, (_, i) =>
    ids[i] ? `<div class="charm" data-i="${i}" title="${charmById(ids[i]).name}">${charmCard(ids[i])}</div>` : '<div class="slot"></div>').join('');
  container.querySelectorAll('.charm').forEach((el) => {
    el.onclick = () => charmTip(Number(el.dataset.i), inShop);
  });
}

function charmTip(i, inShop) {
  if (G.busy) return;
  Sound.click();
  app.querySelector('.tip')?.remove();
  const c = charmById(G.run.charms[i]);
  const tip = document.createElement('div');
  tip.className = 'tip';
  if (inShop) tip.style.zIndex = 60;
  tip.innerHTML = `<b>${c.name}</b><p>${c.desc}<br><span style="font-size:12px">점수는 왼쪽 부적부터 차례로 계산된다. ×2 부적은 오른쪽에 둘수록 세다.</span></p>
    <div style="display:flex;gap:6px">
      <button class="btn small white" data-a="left">◀ 왼쪽</button>
      <button class="btn small white" data-a="right">오른쪽 ▶</button>
      <span style="flex:1"></span>
      <button class="btn small" data-a="sell">팔기 ${coin(14)} ${Math.floor(c.price / 2)}</button>
      <button class="btn small white" data-a="close">닫기</button>
    </div>`;
  app.appendChild(tip);
  tip.querySelectorAll('[data-a]').forEach((b) => {
    b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'left') moveCharm(G.run, i, i - 1);
      if (a === 'right') moveCharm(G.run, i, i + 1);
      if (a === 'sell') { sellCharm(G.run, i); Sound.coin(); }
      tip.remove();
      afterCharmChange(inShop);
    };
  });
}

function afterCharmChange(inShop) {
  if (inShop) { openShop(); return; }
  R().charms = G.run.charms.slice();
  R().pFlat = pFlatOf(G.run);
  drawTop();
  drawCharms();
  if (R().phase === 'move') syncPieces();
}

// ── 조작 ─────────────────────────────────────────────────────

async function onThrow() {
  if (G.busy || R().phase !== 'throw') return;
  Sound.unlock();
  await play(throwYut(R(), G.run.rng));
}

async function onReroll() {
  if (G.busy || R().phase !== 'move' || R().rerolls <= 0) return;
  await play(reroll(R(), G.run.rng));
}

async function doMove(i) {
  if (G.busy || R().phase !== 'move') return;
  Sound.click();
  await play(applyMove(R(), i, G.run.rng));
}

// ── 이벤트 연출 ──────────────────────────────────────────────

async function play(events) {
  G.busy = true;
  app.querySelector('.tip')?.remove();
  drawControls();
  $('#layer').querySelectorAll('.target').forEach((t) => t.remove());
  $('#layer').querySelectorAll('.piece').forEach((el) => { el.classList.remove('movable'); el.onclick = null; });
  for (const e of events) {
    const h = HANDLERS[e.type];
    if (h) await h(e);
  }
  G.busy = false;
  if (R().phase === 'over') { await roundOver(); return; }
  syncPieces();
  drawBundles();
  drawHeung();
  drawTrays();
  drawControls();
  drawTop();
}

function clearStamp() {
  if (!G.stampEl) return;
  const s = G.stampEl;
  G.stampEl = null;
  s.classList.add('fade');
  setTimeout(() => s.remove(), 300);
}

function stampText(text, color, small) {
  clearStamp();
  const s = document.createElement('div');
  s.className = 'stamp ' + (color || '');
  s.innerHTML = text + (small ? `<small>${small}</small>` : '');
  $('#sticks').appendChild(s);
  G.stampEl = s;
  Sound.stamp();
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  app.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

function floater(text, node, color) {
  const [x, y] = nodeXY(node);
  const f = document.createElement('div');
  f.className = 'floater';
  f.textContent = text;
  if (color) f.style.background = color;
  f.style.left = Math.min(270, Math.max(58, x)) + 'px'; // 판 가장자리에서 잘리지 않게 안쪽으로
  f.style.top = y - 20 + 'px';
  $('#board').appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

const HANDLERS = {
  async throw(e) {
    clearStamp();
    hideCalc();
    if (e.who === 'opp') {
      drawSticks(e.flats, true);
      Sound.toss();
      await sleep(380);
      Sound.clatter();
      await sleep(260);
      stampText('도깨비 ' + NAMES[e.result], 'ink opp');
      await sleep(650);
      return;
    }
    drawSticks(e.flats, true);
    Sound.toss();
    await sleep(320);
    Sound.clatter();
    await sleep(260);
    stampText(NAMES[e.result] + '!', STAMP_COLOR[e.result], e.bonus ? '한 번 더!' : e.rerolled ? '다시 던졌다' : '');
    G.flats = e.flats;
    await sleep(420);
  },
  async noMove(e) {
    toast(e.who === 'opp' ? '도깨비가 움직일 수 없다' : e.why === 'boss' ? '도깨비 대장: 도는 무효!' : '움직일 말이 없다');
    await sleep(700);
  },
  async oppTurn() {
    toast('도깨비 차례');
    await sleep(450);
  },
  async move(e) {
    const els = e.pieceIds.map(pieceEl);
    for (const el of els) {
      if (el.style.display === 'none') { place(el, e.from === START ? 'o0' : e.from); }
    }
    els.forEach((el, i) => { el.style.display = i === 0 ? '' : 'none'; el.querySelector('.count').hidden = true; });
    // 떠난 칸에 남은 말의 숫자 배지는 지운다(남은 말 수는 연출이 끝난 뒤 syncPieces 가 다시 단다)
    if (e.from !== START) {
      const [fx, fy] = nodeXY(e.from);
      $('#layer').querySelectorAll('.piece').forEach((el) => {
        if (!els.includes(el) && parseFloat(el.style.left) === fx && parseFloat(el.style.top) === fy) el.querySelector('.count').hidden = true;
      });
    }
    let i = 0;
    for (const node of e.path) {
      const n = node === HOME ? 'o0' : node;
      for (const el of els) { place(el, n); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }
      Sound.step(i++);
      await sleep(175);
    }
    if (e.path[e.path.length - 1] === HOME) els.forEach((el) => { el.style.display = 'none'; });
  },
  async capture(e) {
    for (const id of e.victimIds) {
      const el = pieceEl(id);
      el.style.display = '';
      el.classList.add('caught');
    }
    Sound.capture();
    $('#board').classList.remove('shake'); void $('#board').offsetWidth; $('#board').classList.add('shake');
    floater(e.who === 'me' ? '잡았다!' : '잡혔다…', e.node, e.who === 'me' ? '#F2B33D' : '#E0533D');
    if (e.who === 'opp') Sound.caught();
    await sleep(560);
    for (const id of e.victimIds) { const el = pieceEl(id); el.classList.remove('caught'); el.style.display = 'none'; }
  },
  async stack(e) {
    Sound.stack();
    floater(`업었다 ×${e.pieceIds.length}`, e.node, '#FFFDF7');
    const top = pieceEl(e.pieceIds[0]);
    e.pieceIds.forEach((id, i) => { if (i) pieceEl(id).style.display = 'none'; });
    top.style.display = '';
    const badge = top.querySelector('.count');
    badge.hidden = false;
    badge.textContent = '×' + e.pieceIds.length;
    await sleep(380);
  },
  async home(e) {
    Sound.home();
    floater(`골인! ×${e.pieceIds.length}`, 'o0', e.who === 'opp' ? '#2F6BD8' : '#3E9B6A');
    if (e.who === 'opp') {
      if (e.throwsLost) {
        Sound.penalty();
        toast(`도깨비 골인 — 던질 기회 −${e.throwsLost}`);
        $('#pips').classList.add('hurt');
        G.throwsMax = Math.max(G.throwsMax - e.throwsLost, R().throwsLeft);
        setTimeout(() => $('#pips')?.classList.remove('hurt'), 600);
        drawControls();
      } else toast('도깨비가 골인했다');
    }
    await sleep(520);
  },
  async heung(e) {
    Sound.heung(e.value);
    drawHeung(null, e.value);
    const pip = $('#heung').querySelectorAll('.pips i')[e.value - 1];
    pip?.classList.add('bump');
    if (e.value >= HEUNG_MAX) toast('흥이 넘친다! 배수 +5');
    await sleep(260);
  },
  async heungLost(e) {
    Sound.heungLost();
    toast(`흥이 꺼졌다… (배수 +${e.value} 사라짐)`);
    drawHeung('lost', 0);
    await sleep(520);
  },
  async treasureSpawn(e) {
    Sound.bundle();
    addBundle(e.node, e.ttl, true);
    floater('보따리!', e.node, '#FFFDF7');
    await sleep(420);
  },
  async treasureGone(e) {
    const b = $('#layer').querySelector(`.bundle[data-node="${e.node}"]`);
    if (b) { b.classList.add('gone'); Sound.bundleGone(); await sleep(350); b.remove(); }
  },
  async treasureTake(e) {
    const b = $('#layer').querySelector(`.bundle[data-node="${e.node}"]`);
    if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 350); }
    if (e.who === 'me') { Sound.coin(); floater(`+${TREASURE_COINS} 엽전`, e.node, '#F2B33D'); }
    else { Sound.penalty(); toast('도깨비가 보따리를 가로챘다'); }
    await sleep(380);
  },
  async coin(e) {
    Sound.coin();
    floater('+1 엽전', e.node, '#F2B33D');
    await sleep(300);
  },
  async trap(e) {
    toast('덫에 걸린 도깨비!');
    e.pieceIds.forEach((id) => { pieceEl(id).classList.add('caught'); });
    Sound.capture();
    await sleep(560);
    e.pieceIds.forEach((id) => { const el = pieceEl(id); el.classList.remove('caught'); el.style.display = 'none'; });
  },
  async score(e) {
    await animateScore(e);
    // 목표의 30% 이상을 한 번에 벌면 대박 연출
    if (e.total >= e.target * 0.3) {
      Sound.big();
      stampText('대박!', 'yellow', `+${e.total.toLocaleString()}`);
      $('#board').classList.remove('shake'); void $('#board').offsetWidth; $('#board').classList.add('shake');
      await sleep(600);
    }
  },
  async again() { await sleep(150); },
  async roundOver() { /* play() 이 끝난 뒤 처리 */ }
};

function hideCalc() { $('#calc').classList.remove('show'); $('#score').classList.remove('calcing'); }

/** 칩 × 배수 를 한 줄씩 쌓아 보여주고, 점수판 숫자를 굴려 올린다. */
async function animateScore(e) {
  const calc = $('#calc'), chipsEl = $('#chips'), multEl = $('#mult');
  let chips = 0, mul = 1, step = 0;
  calc.classList.add('show');
  $('#score').classList.add('calcing');
  for (const line of e.lines) {
    if (line.chips != null) chips += line.chips;
    if (line.mult != null) mul += line.mult;
    if (line.times != null) mul *= line.times;
    chipsEl.textContent = chips;
    multEl.textContent = mul;
    const target = line.chips != null ? chipsEl : multEl;
    target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump');
    if (line.chips != null) Sound.chip(step); else Sound.mult(step);
    const ci = G.run.charms.findIndex((id) => charmById(id).name === line.src);
    if (ci >= 0) {
      const card = $('#charms').querySelector(`[data-i="${ci}"]`);
      card?.classList.remove('fire'); void card?.offsetWidth; card?.classList.add('fire');
    }
    showSrc(line.src, target);
    step++;
    await sleep(line === e.lines[0] ? 260 : 300);
  }
  Sound.score();
  const from = e.score - e.total;
  // requestAnimationFrame 은 탭이 가려지면 멈춰서 연출이 끝나지 않는다. 타이머로 돌려 항상 끝나게 한다.
  const t0 = performance.now(), dur = 420;
  await new Promise((done) => {
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      drawScore(Math.round(from + e.total * (1 - (1 - k) ** 3)));
      if (k >= 1) { clearInterval(id); done(); }
    }, 16);
  });
  $('#scoreNow').classList.remove('bump'); void $('#scoreNow').offsetWidth; $('#scoreNow').classList.add('bump');
  await sleep(250);
}

function showSrc(text, anchor) {
  const s = document.createElement('div');
  s.className = 'calc src';
  s.style.position = 'absolute';
  const box = $('#score').getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const k = box.width / $('#score').offsetWidth; // 화면 맞춤 배율
  s.style.left = (a.left - box.left + a.width / 2) / k + 'px';
  s.style.top = (a.top - box.top) / k + 'px';
  s.style.opacity = '1';
  s.style.transform = 'translate(-50%, -22px)';
  s.style.height = 'auto';
  s.style.fontSize = '11.5px';
  s.style.fontWeight = '800';
  s.style.color = 'var(--ink-2)';
  s.style.animation = 'floatup .9s ease-out forwards';
  s.textContent = text;
  $('#score').appendChild(s);
  setTimeout(() => s.remove(), 900);
}

// ── 라운드 앞뒤 ──────────────────────────────────────────────

function sheet(html) {
  closeSheet();
  app.insertAdjacentHTML('beforeend', `<div class="sheet-back"></div><div class="sheet">${html}</div>`);
  return app.querySelector('.sheet');
}
function closeSheet() { app.querySelectorAll('.sheet, .sheet-back').forEach((n) => n.remove()); }

function roundIntro() {
  const r = R();
  const boss = r.boss ? `<div class="boss-card">${character('dokkaebiRed', 56)}<div><b>도깨비 대장 — ${r.boss.name}</b><span>${r.boss.desc}</span></div></div>` : '';
  const s = sheet(`
    <h2>${r.number}라운드</h2>
    <p>던질 기회 <b>${r.throwsLeft}번</b> 안에 <b>${r.target.toLocaleString()}점</b>을 넘겨라. 도깨비 ${r.pieces.filter((p) => p.owner === 'opp').length}마리가 같은 판을 돈다.</p>
    <div class="legend">
      <div>${character('dokkaebiRed', 34)}<span><b>빨간 도깨비</b><br>내 말을 잡으러 온다</span></div>
      <div>${character('dokkaebiBlue', 34)}<span><b>파란 도깨비</b><br>골인하면 던질 기회 −1</span></div>
    </div>
    <p style="font-size:12.5px">잡기·업기·골인·보따리로 <b>흥</b>이 오르면 모든 이동에 배수가 붙는다. 내 말이 잡히면 흥이 꺼진다.</p>
    ${boss}
    <div class="row"><button class="btn" id="go">시작!</button></div>`);
  if (r.boss) Sound.boss();
  s.querySelector('#go').onclick = () => { Sound.click(); closeSheet(); };
}

async function roundOver() {
  const r = R();
  syncPieces();
  drawControls();
  if (r.outcome === 'win') {
    stampText('통과!', 'green');
    Sound.win();
    await sleep(1100);
    const payout = settleRound(G.run);
    drawTop();
    if (G.run.status === 'won') { victory(); return; }
    const total = payout.reduce((s, p) => s + p.amount, 0);
    const s = sheet(`
      <h2>${r.number}라운드 통과</h2>
      <p>${r.score.toLocaleString()}점 / 목표 ${r.target.toLocaleString()}점</p>
      <div class="payout">${payout.map((p) => `<div><span>${p.label}</span><b>+${p.amount} ${coin(16)}</b></div>`).join('')}
        <div><span>합계</span><b style="font-family:var(--display);font-weight:400;font-size:20px">+${total} ${coin(18)}</b></div></div>
      <div class="row"><button class="btn yellow" id="go">장터로</button></div>`);
    Sound.coin();
    s.querySelector('#go').onclick = () => { Sound.click(); openShop(); };
  } else {
    stampText('실패…', 'ink');
    Sound.lose();
    await sleep(1100);
    settleRound(G.run);
    gameOver();
  }
}

function openShop() {
  const run = G.run;
  const art = (o) => o.kind === 'charm' ? charmCard(o.id) : o.kind === 'tile' ? tileArt(o.id) : stickArt(o.id);
  const info = (o) => {
    if (o.kind === 'charm') { const c = charmById(o.id); return { kind: '부적', name: c.name, desc: c.desc }; }
    if (o.kind === 'tile') { const t = TILES.find((x) => x.id === o.id); return { kind: '칸 개조', name: t.name, desc: t.desc }; }
    const st = STICKS.find((x) => x.id === o.id);
    return { kind: '윷가락', name: st.name, desc: st.desc + (run.stick ? ' (지금 윷과 바꾼다)' : '') };
  };
  const s = sheet(`
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h2>장터</h2><span class="pill">${coin()} ${run.coins}</span>
    </div>
    <p>다음은 ${run.roundNo + 1}라운드 · 목표 ${ROUNDS[run.roundNo].target.toLocaleString()}점${ROUNDS[run.roundNo].boss ? ' · <b style="color:var(--red)">도깨비 대장</b>' : ''}</p>
    <div class="offers">${run.shop.offers.map((o, i) => {
      const d = info(o);
      return `<div class="offer ${o.sold ? 'sold' : ''}">
        <span class="kind">${d.kind}</span>
        <div class="art">${art(o)}</div>
        <div class="name">${d.name}</div>
        <div class="desc">${d.desc}</div>
        <button class="btn small yellow" data-buy="${i}" ${o.sold || run.coins < o.price ? 'disabled' : ''}>${coin(14)} ${o.price}</button>
      </div>`;
    }).join('')}</div>
    <p style="margin-top:14px">내 부적 — 눌러서 순서를 바꾸거나 판다</p>
    <div class="charms" id="shopCharms" style="padding:8px 0 0;margin:0"></div>
    <div class="row">
      <button class="btn small white" id="rr" ${run.coins < SHOP_REROLL_COST ? 'disabled' : ''}>새로고침 ${coin(14)} ${SHOP_REROLL_COST}</button>
      <button class="btn" id="next" style="flex:1.4">다음 라운드</button>
    </div>`);
  drawCharms(s.querySelector('#shopCharms'), true);
  s.querySelectorAll('[data-buy]').forEach((b) => {
    b.onclick = () => {
      const res = buy(run, Number(b.dataset.buy));
      if (!res.ok) { Sound.deny(); toast(res.reason); return; }
      Sound.coin();
      if (res.node) { drawBoard(); toast('판 위에 새 칸이 놓였다'); }
      drawTop();
      openShop();
    };
  });
  s.querySelector('#rr').onclick = () => { if (rerollShop(run).ok) { Sound.coin(); drawTop(); openShop(); } };
  s.querySelector('#next').onclick = () => {
    Sound.click();
    closeSheet();
    nextRound(run);
    G.throwsMax = R().throwsLeft;
    clearStamp();
    hideCalc();
    $('#layer').innerHTML = '';
    refresh();
    roundIntro();
  };
}

function gameOver() {
  const run = G.run;
  const s = sheet(`
    <h2>판이 뒤집혔다</h2>
    <p>${run.roundNo}라운드에서 ${R().score.toLocaleString()}점 — 목표 ${R().target.toLocaleString()}점에 못 미쳤다.</p>
    <div class="payout">
      <div><span>버틴 라운드</span><b>${run.roundNo - 1} / ${ROUNDS.length}</b></div>
      <div><span>한 번에 가장 많이 번 점수</span><b>${R().lastMoveBest.toLocaleString()}</b></div>
      <div><span>모은 부적</span><b>${run.charms.length ? run.charms.map((id) => charmById(id).name).join(', ') : '없음'}</b></div>
      <div><span>시드</span><b>${run.seed}</b></div>
    </div>
    <div class="row"><button class="btn white" id="title">처음으로</button><button class="btn" id="again">다시 한 판</button></div>`);
  s.querySelector('#title').onclick = () => { closeSheet(); title(); };
  s.querySelector('#again').onclick = () => {
    closeSheet();
    G.run = createRun(Date.now() & 0x7fffffff);
    startRound(G.run);
    buildGame();
    roundIntro();
  };
}

function victory() {
  const run = G.run;
  const s = sheet(`
    <h2>도깨비 대장을 이겼다!</h2>
    <p>6라운드를 모두 넘겼다. 마지막 점수 ${R().score.toLocaleString()}점.</p>
    <div class="cast" style="justify-content:center;margin:16px 0 4px">${HEROES.map((k) => character(k)).join('')}</div>
    <div class="payout">
      <div><span>모은 부적</span><b>${run.charms.map((id) => charmById(id).name).join(', ') || '없음'}</b></div>
      <div><span>시드</span><b>${run.seed}</b></div>
    </div>
    <div class="row"><button class="btn" id="again">다시 한 판</button></div>`);
  s.querySelector('#again').onclick = () => { closeSheet(); title(); };
}

// ── 시작 ─────────────────────────────────────────────────────

function fit() {
  const k = Math.min(1, window.innerHeight / 844, window.innerWidth / 390);
  const stage = document.getElementById('stage');
  stage.style.transform = `scale(${k})`;
  stage.style.marginBottom = 844 * (k - 1) + 'px';
}
window.addEventListener('resize', fit);
fit();

document.addEventListener('pointerdown', () => Sound.unlock());
document.addEventListener('keyup', (e) => {
  if (!G.run || !R() || G.busy || app.querySelector('.sheet')) return;
  if (e.key === ' ' || e.key === 'Enter') onThrow();
  if (e.key === 'r') onReroll();
  const n = Number(e.key);
  if (n >= 1 && n <= 9 && R().phase === 'move') doMove(n - 1);
});

// 확률표는 개발 중 콘솔에서 확인용
window.__yut = { distribution, get run() { return G.run; } };

title();
