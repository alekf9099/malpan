// 화면 컨트롤러. 규칙은 core 가 전부 처리하고, 여기서는 core 가 돌려준 이벤트를 차례로 연출한다.
//   board-view  아이소메트릭 판과 말 위치
//   roller      윷가락·주사위·기물 주사위
//   anim / fx   점프·찌그러짐·날려 보내기 / 먼지·폭죽·스티커

import { createRun, startRound, settleRound, nextRound, buy, sellCharm, moveCharm, rerollShop, ROUNDS, BOARD_RUNS, MAX_CHARMS, SHOP_REROLL_COST, pFlatOf } from '../core/run.js';
import { throwYut, reroll, applyMove, legalMoves, threats, boardFor, nextEventIn, HEUNG_MAX, TREASURE_COINS } from '../core/round.js';
import { START, HOME } from '../core/board.js';
import { TILES, STICKS, charmById } from '../core/items.js';
import { BOARDS } from '../core/boards/index.js';
import { HEROES as HERO_SKILLS, heroOf } from '../core/heroes.js';
import { character, act, face, kindOf, charmCard, tileArt, stickArt, coin, HEROES, bundle, traitBadge } from './art.js';
import { useBoard, boardSvg, nodeXY, depth, pieceSize, canvasSize } from './board-view.js';
import * as Camera from './camera.js';
import { sleep, tween, hop, drop, knockOut, squish, shake, flash, fly } from './anim.js';
import * as FX from './fx.js';
import * as Roller from './roller.js';
import { Sound } from './sound.js';

// 게임 이름은 여기 한 곳에서만 바꾼다
export const GAME_TITLE = { main: '말판', accent: '원정대', sub: '도깨비에게 빼앗긴 놀이판을 되찾아라' };

const app = document.getElementById('app');
const G = { run: null, busy: false, throwsMax: 0, stampEl: null, picked: null, boardId: null };
const $ = (sel) => app.querySelector(sel);
const R = () => G.run.round;
const B = () => boardFor(R());

const STACK_STEP = 21; // 업힌 말이 위로 쌓이는 높이

// ── 타이틀 ───────────────────────────────────────────────────

function title() {
  G.boardId = null;
  app.className = 'app';
  document.title = `${GAME_TITLE.main} ${GAME_TITLE.accent}`;
  const cards = HERO_SKILLS.map((h, i) => `
    <div class="hero-card" style="animation-delay:${i * 90}ms">
      <div class="hero-art">${character(HEROES[i], 84)}</div>
      <div class="hero-txt"><b>${h.name}</b><span class="skill">${h.skill}</span><p>${h.desc}</p></div>
    </div>`).join('');
  app.innerHTML = `
    <div class="title2">
      <div class="title-boards" aria-hidden="true">
        <span class="tb tb1">${Roller.chessDieIcon('knight')}</span>
        <span class="tb tb2">${Roller.stickBundle()}</span>
        <span class="tb tb3">${Roller.dieIcon(5)}</span>
      </div>
      <div class="logo2"><span class="l1">${GAME_TITLE.main}</span><span class="l2">${GAME_TITLE.accent}</span></div>
      <div class="sub">${GAME_TITLE.sub}</div>
      <div class="roster">${cards}</div>
      <div class="villain">${character('dokkaebiRed', 46)}<span>판마다 마지막엔 <b>도깨비 대장</b>이 기다린다</span>${character('dokkaebiBlue', 46)}</div>
      <button class="btn" id="start" style="width:100%;height:62px;font-size:26px">원정 떠나기<small class="btn-sub">윷놀이판 → 주사위판 → 체스판 · 6라운드</small></button>
      <div class="pick-title"><i></i><span>판 하나만 골라 짧게</span><i></i></div>
      <div class="board-pick">${PICKS.map((p) => `
        <button class="pick" data-board="${p.id}">
          <span class="pick-art">${p.art()}</span>
          <b>${BOARDS[p.id].name}</b>
          <span>${p.line}</span>
          <em>2라운드 · ${BOARD_RUNS[p.id][0].target.toLocaleString()}점~</em>
        </button>`).join('')}</div>
    </div>`;
  $('#start').onclick = () => begin(null);
  app.querySelectorAll('.pick').forEach((b) => { b.onclick = () => begin(b.dataset.board); });
}

const PICKS = [
  { id: 'yut', art: () => Roller.stickBundle(), line: '윷가락 · 지름길' },
  { id: 'marble', art: () => Roller.dieIcon(5), line: '주사위 · 칸 이벤트' },
  { id: 'chess', art: () => Roller.chessDieIcon('knight'), line: '기물 주사위 · 점프' }
];

/** 원정 시작. board 가 있으면 그 판의 2라운드만 한다. */
function begin(board) {
  Sound.unlock(); Sound.click();
  const q = new URLSearchParams(location.search);
  const fixed = parseInt(q.get('seed'), 10);
  G.run = createRun(Number.isNaN(fixed) ? (Date.now() & 0x7fffffff) : fixed, { board });
  // 개발·테스트용: ?round=3 이면 그 라운드(주사위판)부터 시작한다
  const startAt = parseInt(q.get('round'), 10);
  if (!board && startAt >= 1 && startAt <= ROUNDS.length) G.run.roundNo = startAt;
  startRound(G.run);
  enterRound();
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
    <div class="board-wrap" id="board"><div id="cam"><div id="mat"></div><div id="layer"></div></div>
      <button class="btn small white zoom-btn" id="zoom" aria-label="전체 보기">전체</button></div>
    <div class="trays" id="trays"></div>
    <div class="throw-zone" id="sticks"><div id="roller"></div></div>
    <div class="controls">
      <button class="btn main" id="throw">던지기</button>
      <div class="side"><button class="btn small white" id="reroll"></button></div>
    </div>
    <div class="throws" id="pips"></div>
    <div class="hint" id="hint"></div>
    <div class="charms" id="charms"></div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  $('#throw').onclick = onThrow;
  $('#reroll').onclick = onReroll;
  $('#zoom').onclick = () => {
    Sound.click();
    if (Camera.zoomedIn()) Camera.overview(); else frameAction();
    drawZoom();
  };
}

function drawZoom() { const z = $('#zoom'); if (z) z.textContent = Camera.zoomedIn() ? '전체' : '확대'; }

