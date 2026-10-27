// 화면 컨트롤러. 규칙은 core 가 전부 처리하고, 여기서는 core 가 돌려준 이벤트를 차례로 연출한다.
//   board-view  아이소메트릭 노선도와 말 위치
//   roller3d    3D 열차 주사위 (roller 는 three.js 를 못 불러왔을 때의 2D 대체)
//   anim / fx   점프·찌그러짐·날려 보내기 / 먼지·폭죽·스티커

import { createRun, startRound, settleRound, nextRound, buy, sellCharm, moveCharm, rerollShop, dailySeed, DAYS, MAX_CHARMS, SHOP_REROLL_COST } from '../core/run.js';
import {
  depart, reroll, applyMove, legalMoves, threats, boardFor, nextEventAt, useSkill, skillBlocked,
  placeBlockade, blockadeBlocked, timeOf, minutesLeft, hhmm, CLOCK, BLOCKADE, HEUNG_MAX, TREASURE_COINS, METRO
} from '../core/round.js';
import { START, HOME } from '../core/board.js';
import { TILES, BOSS_RULES, CLOSURE_RULE, LINE_PASS, charmById } from '../core/items.js';
import { BOARDS } from '../core/boards/index.js';
import { HEROES as HERO_SKILLS, heroOf } from '../core/heroes.js';
import { character, act, face, kindOf, charmCard, tileArt, lineArt, coin, HEROES, bundle, tape, traitBadge } from './art.js';
import { useBoard, boardSvg, nodeXY, depth, pieceSize, canvasSize } from './board-view.js';
import * as Camera from './camera.js';
import { sleep, tween, hop, drop, knockOut, squish, shake, flash, fly } from './anim.js';
import * as FX from './fx.js';
import * as Roller from './roller.js';
import * as Roller3D from './roller3d.js';
import * as Records from './records.js';
import { Sound } from './sound.js';

// 게임 이름은 여기 한 곳에서만 바꾼다
export const GAME_TITLE = { main: '도깨비', accent: '노선도', sub: '막차 전에 손님을 실어 나르고, 도깨비 열차를 막아라' };

const app = document.getElementById('app');
const G = { run: null, busy: false, stampEl: null, picked: null, boardId: null, blockMode: false };
const $ = (sel) => app.querySelector(sel);
const R = () => G.run.round;
const B = () => boardFor(R());

const STACK_STEP = 21; // 함께 탄 말이 위로 쌓이는 높이
const TIME_NAME = { rush: '러시아워', night: '심야', last: '막차' };
const TIME_DESC = { rush: '손님이 많고 이동 칩 +50%', night: '안개가 짙다 — 먼 역은 ?', last: '막차 시간 — 골인 배수 +3' };
const dayLabel = (r) => (G.run.daily ? '오늘의 노선' : `${r.day}요일`);
const fmtLeft = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);

// ── 타이틀 ───────────────────────────────────────────────────

function title() {
  G.boardId = null;
  app.className = 'app';
  document.title = `${GAME_TITLE.main} ${GAME_TITLE.accent}`;
  const cards = HERO_SKILLS.map((h, i) => `
    <button class="hero-card" data-dex="${i}" style="animation-delay:${i * 90}ms">
      <div class="hero-art">${character(HEROES[i], 84)}</div>
      <div class="hero-txt"><b>${h.job} ${h.name}</b><span class="skill">${h.skill}</span><span class="skill act">스킬 · ${h.active.name}</span><p>${h.desc}</p></div>
    </button>`).join('');
  const today = new Date();
  app.innerHTML = `
    <div class="title2">
      <div class="title-lines" aria-hidden="true">${[1, 2, 3, 4, 5].map((id) => `<i style="--lc:${BOARDS.metro.lines[id].color}"></i>`).join('')}</div>
      <div class="title-boards" aria-hidden="true"><span class="tb tb2">${Roller.metroDieIcon()}</span></div>
      <div class="logo2"><span class="l1">${GAME_TITLE.main}</span><span class="l2">${GAME_TITLE.accent}</span></div>
      <div class="sub">${GAME_TITLE.sub}</div>
      <button class="my-rank" id="rankPill">${(() => { const m = Records.summary(); return `<b>${m.title.name}</b><span>누적 승점 ${m.total.toLocaleString()}</span><i>랭킹 보기 ›</i>`; })()}</button>
      <div class="roster-head"><b>원정대</b><span>카드를 누르면 자세히</span><button class="btn small white" id="dexBtn">캐릭터 도감</button></div>
      <div class="roster">${cards}</div>
      <button class="villain" data-dex="foes">${character('dokkaebiRed', 46)}<span>수·금요일엔 <b>도깨비 차장</b>이 노선을 어지럽힌다</span>${character('dokkaebiBlue', 46)}</button>
      <button class="btn" id="start" style="width:100%;height:62px;font-size:26px">5일 운행 시작<small class="btn-sub">월~금 · 날마다 새 노선도 · 06:00 첫차 → 24:00 막차</small></button>
      <button class="btn white daily-btn" id="daily"><b>오늘의 노선</b><span>${today.getMonth() + 1}월 ${today.getDate()}일 · 하루짜리 · 오늘은 누구나 같은 노선도</span></button>
    </div>`;
  // 3D 굴림 도구를 미리 불러 두고, 준비되면 타이틀 장식도 3D 그림으로 바꾼다
  Roller3D.load().then((ok) => {
    const el = app.querySelector('.title2 .tb2');
    if (!ok || !el) return;
    el.classList.add('as3d');
    Roller3D.still(el, BOARDS.metro, null);
  });
  app.querySelectorAll('[data-dex]').forEach((b) => { b.onclick = () => { Sound.unlock(); Sound.click(); dex(b.dataset.dex === 'foes' ? 'foes' : Number(b.dataset.dex)); }; });
  $('#dexBtn').onclick = () => { Sound.unlock(); Sound.click(); dex(0); };
  $('#rankPill').onclick = () => { Sound.unlock(); Sound.click(); ranking(); };
  $('#start').onclick = () => begin(false);
  $('#daily').onclick = () => begin(true);
}

// ── 랭킹(기기 안) ───────────────────────────────────────────

const MODE_NAME = { full: '5일 운행', daily: '오늘의 노선' };

function ranking() {
  app.className = 'app dex-app';
  const m = Records.summary();
  const t = m.title, next = t.next;
  const pct = next ? Math.min(100, Math.round((100 * (m.total - t.min)) / (next.min - t.min))) : 100;
  const date = (at) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const stop = (r) => r.cleared ? '완주' : r.mode === 'daily' ? '목표에 못 미침' : `${DAYS[r.reached - 1]?.day || ''}요일에 멈춤`;
  const rows = m.runs.length ? m.runs.map((r, i) => `
      <div class="rank-row ${i < 3 ? 'top' + (i + 1) : ''}">
        <span class="no">${i + 1}</span>
        <div class="what"><b>${MODE_NAME[r.mode] || '지난 기록'}</b><span>${stop(r)} · ${date(r.at)}</span></div>
        <b class="pts">${r.points.toLocaleString()}</b>
      </div>`).join('') : '<p class="rank-empty">아직 기록이 없다. 운행을 시작해 하루를 목표대로 마치면 승점이 쌓인다.</p>';
  app.innerHTML = `
    <div class="dex">
      <div class="dex-head"><button class="btn small white" id="dexBack">← 처음으로</button><b>랭킹</b></div>
      <div class="rank-me">
        <span class="kind">이 기기의 내 기록</span>
        <h3>${t.name}</h3>
        <div class="rank-total"><b>${m.total.toLocaleString()}</b><span>누적 승점 · ${m.plays || 0}번 운행</span></div>
        <div class="bar rank-bar"><i style="width:${pct}%"></i></div>
        <p>${next ? `${next.name}까지 ${(next.min - m.total).toLocaleString()}점` : '가장 높은 칭호에 올랐다'}</p>
      </div>
      <div class="rank-rule">하루 목표 달성 +10 · 보스 날 +10 · 목표 초과 10%마다 +1 · 남은 운행 1시간마다 +2 · 5일 완주 +100 (오늘의 노선은 절반)</div>
      <div class="rank-list">${rows}</div>
    </div>`;
  $('#dexBack').onclick = () => { Sound.click(); title(); };
}

// ── 캐릭터 도감 ─────────────────────────────────────────────

/** 도감에만 쓰는 소개 글. 규칙(능력·스킬 수치)은 core/heroes.js 에서 읽는다 */
const DEX_NOTES = {
  tiger: { line: '첫차를 모는 기관사', tip: '빨간 도깨비 열차가 내 말 뒤를 쫓아오면 경적으로 차고에 돌려보내자. 직접 들이받으면 돌파로 배수가 두 배가 된다.' },
  rabbit: { line: '발 빠른 역무원', tip: '추가 운행은 시간이 들지 않는 공짜 운행이다. 막차가 가까울 때 아껴 두면 한 번을 더 달린다. 안전 요원이 남아 있으면 토끼가 낀 묶음은 잡히지 않는다.' },
  parrot: { line: '목청 좋은 안내원', tip: '승객 호출로 손님을 불러 태우고, 앵무새가 직접 내려 주면 배달 보상이 두 배다.' },
  panda: { line: '든든한 보안관', tip: '여럿이 함께 타고 위험한 역에 섰을 때 스크린도어를 닫자. 판다가 낀 묶음은 함께 타기 배수도 두 배다.' }
};
const ACT_LABEL = { idle: '대기', walk: '걷기', cheer: '환호', sad: '좌절', dance: '춤' };

