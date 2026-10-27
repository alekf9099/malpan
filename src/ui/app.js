// 화면 컨트롤러. 규칙은 core 가 전부 처리하고, 여기서는 core 가 돌려준 이벤트를 차례로 연출한다.
//   board-view  아이소메트릭 노선도와 말 위치
//   roller3d    3D 열차 주사위 (roller 는 three.js 를 못 불러왔을 때의 2D 대체)
//   anim / fx   점프·찌그러짐·날려 보내기 / 먼지·폭죽·스티커

import { createRun, startRound, settleRound, nextRound, buy, sellCharm, moveCharm, rerollShop, dailySeed, routeFor, networkGrowth, DAYS, MAX_CHARMS, SHOP_REROLL_COST } from '../core/run.js';
import {
  depart, reroll, applyMove, legalMoves, threats, boardFor, nextEventAt, useSkill, skillBlocked,
  placeBlockade, blockadeBlocked, timeOf, minutesLeft, hhmm, CLOCK, BLOCKADE, buyStation, tollFor
} from '../core/round.js';
import { START, HOME } from '../core/board.js';
import { BOSS_RULES, CLOSURE_RULE, LINE_PASS, charmById } from '../core/items.js';
import { stationToll, links, chainOf, holdings, CHAIN_MAX, OWN_STOP_MULT_MAX, PRICE } from '../core/estate.js';
import { BOARDS } from '../core/boards/index.js';
import { INCIDENTS } from '../core/incidents.js';
import { HEROES as HERO_SKILLS, heroOf } from '../core/heroes.js';
import { character, act, face, kindOf, charmCard, lineArt, coin, HEROES, tape, traitBadge, ownerFlag, goblinFlag } from './art.js';
import { useBoard, boardSvg, nodeXY, depth, pieceSize, canvasSize, tagSide } from './board-view.js';
import * as Camera from './camera.js';
import { sleep, tween, hop, drop, knockOut, squish, shake, flash, fly } from './anim.js';
import * as FX from './fx.js';
import * as Roller from './roller.js';
import * as Roller3D from './roller3d.js';
import * as Records from './records.js';
import * as Stations from './stations.js';
import { Sound } from './sound.js';

// 게임 이름은 여기 한 곳에서만 바꾼다
export const GAME_TITLE = { main: '도깨비', accent: '노선도', sub: '서울 지하철, 막차 전에 원정대를 종착역까지 — 도깨비 열차를 막아라' };

const app = document.getElementById('app');
const G = { run: null, busy: false, stampEl: null, picked: null, boardId: null, blockMode: false };
const $ = (sel) => app.querySelector(sel);
const R = () => G.run.round;
const B = () => boardFor(R());