/** 지금 볼만한 곳(내 말·도깨비·보따리·출발점)을 화면에 맞춘다. */
function frameAction() {
  const r = R();
  const pts = r.pieces.filter((p) => p.node !== START && p.node !== HOME).map((p) => nodeXY(p.node));
  for (const t of r.treasures) pts.push(nodeXY(t.node));
  if (B().entry) pts.push(nodeXY(B().entry));
  if (!pts.length) pts.push(nodeXY(HOME));
  Camera.frame(pts, { maxZoom: 0.92 });
}

/** 라운드에 들어갈 때. 판이 바뀌면 판을 새로 깔고 소개한다. */
function enterRound() {
  const r = R();
  const newBoard = G.boardId !== r.boardId;
  G.boardId = r.boardId;
  useBoard(B());
  if (newBoard || !$('#board')) buildGame();
  app.className = 'app game board-' + r.boardId;
  G.throwsMax = r.throwsLeft;
  G.picked = null;
  clearStamp();
  hideCalc();
  $('#layer').innerHTML = '';
  Roller.idle($('#roller'), B());
  Camera.attach($('#board'), $('#cam'), canvasSize());
  refresh();
  Camera.overview(0);
  drawZoom();
  if (newBoard) boardIntro(); else roundIntro();
}

function refresh() {
  drawHeung();
  drawTop();
  drawScore(R().score);
  drawBoard();
  syncPieces();
  drawBundles();
  drawTrays();
  drawControls();
  drawCharms();
}

function drawTop() {
  const r = R();
  $('#top').innerHTML = `
    <span class="pill">${r.number} / ${G.run.rounds.length}<span class="wide-only">&nbsp;</span><span class="phone-only"> · </span>${B().name}</span>
    <span class="pill omen" id="omen" hidden></span>
    ${r.boss ? `<span class="pill boss" title="${r.boss.desc}">대장<span class="wide-only"> · ${r.boss.name}</span></span>` : ''}
    <span style="flex:1"></span>
    <span class="pill" id="coinPill">${coin()} ${G.run.coins}</span>
    <button class="btn small white icon-btn" id="snd" aria-label="소리">${Sound.isOn() ? '♪' : '✕'}</button>`;
  $('#snd').onclick = () => { Sound.toggle(); Sound.unlock(); drawTop(); };
  drawOmen();
}

/** 돌발 사건 예고: 무슨 사건인지는 숨기고 언제 오는지만 */
function drawOmen() {
  const el = $('#omen');
  if (!el) return;
  const n = nextEventIn(R());
  el.hidden = n === null || R().phase === 'over';
  el.classList.toggle('soon', n === 0 || n === 1);
  el.textContent = n === 0 ? '사건!' : n === 1 ? '곧 사건' : `사건 ${n}번 뒤`;
  el.title = '돌발 사건 예고 — 무슨 일이 생길지는 그때 알 수 있다';
}

function drawScore(value) {
  const r = R();
  $('#scoreNow').textContent = value.toLocaleString();
  $('#target').textContent = r.target.toLocaleString();
  $('#bar').classList.toggle('done', value >= r.target);
  $('#bar i').style.width = Math.min(100, (100 * value) / r.target) + '%';
}

/** 흥 게이지: 칸 5개. 켜진 만큼 모든 이동에 배수가 더해진다. */
function drawHeung(flashKind, h = R().heung) {
  const el = $('#heung');
  el.className = 'heung' + (h >= HEUNG_MAX ? ' max' : '') + (flashKind === 'lost' ? ' lost' : '');
  el.innerHTML = `<span class="lbl">흥</span><span class="pips">${Array.from({ length: HEUNG_MAX }, (_, i) => `<i class="${i < h ? 'on' : ''}"></i>`).join('')}</span>` +
    `<span class="val">${h ? `배수 +${h}` : '잡기·업기·골인·보따리로 오른다'}</span>`;
  if (!h) el.querySelector('.val').style.color = 'var(--ink-3)';
  $('#score').classList.toggle('hot', h >= HEUNG_MAX);
}

function drawBoard() { $('#mat').innerHTML = boardSvg(R().tiles); }

// ── 좌표 ─────────────────────────────────────────────────────

/** 판 화면 좌표 → 앱 좌표(효과 층은 앱 전체를 덮는다) */
function toApp([x, y]) {
  const b = $('#board');
  return [x + b.offsetLeft, y + b.offsetTop];
}
/** 노드 → 앱 좌표. 카메라 이동·확대를 거친 실제 화면 위치 */
const nodeApp = (node) => toApp(Camera.toView(nodeXY(node)));

// ── 말 ───────────────────────────────────────────────────────

function pieceEl(id) {
  let el = $('#layer').querySelector(`[data-piece="${id}"]`);
  if (!el) {
    const p = R().pieces.find((q) => q.id === id);
    el = document.createElement('div');
    el.className = 'piece';
    el.dataset.piece = id;
    const s = pieceSize();
    el.style.width = el.style.height = s + 'px';
    el.innerHTML = character(kindOf(id)) + '<span class="count" hidden></span>' +
      (p?.trait ? `<span class="trait">${traitBadge(p.trait)}</span>` : '<span class="warn" hidden>!</span>');
    $('#layer').appendChild(el);
  }
  return el;
}

/** 말을 노드 위에 세운다. level 은 업힌 순서(0 이 맨 아래). */
function place(el, node, level = 0) {
  const [x, y] = nodeXY(node);
  const s = pieceSize();
  el.style.left = x - s / 2 + 'px';
  el.style.top = y - s * 0.92 - level * STACK_STEP + 'px';
  el.style.zIndex = depth(y) + level;
  return [x, y - level * STACK_STEP];
}