/** 도감 화면. which 는 원정대 번호(0~3) 또는 'foes'(도깨비) */
function dex(which = 0) {
  app.className = 'app dex-app';
  const tabs = HERO_SKILLS.map((h, i) => `<button class="dex-tab ${which === i ? 'on' : ''}" data-tab="${i}">${character(HEROES[i], 40)}<span>${h.name}</span></button>`).join('') +
    `<button class="dex-tab ${which === 'foes' ? 'on' : ''}" data-tab="foes">${character('dokkaebiRed', 40)}<span>도깨비</span></button>`;
  const stage = (kind) => `
    <div class="dex-stage">
      <div class="dex-floor"></div>
      <div class="dex-char">${character(kind, 210)}</div>
      <div class="dex-acts">${Object.entries(ACT_LABEL).map(([a, l]) => `<button class="${a === 'idle' ? 'on' : ''}" data-act="${a}">${l}</button>`).join('')}</div>
    </div>`;
  let body;
  if (which === 'foes') {
    body = `${stage('dokkaebiRed')}
      <div class="dex-info">
        <div class="dex-name"><b>도깨비 열차</b><span>종점 쪽 차고에서 거꾸로 달려오는 장난꾸러기들</span></div>
        <div class="dex-card"><div class="dex-row">${character('dokkaebiRed', 44)}<div><span class="kind">빨간 도깨비 · 사냥꾼</span><p>내 말을 들이받는 수를 가장 좋아한다. 잡히면 승객 만족도가 떨어지고, 그 말은 차고로 돌아가며 태운 손님도 내린다.</p></div></div></div>
        <div class="dex-card"><div class="dex-row">${character('dokkaebiBlue', 44)}<div><span class="kind">파란 도깨비 · 도망꾼</span><p>출발역까지 달아나는 걸 가장 좋아한다. 파란 도깨비가 끝까지 가면 운행이 ${CLOCK.delay}분 지연된다.</p></div></div></div>
        <div class="dex-card"><span class="kind">행선지 · 봉쇄</span><p>도깨비 열차 머리 위의 호선 표시는 다음 갈림길에서 탈 노선이다. 봉쇄 테이프를 친 역은 ${BLOCKADE.minutes / 60}시간 동안 지나가지 못한다.</p></div>
        <div class="dex-card boss"><span class="kind">도깨비 차장 — 수요일·금요일</span>
          <ul><li><b>${CLOSURE_RULE.name}</b>금요일엔 늘 — ${CLOSURE_RULE.desc}</li>${BOSS_RULES.map((b) => `<li><b>${b.name}</b>${b.desc}</li>`).join('')}</ul></div>
      </div>`;
  } else {
    const h = HERO_SKILLS[which], n = DEX_NOTES[h.id];
    body = `${stage(HEROES[which])}
      <div class="dex-info">
        <div class="dex-name"><b>${h.job} ${h.name}</b><span>${n.line} · ${which + 1}번째로 출발</span></div>
        <div class="dex-card"><span class="kind">능력 · 늘 켜져 있다</span><h3>${h.skill}</h3><p>${h.desc}</p></div>
        <div class="dex-card skill"><span class="kind">스킬 · 눌러서 쓴다</span><h3>${h.active.name}</h3><p>${h.active.desc}</p>
          <div class="dex-rule">하루 한 번 · 노선 위에 나와 있을 때 · 출발 전에</div>
          <button class="btn small yellow" id="dexSkill">스킬 연출 보기</button></div>
        <div class="dex-card tip"><span class="kind">이렇게 써 보자</span><p>${n.tip}</p></div>
      </div>`;
  }
  app.innerHTML = `
    <div class="dex">
      <div class="dex-head"><button class="btn small white" id="dexBack">← 처음으로</button><b>캐릭터 도감</b></div>
      <div class="dex-tabs">${tabs}</div>
      <div class="dex-body">${body}</div>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  $('#dexBack').onclick = () => { Sound.click(); title(); };
  app.querySelectorAll('.dex-tab').forEach((t) => { t.onclick = () => { Sound.click(); dex(t.dataset.tab === 'foes' ? 'foes' : Number(t.dataset.tab)); }; });
  const big = app.querySelector('.dex-char');
  app.querySelectorAll('.dex-acts button').forEach((b) => {
    b.onclick = () => {
      Sound.click();
      app.querySelectorAll('.dex-acts button').forEach((x) => x.classList.toggle('on', x === b));
      act(big, b.dataset.act);
      if (b.dataset.act === 'cheer' || b.dataset.act === 'dance') { const r = big.getBoundingClientRect(), a = app.getBoundingClientRect(), k = r.width / big.offsetWidth; FX.sparkle((r.left - a.left) / k + big.offsetWidth / 2, (r.top - a.top) / k + 40, 8, '#F2B33D'); }
    };
  });
  const sk = $('#dexSkill');
  if (sk) sk.onclick = async () => {
    if (sk.disabled) return;
    sk.disabled = true;
    Sound.unlock();
    const h = HERO_SKILLS[which];
    await skillCutin({ pieceId: 'm' + which, hero: h.id, name: h.active.name, desc: h.active.desc });
    act(big, 'cheer', 1200);
    sk.disabled = false;
  };
}

/** 운행 시작. daily 면 오늘의 노선(하루짜리, 날짜 시드) */
function begin(daily) {
  Sound.unlock(); Sound.click();
  const q = new URLSearchParams(location.search);
  const fixed = parseInt(q.get('seed'), 10);
  const seed = daily ? dailySeed() : Number.isNaN(fixed) ? (Date.now() & 0x7fffffff) : fixed;
  G.run = createRun(seed, { daily });
  // 개발·테스트용: ?day=3 이면 그 날(수요일)부터 시작한다
  const startAt = parseInt(q.get('day'), 10);
  if (!daily && startAt >= 1 && startAt <= DAYS.length) G.run.roundNo = startAt;
  startRound(G.run);
  enterRound();
}

// ── 게임 화면 골격 ───────────────────────────────────────────

function buildGame() {
  // 위: 요일·점수·만족도·운행 시계(hud) / 가운데: 노선도 / 아래: 원정대·출발·다시 굴리기·봉쇄·정기권(dock)
  app.innerHTML = `
    <div class="hud" id="hud">
      <div class="top" id="top"></div>
      <div class="scoreboard" id="score">
        <div class="score-row"><div class="score-now" id="scoreNow">0</div><div class="bar" id="bar"><i style="width:0%"></i></div><div class="score-goal">목표<b id="target">0</b></div></div>
        <div class="heung" id="heung"></div>
        <div class="clock" id="clock"></div>
        <div class="calc" id="calc"><div class="chips" id="chips">0</div><div class="x">×</div><div class="mult" id="mult">1</div></div>
      </div>
    </div>
    <div class="board-wrap" id="board"><div id="cam"><div id="mat"></div><div id="layer"></div></div>
      <div class="stamp-spot" id="stampSpot"></div><div class="roller-float" id="roller"></div>
      <div class="hint" id="hint"></div>
      <button class="btn small white zoom-btn" id="zoom" aria-label="전체 보기">전체</button></div>
    <div class="dock" id="dock">
      <div class="trays" id="trays"></div>
      <div class="controls">
        <div class="throw-wrap"><button class="btn main" id="throw">열차 출발</button></div>
        <div class="side"><button class="btn small white" id="reroll"></button><button class="btn small white" id="blockBtn"></button></div>
      </div>
      <div class="charms" id="charms"></div>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  wireGauge($('#throw'));
  $('#reroll').onclick = onReroll;
  $('#blockBtn').onclick = toggleBlockMode;
  $('#zoom').onclick = () => {
    Sound.click();
    if (Camera.zoomedIn()) Camera.overview(); else frameAction();
    drawZoom();
  };
}

function drawZoom() { const z = $('#zoom'); if (z) z.textContent = Camera.zoomedIn() ? '전체' : '확대'; }

/** 지금 볼만한 곳(내 말·도깨비·분실물)을 화면에 맞춘다. */
function frameAction() {
  const r = R();
  const pts = r.pieces.filter((p) => p.node !== START && p.node !== HOME).map((p) => nodeXY(p.node));
  for (const t of r.treasures) pts.push(nodeXY(t.node));
  pts.push(nodeXY(B().S));
  Camera.frame(pts, { maxZoom: 0.92 });
}