const STACK_STEP = 21; // 함께 탄 말이 위로 쌓이는 높이
const TIME_NAME = { rush: '러시아워', night: '심야', last: '막차' };
const dayLabel = (r) => (G.run.daily ? '오늘의 노선' : `${r.day}요일`);
// 점수판에 들어갈 짧은 꼴: 2시간 넘게 남으면 시간만
const fmtLeftShort = (m) => (m >= 120 ? `${Math.floor(m / 60)}시간` : fmtLeft(m));
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
      ${(() => { const h = holdings(Stations.load()); return `<button class="my-net" id="netPill">${ownerFlag(22)}<span>내 노선망</span><b>역 ${h.count}곳</b><em>${h.best > 1 ? `최대 ${h.best}역 연결` : '역을 이어서 사 보자'}</em></button>`; })()}
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
  $('#netPill').onclick = () => { Sound.unlock(); Sound.click(); ranking(); };
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
      ${netCard()}
      <div class="rank-rule">하루 목표 달성 +10 · 보스 날 +10 · 목표 초과 10%마다 +1 · 남은 운행 1시간마다 +2 · 5일 완주 +100 (오늘의 노선은 절반)</div>
      <div class="rank-list">${rows}</div>
    </div>`;
  $('#dexBack').onclick = () => { Sound.click(); title(); };
  const rs = $('#netReset');
  if (rs) rs.onclick = () => {
    if (!rs.dataset.sure) { rs.dataset.sure = '1'; rs.textContent = '정말 전부 놓을까? 한 번 더 누르면 초기화'; Sound.deny(); return; }
    Stations.reset(Stations.load());
    Sound.penalty();
    ranking();
  };
}

/** 랭킹 화면의 내 노선망: 가진 역·값·연결 구간 */
function netCard() {
  const owned = Stations.load();
  const h = holdings(owned);
  const at = links(owned).at;
  const names = Object.keys(owned).filter((n) => owned[n]).sort();
  return `<div class="net-card">
      <div class="net-head">${ownerFlag(26)}<b>내 노선망</b><span>산 역은 원정이 끝나도 계속 내 것</span></div>
      <div class="net-stats"><div><b>${h.count}</b><span>역</span></div><div><b>${h.value.toLocaleString()}</b><span>점어치</span></div><div><b>×${Math.min(CHAIN_MAX, h.best || 1)}</b><span>최대 연결</span></div></div>
      ${names.length ? `<div class="net-list">${names.map((n) => `<i class="${at[n]?.len > 1 ? 'mono' : ''}">${n}${at[n]?.len > 1 ? ` ×${Math.min(CHAIN_MAX, at[n].len)}` : ''}</i>`).join('')}</div>` : '<p class="rank-empty">아직 산 역이 없다. 운행 중 멈춘 역을 점수로 인수해 보자.</p>'}
      ${names.length ? '<button class="btn small white" id="netReset">내 노선망 초기화</button>' : ''}
    </div>`;
}

// ── 캐릭터 도감 ─────────────────────────────────────────────

/** 도감에만 쓰는 소개 글. 규칙(능력·스킬 수치)은 core/heroes.js 에서 읽는다 */
const DEX_NOTES = {
  tiger: { line: '첫차를 모는 기관사', tip: '빨간 도깨비 열차가 내 말 뒤를 쫓아오면 경적으로 차고에 돌려보내자. 직접 들이받으면 돌파로 배수가 두 배가 된다.' },
  rabbit: { line: '발 빠른 역무원', tip: '추가 운행은 시간이 들지 않는 공짜 운행이다. 막차가 가까울 때 아껴 두면 한 번을 더 달린다. 안전 요원이 남아 있으면 토끼가 낀 묶음은 잡히지 않는다.' },
  parrot: { line: '목청 좋은 안내원', tip: '승객 호출로 역 두 곳에 인파를 부르자. 앵무새가 인파 몰린 역에 서면 칩이 한 번 더 붙는다.' },
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
        <div class="dex-card"><div class="dex-row">${character('dokkaebiRed', 44)}<div><span class="kind">빨간 도깨비 · 사냥꾼</span><p>내 말을 들이받는 수를 가장 좋아한다. 잡히면 그 말은 차고로 돌아가 출발역부터 다시 달려야 한다.</p></div></div></div>
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
  G.run = createRun(seed, { daily, owned: Stations.load() });
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
        <div class="hrow score-row" data-guide="score"><span class="hl hl-score">점수</span><div class="score-now" id="scoreNow">0</div><div class="bar" id="bar"><i style="width:0%"></i></div><div class="score-goal">목표<b id="target">0</b></div></div>
        <div class="hrow clock" id="clock" data-guide="clock"></div>
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
  app.querySelectorAll('.hud [data-guide]').forEach((el) => { el.onclick = () => openGuide(el.dataset.guide); });
  wireGauge($('#throw'));
  $('#reroll').onclick = onReroll;
  $('#blockBtn').onclick = toggleBlockMode;
  $('#zoom').onclick = () => {
    Sound.click();
    if (Camera.showingWhole()) frameAction(); else Camera.whole();
    setTimeout(drawZoom, 0);
  };
}

function drawZoom() { const z = $('#zoom'); if (z) z.textContent = Camera.showingWhole() ? '돌아가기' : '서울 전체'; }

/** 지금 볼만한 곳(내 말·도깨비)을 화면에 맞춘다. */
function frameAction() {
  const r = R();
  const pts = r.pieces.filter((p) => p.node !== START && p.node !== HOME).map((p) => nodeXY(p.node));
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
  // 처음엔 출발역과 그 앞 몇 역을 가까이 — 노선도는 크고, 카메라가 말을 따라간다
  const b = B();
  const near = b.nodes.filter((n) => b.depth[n] <= 2).map((n) => nodeXY(n));
  const xs = near.map((p) => p[0]), ys = near.map((p) => p[1]);
  Camera.setHome([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]]);
  refresh();
  Camera.overview(0);
  drawZoom();
  if (first) boardIntro(); else roundIntro();
}

function refresh() {
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
    <button class="pill omen" id="omen" data-guide="event" hidden></button>
    ${r.boss ? '<button class="pill boss" data-guide="boss">차장</button>' : ''}
    <span style="flex:1"></span>
    <button class="pill" id="coinPill" data-guide="coin">${coin()} ${G.run.coins}</button>
    <button class="btn small white icon-btn help-btn" id="help" aria-label="화면 보는 법">?</button>
    <button class="btn small white icon-btn" id="snd" aria-label="소리">${Sound.isOn() ? '♪' : '✕'}</button>`;
  $('#snd').onclick = () => { Sound.toggle(); Sound.unlock(); drawTop(); };
  $('#help').onclick = () => openGuide();
  $('#top').querySelectorAll('[data-guide]').forEach((el) => { el.onclick = () => openGuide(el.dataset.guide); });
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
  el.innerHTML = clockHtml(r, at);
  el.classList.toggle('late', r.end - at <= 120);
}

function clockHtml(r, at) {
  const span = r.end - CLOCK.start;
  const pos = (m) => Math.max(0, Math.min(100, (100 * (m - CLOCK.start)) / span));
  const seg = (a, b, cls) => `<i class="${cls}" style="left:${pos(a)}%;width:${pos(b) - pos(a)}%"></i>`;
  const left = Math.max(0, r.end - at);
  const t = timeOf(r, at);
  return `<span class="hl hl-clock">시각</span><span class="now">${hhmm(at)}</span>
    <span class="track">${CLOCK.rush.map(([a, b]) => seg(a, b, 'rush')).join('')}${seg(CLOCK.night, CLOCK.last, 'night')}${seg(CLOCK.last, r.end, 'last')}
      <i class="done" style="width:${pos(at)}%"></i><b class="hand" style="left:${pos(at)}%"></b></span>
    ${TIME_NAME[t] ? `<span class="band time-${t}">${TIME_NAME[t]}</span>` : ''}<span class="left">${left ? `막차까지 ${fmtLeftShort(left)}` : '운행 끝'}</span>`;
}

function drawScore(value) {
  const r = R();
  $('#scoreNow').textContent = value.toLocaleString();
  $('#target').textContent = r.target.toLocaleString();
  $('#bar').classList.toggle('done', value >= r.target);
  $('#bar i').style.width = Math.min(100, (100 * value) / r.target) + '%';
}

function drawBoard() {
  const r = R();
  $('#mat').innerHTML = boardSvg({ owned: r.owned, goblin: r.goblinStations, monopolyEdges: links(r.owned).edges });
  drawRouteBanner();
}