/** 상태 그대로 말을 놓는다. 같은 칸의 말은 탑처럼 쌓아 보여준다. */
function syncPieces() {
  const r = R();
  $('#layer').querySelectorAll('.target, .target-tag').forEach((t) => t.remove());
  const byNode = {};
  for (const p of r.pieces) {
    const el = pieceEl(p.id);
    el.classList.remove('movable', 'picked');
    el.style.opacity = '';
    el.onclick = null;
    if (p.node === START || p.node === HOME) { el.style.display = 'none'; continue; }
    if (p.owner === 'me') el.onclick = () => heroTip(p.id);
    (byNode[p.node] ||= []).push(p);
  }
  for (const [node, list] of Object.entries(byNode)) {
    list.forEach((p, i) => {
      const el = pieceEl(p.id);
      el.style.display = '';
      place(el, node, i);
      const badge = el.querySelector('.count');
      badge.hidden = i !== list.length - 1 || list.length < 2;
      badge.textContent = '×' + list.length;
    });
  }
  // 잡힐 위험 경고는 묶음의 맨 위 말에만
  const danger = threats(r);
  for (const p of r.pieces.filter((q) => q.owner === 'me')) {
    const warn = pieceEl(p.id).querySelector('.warn');
    const list = byNode[p.node] || [];
    if (warn) warn.hidden = !(danger[p.node] >= 0.15) || list[list.length - 1] !== p;
  }
  if (r.phase === 'move' && !G.busy) showOptions();
}

/** 돌발 사건 카드: 판 한가운데에 떨어졌다가 사라진다. 좋은 사건은 원정대가, 나쁜 사건은 도깨비가 들고 온다. */
async function eventCard(e) {
  if (e.good) Sound.big(); else Sound.boss();
  const who = e.good ? HEROES[(e.name.length + R().throwsLeft) % HEROES.length] : 'dokkaebiRed';
  const card = document.createElement('div');
  card.className = 'event-card' + (e.good ? '' : ' bad');
  card.innerHTML = `<div class="ev-head">돌발 사건</div>${character(who, 74, e.good ? 'cheer' : 'dance')}
    <div class="ev-name">${e.name}</div><div class="ev-desc">${e.desc}</div>`;
  $('#board').appendChild(card);
  flash(app);
  await tween(card, [
    { transform: 'translate(-50%, -50%) translateY(-160px) rotate(-14deg) scale(.6)', opacity: 0 },
    { transform: 'translate(-50%, -50%) translateY(10px) rotate(3deg) scale(1.04)', opacity: 1, offset: 0.6 },
    { transform: 'translate(-50%, -50%) rotate(-2deg) scale(1)', opacity: 1 }
  ], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
  const [x, y] = [card.offsetLeft + $('#board').offsetLeft, card.offsetTop + $('#board').offsetTop];
  FX.confetti(x, y - 40, e.good ? 26 : 10, 1.2);
  await sleep(1300);
  await tween(card, [
    { transform: 'translate(-50%, -50%) rotate(-2deg) scale(1)', opacity: 1 },
    { transform: 'translate(-50%, -50%) translateY(40px) rotate(6deg) scale(.8)', opacity: 0 }
  ], { duration: 280, easing: 'ease-in', fill: 'forwards' });
  card.remove();
}

/** 묶음(같은 칸에 업힌 말들)의 맨 위 말 요소 */
function topOf(node) {
  const ids = R().pieces.filter((p) => p.node === node).map((p) => p.id);
  return pieceEl(ids[ids.length - 1]);
}

/**
 * 둘 수 있는 수 표시: 움직일 말이 꿈틀대고, 도착 칸에 예상 점수와 잡힐 확률이 뜬다.
 * 수가 많으면(체스판) 말을 먼저 고르고 그 말의 수만 보여준다.
 */
function showOptions() {
  const moves = legalMoves(R()).map((m, i) => ({ ...m, i }));
  const groups = [...new Set(moves.map((m) => m.from))];
  const twoStep = moves.length > 6 && groups.length > 1;
  if (twoStep && !groups.includes(G.picked)) {
    const best = moves.reduce((a, b) => (b.preview.score.total > a.preview.score.total ? b : a));
    G.picked = best.from;
  }
  const shown = twoStep ? moves.filter((m) => m.from === G.picked) : moves;
  const best = Math.max(...shown.map((m) => m.preview.score.total));
  // 카메라: 움직일 말과 도착 칸이 모두 보이게
  const pts = shown.map((m) => nodeXY(m.preview.dest === HOME ? (B().entry || m.from) : m.preview.dest));
  for (const g of groups) if (g !== START) pts.push(nodeXY(g));
  if (groups.includes(START) && B().entry) pts.push(nodeXY(B().entry));
  Camera.frame(pts, { maxZoom: 1 });
  drawZoom();

  for (const g of groups) {
    if (g === START) continue;
    const el = topOf(g);
    el.classList.add('movable');
    if (twoStep && g === G.picked) el.classList.add('picked');
    el.onclick = () => {
      if (twoStep && g !== G.picked) { Sound.click(); G.picked = g; syncPieces(); drawTrays(); return; }
      const only = moves.filter((m) => m.from === g);
      if (only.length === 1) doMove(only[0].i);
    };
  }

  for (const m of shown) {
    const pv = m.preview;
    const dest = pv.dest === HOME ? (B().entry || m.path[m.path.length - 2] || m.from) : pv.dest;
    const [x, y] = nodeXY(dest);
    // 도착 고리는 말보다 아래 층, 점수 라벨은 따로 맨 위 층에(클릭은 고리가 받는다)
    const t = document.createElement('div');
    t.className = 'target';
    t.style.left = x + 'px';
    t.style.top = y + 'px';
    t.style.zIndex = depth(y) - 1;
    const label = pv.dest === HOME ? '골인 ' : pv.captured ? '잡기 ' : pv.treasure ? '보따리 ' : pv.joined ? '업기 ' : pv.boardTile ? pv.boardTile.name + ' ' : '';
    const risk = pv.dest === HOME ? '' : pv.danger >= 0.05
      ? `<i class="risk">${Math.round(pv.danger * 100)}%</i>`
      : '<i class="risk safe">안전</i>';
    const tag = document.createElement('div');
    tag.className = 'target-tag';
    tag.style.left = x + 'px';
    tag.style.top = y + 'px';
    tag.style.zIndex = 600 + depth(y);
    tag.innerHTML = `<span class="gain ${pv.score.total === best ? 'hot' : ''}">${label}+${pv.score.total}${risk}</span>`;
    t.onclick = () => doMove(m.i);
    $('#layer').append(t, tag);
  }
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
    <div class="tray"><span class="label">대기</span>${minis || '<span class="label">—</span>'}</div>
    <div class="tray"><span class="label">도깨비 대기 ${oppWait}</span><span class="label">골인</span><b style="font-family:var(--display);font-size:20px">${home}/${mine.length}</b></div>`;
  const ready = $('#trays [data-new]:not([data-new=""])');
  if (ready) ready.onclick = () => doMove(Number(ready.dataset.new));
}

function drawControls() {
  const r = R();
  const canThrow = !G.busy && r.phase === 'throw';
  const tb = $('#throw');
  tb.disabled = !canThrow;
  tb.textContent = r.extra > 0 && r.phase === 'throw' ? '한 번 더!' : B().rollName;
  tb.classList.toggle('yellow', r.extra > 0 && r.phase === 'throw');
  tb.style.fontSize = '24px';
  const rb = $('#reroll');
  rb.disabled = G.busy || r.phase !== 'move' || r.rerolls <= 0;
  rb.innerHTML = `다시 굴리기<br><span style="font-family:var(--display);font-size:20px">×${r.rerolls}</span>`;
  const used = G.throwsMax - r.throwsLeft;
  drawOmen();
  $('#pips').innerHTML = Array.from({ length: G.throwsMax }, (_, i) => `<i class="${i < used ? 'used' : ''}"></i>`).join('') +
    Array.from({ length: r.extra }, () => '<i class="extra"></i>').join('');
  const many = r.phase === 'move' && legalMoves(r).length > 6;
  $('#hint').textContent = G.busy ? '' : r.phase === 'move'
    ? (many ? '말을 눌러 고르고, 노란 칸을 누르세요 — %는 잡힐 확률' : '노란 칸을 누르세요 — 숫자는 예상 점수, %는 잡힐 확률')
    : r.phase === 'throw' ? `남은 기회 ${r.throwsLeft}번${r.extra ? ` + 한 번 더 ${r.extra}` : ''}` : '';
}

function drawCharms(container = $('#charms'), inShop = false) {
  const ids = G.run.charms;
  container.innerHTML = Array.from({ length: MAX_CHARMS }, (_, i) =>
    ids[i] ? `<div class="charm" data-i="${i}" title="${charmById(ids[i]).name}">${charmCard(ids[i])}</div>` : '<div class="slot"></div>').join('');
  container.querySelectorAll('.charm').forEach((el) => { el.onclick = () => charmTip(Number(el.dataset.i), inShop); });
}

/** 내 말을 누르면 그 캐릭터의 능력을 보여준다. */
function heroTip(pieceId) {
  if (G.busy) return;
  const h = heroOf(pieceId);
  if (!h) return;
  Sound.click();
  app.querySelector('.tip')?.remove();
  const tip = document.createElement('div');
  tip.className = 'tip';
  const used = h.escape && R().escapeUsed ? ' (이번 라운드엔 이미 썼다)' : '';
  tip.innerHTML = `<div style="display:flex;gap:10px;align-items:center">${character(kindOf(pieceId), 52)}
    <div><b>${h.name} · ${h.skill}</b><p style="margin:4px 0 0">${h.desc}${used}</p></div></div>
    <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn small white" data-a="close">닫기</button></div>`;
  app.appendChild(tip);
  tip.querySelector('[data-a]').onclick = () => tip.remove();
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
      if (inShop) { openShop(); return; }
      R().charms = G.run.charms.slice();
      R().pFlat = pFlatOf(G.run);
      drawTop(); drawCharms();
      if (R().phase === 'move') syncPieces();
    };
  });
}