/** 하루를 시작할 때. 첫날에는 노선도 보는 법을 알려준다. */
function enterRound() {
  const r = R();
  const first = G.boardId !== r.boardId;
  G.boardId = r.boardId;
  G.blockMode = false;
  useBoard(B());
  buildGame();
  app.className = 'app game board-' + r.boardId;
  G.picked = null;
  clearStamp();
  hideCalc();
  Camera.attach($('#board'), $('#cam'), canvasSize());
  refresh();
  Camera.overview(0);
  drawZoom();
  if (first) boardIntro(); else roundIntro();
}

function refresh() {
  drawHeung();
  drawTop();
  drawScore(R().score);
  drawClock();
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
    <span class="pill">${dayLabel(r)}${G.run.daily ? '' : `<span class="phone-only"> · </span><span class="wide-only">&nbsp;</span>${r.number}/${G.run.rounds.length}`}</span>
    <span class="pill omen" id="omen" hidden></span>
    ${r.boss ? `<span class="pill boss" title="도깨비 차장 · ${r.boss.name} — ${r.boss.desc}">차장</span>` : ''}
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
  const at = nextEventAt(R());
  el.hidden = at === null || R().phase === 'over';
  if (at === null) return;
  const soon = at - R().clock <= 60;
  el.classList.toggle('soon', soon);
  el.textContent = R().clock >= at ? '사건!' : `사건 ${hhmm(at)}`;
  el.title = '돌발 사건 예고 — 무슨 일이 생길지는 그때 알 수 있다';
}

/** 운행 시계: 06:00 → 막차. 러시아워·심야 구간을 색으로, 지금 시각을 바늘로 */
function drawClock(at = R().clock) {
  const el = $('#clock');
  if (!el) return;
  const r = R();
  G.clockShown = at;
  const span = r.end - CLOCK.start;
  const pos = (m) => Math.max(0, Math.min(100, (100 * (m - CLOCK.start)) / span));
  const seg = (a, b, cls) => `<i class="${cls}" style="left:${pos(a)}%;width:${pos(b) - pos(a)}%"></i>`;
  const left = Math.max(0, r.end - at);
  const t = timeOf(r, at);
  el.innerHTML = `<span class="now">${hhmm(at)}</span>
    <span class="track">${CLOCK.rush.map(([a, b]) => seg(a, b, 'rush')).join('')}${seg(CLOCK.night, CLOCK.last, 'night')}${seg(CLOCK.last, r.end, 'last')}
      <i class="done" style="width:${pos(at)}%"></i><b class="hand" style="left:${pos(at)}%"></b></span>
    ${TIME_NAME[t] ? `<span class="band time-${t}" title="${TIME_DESC[t]}">${TIME_NAME[t]}</span>` : ''}<span class="left">${left ? `막차까지 ${fmtLeft(left)}` : '운행 끝'}</span>`;
  el.classList.toggle('late', left <= 120);
}

function drawScore(value) {
  const r = R();
  $('#scoreNow').textContent = value.toLocaleString();
  $('#target').textContent = r.target.toLocaleString();
  $('#bar').classList.toggle('done', value >= r.target);
  $('#bar i').style.width = Math.min(100, (100 * value) / r.target) + '%';
}

/** 승객 만족도: 칸 5개. 켜진 만큼 모든 이동에 배수가 더해진다. */
function drawHeung(flashKind, h = R().heung) {
  const el = $('#heung');
  el.className = 'heung' + (h >= HEUNG_MAX ? ' max' : '') + (flashKind === 'lost' ? ' lost' : '');
  el.innerHTML = `<span class="lbl">만족</span><span class="pips">${Array.from({ length: HEUNG_MAX }, (_, i) => `<i class="${i < h ? 'on' : ''}"></i>`).join('')}</span>` +
    `<span class="val">${h ? `배수 +${h}` : '잡기·함께 타기·골인·분실물로 오른다'}</span>`;
  if (!h) el.querySelector('.val').style.color = 'var(--ink-3)';
  $('#score').classList.toggle('hot', h >= HEUNG_MAX);
}

function drawBoard() {
  const r = R();
  $('#mat').innerHTML = boardSvg(r.tiles, r.revealed, { flags: r.flags, completed: r.completed });
  drawLineLegend();
}

/** 호선마다 깃발 진행(꽂은 역 / 전체 역)과 특화 효과 */
function drawLineLegend() {
  const b = B(), r = R();
  let el = $('#lineLegend');
  if (!el) { el = document.createElement('div'); el.id = 'lineLegend'; el.className = 'line-legend'; $('#board').appendChild(el); }
  el.innerHTML = Object.entries(b.lineStations).map(([id, st]) => {
    const line = b.lines[id];
    const got = st.filter((n) => r.flags[n]).length;
    const shut = b.closed === Number(id);
    const done = r.completed.includes(Number(id));
    return `<span class="ll ${done ? 'done' : ''} ${shut ? 'shut' : ''}" style="--lc:${line.color}" title="${line.title} · ${line.desc}">
      <i></i><b>${line.name}</b><em>${shut ? '운행 중지' : done ? '완성' : `${got}/${st.length}`}</em></span>`;
  }).join('');
}

// ── 좌표 ─────────────────────────────────────────────────────

/** 판 화면 좌표 → 앱 좌표(효과 층은 앱 전체를 덮는다) */
function toApp([x, y]) {
  const b = $('#board');
  return [x + b.offsetLeft, y + b.offsetTop];
}
/** 역 → 앱 좌표. 카메라 이동·확대를 거친 실제 화면 위치 */
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

/** 말을 역 위에 세운다. level 은 함께 탄 순서(0 이 맨 아래). */
function place(el, node, level = 0) {
  const [x, y] = nodeXY(node);
  const s = pieceSize();
  el.style.left = x - s / 2 + 'px';
  el.style.top = y - s * 0.92 - level * STACK_STEP + 'px';
  el.style.zIndex = depth(y) + level;
  return [x, y - level * STACK_STEP];
}

/** 상태 그대로 말을 놓는다. 같은 역의 말은 탑처럼 쌓아 보여준다. */
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
  // 태운 손님(내 말), 다음 갈림길에서 탈 호선(도깨비)
  const b = B();
  for (const p of r.pieces) {
    const el = pieceEl(p.id);
    el.querySelector('.rider, .heading')?.remove();
    if (p.owner === 'me' && p.rider) el.insertAdjacentHTML('beforeend', `<span class="rider" style="--lc:${b.lines[p.rider].color}" title="${b.lines[p.rider].name} 역에 내려 주면 배달">${PERSON(b.lines[p.rider].color)}</span>`);
    if (p.owner === 'opp' && p.heading) el.insertAdjacentHTML('beforeend', `<span class="heading" style="--lc:${b.lines[p.heading.line].color}">${b.lines[p.heading.line].name}행</span>`);
  }
  // 잡힐 위험 경고는 묶음의 맨 위 말에만
  const danger = threats(r);
  for (const p of r.pieces.filter((q) => q.owner === 'me')) {
    const warn = pieceEl(p.id).querySelector('.warn');
    const list = byNode[p.node] || [];
    if (warn) warn.hidden = !(danger[p.node] >= 0.15) || list[list.length - 1] !== p;
  }
  if (r.phase === 'move' && !G.busy) showOptions();
  if (r.phase === 'throw' && !G.busy && G.blockMode) showBlockTargets();
}

const HERO_COLOR = { tiger: '#F08A2E', rabbit: '#F7B7C8', parrot: '#E0533D', panda: '#3E9B6A' };

/**
 * 스킬 컷인: 캐릭터 색 띠가 화면을 가로지르고, 큰 캐릭터가 튀어나오며 스킬 이름 도장이 찍힌다.
 * 격투 게임의 필살기 컷인처럼 짧고 세게(1초 남짓) — 하루에 여러 번 보므로 길면 지친다.
 */