/** 노선도 위 왼쪽 위: 오늘 구간(출발역 → 종착역) · 운행 중지 호선 */
function drawRouteBanner() {
  const b = B();
  let el = $('#routeBanner');
  if (!el) { el = document.createElement('div'); el.id = 'routeBanner'; el.className = 'route-banner'; $('#board').appendChild(el); }
  el.onclick = () => openGuide('route');
  const dot = (n) => `<i style="--lc:${b.lineAt(n).color}"></i>`;
  el.innerHTML = `<span class="rb-head">오늘 구간</span><b>${dot(b.S)}${b.S}</b><span class="rb-arrow">→</span><b>${dot(b.G)}${b.G}</b><em>최단 ${b.length}역</em>${(() => { const k = b.nodes.filter((n) => R().owned[n]).length; return k ? `<span class="rb-own">${ownerFlag(14)}내 역 ${k}</span>` : ''; })()}` +
    (b.closed ? `<span class="rb-shut" style="--lc:${b.lines[b.closed].color}">${b.lines[b.closed].name} 운행 중지</span>` : '');
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
  // 다음 갈림길에서 탈 호선(도깨비)
  const b = B();
  for (const p of r.pieces) {
    const el = pieceEl(p.id);
    el.querySelector('.heading')?.remove();
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
    const label = pv.dest === HOME ? '골인 ' : pv.captured ? '잡기 ' : pv.joined ? '함께 타기 ' : pv.incident ? INCIDENTS[pv.incident].name + ' ' : '';
    const risk = pv.dest === HOME ? '' : pv.danger >= 0.05
      ? `<i class="risk">${Math.round(pv.danger * 100)}%</i>`
      : '<i class="risk safe">안전</i>';
    const tag = document.createElement('div');
    tag.className = 'target-tag';
    tag.style.left = x + 'px';
    tag.style.top = y + 'px';
    tag.style.zIndex = 600 + depth(y);
    const mins = pv.minutes ? `<i class="mins">${pv.minutes}분</i>` : '<i class="mins free">공짜</i>';
    const deal = pv.pay ? `<i class="pay">도깨비 역 −${pv.pay}</i>` : pv.price ? `<i class="buy">인수 ${pv.price}</i>` : '';
    tag.innerHTML = `<span class="gain ${pv.score.total === best ? 'hot' : ''}">${label}+${pv.score.total}${risk}${mins}${deal}</span>`;
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
  $('#hint').textContent = r.offer && r.phase === 'throw' && !G.busy && r.score >= r.offer.price ? '멈춘 역을 인수할 수 있다 — 카드를 보거나 그냥 출발'
    : G.blockMode ? '테이프를 칠 역을 누르세요 · 3시간 동안 도깨비 열차가 못 지나간다'
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

// ── 내 역 깃발 · 역 사건 · 봉쇄 테이프 ─────────────────────────

function drawBundles() {
  $('#layer').querySelectorAll('.flag, .incident, .tape').forEach((b) => b.remove());
  for (const n of Object.keys(R().owned)) if (R().owned[n]) addFlag(n, 'own');
  for (const n of R().goblinStations) addFlag(n, 'goblin');
  for (const i of R().incidents) addIncident(i);
  for (const t of R().blockades) addTape(t);
}

// 역 사건 그림: 화재는 불꽃, 신호 장애는 시계, 인파는 사람들, 버스킹은 음표
const INC_ART = {
  fire: '<path d="M20 4c2 7 10 10 10 20a10 10 0 0 1-20 0c0-5 3-8 5-10 0 4 2 6 4 6-1-6 1-11 1-16z" fill="#F2733D" stroke="#22201D" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 20c1 3 5 5 5 9a5 5 0 0 1-10 0c0-3 3-5 5-9z" fill="#F7C94A"/>',
  delay: '<circle cx="20" cy="21" r="14" fill="#FFFDF7" stroke="#22201D" stroke-width="3"/><path d="M20 21V12" stroke="#22201D" stroke-width="3" stroke-linecap="round"/><path class="inc-hand" d="M20 21l7 4" stroke="#E0533D" stroke-width="3" stroke-linecap="round"/><path d="M14 4h12" stroke="#22201D" stroke-width="3" stroke-linecap="round"/>',
  crowd: '<circle cx="11" cy="15" r="5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M3 35c0-7 4-12 8-12s8 5 8 12z" fill="#2EA6DA" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/><circle cx="29" cy="15" r="5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M21 35c0-7 4-12 8-12s8 5 8 12z" fill="#E2337A" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="11" r="5.5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M11 33c0-8 4-13 9-13s9 5 9 13z" fill="#F2B33D" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/>',
  busk: '<path d="M15 30V8l16-4v20" fill="none" stroke="#22201D" stroke-width="3.2" stroke-linejoin="round"/><ellipse cx="11" cy="30" rx="6" ry="4.5" fill="#E2337A" stroke="#22201D" stroke-width="2.6"/><ellipse cx="27" cy="25" rx="6" ry="4.5" fill="#8E63B0" stroke="#22201D" stroke-width="2.6"/>'
};
const incidentArt = (kind, size = 34) => `<svg class="inc-art" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${INC_ART[kind]}</svg>`;

/** 사건마다 역 위에 도는 움직임: 연기·고리·뛰는 사람들·떠오르는 음표 */
const INC_FX = {
  fire: '<i class="smoke s1"></i><i class="smoke s2"></i><i class="smoke s3"></i><i class="ember"></i>',
  delay: '<i class="pulse"></i><i class="pulse p2"></i>',
  crowd: '<i class="hop h1"></i><i class="hop h2"></i>',
  busk: '<i class="note n1">♪</i><i class="note n2">♫</i><i class="note n3">♪</i>'
};
const incidentTag = (i) => i.kind === 'fire' ? `화재 ~${hhmm(i.until)}` : i.kind === 'delay' ? `지연 +${INCIDENTS.delay.delay}분`
  : i.kind === 'crowd' ? `인파 칩+${INCIDENTS.crowd.chips}` : `버스킹 배수+${INCIDENTS.busk.mult}`;

function addIncident(i) {
  const el = document.createElement('div');
  el.className = `incident kind-${i.kind}`;
  el.dataset.node = i.node;
  el.innerHTML = `<span class="inc-fx">${INC_FX[i.kind]}</span>${incidentArt(i.kind)}<span class="inc-tag">${incidentTag(i)}</span>`;
  const [x, y] = nodeXY(i.node);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.zIndex = depth(y) - 2;
  $('#layer').appendChild(el);
  return el;
}

/** 역 사건 속보: 위에 뉴스 띠가 지나가고, 카메라가 그 역으로 가서 사건이 터진다 */
async function incidentAlert(e) {
  const info = INCIDENTS[e.kind];
  const news = document.createElement('div');
  news.className = `news-flash kind-${e.kind}`;
  news.innerHTML = `<b>속보</b><span>${hhmm(R().clock)} <strong>${e.node}역</strong> ${info.name} — ${info.desc}</span>`;
  $('#board').appendChild(news);
  tween(news, [{ transform: 'translateX(110%)' }, { transform: 'translateX(-3%)', offset: 0.75 }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
  Camera.follow(nodeXY(e.node), 480);
  drawZoom();
  await sleep(480);
  const el = addIncident(e);
  const [x, y] = nodeApp(e.node);
  if (e.kind === 'fire') {
    Sound.capture(); flash(app); shake($('#board'), 8, 420);
    FX.pow(x, y - 56, '화재 발생!', '#E0533D', '#FFFDF7', -6);
  } else if (e.kind === 'delay') {
    Sound.penalty(); FX.ring(x, y, '#F2B33D');
    FX.pow(x, y - 56, '신호 장애', '#F2B33D', '#22201D', 5);
  } else if (e.kind === 'crowd') {
    Sound.bundle(); FX.pow(x, y - 56, '인파 몰림!', '#2EA6DA', '#FFFDF7', -4);
  } else {
    Sound.home(); FX.sparkle(x, y - 20, 10, '#E2337A'); FX.pow(x, y - 56, '버스킹!', '#E2337A', '#FFFDF7', 4);
  }
  await tween(el, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.35)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
  await sleep(900);
  tween(news, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-14px)' }], { duration: 300, fill: 'forwards' }).then(() => news.remove());
}

/** 역 깃발: kind 'own' 내 역(금빛) · 'goblin' 도깨비 역(보랏빛). 오늘 구간의 내 역엔 통행료가 붙는다 */
function addFlag(node, kind) {
  const r = R();
  const el = document.createElement('div');
  const k = kind === 'own' ? chainOf(r.owned, node) : 0;
  const mono = k > 1;
  el.className = `flag kind-${kind}${mono ? ' mono' : ''} tag-${tagSide(node)}`;
  el.dataset.node = node;
  // 출발역·종착역에는 도깨비 열차가 서지 않으니 통행료 표시도 없다
  const onRoute = B().nodes.includes(node) && node !== B().S && node !== B().G;
  const tag = kind === 'goblin' ? `<span class="flag-tag">도깨비 −${stationToll(node)}</span>`
    : onRoute ? `<span class="flag-tag">+${tollFor(r, node).amount || stationToll(node)}${mono ? ` ×${k}` : ''}</span>` : mono ? `<span class="flag-tag">×${k}</span>` : '';
  el.innerHTML = (kind === 'goblin' ? goblinFlag(30) : ownerFlag(onRoute ? 30 : 22)) + tag;
  const [x, y] = nodeXY(node);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.zIndex = depth(y) - 3;
  $('#layer').appendChild(el);
  return el;
}

/** 멈춘 역을 살 수 있으면 노선도 아래에 인수 카드를 띄운다 */
function showOffer() {
  hideOffer();
  const r = R();
  // 값을 낼 수 있을 때만 묻는다
  if (r.phase !== 'throw' || !r.offer || G.busy || r.score < r.offer.price) return;
  const { node, price } = r.offer;
  const b = B();
  const lines = b.stationLines(node).map((l) => `<i style="--lc:${b.lines[l].color}" title="${b.lines[l].name}"></i>`).join('');
  const next = { ...r.owned, [node]: true };
  const k = chainOf(next, node);
  const via = links(next).at[node];
  const card = document.createElement('div');
  card.className = 'offer-card';
  card.innerHTML = `
    <div class="oc-sign">${lines}<b>${node}</b></div>
    <div class="oc-body"><span>이 역을 인수할까?</span>
      <em>값 <b>${price}점</b> · 도깨비 열차가 서면 통행료 <b>${stationToll(node) * k}점</b>${k > 1 ? ` · <strong>${b.lines[via.line].name} ${via.len}역 연결 — 배수 ×${k}</strong>` : ''}</em></div>
    <div class="oc-btns"><button class="btn small white" data-a="skip">지나치기</button>
      <button class="btn small yellow" data-a="buy">${price}점에 인수</button></div>`;
  $('#board').appendChild(card);
  tween(card, [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'translateY(-4px)', opacity: 1, offset: 0.7 }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.3,.7,.3,1.2)' });
  card.querySelector('[data-a=skip]').onclick = () => { Sound.click(); R().offer = null; hideOffer(); drawControls(); };
  card.querySelector('[data-a=buy]').onclick = () => onBuy(node);
  // 카메라: 그 역이 카드 위쪽에 보이게
  const [x, y] = nodeXY(node);
  Camera.follow([x, y + 120], 360);
}

function hideOffer() { $('#board')?.querySelector('.offer-card')?.remove(); }

async function onBuy(node) {
  if (G.busy || R().offer?.node !== node || R().score < R().offer.price) { Sound.deny(); return; }
  Sound.unlock();
  hideOffer();
  await play(buyStation(R(), node));
  Stations.save(G.run.owned);
}

/** 점수판 숫자 자리(앱 좌표) */
function scoreSpot() {
  const el = $('#scoreNow'), ab = app.getBoundingClientRect(), b = el.getBoundingClientRect(), k = b.width / el.offsetWidth;
  return [(b.left - ab.left) / k + el.offsetWidth / 2, (b.top - ab.top) / k + el.offsetHeight / 2];
}

/** 토큰 그림이 from 에서 to 로 날아간다(점수가 오가는 연출) */
async function flyCoins(from, to, n) {
  const flights = [];
  for (let i = 0; i < Math.min(8, n); i++) {
    const c = document.createElement('div');
    c.className = 'fly-coin';
    c.innerHTML = coin(22);
    $('#fx').appendChild(c);
    flights.push(fly(c, [from[0] + (Math.random() - 0.5) * 26, from[1] - 10], to, { duration: 600, arc: 110, delay: i * 60 }));
  }
  await Promise.all(flights);
}

/** 연결 카드: 호선 색 카드가 떨어지고, 그 구간 금빛 띠가 흐른다 */
async function linkCard(lineId, len, k) {
  const line = B().lines[lineId];
  Sound.big();
  flash(app);
  const card = document.createElement('div');
  card.className = 'event-card line-card';
  card.style.setProperty('--lc', line.color);
  card.innerHTML = `<div class="ev-head">역 연결</div><div class="ev-name">${line.name} ${len}역 연결!</div>
    <div class="ev-desc">이 구간 통행료 ×${k} · 내 말이 서면 배수 +${Math.min(OWN_STOP_MULT_MAX, k - 1)}${k >= CHAIN_MAX ? '<br>최대 배수!' : ''}</div>`;
  $('#board').appendChild(card);
  await tween(card, [{ transform: 'translate(-50%, -50%) scale(.4) rotate(-8deg)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.06) rotate(2deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }], { duration: 480, fill: 'forwards' });
  FX.confetti(card.offsetLeft + $('#board').offsetLeft, card.offsetTop + $('#board').offsetTop - 30, 40, 1.4);
  await sleep(1300);
  await tween(card, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -50%) translateY(30px) scale(.85)' }], { duration: 260, fill: 'forwards' });
  card.remove();
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
  hideOffer();
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
  drawTrays();
  drawControls();
  drawTop();
  drawClock();
  showOffer();
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
      ? (e.why === 'shield' ? '스크린도어에 막혔다!' : e.why === 'blockade' ? '봉쇄 테이프에 막혔다!' : e.why === 'fire' ? '화재 역에 막혔다!' : '도깨비 열차가 움직일 수 없다')
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
    const say = { rush: '러시아워! 인파가 몰린다 — 이동 칩 +50%', day: '한산한 시간', night: '심야 할증 — 이동 칩 +25%', last: '막차 시간! 골인 배수 +3' };
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
  async incident(e) { await incidentAlert(e); },
  async incidentEnd(e) {
    const el = $('#layer').querySelector(`.incident[data-node="${e.node}"]`);
    if (e.used) {
      const [x, y] = nodeApp(e.node);
      FX.pow(x, y - 62, e.kind === 'crowd' ? '승객 가득 태움!' : '앵콜!', e.kind === 'crowd' ? '#2EA6DA' : '#E2337A', '#FFFDF7', -5);
      FX.sparkle(x, y - 30, 10, '#F2B33D');
      Sound.coin();
    }
    if (el) { await tween(el, [{ opacity: 1 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 360, fill: 'forwards' }); el.remove(); }
  },
  async buy(e) {
    // 점수에서 토큰이 날아가 역에 꽂히고, 금빛 깃발이 떨어진다
    const at = nodeApp(e.node);
    Camera.follow(nodeXY(e.node), 300);
    await sleep(200);
    drawScore(e.score);
    tween($('#scoreNow'), [{ transform: 'scale(1)' }, { transform: 'scale(.8)' }, { transform: 'scale(1)' }], { duration: 300 });
    await flyCoins(scoreSpot(), nodeApp(e.node), 6);
    Sound.buy();
    drawBoard();
    const el = addFlag(e.node, 'own');
    await drop(el, { height: 140, duration: 420 });
    FX.ring(...nodeApp(e.node), '#F2B33D');
    FX.ring(...nodeApp(e.node), '#FFFDF7');
    FX.confetti(at[0], at[1] - 30, 22, 1);
    FX.pow(at[0], at[1] - 70, '인수!', '#F2B33D', '#22201D', -5);
    toast(`${e.node}역이 내 역이 됐다 — 도깨비 열차가 서면 통행료 ${stationToll(e.node)}점`);
    shake($('#board'), 5, 260);
    R().pieces.filter((p) => p.owner === 'me' && p.node === e.node).forEach((p) => act(pieceEl(p.id), 'cheer', 1200));
    await sleep(450);
    if (e.chain > 1) { drawBundles(); await linkCard(e.line, e.length, e.chain); }
    drawBundles();
  },
  async toll(e) {
    // 도깨비가 내 역에 섰다: 깃발이 펄럭이고 토큰이 역에서 점수판으로 쏟아진다
    const at = nodeApp(e.node);
    const flag = $('#layer').querySelector(`.flag.kind-own[data-node="${e.node}"]`);
    if (flag) { flag.classList.remove('wave'); void flag.offsetWidth; flag.classList.add('wave'); }
    e.pieceIds?.forEach((id) => act(pieceEl(id), 'sad', 1000));
    Sound.toll(e.chain > 1 || e.crowd);
    FX.pow(at[0], at[1] - 64, `통행료 +${e.amount}`, '#F2B33D', '#22201D', 6);
    if (e.chain > 1) FX.pow(at[0] + 34, at[1] - 96, `연결 ×${e.chain}`, '#E0533D', '#FFFDF7', -8);
    if (e.crowd) FX.pow(at[0] - 34, at[1] - 96, '인파 ×2', '#2EA6DA', '#FFFDF7', 8);
    FX.sparkle(at[0], at[1] - 30, 6 + e.chain * 3, '#F2B33D');
    await flyCoins(at, scoreSpot(), 2 + e.chain * 2);
    drawScore(e.score);
    tween($('#scoreNow'), [{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-4deg)' }, { transform: 'scale(1)' }], { duration: 320 });
    await sleep(200);
  },
  async tollPaid(e) {
    // 내 말이 도깨비 역에 섰다: 점수판에서 토큰이 빠져나가 도깨비 깃발로
    const at = nodeApp(e.node);
    Sound.penalty();
    R().pieces.filter((p) => p.owner === 'me' && p.node === e.node).forEach((p) => act(pieceEl(p.id), 'sad', 1100));
    FX.pow(at[0], at[1] - 64, `통행료 −${e.amount}`, '#6B3FA0', '#FFFDF7', -6);
    drawScore(e.score);
    shake($('#score'), 6, 360);
    await flyCoins(scoreSpot(), at, 4);
    const flag = $('#layer').querySelector(`.flag.kind-goblin[data-node="${e.node}"]`);
    if (flag) tween(flag, [{ transform: 'scale(1)' }, { transform: 'scale(1.3) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 380 });
    await sleep(250);
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
  async sale() {
    Sound.coin();
    toast('역세권 세일 — 오늘 하루 역 값이 반값!');
    await sleep(500);
  },
  async boom() {
    Sound.toll(true);
    for (const el of $('#layer').querySelectorAll('.flag.kind-own')) { el.classList.add('wave'); const [x, y] = nodeApp(el.dataset.node); FX.sparkle(x, y - 40, 5, '#F2B33D'); }
    toast('역세권 호재 — 오늘 하루 내 역 통행료 2배!');
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
    <p>서울 지하철 노선도 위에서 원정대 넷을 <b>출발역</b>에서 <b>종착역</b>까지 보내자. 열차 주사위(1~5역·급행)만큼 달리고, 환승역에서는 갈아탈 호선을 고른다. 날마다 구간이 바뀐다.</p>
    <div class="board-preview"><div class="roller-mini" id="mini"></div>
      <div style="font-size:12.5px;font-weight:700;line-height:1.55">한 번 달릴 때마다 <b>운행 시간</b>이 흐른다(출발 ${CLOCK.trip}분 + 역마다 ${CLOCK.perStop}분). <b>24:00 막차</b>가 지나기 전에 목표 점수를 넘겨야 한다. 역마다 화재·신호 장애 같은 사건이 터진다. 멈춘 역은 <b>점수로 인수</b>해 두면 도깨비 열차가 설 때마다 통행료가 들어온다.</div></div>
    <div class="row"><button class="btn" id="go">알겠다!</button></div>`);
  const mini = s.querySelector('#mini');
  if (Roller3D.ready()) Roller3D.still(mini, B(), null); else Roller.idle(mini);
  s.querySelector('#go').onclick = () => {
    Sound.click();
    if (guideSeen()) roundIntro(); else openGuide(null, roundIntro);
  };
}

// ── 화면 보는 법 ─────────────────────────────────────────────

const GUIDE_KEY = 'malpan.guide.v1';
function guideSeen() { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return true; } }
function markGuideSeen() { try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* 저장 못 해도 괜찮다 */ } }

/**
 * 게임 화면의 표시 하나하나를 실제와 같은 모양으로 보여 주며 설명한다.
 * focus 를 주면 그 항목으로 스크롤해 반짝인다(점수판 줄·위쪽 알약을 누르면 그 항목).
 * then 이 있으면 첫 운행 안내 — 닫은 뒤 그날 소개로 넘어간다.
 */
function openGuide(focus = null, then = null) {
  if (G.busy && !then) return;
  Sound.click();
  const r = R(), b = B();
  const l0 = b.lineAt(b.S);
  const item = (key, mock, title, text) => `
    <div class="g-item" data-key="${key}"><div class="g-mock">${mock}</div><div class="g-txt"><b>${title}</b><p>${text}</p></div></div>`;
  const boss = r.boss
    ? `오늘의 규칙 <b>${r.boss.name}</b> — ${r.boss.id === 'closure' ? `${b.lines[b.closed].name} ${CLOSURE_RULE.desc}` : r.boss.desc}`
    : '수요일·금요일에만 나온다. 그날만 특별한 규칙이 하나 붙는다.';
  const s = sheet(`
    <h2>화면 보는 법</h2>
    <p>게임 중에도 점수판 줄이나 위쪽 알약, <b>?</b> 단추를 누르면 이 설명이 열린다.</p>
    <div class="guide">
      <h3>위 점수판</h3>
      ${item('score', `<div class="hrow score-row"><span class="hl hl-score">점수</span><div class="score-now">590</div><div class="bar"><i style="width:42%"></i></div><div class="score-goal">목표<b>${r.target.toLocaleString()}</b></div></div>`,
        '점수 · 목표', '오늘 모은 점수. 막대가 끝까지 차서 <b>목표</b>를 넘기면 그날 운행 완료. 한 번 달릴 때마다 <b>칩 × 배수</b>만큼 오른다.')}
      ${item('clock', `<div class="hrow clock">${clockHtml({ end: r.end }, 480)}</div>
          <div class="g-swatch"><span><i class="rush"></i>러시아워</span><span><i class="night"></i>심야</span><span><i class="last"></i>막차</span><span><i class="done"></i>지난 시간</span></div>`,
        '시각 · 막차까지', `지금 시각과 막차까지 남은 시간. 한 번 달릴 때마다 시간이 흐른다(출발 ${CLOCK.trip}분 + 역마다 ${CLOCK.perStop}분). <b>${hhmm(r.end)} 막차</b> 전에 목표를 넘겨야 한다.<br>러시아워 이동 칩 +50% · 심야 할증 이동 칩 +25% · 막차 골인 배수 +3`)}
      <h3>위쪽 알약</h3>
      ${item('event', '<span class="pill omen">사건 11:00</span>', '돌발 사건 예고', '이 시각이 되면 돌발 사건이 터진다. 무슨 일인지는 그때 안다. 1시간 안으로 다가오면 빨갛게 깜빡인다.')}
      ${item('boss', '<span class="pill boss">차장</span>', '도깨비 차장', boss)}
      ${item('coin', `<span class="pill">${coin()} ${G.run.coins}</span>`, '토큰', '하루를 마치면 <b>역 매점</b>에서 정기권·노선 연장권을 사는 돈. 일찍 끝내 남긴 운행 시간만큼 더 받는다.')}
      <h3>노선도 위</h3>
      ${item('route', `<span class="route-banner g-banner"><span class="rb-head">오늘 구간</span><b>${b.S}</b><span class="rb-arrow">→</span><b>${b.G}</b><em>최단 ${b.length}역</em></span>`,
        '오늘 구간', '진한 선과 역이 오늘 달릴 수 있는 길이다. 옅은 선은 오늘 구간 밖. 초록 <b>출발역</b>에서 나와 빨간 <b>종착역</b>을 지나면 골인. 큰 동그라미는 <b>환승역</b>(칩 +8) — 다른 호선으로 갈아탈 수 있다.')}
      ${item('estate', `<span class="g-flags"><span class="flag kind-own g-flag">${ownerFlag(30)}<span class="flag-tag">+12</span></span><span class="flag kind-own mono g-flag">${ownerFlag(30)}<span class="flag-tag">+36 ×3</span></span><span class="flag kind-goblin g-flag">${goblinFlag(30)}<span class="flag-tag">−12</span></span></span>`,
        '역 인수 · 통행료', `내 말이 멈춘 역은 출발 전에 <b>점수로 인수</b>할 수 있다(일반역 ${PRICE[1]} · 환승역 ${PRICE[2]} · 세 호선 ${PRICE[3]}). 금빛 깃발이 내 역 — 도깨비 열차가 서면 <b>통행료</b>(값의 4분의 1)가 들어오고, 같은 호선에서 이어서 사면 <b>연결 배수</b>가 오른다 — 통행료 2역 ×2 · 3역 ×3 · 4역 이상 ×4, 내 말이 연결된 내 역에 서면 점수 배수 +1(2역)·+2(3역 이상). 노선망이 클수록 승객이 늘어 그날 목표도 조금씩 오른다. 산 역은 원정이 끝나도 계속 내 것. 보랏빛 깃발은 <b>도깨비 역</b>(수·금) — 내 말이 서면 내가 낸다.`)}
      ${item('incidents', `<span class="g-incidents">${Object.values(INCIDENTS).map((i) => `<span class="incident kind-${i.id} g-inc">${incidentArt(i.id)}<span class="inc-tag">${i.name}</span></span>`).join('')}</span>`,
        '역 사건', `운행 중에 역에서 일이 터지면 <b>속보</b>가 뜨고 그 역에 표시가 생긴다. <b>화재</b>: 연기가 걷힐 때까지 아무도 못 지나간다 · <b>신호 장애</b>: 지나가거나 서면 ${INCIDENTS.delay.delay}분 더 · <b>인파 몰림</b>: 서면 칩 +${INCIDENTS.crowd.chips} · <b>역 버스킹</b>: 서면 배수 +${INCIDENTS.busk.mult}`)}
      ${item('target', '<span class="g-tag"><span class="gain hot">+120<i class="risk">12%</i><i class="mins">75분</i></span></span>',
        '갈 수 있는 역', '노란 고리가 갈 수 있는 역. 이름표는 <b>예상 점수 · 잡힐 확률</b>(초록 "안전"이면 걱정 없음) <b>· 걸리는 시간</b>. 고리를 누르면 그 역으로 달린다.')}
      ${item('marks', `<span class="g-marks"><span class="g-warn">!</span><span class="g-head" style="--lc:${l0.color}">${l0.name}행</span><span class="g-tape">${tape(30)}</span></span>`,
        '말 위 표시', '<b>!</b> 다음 도깨비 차례에 잡힐 수 있다 · <b>○호선행</b> 도깨비 열차가 다음 갈림길에서 탈 호선 · <b>테이프</b> 봉쇄된 역')}
      <h3>아래 조작판</h3>
      ${item('dock', `<span class="g-dock"><span class="hero-chip wait">${character(HEROES[0], 30)}<i class="b">차고</i></span><span class="hero-chip out can">${character(HEROES[1], 30)}<i class="b skill">스킬</i></span></span>`,
        '원정대', '<b>차고</b>에 있는 말은 눌러서 노선에 내보낸다. 노선 위에서 <b>스킬</b> 표시가 뜬 말을 누르면 하루 한 번 스킬을 쓴다.')}
      ${item('throw', '<span class="btn main g-throw">열차 출발</span>',
        '열차 출발 · 다시 굴리기 · 봉쇄', '<b>열차 출발</b>을 꾹 눌렀다 떼면 손맛 게이지(초록에서 떼면 좋은 결과). <b>다시 굴리기</b>는 결과가 마음에 안 들 때, <b>봉쇄 테이프</b>는 출발 전에 역 하나를 3시간 막는다.')}
    </div>
    <div class="row"><button class="btn" id="gOk">${then ? '알겠다! 오늘 운행 보기' : '닫기'}</button></div>`);
  s.classList.add('guide-sheet');
  s.querySelector('#gOk').onclick = () => {
    Sound.click();
    markGuideSeen();
    closeSheet();
    if (then) then();
  };
  if (focus) {
    const el = s.querySelector(`.g-item[data-key="${focus}"]`);
    if (el) { el.classList.add('focus'); requestAnimationFrame(() => el.scrollIntoView({ block: 'center' })); }
  }
}

/** 그날 소개: 구간·목표·도깨비·운행 시계·봉쇄·역 사건·도깨비 차장 */
function roundIntro() {
  const r = R(), b = B();
  const bossInfo = r.boss ? `<div class="boss-card">${character('dokkaebiRed', 56)}<div><b>도깨비 차장 — ${r.boss.name}</b><span>${r.boss.id === 'closure' ? `${b.lines[b.closed].name} ${CLOSURE_RULE.desc}` : r.boss.desc}</span></div></div>` : '';
  const s = sheet(`
    <h2>${dayLabel(r)} 운행${G.run.daily ? '' : ` <small class="day-no">${r.number}/${G.run.rounds.length}</small>`}</h2>
    <div class="route-card"><span>오늘 구간</span><b><i style="--lc:${b.lineAt(b.S).color}"></i>${b.S}</b><em>→</em><b><i style="--lc:${b.lineAt(b.G).color}"></i>${b.G}</b><small>최단 ${b.length}역 · 갈림길 ${b.forks.length}곳</small></div>
    <p><b>${hhmm(CLOCK.start)} 첫차 → ${hhmm(r.end)} 막차</b> 안에 <b>${r.target.toLocaleString()}점</b>을 넘겨라. 도깨비 열차 ${r.pieces.filter((p) => p.owner === 'opp').length}대가 ${b.G} 쪽에서 거꾸로 달려온다.</p>
    <div class="legend">
      <div>${character('dokkaebiRed', 34)}<span><b>빨간 도깨비</b><br>내 말을 들이받으러 온다</span></div>
      <div>${character('dokkaebiBlue', 34)}<span><b>파란 도깨비</b><br>끝까지 가면 운행 지연 +${CLOCK.delay}분</span></div>
    </div>
    <div class="metro-intro">
      <div class="mi-time"><b>운행 시계</b>07~09시·18~20시 러시아워(이동 칩 +50%) · 22시 심야 할증(+25%) · 23시 막차(골인 배수 +3)</div>
      ${networkGrowth(r.owned) > 0 ? `<div class="mi-time own-line"><b>내 노선망 역 ${holdings(r.owned).count}곳</b>승객이 늘어 오늘 목표 +${Math.round(networkGrowth(r.owned) * 100)}%</div>` : ''}
      <div class="mi-time own-line"><b>역 인수</b>멈춘 역을 점수로 사 두면 도깨비 열차가 설 때마다 통행료. 같은 호선에서 이어서 사면 배수 ×2·×3·×4 · 산 역은 계속 내 것</div>
      ${r.goblinStations.length ? `<div class="mi-time goblin-line"><b>도깨비 역</b>${r.goblinStations.join(' · ')} — 내 말이 서면 통행료를 낸다</div>` : ''}
      <div class="mi-time tape-line"><b>봉쇄 테이프 ×${r.blockadesLeft}</b>역 하나를 ${BLOCKADE.minutes / 60}시간 동안 막아 도깨비 열차가 못 지나가게 한다</div>
      <div class="mi-lines">${Object.values(INCIDENTS).map((i) => `<span class="mi-inc kind-${i.id}">${incidentArt(i.id, 22)}<b>${i.name}</b>${i.desc}</span>`).join('')}</div>
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
  const art = (o) => o.kind === 'charm' ? charmCard(o.id) : lineArt();
  const info = (o) => {
    if (o.kind === 'charm') { const c = charmById(o.id); return { kind: '정기권', name: c.name, desc: c.desc }; }
    return { kind: '노선', name: LINE_PASS.name, desc: LINE_PASS.desc + (run.extraLines ? ` (지금 ${run.extraLines}장)` : '') };
  };
  const s = sheet(`
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h2>역 매점</h2><span class="pill">${coin()} ${run.coins}</span>
    </div>
    <p>내일은 <b>${next.day}요일</b> · <b>${routeFor(run, run.roundNo + 1).join(' → ')}</b> · 목표 ${next.target.toLocaleString()}점 · 도깨비 열차 ${next.opp}대${next.boss ? ' · <b style="color:var(--red)">도깨비 차장</b>' : ''}</p>
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
    G.run = createRun(run.daily ? dailySeed() : Date.now() & 0x7fffffff, { daily: run.daily, owned: run.owned });
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