// ── 보따리 ───────────────────────────────────────────────────

function drawBundles() {
  $('#layer').querySelectorAll('.bundle').forEach((b) => b.remove());
  for (const t of R().treasures) addBundle(t.node, t.ttl);
}

function addBundle(node, ttl) {
  const b = document.createElement('div');
  b.className = 'bundle';
  b.dataset.node = node;
  b.style.animation = 'none';
  b.innerHTML = bundle(34) + `<span class="ttl">${ttl}</span>`;
  const [x, y] = nodeXY(node);
  b.style.left = x + 'px';
  b.style.top = y - 6 + 'px';
  b.style.zIndex = depth(y) - 1;
  $('#layer').appendChild(b);
  return b;
}

// ── 조작 ─────────────────────────────────────────────────────

async function onThrow() {
  if (G.busy || R().phase !== 'throw') return;
  Sound.unlock();
  G.picked = null;
  await play(throwYut(R(), G.run.rng));
}

async function onReroll() {
  if (G.busy || R().phase !== 'move' || R().rerolls <= 0) return;
  G.picked = null;
  await play(reroll(R(), G.run.rng));
}

async function doMove(i) {
  if (G.busy || R().phase !== 'move') return;
  Sound.click();
  G.picked = null;
  await play(applyMove(R(), i, G.run.rng));
}

// ── 이벤트 연출 ──────────────────────────────────────────────