async function skillCutin(e) {
  const h = heroOf(e.pieceId);
  Sound.skill();
  const c = document.createElement('div');
  c.className = 'cutin';
  c.style.setProperty('--hc', HERO_COLOR[e.hero]);
  c.innerHTML = `<div class="cut-band"><div class="cut-lines"></div></div>
    <div class="cut-hero">${character(kindOf(e.pieceId), 190, 'cheer')}</div>
    <div class="cut-text"><span class="who">${h.job} ${h.name}의 스킬</span><b>${e.name}</b><span class="what">${e.desc}</span></div>`;
  app.appendChild(c);
  flash(app);
  const band = c.querySelector('.cut-band'), hero = c.querySelector('.cut-hero'), text = c.querySelector('.cut-text');
  await Promise.all([
    tween(band, [{ transform: 'skewY(-8deg) scaleY(0)' }, { transform: 'skewY(-8deg) scaleY(1.15)', offset: 0.6 }, { transform: 'skewY(-8deg) scaleY(1)' }], { duration: 260, easing: 'ease-out', fill: 'forwards' }),
    tween(hero, [{ transform: 'translateX(-120%) rotate(-10deg)', opacity: 0 }, { transform: 'translateX(6%) rotate(3deg)', opacity: 1, offset: 0.7 }, { transform: 'translateX(0) rotate(0)', opacity: 1 }], { duration: 380, delay: 60, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' }),
    tween(text, [{ transform: 'translateX(120%) scale(1.6)', opacity: 0 }, { transform: 'translateX(-4%) scale(.95)', opacity: 1, offset: 0.7 }, { transform: 'translateX(0) scale(1)', opacity: 1 }], { duration: 380, delay: 140, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' })
  ]);
  Sound.stamp();
  shake(c, 6, 260);
  await sleep(700);
  await Promise.all([
    tween(hero, [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(140%)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }),
    tween(text, [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-140%)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' }),
    tween(band, [{ transform: 'skewY(-8deg) scaleY(1)', opacity: 1 }, { transform: 'skewY(-8deg) scaleY(0)', opacity: 0 }], { duration: 260, delay: 60, easing: 'ease-in', fill: 'forwards' })
  ]);
  c.remove();
}

/** 돌발 사건 카드: 노선도 한가운데에 떨어졌다가 사라진다. 좋은 사건은 원정대가, 나쁜 사건은 도깨비가 들고 온다. */
async function eventCard(e) {
  if (e.good) Sound.big(); else Sound.boss();
  const who = e.good ? HEROES[(e.name.length + R().moves) % HEROES.length] : 'dokkaebiRed';
  const card = document.createElement('div');
  card.className = 'event-card' + (e.good ? '' : ' bad');
  card.innerHTML = `<div class="ev-head">${hhmm(R().clock)} 돌발 사건</div>${character(who, 74, e.good ? 'cheer' : 'dance')}
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

/** 묶음(같은 역에 함께 탄 말들)의 맨 위 말 요소 */
function topOf(node) {
  const ids = R().pieces.filter((p) => p.node === node).map((p) => p.id);
  return pieceEl(ids[ids.length - 1]);
}

/**
 * 둘 수 있는 수 표시: 움직일 말이 꿈틀대고, 도착 역에 예상 점수·잡힐 확률·걸리는 시간이 뜬다.
 * 수가 많으면 말을 먼저 고르고 그 말의 수만 보여준다.
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
  // 카메라: 움직일 말과 도착 역이 모두 보이게
  const pts = shown.map((m) => nodeXY(m.preview.dest === HOME ? m.path[m.path.length - 2] : m.preview.dest));
  for (const g of groups) pts.push(nodeXY(g === START ? B().S : g));
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
    const dest = pv.dest === HOME ? (m.path[m.path.length - 2] || m.from) : pv.dest;
    const [x, y] = nodeXY(dest);
    // 도착 고리는 말보다 아래 층, 점수 라벨은 따로 맨 위 층에(클릭은 고리가 받는다)
    const t = document.createElement('div');
    t.className = 'target';
    t.style.left = x + 'px';
    t.style.top = y + 'px';
    t.style.zIndex = depth(y) - 1;
    const label = pv.dest === HOME ? '골인 ' : pv.captured ? '잡기 ' : pv.treasure ? '분실물 ' : pv.joined ? '함께 타기 ' : pv.boardTile ? pv.boardTile.name + ' ' : '';
    const risk = pv.dest === HOME ? '' : pv.danger >= 0.05
      ? `<i class="risk">${Math.round(pv.danger * 100)}%</i>`
      : '<i class="risk safe">안전</i>';
    const tag = document.createElement('div');
    tag.className = 'target-tag';
    tag.style.left = x + 'px';
    tag.style.top = y + 'px';
    tag.style.zIndex = 600 + depth(y);
    const hidden = pv.dest !== HOME && !R().revealed.includes(pv.dest);
    const mins = pv.minutes ? `<i class="mins">${pv.minutes}분</i>` : '<i class="mins free">공짜</i>';
    tag.innerHTML = hidden ? `<span class="gain mystery">? 안개 속${mins}</span>`
      : `<span class="gain ${pv.score.total === best ? 'hot' : ''}">${label}+${pv.score.total}${risk}${mins}</span>`;
    t.onclick = () => doMove(m.i);
    $('#layer').append(t, tag);
  }
}

function drawTrays() {
  const r = R();
  const mine = r.pieces.filter((p) => p.owner === 'me');
  const opp = r.pieces.filter((p) => p.owner === 'opp');
  const newIdx = r.phase === 'move' && !G.busy ? legalMoves(r).findIndex((m) => m.kind === 'new') : -1;
  const firstWaiting = mine.find((p) => p.node === START);
  // 원정대 줄: 넷 다 늘 보인다. 차고에 있으면 새로 내보내기, 노선 위에 있으면 스킬 단추
  const chips = mine.map((p) => {
    const h = heroOf(p.id);
    const state = p.node === START ? 'wait' : p.node === HOME ? 'home' : 'out';
    const used = r.skillsUsed.includes(h.id);
    const canSkill = !G.busy && !skillBlocked(r, h.id);
    const canNew = p === firstWaiting && newIdx >= 0;
    const badge = state === 'home' ? '<i class="b home">골인</i>' : state === 'wait' ? '<i class="b">차고</i>' : used ? '<i class="b used">씀</i>' : canSkill ? '<i class="b skill">스킬</i>' : '';
    return `<button class="hero-chip ${state} ${canSkill ? 'can' : ''} ${canNew ? 'ready' : ''} ${used ? 'used' : ''}" data-id="${p.id}" data-new="${canNew ? newIdx : ''}" aria-label="${h.name} · ${h.active.name}">
      ${character(kindOf(p.id), 36)}${badge}</button>`;
  }).join('');
  const home = mine.filter((p) => p.node === HOME).length;
  const oppWait = opp.filter((p) => p.node === START).length;
  $('#trays').innerHTML = `
    <div class="tray heroes">${chips}</div>
    <div class="tray"><span class="label">도깨비 ${oppWait}</span><span class="label">골인</span><b style="font-family:var(--display);font-size:20px">${home}/${mine.length}</b></div>`;
  $('#trays').querySelectorAll('.hero-chip').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.new !== '') return doMove(Number(b.dataset.new));
      if (b.classList.contains('can')) return onSkill(heroOf(b.dataset.id).id);
      heroTip(b.dataset.id);
    };
  });
}

function drawControls() {
  const r = R();
  const canThrow = !G.busy && r.phase === 'throw';
  const tb = $('#throw');
  tb.disabled = !canThrow;
  tb.innerHTML = r.extra > 0 && r.phase === 'throw' ? `한 번 더!${r.freeRide ? '<small>공짜 운행</small>' : ''}` : `열차 출발<small>${hhmm(G.busy ? (G.clockShown ?? r.clock) : r.clock)} 출발</small>`;
  tb.classList.toggle('yellow', r.extra > 0 && r.phase === 'throw');
  const rb = $('#reroll');
  rb.disabled = G.busy || r.phase !== 'move' || r.rerolls <= 0;
  rb.innerHTML = `다시 굴리기 <b>×${r.rerolls}</b>`;
  const bb = $('#blockBtn');
  bb.disabled = G.busy || r.phase !== 'throw' || r.blockadesLeft <= 0;
  bb.classList.toggle('on', G.blockMode);
  bb.innerHTML = G.blockMode ? '봉쇄 취소' : `봉쇄 테이프 <b>×${r.blockadesLeft}</b>`;
  drawOmen();
  const many = r.phase === 'move' && legalMoves(r).length > 6;
  $('#hint').textContent = G.blockMode ? '테이프를 칠 역을 누르세요 · 3시간 동안 도깨비 열차가 못 지나간다'
    : G.busy || r.phase !== 'move' ? ''
      : many ? '말을 고르고 노란 역을 누르세요 · %는 잡힐 확률' : '노란 역을 누르세요 · 점수 · 잡힐 확률 · 걸리는 시간';
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
  const used = h.escape && R().escapeUsed ? ' (오늘은 이미 썼다)' : '';
  const why = skillBlocked(R(), h.id);
  tip.innerHTML = `<div style="display:flex;gap:10px;align-items:center">${character(kindOf(pieceId), 52)}
    <div><b>${h.job} ${h.name} · ${h.skill}</b><p style="margin:4px 0 0">${h.desc}${used}</p></div></div>
    <div class="skill-line"><span class="kind">스킬</span><b>${h.active.name}</b><span>${h.active.desc}</span></div>
    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;align-items:center">
      ${why ? `<span class="skill-why">${why}</span>` : ''}
      <button class="btn small white" data-a="close">닫기</button>
      ${why ? '' : `<button class="btn small yellow" data-a="skill">${h.active.name} 쓰기</button>`}</div>`;
  app.appendChild(tip);
  tip.querySelector('[data-a=close]').onclick = () => tip.remove();
  const go = tip.querySelector('[data-a=skill]');
  if (go) go.onclick = () => onSkill(h.id);
}

function charmTip(i, inShop) {
  if (G.busy) return;
  Sound.click();
  app.querySelector('.tip')?.remove();
  const c = charmById(G.run.charms[i]);
  const tip = document.createElement('div');
  tip.className = 'tip';
  if (inShop) tip.style.zIndex = 60;
  tip.innerHTML = `<b>${c.name}</b><p>${c.desc}<br><span style="font-size:12px">점수는 왼쪽 정기권부터 차례로 계산된다. ×2 정기권은 오른쪽에 둘수록 세다.</span></p>
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
      drawTop(); drawCharms();
      if (R().phase === 'move') syncPieces();
    };
  });
}

// ── 분실물 · 손님 · 봉쇄 테이프 ─────────────────────────────

function drawBundles() {
  $('#layer').querySelectorAll('.bundle, .passenger, .tape').forEach((b) => b.remove());
  for (const t of R().treasures) addBundle(t.node, t.ttl);
  for (const q of R().passengers) addPassenger(q);
  for (const t of R().blockades) addTape(t);
}

const PERSON = (color) => `<svg viewBox="0 0 40 48" width="26" height="31"><circle cx="20" cy="12" r="8" fill="#FFFDF7" stroke="#22201D" stroke-width="3"/><path d="M6 44c0-10 6-17 14-17s14 7 14 17z" fill="${color}" stroke="#22201D" stroke-width="3" stroke-linejoin="round"/></svg>`;

function addPassenger(q) {
  const b = B();
  const el = document.createElement('div');
  el.className = 'passenger';
  el.dataset.node = q.node;
  el.style.setProperty('--lc', b.lines[q.line].color);
  el.innerHTML = PERSON(b.lines[q.line].color) + `<span class="want">${b.lines[q.line].name}</span>`;
  const [x, y] = nodeXY(q.node);
  el.style.left = x + 'px';
  el.style.top = y - 4 + 'px';
  el.style.zIndex = depth(y) - 1;
  $('#layer').appendChild(el);
  return el;
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

function addTape(t) {
  const el = document.createElement('div');
  el.className = 'tape';
  el.dataset.node = t.node;
  el.innerHTML = tape(44) + `<span class="until">~${hhmm(t.until)}</span>`;
  const [x, y] = nodeXY(t.node);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.zIndex = depth(y) + 4;
  $('#layer').appendChild(el);
  return el;
}

// ── 조작 ─────────────────────────────────────────────────────

async function onThrow(quality = 'normal') {
  if (G.busy || R().phase !== 'throw') return;
  Sound.unlock();
  G.picked = null;
  G.blockMode = false;
  await play(depart(R(), G.run.rng, quality));
}

/** 봉쇄 모드: 켜면 테이프를 칠 수 있는 역에 고리가 뜬다 */
function toggleBlockMode() {
  const r = R();
  if (G.busy || r.phase !== 'throw' || r.blockadesLeft <= 0) { Sound.deny(); return; }
  Sound.click();
  G.blockMode = !G.blockMode;
  syncPieces();
  drawControls();
  if (G.blockMode) {
    const pts = r.pieces.filter((p) => p.node !== START && p.node !== HOME).map((p) => nodeXY(p.node));
    if (pts.length) { Camera.frame(pts, { maxZoom: 0.9, pad: 140 }); drawZoom(); }
  }
}

function showBlockTargets() {
  const r = R(), b = B();
  for (const n of b.nodes) {
    if (blockadeBlocked(r, n)) continue;
    const [x, y] = nodeXY(n);
    const t = document.createElement('div');
    t.className = 'target block';
    t.style.left = x + 'px';
    t.style.top = y + 'px';
    t.style.zIndex = depth(y) - 1;
    t.onclick = () => onBlockade(n);
    $('#layer').append(t);
  }
}

async function onBlockade(node) {
  if (G.busy || blockadeBlocked(R(), node)) { Sound.deny(); return; }
  G.blockMode = false;
  await play(placeBlockade(R(), node));
}

// ── 손맛 게이지 ──────────────────────────────────────────────
// 출발 단추를 꾹 누르면 힘 게이지가 오르내린다. 떼는 순간의 힘으로 솜씨가 정해진다.
//   초록 구간(70~88%) 굿 — 두 번 굴려 좋은 쪽 / 한가운데(77~81%) 퍼펙트 — 세 번 중 가장 좋은 쪽
//   끝(96% 넘게) 삐끗 — 두 번 중 나쁜 쪽 / 그 밖 보통. 톡 누르면(0.18초 안) 그냥 던진다.
const GAUGE = { period: 1100, good: [0.7, 0.88], perfect: [0.77, 0.81], slip: 0.96, tap: 180 };
const gaugeQuality = (p) => p >= GAUGE.perfect[0] && p <= GAUGE.perfect[1] ? 'perfect'
  : p >= GAUGE.good[0] && p <= GAUGE.good[1] ? 'good' : p > GAUGE.slip ? 'slip' : 'normal';
const QUALITY_STAMP = { perfect: ['퍼펙트 출발!', '#F2B33D', '#22201D'], good: ['굿 출발!', '#3E9B6A', '#FFFDF7'], slip: ['급출발 삐끗…', '#8C846F', '#FFFDF7'] };

function wireGauge(btn) {
  const wrap = btn.parentElement;
  wrap.insertAdjacentHTML('beforeend', `<div class="power" hidden><i class="good"></i><i class="perfect"></i><i class="slip"></i><b class="needle"></b><span>떼면 출발</span></div>`);
  const meter = wrap.querySelector('.power'), needle = meter.querySelector('.needle');
  meter.querySelector('.good').style.cssText = `left:${GAUGE.good[0] * 100}%;width:${(GAUGE.good[1] - GAUGE.good[0]) * 100}%`;
  meter.querySelector('.perfect').style.cssText = `left:${GAUGE.perfect[0] * 100}%;width:${(GAUGE.perfect[1] - GAUGE.perfect[0]) * 100}%`;
  meter.querySelector('.slip').style.cssText = `left:${GAUGE.slip * 100}%;width:${(1 - GAUGE.slip) * 100}%`;
  let t0 = 0, raf = 0, holding = false;
  const power = () => { const u = ((performance.now() - t0) % GAUGE.period) / GAUGE.period; return u < 0.5 ? u * 2 : 2 - u * 2; };
  const tick = () => { needle.style.left = power() * 100 + '%'; raf = requestAnimationFrame(tick); };
  const start = () => {
    if (holding || G.busy || R().phase !== 'throw') return;
    Sound.unlock();
    holding = true; t0 = performance.now();
    meter.hidden = false;
    tick();
  };
  const release = () => {
    if (!holding) return;
    holding = false;
    cancelAnimationFrame(raf);
    const held = performance.now() - t0, p = power();
    meter.hidden = true;
    const q = held < GAUGE.tap ? 'normal' : gaugeQuality(p);
    if (QUALITY_STAMP[q]) {
      const [text, bg, ink] = QUALITY_STAMP[q];
      const b = wrap.getBoundingClientRect(), a = app.getBoundingClientRect(), k = b.width / wrap.offsetWidth;
      FX.pow((b.left - a.left) / k + wrap.offsetWidth / 2, (b.top - a.top) / k - 10, text, bg, ink, -4);
      if (q === 'perfect') Sound.big(); else if (q === 'good') Sound.coin(); else Sound.deny();
    }
    onThrow(q);
  };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); start(); });
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointerleave', release);
  btn.addEventListener('pointercancel', () => { holding = false; cancelAnimationFrame(raf); meter.hidden = true; });
  // 게이지 없이 눌린 클릭(키보드 포커스·자동 테스트)은 보통 출발. 게이지로 출발한 직후의 클릭은 이미 진행 중이라 무시된다
  btn.addEventListener('click', () => { if (!holding) onThrow('normal'); });
  G.gauge = { start, release };
}