async function play(events) {
  G.busy = true;
  app.querySelector('.tip')?.remove();
  drawControls();
  $('#layer').querySelectorAll('.target, .target-tag').forEach((t) => t.remove());
  $('#layer').querySelectorAll('.piece').forEach((el) => { el.classList.remove('movable', 'picked'); el.onclick = null; });
  for (const e of events) {
    const h = HANDLERS[e.type];
    if (h) await h(e);
  }
  G.busy = false;
  if (R().phase === 'over') { await roundOver(); return; }
  if (R().phase === 'throw') { frameAction(); drawZoom(); }
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

/** 결과 도장의 색: 등급이 높을수록 뜨겁게 */
const TIER_COLOR = { [-1]: 'ink', 1: 'white', 2: 'green', 3: 'blue', 4: '', 5: 'yellow' };

/** 이동 경로를 한 칸씩 뛴다. 업힌 말은 같이 뛴다. 체스 미끄러짐은 낮게, 나이트는 높게. */
async function travel(e) {
  const els = e.pieceIds.map(pieceEl);
  const board = B();
  const first = e.path[0] === HOME ? (board.entry || e.from) : e.path[0];
  let prev;
  Camera.follow(nodeXY(e.from === START ? first : e.from), 300);
  if (e.from === START) {
    // 등장: 하늘에서 첫 칸으로 떨어진다
    els.forEach((el, lvl) => { el.style.display = ''; place(el, first, lvl); el.querySelector('.count').hidden = true; });
    G.lastLand = first;
    if (e.who === 'me') Sound.drop(); else Sound.step(0);
    await Promise.all(els.map((el) => drop(el, { height: 150, duration: 440 })));
    FX.dust(...nodeApp(first), 7);
    prev = nodeXY(first);
    e = { ...e, path: e.path.slice(1) };
  } else {
    prev = nodeXY(e.from);
  }
  els.forEach((el) => act(el, 'walk'));
  const jumpy = board.id === 'chess' && e.roll?.value === 'knight';
  for (let k = 0; k < e.path.length; k++) {
    const node = e.path[k];
    const warpLeg = e.warp && k === e.path.length - 1;
    const target = node === HOME ? (board.entry || e.path[k - 1] || e.from) : node;
    const to = nodeXY(target);
    G.lastLand = target;
    const height = warpLeg ? 150 : jumpy ? 70 : board.id === 'chess' ? 12 : 26;
    const duration = warpLeg ? 700 : jumpy ? 420 : board.id === 'chess' ? 150 : 190;
    if (warpLeg) { Sound.whoosh(); FX.pow(...nodeApp(e.path[k - 1]), '비행기!', '#2F6BD8', '#FFFDF7'); }
    Camera.follow(to, warpLeg ? 650 : duration + 40);
    await Promise.all(els.map((el, lvl) => {
      face(el, to[0] - prev[0]);
      place(el, target, lvl);
      return hop(el, [prev[0], prev[1]], to, { height, duration });
    }));
    Sound.step(k);
    if (k === e.path.length - 1 || warpLeg || jumpy) FX.dust(...nodeApp(target), warpLeg || jumpy ? 8 : 4);
    prev = to;
  }
  els.forEach((el) => act(el, 'idle'));
  if (e.path[e.path.length - 1] === HOME) {
    els.forEach((el) => act(el, 'dance'));
    // 골인: 높이 뛰어 사라진다
    await Promise.all(els.map((el) => tween(el, [
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(-70px) scale(1.15) rotate(-10deg)', opacity: 1, offset: 0.5 },
      { transform: 'translateY(-120px) scale(.3) rotate(20deg)', opacity: 0 }
    ], { duration: 520, easing: 'ease-out', fill: 'forwards' })));
    els.forEach((el) => { el.style.display = 'none'; });
  }
}

const HANDLERS = {
  async throw(e) {
    clearStamp();
    hideCalc();
    Sound.toss(B().roller);
    const anim = Roller.animate($('#roller'), B(), e.roll, e.who);
    setTimeout(() => Sound.clatter(B().roller), B().roller === 'sticks' ? 380 : 450);
    await anim;
    const extra = e.bonus ? (B().roller === 'dice' ? '더블! 한 번 더' : '한 번 더!') : e.rerolled ? '다시 굴렸다' : '';
    if (e.who === 'opp') {
      stampText('도깨비 ' + e.roll.label, 'ink opp');
      await sleep(420);
      return;
    }
    stampText(e.roll.label + '!', TIER_COLOR[e.roll.tier] ?? '', extra);
    if (e.bonus) FX.sparkle($('#sticks').offsetLeft + $('#sticks').offsetWidth - 70, $('#sticks').offsetTop + 40, 8, '#F2B33D');
    await sleep(380);
  },
  async noMove(e) {
    toast(e.who === 'opp' ? '도깨비가 움직일 수 없다' : e.why === 'boss' ? '도깨비 대장: 약한 수는 무효!' : '움직일 말이 없다');
    await sleep(700);
  },
  async oppTurn() {
    toast('도깨비 차례');
    await sleep(380);
  },
  async move(e) { await travel(e); },
  async capture(e) {
    const at = nodeApp(e.node);
    // 타격의 순간: 화면이 번쩍이고 잠깐 멈춘다
    Sound.capture();
    flash(app);
    e.attackerIds?.forEach((id) => { squish(pieceEl(id), 0.55); act(pieceEl(id), 'cheer', 1100); });
    e.victimIds.forEach((id) => act(pieceEl(id), 'sad'));
    await sleep(110);
    FX.ring(...at);
    FX.stars(...at, 9);
    FX.pow(at[0], at[1] - 46, e.who === 'me' ? '퍽! 잡았다' : '앗, 잡혔다', e.who === 'me' ? '#F2B33D' : '#E0533D', e.who === 'me' ? '#22201D' : '#FFFDF7');
    shake($('#board'), 9, 420);
    if (e.who === 'opp') Sound.caught();
    const dir = nodeXY(e.node)[0] < canvasSize().w / 2 ? -1 : 1;
    await Promise.all(e.victimIds.map((id) => { const el = pieceEl(id); el.style.display = ''; return knockOut(el, dir); }));
    e.victimIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; act(el, 'idle'); });
  },
  async stack(e) {
    Sound.stack();
    const ids = e.pieceIds;
    // 아래에 있던 말이 눌렸다가 튀고, 탑으로 다시 쌓인다
    ids.forEach((id, lvl) => { const el = pieceEl(id); el.style.display = ''; place(el, e.node, lvl); });
    ids.forEach((id) => act(pieceEl(id), 'cheer', 900));
    await squish(pieceEl(ids[0]), 0.6);
    const [x, y] = nodeApp(e.node);
    FX.sparkle(x, y - 30, 8);
    FX.pow(x, y - 40 - ids.length * STACK_STEP, `업었다 ×${ids.length}`, '#FFFDF7', '#22201D', 8);
    await sleep(300);
  },
  async home(e) {
    Sound.home();
    const at = nodeApp(G.lastLand || B().entry);
    FX.confetti(at[0], at[1] - 20, 30);
    FX.pow(at[0], at[1] - 60, e.who === 'opp' ? '도깨비 골인' : `골인! ×${e.pieceIds.length}`, e.who === 'opp' ? '#2F6BD8' : '#3E9B6A', '#FFFDF7');
    if (e.who === 'opp' && e.throwsLost) {
      Sound.penalty();
      toast(`도깨비 골인 — 던질 기회 −${e.throwsLost}`);
      $('#pips').classList.add('hurt');
      G.throwsMax = Math.max(G.throwsMax - e.throwsLost, R().throwsLeft);
      setTimeout(() => $('#pips')?.classList.remove('hurt'), 600);
      drawControls();
    }
    await sleep(560);
  },
  async coin(e) {
    Sound.coin();
    await coinsFly(nodeApp(e.node), e.amount);
  },
  async trap(e) {
    toast('덫에 걸린 도깨비!');
    Sound.capture();
    await Promise.all(e.pieceIds.map((id) => knockOut(pieceEl(id), 1)));
    e.pieceIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; });
  },
  async score(e) {
    const last = R().pieces.find((p) => p.owner === 'me' && p.node !== START && p.node !== HOME);
    await animateScore(e);
    if (e.total >= e.target * 0.3) {
      Sound.big();
      stampText('대박!', 'yellow', `+${e.total.toLocaleString()}`);
      R().pieces.filter((p) => p.owner === 'me').forEach((p) => act(pieceEl(p.id), 'dance', 1600));
      shake($('#board'), 10, 500);
      const sb = $('#score').getBoundingClientRect(), ab = app.getBoundingClientRect(), k = sb.width / $('#score').offsetWidth;
      FX.confetti((sb.left - ab.left) / k + 80, (sb.top - ab.top) / k + 30, 40, 1.4);
      await sleep(600);
    }
    void last;
  },
  async heung(e) {
    Sound.heung(e.value);
    drawHeung(null, e.value);
    const pip = $('#heung').querySelectorAll('.pips i')[e.value - 1];
    if (pip) tween(pip, [{ transform: 'scale(1)' }, { transform: 'scale(1.6) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 360 });
    if (e.value >= HEUNG_MAX) toast('흥이 넘친다! 배수 +5');
    await sleep(260);
  },
  async heungLost(e) {
    Sound.heungLost();
    toast(e.why === 'trap' ? `함정! 흥이 꺼졌다 (배수 +${e.value} 사라짐)` : `흥이 꺼졌다… (배수 +${e.value} 사라짐)`);
    drawHeung('lost', 0);
    shake($('#heung'), 6, 400);
    await sleep(480);
  },
  async treasureSpawn(e) {
    Sound.bundle();
    const b = addBundle(e.node, e.ttl);
    b.style.animation = '';
    await drop(b, { height: 120, duration: 420 });
    FX.dust(...nodeApp(e.node), 5);
  },
  async treasureGone(e) {
    const b = $('#layer').querySelector(`.bundle[data-node="${e.node}"]`);
    if (b) { Sound.bundleGone(); await tween(b, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 320, fill: 'forwards' }); b.remove(); }
  },
  async treasureTake(e) {
    const b = $('#layer').querySelector(`.bundle[data-node="${e.node}"]`);
    const at = nodeApp(e.node);
    if (b) { tween(b, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.8) rotate(20deg)', opacity: 0 }], { duration: 380, fill: 'forwards' }).then(() => b.remove()); }
    FX.stars(at[0], at[1] - 10, 6);
    if (e.who === 'me') { Sound.coin(); await coinsFly(at, TREASURE_COINS); }
    else { Sound.penalty(); FX.pow(at[0], at[1] - 40, '보따리를 뺏겼다', '#E0533D', '#FFFDF7'); await sleep(400); }
  },
  async keyCard(e) {
    Sound.bundle();
    const card = document.createElement('div');
    card.className = 'key-card';
    card.innerHTML = `<div class="k">황금열쇠</div><b>${e.card.name}</b><span>${e.card.desc}</span>`;
    app.appendChild(card);
    await tween(card, [
      { transform: 'translate(-50%,-50%) rotateY(90deg) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%,-50%) rotateY(0) scale(1.06)', opacity: 1, offset: 0.6 },
      { transform: 'translate(-50%,-50%) rotateY(0) scale(1)', opacity: 1 }
    ], { duration: 420 });
    await sleep(900);
    tween(card, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-70%)' }], { duration: 260, fill: 'forwards' }).then(() => card.remove());
    if (e.bonus) { drawScore(e.score); Sound.score(); }
    if (e.card.id === 'coins') { Sound.coin(); await coinsFly(nodeApp(e.node), 3); }
    if (e.card.id === 'heung') drawHeung(null, e.heung);
    if (e.victimIds?.length) {
      Sound.capture();
      await Promise.all(e.victimIds.map((id) => knockOut(pieceEl(id), 1)));
      e.victimIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; });
    }
  },
  async escape(e) {
    const at = nodeApp(e.node);
    Sound.whoosh();
    FX.pow(at[0], at[1] - 50, '토끼의 꾀!', '#FFFDF7', '#E0533D', 6);
    FX.sparkle(at[0], at[1] - 20, 10, '#F2B33D');
    e.pieceIds.forEach((id) => { const el = pieceEl(id); el.style.display = ''; squish(el, 0.7); act(el, 'cheer', 1200); });
    e.attackerIds.forEach((id) => act(pieceEl(id), 'sad'));
    await sleep(260);
    await Promise.all(e.attackerIds.map((id) => knockOut(pieceEl(id), nodeXY(e.node)[0] < canvasSize().w / 2 ? -1 : 1)));
    e.attackerIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; act(el, 'idle'); });
    toast('토끼가 꾀를 내어 도깨비를 출발로 돌려보냈다');
  },
  async event(e) {
    await eventCard(e);
  },
  async goldRush(e) {
    drawBoard();
    Sound.coin();
    for (const n of e.nodes) { const [x, y] = nodeApp(n); FX.sparkle(x, y - 10, 10, '#F2B33D'); FX.ring(x, y); }
    toast('황금 칸이 생겼다 — 멈추면 배수 +2');
    await sleep(700);
  },
  async gust(e) {
    Sound.whoosh();
    shake($('#board'), 6, 500);
    if (!e.pieceIds.length) { toast('바람만 시원하게 불었다'); await sleep(500); return; }
    await Promise.all(e.pieceIds.map((id, i) => sleep(i * 90).then(() => { act(pieceEl(id), 'sad'); return knockOut(pieceEl(id), i % 2 ? 1 : -1); })));
    e.pieceIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; act(el, 'idle'); });
    toast(`도깨비 ${e.pieceIds.length}마리가 출발로 날아갔다`);
    await sleep(400);
  },
  async tailwind() {
    Sound.home();
    G.throwsMax += 1;
    drawControls();
    tween($('#pips'), [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 420 });
    await sleep(500);
  },
  async eventCoins(e) {
    Sound.coin();
    const b = $('#board');
    await coinsFly([b.offsetLeft + b.offsetWidth / 2, b.offsetTop + b.offsetHeight / 2], e.amount);
  },
  async again() { await sleep(120); },
  async roundOver() { /* play() 이 끝난 뒤 처리 */ }
};

/** 엽전이 날아가 위쪽 엽전 표시에 꽂힌다. */
async function coinsFly(from, n) {
  const pill = $('#coinPill');
  if (!pill) return;
  const pb = pill.getBoundingClientRect(), ab = app.getBoundingClientRect(), k = pb.width / pill.offsetWidth;
  const to = [(pb.left - ab.left) / k + 20, (pb.top - ab.top) / k + 16];
  const flights = [];
  for (let i = 0; i < Math.min(6, n); i++) {
    const c = document.createElement('div');
    c.className = 'fly-coin';
    c.innerHTML = coin(22);
    $('#fx').appendChild(c);
    flights.push(fly(c, [from[0] + (Math.random() - 0.5) * 20, from[1] - 20], to, { duration: 560, arc: 90, delay: i * 70 }));
  }
  await Promise.all(flights);
  tween(pill, [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 260 });
}

function hideCalc() { $('#calc')?.classList.remove('show'); $('#score')?.classList.remove('calcing'); }

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
    tween(target, [{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-3deg)' }, { transform: 'scale(1)' }], { duration: 280 });
    if (line.chips != null) Sound.chip(step); else Sound.mult(step);
    const ci = G.run.charms.findIndex((id) => charmById(id).name === line.src);
    if (ci >= 0) {
      const card = $('#charms').querySelector(`[data-i="${ci}"]`);
      if (card) tween(card, [{ transform: 'translateY(0)' }, { transform: 'translateY(-14px) scale(1.12) rotate(-4deg)' }, { transform: 'translateY(0)' }], { duration: 420 });
    }
    showSrc(line.src, target);
    step++;
    await sleep(line === e.lines[0] ? 240 : 270);
  }
  Sound.score();
  const from = e.score - e.total;
  const t0 = performance.now(), dur = 420;
  await new Promise((done) => {
    const id = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      drawScore(Math.round(from + e.total * (1 - (1 - k) ** 3)));
      if (k >= 1) { clearInterval(id); done(); }
    }, 16);
  });
  tween($('#scoreNow'), [{ transform: 'scale(1)' }, { transform: 'scale(1.18) rotate(-3deg)' }, { transform: 'scale(1)' }], { duration: 320 });
  await sleep(200);
}