async function onSkill(heroId) {
  if (G.busy || skillBlocked(R(), heroId)) { Sound.deny(); return; }
  Sound.unlock();
  G.blockMode = false;
  app.querySelector('.tip')?.remove();
  await play(useSkill(R(), heroId, G.run.rng));
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
  drawClock();
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
  $('#stampSpot').appendChild(s);
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
const TIER_COLOR = { 1: 'white', 2: 'green', 3: 'blue', 4: '', 5: 'yellow' };

/** 이동 경로를 한 역씩 달린다. 함께 탄 말은 같이 간다. 급행역에서 내리면 다음 환승역까지 크게 뛴다. */
async function travel(e) {
  const els = e.pieceIds.map(pieceEl);
  const first = e.path[0];
  let prev;
  Camera.follow(nodeXY(e.from === START ? first : e.from), 300);
  if (e.from === START) {
    // 등장: 차고에서 첫 역으로 떨어진다
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
  for (let k = 0; k < e.path.length; k++) {
    const node = e.path[k];
    const warpLeg = e.warp && k === e.path.length - 1;
    const target = node === HOME ? (e.path[k - 1] || e.from) : node;
    const to = nodeXY(target);
    G.lastLand = target;
    const height = warpLeg ? 150 : 26;
    const duration = warpLeg ? 700 : 190;
    if (warpLeg) { Sound.whoosh(); FX.pow(...nodeApp(e.path[k - 1]), '급행!', '#2F6BD8', '#FFFDF7'); }
    Camera.follow(to, warpLeg ? 650 : duration + 40);
    await Promise.all(els.map((el, lvl) => {
      face(el, to[0] - prev[0]);
      place(el, target, lvl);
      return hop(el, [prev[0], prev[1]], to, { height, duration });
    }));
    Sound.step(k);
    if (k === e.path.length - 1 || warpLeg) FX.dust(...nodeApp(target), warpLeg ? 8 : 4);
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
    Sound.toss();
    if (Roller3D.ready()) {
      // 노선도 위로 던져 튀고 굴러 멈춘다. 처음 바닥에 닿을 때 달그락
      const board = $('#board');
      const hit = () => { Sound.clatter(); board.removeEventListener('rollhit', hit); };
      board.addEventListener('rollhit', hit);
      await Roller3D.toss(board, B(), e.roll, e.who);
      board.removeEventListener('rollhit', hit);
    } else {
      // three.js 를 못 불러왔을 때: 2D 주사위를 판 가운데에 잠깐 띄운다
      const spot = $('#roller');
      spot.classList.add('show');
      const anim = Roller.animate(spot, B(), e.roll, e.who);
      setTimeout(() => Sound.clatter(), 450);
      await anim;
      setTimeout(() => spot.classList.remove('show'), 700);
    }
    const extra = e.bonus ? '급행! 한 번 더' : e.rerolled ? '다시 굴렸다' : '';
    if (e.who === 'opp') {
      stampText('도깨비 ' + e.roll.label, 'ink opp');
      await sleep(420);
      return;
    }
    stampText(e.roll.label + '!', TIER_COLOR[e.roll.tier] ?? '', extra);
    if (e.bonus) { const b = $('#board'); FX.sparkle(b.offsetLeft + b.offsetWidth - 70, b.offsetTop + 50, 8, '#F2B33D'); }
    await sleep(380);
  },
  async noMove(e) {
    toast(e.who === 'opp'
      ? (e.why === 'shield' ? '스크린도어에 막혔다!' : e.why === 'blockade' ? '봉쇄 테이프에 막혔다!' : '도깨비 열차가 움직일 수 없다')
      : e.why === 'boss' ? '도깨비 차장: 서행 운전 — 1역은 무효!' : `갈 수 있는 길이 없다 — ${CLOCK.wait}분 기다린다`);
    await sleep(700);
  },
  async oppTurn() {
    toast('도깨비 열차 차례');
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
    FX.pow(at[0], at[1] - 46, e.who === 'me' ? '쾅! 잡았다' : '앗, 들이받혔다', e.who === 'me' ? '#F2B33D' : '#E0533D', e.who === 'me' ? '#22201D' : '#FFFDF7');
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
    FX.pow(x, y - 40 - ids.length * STACK_STEP, `함께 타기 ×${ids.length}`, '#FFFDF7', '#22201D', 8);
    await sleep(300);
  },
  async home(e) {
    Sound.home();
    const at = nodeApp(G.lastLand || B().G);
    FX.confetti(at[0], at[1] - 20, 30);
    FX.pow(at[0], at[1] - 60, e.who === 'opp' ? '도깨비 열차 통과' : `종점 도착! ×${e.pieceIds.length}`, e.who === 'opp' ? '#2F6BD8' : '#3E9B6A', '#FFFDF7');
    if (e.who === 'opp' && e.delay) {
      Sound.penalty();
      toast(`운행 지연 +${e.delay}분`);
      $('#clock')?.classList.add('hurt');
      setTimeout(() => $('#clock')?.classList.remove('hurt'), 600);
    }
    await sleep(560);
  },
  async clock(e) {
    drawClock(e.clock);
    drawControls();
    if (e.why === 'free') { const c = $('#clock'); if (c) FX.pow(c.offsetLeft + c.offsetWidth / 2, c.offsetTop + $('#hud').offsetTop + 10, '공짜 운행', '#F7B7C8', '#22201D', 3); }
    tween($('#clock .hand'), [{ transform: 'translateX(-50%) scale(1.6)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 300 });
    await sleep(80);
  },
  async timeShift(e) {
    drawTop();
    drawClock(e.clock);
    if (e.time === 'night') drawBoard();
    const say = { rush: '러시아워! 손님이 몰려온다 — 이동 칩 +50%', day: '한산한 시간', night: '심야 — 안개가 짙어진다', last: '막차 시간! 골인 배수 +3' };
    Sound.stamp();
    toast(`${hhmm(e.clock)} · ${say[e.time]}`);
    await sleep(500);
  },
  async blockade(e) {
    Sound.stamp();
    const el = addTape(e);
    await drop(el, { height: 80, duration: 320 });
    const [x, y] = nodeApp(e.node);
    FX.pow(x, y - 44, '봉쇄!', '#F2B33D', '#22201D', -6);
    toast(`${hhmm(e.until)}까지 도깨비 열차는 이 역을 못 지나간다 (남은 테이프 ${e.left})`);
    await sleep(300);
  },
  async blockadeEnd(e) {
    const el = $('#layer').querySelector(`.tape[data-node="${e.node}"]`);
    if (el) { await tween(el, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.4)' }], { duration: 300, fill: 'forwards' }); el.remove(); }
  },
  async coin(e) {
    Sound.coin();
    if (e.why === 'toll') { const [x, y] = nodeApp(e.node); FX.pow(x, y - 40, '통행료!', '#F2B33D', '#22201D', 4); }
    await coinsFly(nodeApp(e.node), e.amount);
  },
  async trap(e) {
    toast('검표 역에 걸린 도깨비 열차!');
    Sound.capture();
    await Promise.all(e.pieceIds.map((id) => knockOut(pieceEl(id), 1)));
    e.pieceIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; });
  },
  async score(e) {
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
  },
  async heung(e) {
    Sound.heung(e.value);
    drawHeung(null, e.value);
    const pip = $('#heung').querySelectorAll('.pips i')[e.value - 1];
    if (pip) tween(pip, [{ transform: 'scale(1)' }, { transform: 'scale(1.6) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 360 });
    if (e.value >= HEUNG_MAX) toast('승객 만족도 최고! 배수 +5');
    await sleep(260);
  },
  async heungLost(e) {
    Sound.heungLost();
    toast(e.why === 'trap' ? `공사중! 만족도가 떨어졌다 (배수 +${e.value} 사라짐)` : `승객들이 실망했다… (배수 +${e.value} 사라짐)`);
    drawHeung('lost', 0);
    shake($('#heung'), 6, 400);
    await sleep(480);
  },
  async flag(e) {
    drawBoard();
    const [x, y] = nodeApp(e.node);
    FX.sparkle(x + 6, y - 24, 5, '#F2B33D');
    Sound.stack();
    await sleep(120);
  },
  async flagLost(e) {
    drawBoard();
    const [x, y] = nodeApp(e.node);
    FX.pow(x, y - 40, '깃발을 뺏겼다', '#22201D', '#F2B33D', 6);
    await sleep(260);
  },
  async lineComplete(e) {
    drawBoard();
    const line = B().lines[e.line];
    Sound.big();
    flash(app);
    const card = document.createElement('div');
    card.className = 'event-card line-card';
    card.style.setProperty('--lc', line.color);
    card.innerHTML = `<div class="ev-head">호선 완성</div><div class="ev-name">${line.name} 완성!</div>
      <div class="ev-desc">${line.title} 효과 2배 · 점수 +${e.bonus} · 토큰 +${e.coins}<br>도깨비 열차가 이 호선에 서면 통행료</div>`;
    $('#board').appendChild(card);
    await tween(card, [{ transform: 'translate(-50%, -50%) scale(.4) rotate(-8deg)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.06) rotate(2deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }], { duration: 480, fill: 'forwards' });
    FX.confetti(card.offsetLeft + $('#board').offsetLeft, card.offsetTop + $('#board').offsetTop - 30, 34, 1.3);
    drawScore(e.score);
    drawTop();
    await sleep(1300);
    await tween(card, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -50%) translateY(30px) scale(.85)' }], { duration: 260, fill: 'forwards' });
    card.remove();
  },
  async passengerSpawn(e) {
    const el = addPassenger(e);
    Sound.bundle();
    await drop(el, { height: 90, duration: 360 });
  },
  async passengerGone(e) {
    const el = $('#layer').querySelector(`.passenger[data-node="${e.node}"]`);
    if (el) { await tween(el, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-20px)' }], { duration: 300, fill: 'forwards' }); el.remove(); }
  },
  async pickup(e) {
    $('#layer').querySelector(`.passenger[data-node="${e.node}"]`)?.remove();
    const [x, y] = nodeApp(e.node);
    Sound.coin();
    FX.pow(x, y - 54, `손님 탑승 · ${B().lines[e.line].name}행`, B().lines[e.line].color, '#FFFDF7', -4);
    act(pieceEl(e.pieceId), 'cheer', 700);
    await sleep(380);
  },
  async deliver(e) {
    const [x, y] = nodeApp(e.node);
    Sound.home();
    FX.pow(x, y - 58, '배달 완료!', '#3E9B6A', '#FFFDF7', 5);
    FX.sparkle(x, y - 30, 10, '#F2B33D');
    e.pieceIds.forEach((id) => act(pieceEl(id), 'dance', 900));
    await sleep(420);
  },
  async reveal(e) {
    drawBoard();
    Sound.bundle();
    e.nodes.forEach((n, i) => setTimeout(() => { const [x, y] = nodeApp(n); FX.sparkle(x, y - 6, 4, '#FFFDF7'); }, i * 40));
    await sleep(160);
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
    else { Sound.penalty(); FX.pow(at[0], at[1] - 40, '분실물을 뺏겼다', '#E0533D', '#FFFDF7'); await sleep(400); }
  },
  async escape(e) {
    const at = nodeApp(e.node);
    Sound.whoosh();
    FX.pow(at[0], at[1] - 50, '안전 요원 출동!', '#FFFDF7', '#E0533D', 6);
    FX.sparkle(at[0], at[1] - 20, 10, '#F2B33D');
    e.pieceIds.forEach((id) => { const el = pieceEl(id); el.style.display = ''; squish(el, 0.7); act(el, 'cheer', 1200); });
    e.attackerIds.forEach((id) => act(pieceEl(id), 'sad'));
    await sleep(260);
    await Promise.all(e.attackerIds.map((id) => knockOut(pieceEl(id), nodeXY(e.node)[0] < canvasSize().w / 2 ? -1 : 1)));
    e.attackerIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; act(el, 'idle'); });
    toast('토끼 역무원이 도깨비 열차를 차고로 돌려보냈다');
  },
  async event(e) {
    await eventCard(e);
  },
  async goldRush(e) {
    drawBoard();
    Sound.coin();
    for (const n of e.nodes) { const [x, y] = nodeApp(n); FX.sparkle(x, y - 10, 10, '#F2B33D'); FX.ring(x, y); }
    toast('황금 역이 생겼다 — 멈추면 배수 +2');
    await sleep(700);
  },
  async gust(e) {
    Sound.whoosh();
    shake($('#board'), 6, 500);
    if (!e.pieceIds.length) { toast('노선에 도깨비 열차가 없었다'); await sleep(500); return; }
    await Promise.all(e.pieceIds.map((id, i) => sleep(i * 90).then(() => { act(pieceEl(id), 'sad'); return knockOut(pieceEl(id), i % 2 ? 1 : -1); })));
    e.pieceIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; act(el, 'idle'); });
    toast(`도깨비 열차 ${e.pieceIds.length}대가 차고로 돌아갔다`);
    await sleep(400);
  },
  async tailwind(e) {
    Sound.home();
    drawClock();
    drawControls();
    toast(`연장 운행 — 막차가 ${hhmm(e.end)}로 늦춰졌다`);
    tween($('#clock'), [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 420 });
    await sleep(500);
  },
  async eventCoins(e) {
    Sound.coin();
    const b = $('#board');
    await coinsFly([b.offsetLeft + b.offsetWidth / 2, b.offsetTop + b.offsetHeight / 2], e.amount);
  },
  async skill(e) { await skillCutin(e); },
  async roar(e) {
    const at = nodeApp(e.from);
    Sound.roar();
    act(pieceEl(e.pieceId), 'cheer', 1200);
    FX.pow(at[0], at[1] - 60, '빠아앙!', '#F08A2E', '#22201D', -6);
    for (let i = 0; i < 4; i++) setTimeout(() => FX.shock(at[0], at[1] - 16, 1 + i * 0.9), i * 110);
    shake($('#board'), 12, 520);
    await sleep(260);
    const dir = nodeXY(e.node)[0] < canvasSize().w / 2 ? -1 : 1;
    await Promise.all(e.victimIds.map((id, i) => sleep(i * 70).then(() => { act(pieceEl(id), 'sad'); return knockOut(pieceEl(id), dir); })));
    e.victimIds.forEach((id) => { const el = pieceEl(id); el.getAnimations().forEach((a) => a.cancel()); el.style.display = 'none'; act(el, 'idle'); });
    toast(`경적에 놀란 도깨비 열차 ${e.victimIds.length}대가 차고로 돌아갔다`);
    await sleep(300);
  },
  async hop(e) {
    const el = pieceEl(e.pieceId);
    const [x, y] = nodeApp(R().pieces.find((p) => p.id === e.pieceId).node);
    Sound.home();
    act(el, 'cheer', 1100);
    await tween(el, [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(8px) scale(1.2, .75)', offset: 0.15 },
      { transform: 'translateY(-130px) scale(.9, 1.15) rotate(-12deg)', offset: 0.5 },
      { transform: 'translateY(6px) scale(1.18, .8)', offset: 0.85 },
      { transform: 'translateY(0) scale(1)' }
    ], { duration: 720, easing: 'cubic-bezier(.3,.6,.4,1)' });
    FX.dust(x, y, 8);
    FX.sparkle(x, y - 40, 10, '#F2B33D');
    FX.pow(x, y - 70, '추가 운행! 시간 공짜', '#F7B7C8', '#22201D', 6);
    drawControls();
    await sleep(350);
  },
  async shieldUp(e) {
    Sound.stack();
    for (const id of e.pieceIds) {
      const el = pieceEl(id);
      if (!el.querySelector('.shield-bubble')) el.insertAdjacentHTML('beforeend', '<span class="shield-bubble"></span>');
      const [x, y] = nodeApp(R().pieces.find((p) => p.id === id).node);
      FX.sparkle(x, y - 30, 6, '#7FD39B');
    }
    toast('스크린도어 닫힘! 다음 도깨비 차례 동안 잡히지 않는다');
    await sleep(600);
  },
  async shieldDown() {
    $('#layer').querySelectorAll('.shield-bubble').forEach((b) => { b.classList.add('pop'); setTimeout(() => b.remove(), 300); });
    await sleep(200);
  },
  async again() { await sleep(120); },
  async roundOver() { /* play() 이 끝난 뒤 처리 */ }
};

/** 토큰이 날아가 위쪽 토큰 표시에 꽂힌다. */
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

// ── 하루 앞뒤 ────────────────────────────────────────────────

function sheet(html) {
  closeSheet();
  app.insertAdjacentHTML('beforeend', `<div class="sheet-back"></div><div class="sheet">${html}</div>`);
  return app.querySelector('.sheet');
}
function closeSheet() { app.querySelectorAll('.sheet, .sheet-back').forEach((n) => n.remove()); }

/** 첫날: 노선도가 미끄러져 들어오고, 보는 법을 알려준다. */
function boardIntro() {
  tween($('#board'), [
    { transform: 'translateY(60px) scale(.85) rotate(-4deg)', opacity: 0 },
    { transform: 'translateY(-8px) scale(1.02)', opacity: 1, offset: 0.7 },
    { transform: 'translateY(0) scale(1)' }
  ], { duration: 650, easing: 'cubic-bezier(.3,.7,.4,1)' });
  Sound.whoosh();
  const s = sheet(`
    <span class="kind">노선도 보는 법</span>
    <h2 style="margin-top:8px">${GAME_TITLE.main} ${GAME_TITLE.accent}</h2>
    <p>원정대 넷을 출발역에서 종점까지 실어 나르자. 열차 주사위(1~5역·급행)만큼 달리고, 환승역을 지나면 탈 호선을 고른다.</p>
    <div class="board-preview"><div class="roller-mini" id="mini"></div>
      <div style="font-size:12.5px;font-weight:700;line-height:1.55">한 번 달릴 때마다 <b>운행 시간</b>이 흐른다(출발 ${CLOCK.trip}분 + 역마다 ${CLOCK.perStop}분). <b>24:00 막차</b>가 지나기 전에 목표 점수를 넘겨야 한다. 안 가 본 역은 ?</div></div>
    <div class="row"><button class="btn" id="go">알겠다!</button></div>`);
  const mini = s.querySelector('#mini');
  if (Roller3D.ready()) Roller3D.still(mini, B(), null); else Roller.idle(mini);
  s.querySelector('#go').onclick = () => { Sound.click(); roundIntro(); };
}

/** 그날 소개: 목표·도깨비·운행 시계·봉쇄·호선 특화·도깨비 차장 */
function roundIntro() {
  const r = R(), b = B();
  const bossInfo = r.boss ? `<div class="boss-card">${character('dokkaebiRed', 56)}<div><b>도깨비 차장 — ${r.boss.name}</b><span>${r.boss.id === 'closure' ? `${b.lines[b.closed].name} ${CLOSURE_RULE.desc}` : r.boss.desc}</span></div></div>` : '';
  const lines = Object.keys(b.lineStations).map((id) => b.lines[id]);
  const s = sheet(`
    <h2>${dayLabel(r)} 운행${G.run.daily ? '' : ` <small class="day-no">${r.number}/${G.run.rounds.length}</small>`}</h2>
    <p><b>${hhmm(CLOCK.start)} 첫차 → ${hhmm(r.end)} 막차</b> 안에 <b>${r.target.toLocaleString()}점</b>을 넘겨라. 도깨비 열차 ${r.pieces.filter((p) => p.owner === 'opp').length}대가 종점 쪽에서 거꾸로 달려온다.</p>
    <div class="legend">
      <div>${character('dokkaebiRed', 34)}<span><b>빨간 도깨비</b><br>내 말을 들이받으러 온다</span></div>
      <div>${character('dokkaebiBlue', 34)}<span><b>파란 도깨비</b><br>끝까지 가면 운행 지연 +${CLOCK.delay}분</span></div>
    </div>
    <div class="metro-intro">
      <div class="mi-time"><b>운행 시계</b>07~09시·18~20시 러시아워(이동 칩 +50%) · 22시 심야(안개) · 23시 막차(골인 배수 +3)</div>
      <div class="mi-time tape-line"><b>봉쇄 테이프 ×${r.blockadesLeft}</b>역 하나를 ${BLOCKADE.minutes / 60}시간 동안 막아 도깨비 열차가 못 지나가게 한다</div>
      <div class="mi-lines">${lines.map((l) => `<span style="--lc:${l.color}" class="${b.closed === l.id ? 'shut' : ''}"><i></i><b>${l.name} ${l.title}</b>${b.closed === l.id ? '운행 중지' : l.desc}</span>`).join('')}</div>
      <p>멈춘 역에 깃발이 꽂힌다. 한 호선 역에 모두 꽂으면 <b>호선 완성</b> — 점수 +${METRO.completeScore}, 효과 2배, 도깨비 열차는 통행료를 낸다. 손님은 원하는 호선 역에 내려 주자.</p>
    </div>
    ${bossInfo}
    <div class="row"><button class="btn" id="go">첫차 출발!</button></div>`);
  if (r.boss) Sound.boss();
  s.querySelector('#go').onclick = () => { Sound.click(); closeSheet(); };
}

async function roundOver() {
  const r = R();
  syncPieces();
  drawControls();
  if (r.outcome === 'win') {
    stampText('운행 완료!', 'green');
    Sound.win();
    FX.confetti(app.clientWidth / 2, 300, 50, 1.6);
    await sleep(1200);
    const payout = settleRound(G.run);
    drawTop();
    if (G.run.status === 'won') { victory(); return; }
    const total = payout.reduce((s, p) => s + p.amount, 0);
    const next = G.run.rounds[G.run.roundNo];
    const s = sheet(`
      <h2>${dayLabel(r)} 운행 완료</h2>
      <p>${r.score.toLocaleString()}점 / 목표 ${r.target.toLocaleString()}점 · ${hhmm(r.clock)}에 마감 (막차까지 ${fmtLeft(minutesLeft(r))} 남김)</p>
      <div class="payout">${payout.map((p) => `<div><span>${p.label}</span><b>+${p.amount} ${coin(16)}</b></div>`).join('')}
        <div><span>합계</span><b style="font-family:var(--display);font-weight:400;font-size:20px">+${total} ${coin(18)}</b></div></div>
      <div class="points-line"><span>승점</span><b>+${G.run.lastPoints}</b><em>이번 원정 ${G.run.points}점</em></div>
      <div class="row"><button class="btn yellow" id="go">역 매점으로 · 내일은 ${next.day}요일</button></div>`);
    Sound.coin();
    s.querySelector('#go').onclick = () => { Sound.click(); openShop(); };
  } else {
    stampText('막차 끊김…', 'ink');
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
  const art = (o) => o.kind === 'charm' ? charmCard(o.id) : o.kind === 'tile' ? tileArt(o.id) : lineArt();
  const info = (o) => {
    if (o.kind === 'charm') { const c = charmById(o.id); return { kind: '정기권', name: c.name, desc: c.desc }; }
    if (o.kind === 'tile') { const t = TILES.find((x) => x.id === o.id); return { kind: '역 개조', name: t.name, desc: `${t.desc} (내일 노선도 빈 역에)` }; }
    return { kind: '노선', name: LINE_PASS.name, desc: LINE_PASS.desc + (run.extraLines ? ` (지금 ${run.extraLines}장)` : '') };
  };
  const s = sheet(`
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h2>역 매점</h2><span class="pill">${coin()} ${run.coins}</span>
    </div>
    <p>내일은 <b>${next.day}요일</b> · 목표 ${next.target.toLocaleString()}점 · 도깨비 열차 ${next.opp}대${next.boss ? ' · <b style="color:var(--red)">도깨비 차장</b>' : ''}</p>
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
    <p style="margin-top:14px">내 정기권 — 눌러서 순서를 바꾸거나 판다</p>
    <div class="charms" id="shopCharms" style="padding:8px 0 0;margin:0"></div>
    <div class="row">
      <button class="btn small white" id="rr" ${run.coins < SHOP_REROLL_COST ? 'disabled' : ''}>새로고침 ${coin(14)} ${SHOP_REROLL_COST}</button>
      <button class="btn" id="next" style="flex:1.4">${next.day}요일 첫차로</button>
    </div>`);
  drawCharms(s.querySelector('#shopCharms'), true);
  s.querySelectorAll('[data-buy]').forEach((b) => {
    b.onclick = () => {
      const res = buy(run, Number(b.dataset.buy));
      if (!res.ok) { Sound.deny(); toast(res.reason); return; }
      Sound.coin();
      if (res.node) toast('내일 노선도의 빈 역 하나가 개조된다');
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

/** 원정이 끝나면 한 번만 기록하고, 결과 창에 붙일 승점 줄을 만든다 */
function pointsBlock(cleared) {
  const run = G.run;
  if (!run.recorded) run.recorded = Records.record(run, cleared);
  const rec = run.recorded;
  const where = rec.rank ? (rec.best ? '내 최고 기록!' : `내 기록 ${rec.rank}위`) : '10위 밖';
  return `<div class="points-final">
      <div class="pf-main"><span>이번 운행 승점</span><b>${run.points.toLocaleString()}</b><em class="${rec.best ? 'best' : ''}">${where}</em></div>
      <div class="pf-sub">누적 ${rec.total.toLocaleString()}점 · <b>${rec.title.name}</b>${rec.promoted ? ' <i>칭호가 올랐다!</i>' : ''}</div>
    </div>`;
}

function gameOver() {
  const run = G.run;
  const r = R();
  const s = sheet(`
    <h2>막차가 끊겼다</h2>
    <p>${dayLabel(r)} ${hhmm(r.end)} 막차까지 ${r.score.toLocaleString()}점 — 목표 ${r.target.toLocaleString()}점에 못 미쳤다.</p>
    <div class="cast" style="justify-content:center;margin:10px 0 4px">${HEROES.map((k) => character(k, 56, 'sad')).join('')}${character('dokkaebiRed', 56, 'dance')}</div>
    ${pointsBlock(false)}
    <div class="payout">
      ${run.daily ? '' : `<div><span>버틴 날</span><b>${run.roundNo - 1} / ${run.rounds.length}</b></div>`}
      <div><span>한 번에 가장 많이 번 점수</span><b>${r.lastMoveBest.toLocaleString()}</b></div>
      <div><span>모은 정기권</span><b>${run.charms.length ? run.charms.map((id) => charmById(id).name).join(', ') : '없음'}</b></div>
      <div><span>시드</span><b>${run.seed}</b></div>
    </div>
    <div class="row"><button class="btn white" id="title">처음으로</button><button class="btn" id="again">${run.daily ? '오늘의 노선 다시' : '다시 운행'}</button></div>`);
  s.querySelector('#title').onclick = () => { closeSheet(); title(); };
  s.querySelector('#again').onclick = () => {
    closeSheet();
    G.run = createRun(run.daily ? dailySeed() : Date.now() & 0x7fffffff, { daily: run.daily });
    G.boardId = 'metro';
    startRound(G.run);
    enterRound();
  };
}

function victory() {
  const run = G.run;
  FX.confetti(app.clientWidth / 2, 400, 80, 2);
  const s = sheet(`
    <h2>${run.daily ? '오늘의 노선 운행 완료!' : '5일 운행 완주!'}</h2>
    <p>${run.daily ? '오늘의 노선도를 지켜 냈다' : '월요일부터 금요일까지 도깨비 열차를 막아 냈다'}. 마지막 점수 ${R().score.toLocaleString()}점.</p>
    <div class="cast" style="justify-content:center;margin:16px 0 4px">${HEROES.map((k) => character(k, 64, 'dance')).join('')}</div>
    ${pointsBlock(true)}
    <div class="payout">
      <div><span>모은 정기권</span><b>${run.charms.map((id) => charmById(id).name).join(', ') || '없음'}</b></div>
      <div><span>시드</span><b>${run.seed}</b></div>
    </div>
    <div class="row"><button class="btn" id="again">처음으로</button></div>`);
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
// 키보드: Space/Enter 를 누르고 있으면 게이지, 떼면 출발. R 다시 굴리기, B 봉쇄 모드
document.addEventListener('keydown', (e) => {
  if (e.repeat || !G.run || !R() || G.busy || app.querySelector('.sheet') || !app.classList.contains('game')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); G.gauge?.start(); }
});
document.addEventListener('keyup', (e) => {
  if (!G.run || !R() || app.querySelector('.sheet') || !app.classList.contains('game')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); G.gauge?.release(); }
  if (e.key === 'r' && !G.busy) onReroll();
  if (e.key === 'b' && !G.busy) toggleBlockMode();
});

// 개발 중 콘솔 확인용
window.__game = { get run() { return G.run; } };

title();