function showSrc(text, anchor) {
  const s = document.createElement('div');
  const box = $('#score').getBoundingClientRect(), a = anchor.getBoundingClientRect();
  const k = box.width / $('#score').offsetWidth;
  s.style.cssText = `position:absolute;left:${(a.left - box.left + a.width / 2) / k}px;top:${(a.top - box.top) / k}px;` +
    'transform:translate(-50%,-22px);font-size:11.5px;font-weight:800;color:var(--ink-2);white-space:nowrap;pointer-events:none';
  s.textContent = text;
  $('#score').appendChild(s);
  tween(s, [{ opacity: 0, transform: 'translate(-50%,-14px)' }, { opacity: 1, transform: 'translate(-50%,-24px)', offset: 0.3 }, { opacity: 0, transform: 'translate(-50%,-40px)' }], { duration: 900 }).then(() => s.remove());
}

// ── 라운드 앞뒤 ──────────────────────────────────────────────

function sheet(html) {
  closeSheet();
  app.insertAdjacentHTML('beforeend', `<div class="sheet-back"></div><div class="sheet">${html}</div>`);
  return app.querySelector('.sheet');
}
function closeSheet() { app.querySelectorAll('.sheet, .sheet-back').forEach((n) => n.remove()); }

/** 새 판에 들어설 때: 판이 미끄러져 들어오고, 이동 방식을 알려준다. */
function boardIntro() {
  const b = B();
  tween($('#board'), [
    { transform: 'translateY(60px) scale(.85) rotate(-4deg)', opacity: 0 },
    { transform: 'translateY(-8px) scale(1.02)', opacity: 1, offset: 0.7 },
    { transform: 'translateY(0) scale(1)' }
  ], { duration: 650, easing: 'cubic-bezier(.3,.7,.4,1)' });
  Sound.whoosh();
  const s = sheet(`
    <span class="kind">새 판</span>
    <h2 style="margin-top:8px">${b.name}</h2>
    <p>${b.blurb}</p>
    <div class="board-preview"><div class="roller-mini" id="mini"></div>
      <div style="font-size:13px;font-weight:700;line-height:1.5">${b.id === 'chess' ? '폰·킹은 짧게, 비숍·룩·퀸은 미끄러지듯, 나이트는 뛰어넘는다' : b.id === 'marble' ? '축제·보물섬·황금열쇠 칸을 노리고 함정은 피하라' : '모서리와 가운데에 멈추면 지름길을 탄다'}</div></div>
    <div class="row"><button class="btn" id="go">좋아!</button></div>`);
  Roller.idle(s.querySelector('#mini'), b);
  s.querySelector('#go').onclick = () => { Sound.click(); roundIntro(); };
}

function roundIntro() {
  const r = R();
  const boss = r.boss ? `<div class="boss-card">${character('dokkaebiRed', 56)}<div><b>도깨비 대장 — ${r.boss.name}</b><span>${r.boss.desc}</span></div></div>` : '';
  const s = sheet(`
    <h2>${r.number}라운드 · ${B().name}</h2>
    <p>기회 <b>${r.throwsLeft}번</b> 안에 <b>${r.target.toLocaleString()}점</b>을 넘겨라. 도깨비 ${r.pieces.filter((p) => p.owner === 'opp').length}마리가 같은 판을 돈다.</p>
    <div class="legend">
      <div>${character('dokkaebiRed', 34)}<span><b>빨간 도깨비</b><br>내 말을 잡으러 온다</span></div>
      <div>${character('dokkaebiBlue', 34)}<span><b>파란 도깨비</b><br>골인하면 기회 −1</span></div>
    </div>
    <p style="font-size:12.5px">잡기·업기·골인·보따리로 <b>흥</b>이 오르면 모든 이동에 배수가 붙는다. 내 말이 잡히면 흥이 꺼진다.</p>
    <div class="mini-roster">${HERO_SKILLS.map((h, i) => `<div>${character(HEROES[i], 34)}<span>${h.skill}</span></div>`).join('')}</div>
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
    FX.confetti(app.clientWidth / 2, 300, 50, 1.6);
    await sleep(1200);
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
    shake(app, 8, 500);
    await sleep(1100);
    settleRound(G.run);
    gameOver();
  }
}

function openShop() {
  const run = G.run;
  const next = run.rounds[run.roundNo];
  const nextBoard = BOARDS[next.board];
  const art = (o) => o.kind === 'charm' ? charmCard(o.id) : o.kind === 'tile' ? tileArt(o.id) : stickArt(o.id);
  const info = (o) => {
    if (o.kind === 'charm') { const c = charmById(o.id); return { kind: '부적', name: c.name, desc: c.desc }; }
    if (o.kind === 'tile') { const t = TILES.find((x) => x.id === o.id); return { kind: '칸 개조', name: t.name, desc: `${t.desc} (${nextBoard.name})` }; }
    const st = STICKS.find((x) => x.id === o.id);
    return { kind: '윷가락', name: st.name, desc: st.desc + (run.stick ? ' (지금 윷과 바꾼다)' : '') };
  };
  const s = sheet(`
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h2>장터</h2><span class="pill">${coin()} ${run.coins}</span>
    </div>
    <p>다음은 ${run.roundNo + 1}라운드 · <b>${nextBoard.name}</b> · 목표 ${next.target.toLocaleString()}점${next.boss ? ' · <b style="color:var(--red)">도깨비 대장</b>' : ''}</p>
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
      if (res.node) toast(`${BOARDS[res.board].name}에 새 칸이 놓였다`);
      drawTop();
      openShop();
    };
  });
  s.querySelector('#rr').onclick = () => { if (rerollShop(run).ok) { Sound.coin(); drawTop(); openShop(); } };
  s.querySelector('#next').onclick = () => {
    Sound.click();
    closeSheet();
    nextRound(run);
    enterRound();
  };
}

function gameOver() {
  const run = G.run;
  const s = sheet(`
    <h2>판이 뒤집혔다</h2>
    <p>${run.roundNo}라운드(${B().name})에서 ${R().score.toLocaleString()}점 — 목표 ${R().target.toLocaleString()}점에 못 미쳤다.</p>
    <div class="cast" style="justify-content:center;margin:10px 0 4px">${HEROES.map((k) => character(k, 56, 'sad')).join('')}${character('dokkaebiRed', 56, 'dance')}</div>
    <div class="payout">
      <div><span>버틴 라운드</span><b>${run.roundNo - 1} / ${run.rounds.length}</b></div>
      <div><span>한 번에 가장 많이 번 점수</span><b>${R().lastMoveBest.toLocaleString()}</b></div>
      <div><span>모은 부적</span><b>${run.charms.length ? run.charms.map((id) => charmById(id).name).join(', ') : '없음'}</b></div>
      <div><span>시드</span><b>${run.seed}</b></div>
    </div>
    <div class="row"><button class="btn white" id="title">처음으로</button><button class="btn" id="again">다시 한 판</button></div>`);
  s.querySelector('#title').onclick = () => { closeSheet(); title(); };
  s.querySelector('#again').onclick = () => {
    closeSheet();
    G.run = createRun(Date.now() & 0x7fffffff);
    G.boardId = null;
    startRound(G.run);
    enterRound();
  };
}

function victory() {
  const run = G.run;
  FX.confetti(app.clientWidth / 2, 400, 80, 2);
  const s = sheet(`
    <h2>${GAME_TITLE.main} ${GAME_TITLE.accent}, 귀환!</h2>
    <p>${run.board ? `${B().name}을 되찾았다` : '윷판·주사위판·체스판을 모두 넘겼다'}. 마지막 점수 ${R().score.toLocaleString()}점.</p>
    <div class="cast" style="justify-content:center;margin:16px 0 4px">${HEROES.map((k) => character(k, 64, 'dance')).join('')}</div>
    <div class="payout">
      <div><span>모은 부적</span><b>${run.charms.map((id) => charmById(id).name).join(', ') || '없음'}</b></div>
      <div><span>시드</span><b>${run.seed}</b></div>
    </div>
    <div class="row"><button class="btn" id="again">다시 한 판</button></div>`);
  s.querySelector('#again').onclick = () => { closeSheet(); title(); };
}

// ── 시작 ─────────────────────────────────────────────────────

// 화면 틀: 세로(폰) 390×844 고정, 가로가 긴 창(PC)에서는 높이 780 에 창 비율만큼 넓힌다.
const PHONE = { w: 390, h: 844 };
const WIDE_H = 780;
const isWide = () => document.body.classList.contains('wide');

function fit() {
  const W = window.innerWidth, H = window.innerHeight;
  const wide = W / H >= 1.15 && W >= 820;
  const was = isWide();
  document.body.classList.toggle('wide', wide);
  const sh = wide ? WIDE_H : PHONE.h;
  const sw = wide ? Math.round(Math.min(1800, Math.max(1100, (W / H) * sh))) : PHONE.w;
  const k = wide ? Math.min(H / sh, W / sw) : Math.min(1, H / sh, W / sw);
  const root = document.documentElement.style;
  root.setProperty('--sw', sw + 'px');
  root.setProperty('--sh', sh + 'px');
  const stage = document.getElementById('stage');
  stage.style.transform = `scale(${k})`;
  stage.style.marginBottom = sh * (k - 1) + 'px';
  // 판 화면 크기가 바뀌었으니 카메라를 다시 맞춘다
  if (G.run && $('#board')) { if (was !== wide) Camera.overview(0); else Camera.refit(); drawZoom(); }
}
window.addEventListener('resize', fit);
fit();

document.addEventListener('pointerdown', () => Sound.unlock());
document.addEventListener('keyup', (e) => {
  if (!G.run || !R() || G.busy || app.querySelector('.sheet')) return;
  if (e.key === ' ' || e.key === 'Enter') onThrow();
  if (e.key === 'r') onReroll();
});

// 개발 중 콘솔 확인용
window.__yut = { get run() { return G.run; } };

title();
