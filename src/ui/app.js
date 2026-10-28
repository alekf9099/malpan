// 화면 컨트롤러 — 역전(驛戰): 역을 차지하라.
// 규칙은 core(match.js)가 전부 처리하고, 여기서는 core 가 돌려준 이벤트를 차례로 연출한다.
//   스플래시 → 메인 홈(내 캐릭터·상대 수) → 캐릭터 선택 · 도감 · 랭킹 → 대결 화면 → 결과
// 대결 화면: 위 플레이어 판(돈·역 수·차례) + 시계 / 가운데 서울 노선도 / 아래 내 조작판(출발·스킬·노선 투자)
// 내 차례에는 갈림길마다 갈 방향을 고르고, AI 차례는 저절로 빠르게 흘러간다.

import {
  createMatch, roll, move, decide, useSkill, skillBlocked, invest, investable, current, playerById, alive, assets, stationsOf,
  tollFor, upgradeFor, nextStations, stopsAt, timeOf, hhmm, CLOCK, START_MONEY, GOAL_BONUS, PASS_RATE, isChance, incidentAt
} from '../core/match.js';
import { choosePath, decideOffer, wantsSkill, chooseInvest } from '../core/ai.js';
import { HEROES as HERO_DATA, heroById, SKILL_USES } from '../core/heroes.js';
import { LINES, STATION_LINES, dist, lineOfEdge } from '../core/boards/seoul.js';
import { BOARDS } from '../core/boards/index.js';
import { links, chainOf, LEVEL_NAME, LEVEL_MULT, MAX_LEVEL, stationPrice, baseToll } from '../core/estate.js';
import { INCIDENTS } from '../core/incidents.js';
import { matchPoints } from '../core/ranking.js';
import { character, act, face, coin, ownerFlag } from './art.js';
import { boardSvg, nodeXY, depth, pieceSize, canvasSize } from './board-view.js';
import * as Camera from './camera.js';
import { sleep, tween, hop, drop, knockOut, squish, shake, flash, fly } from './anim.js';
import * as FX from './fx.js';
import * as Roller from './roller.js';
import * as Roller3D from './roller3d.js';
import * as Records from './records.js';
import * as Prefs from './prefs.js';
import { Sound } from './sound.js';

// 게임 이름은 여기 한 곳에서만 바꾼다
export const GAME_TITLE = { main: '역전', hanja: '驛戰', sub: '역을 차지하라 — 서울 지하철 땅따먹기' };

const app = document.getElementById('app');
const G = { m: null, busy: false, size: 4, wait: null, daily: false };
const $ = (sel) => app.querySelector(sel);
const M = () => G.m;
const ids = HERO_DATA.map((h) => h.id);
const ME = () => M().players[0];
const colorOf = (p) => heroById(p.hero).color;
const nameOf = (p) => heroById(p.hero).name;
const TIME_NAME = { rush: '러시아워', night: '심야', last: '막차' };

// ── 스플래시 ────────────────────────────────────────────────

/** 호선 색 선이 그려지고 역이 찍힌 뒤 로고·열차 주사위·캐릭터가 튀어나온다. 누르거나 2.8초 뒤 메인 홈 */
function splash() {
  app.className = 'app splash-app';
  const lines = [1, 2, 3, 4, 5, 7].map((id, i) => {
    const y = 120 + i * 104;
    const c = LINES[id].color;
    const d = i % 2 ? `M -40 ${y} C 120 ${y - 60}, 260 ${y + 70}, 430 ${y - 20}` : `M 430 ${y} C 280 ${y + 60}, 120 ${y - 70}, -40 ${y + 10}`;
    const dots = [0.25, 0.55, 0.8].map((t, j) => `<circle class="sp-dot" style="animation-delay:${0.5 + i * 0.12 + j * 0.1}s" cx="${i % 2 ? -40 + 470 * t : 430 - 470 * t}" cy="${y + (j - 1) * 12}" r="9"/>`).join('');
    return `<path class="sp-line" style="--lc:${c};animation-delay:${i * 0.12}s" d="${d}"/>${dots}`;
  }).join('');
  const word = (t, base) => [...t].map((ch, i) => `<span class="sp-ch" style="animation-delay:${base + i * 0.12}s">${ch}</span>`).join('');
  app.innerHTML = `
    <div class="splash" id="splash">
      <svg class="sp-lines" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${lines}</svg>
      <div class="sp-logo">
        <div class="sp-die">${Roller.metroDieIcon()}</div>
        <div class="logo3"><b>${word(GAME_TITLE.main, 0.9)}</b><i>${GAME_TITLE.hanja}</i></div>
        <div class="sp-sub">${GAME_TITLE.sub}</div>
      </div>
      <div class="sp-cast">${HERO_DATA.map((h, i) => `<span style="animation-delay:${1.3 + i * 0.12}s">${character(h.id, 64, 'cheer')}</span>`).join('')}</div>
      <div class="sp-tap">화면을 눌러 시작</div>
    </div>`;
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    Sound.unlock(); Sound.whoosh();
    $('#splash').classList.add('out');
    setTimeout(() => title(true), 380);
  };
  $('#splash').onclick = go;
  setTimeout(go, 2800);
}

// ── 메인 홈 ─────────────────────────────────────────────────

const myIndex = () => ids.indexOf(Prefs.getLeader(ids));

function title(fromSplash = false) {
  G.m = null;
  app.className = 'app home-app';
  document.title = `${GAME_TITLE.main}(${GAME_TITLE.hanja}): 역을 차지하라`;
  const li = myIndex(), h = HERO_DATA[li];
  const rank = Records.summary();
  const rivals = Prefs.getRivals();
  const today = new Date();
  app.innerHTML = `
    <div class="home ${fromSplash ? 'enter' : ''}">
      <div class="home-top">
        <div class="logo3 small"><b>${GAME_TITLE.main}</b><i>${GAME_TITLE.hanja}</i></div>
        <button class="btn small white icon-btn" id="snd" aria-label="소리">${Sound.isOn() ? '♪' : '✕'}</button>
      </div>
      <div class="home-stage">
        <div class="home-lines" aria-hidden="true">${[1, 2, 3, 4, 5].map((id) => `<i style="--lc:${LINES[id].color}"></i>`).join('')}</div>
        <div class="home-pad"></div>
        <div class="home-hero" id="homeHero">${character(h.id, 220, 'idle')}</div>
        <div class="home-name"><span class="crown" style="background:${h.color}">내 캐릭터</span><b>${h.job} ${h.name}</b><em>${h.skill} · 스킬 ${h.active.name}</em></div>
        <button class="btn yellow pick-btn" id="pickBtn">${character(h.id, 30)}캐릭터 선택</button>
      </div>
      <div class="rival-row">
        <span>상대</span>
        <button class="btn small white" id="rvMinus" aria-label="상대 줄이기">−</button>
        <div class="rv-faces">${HERO_DATA.filter((x) => x.id !== h.id).slice(0, rivals).map((x) => character(x.id, 34)).join('')}</div>
        <b>${rivals}명</b>
        <button class="btn small white" id="rvPlus" aria-label="상대 늘리기">+</button>
      </div>
      <div class="home-play">
        <button class="btn" id="start">대결 시작<small class="btn-sub">06:00 첫차 → 24:00 막차 · 파산시키거나 자산 1등</small></button>
        <button class="btn white daily-btn" id="daily"><b>오늘의 대결</b><span>${today.getMonth() + 1}월 ${today.getDate()}일 · 오늘은 누구나 같은 판</span></button>
      </div>
      <nav class="home-nav">
        <button data-go="pick"><span class="ic">${character(h.id, 34)}</span><b>캐릭터</b></button>
        <button data-go="dex"><span class="ic book">도감</span><b>도감</b></button>
        <button data-go="rank"><span class="ic trophy">${rank.wins || 0}</span><b>랭킹</b></button>
        <button data-go="guide"><span class="ic qm">?</span><b>하는 법</b></button>
      </nav>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  $('#snd').onclick = () => { Sound.toggle(); Sound.unlock(); $('#snd').textContent = Sound.isOn() ? '♪' : '✕'; };
  $('#pickBtn').onclick = () => { Sound.unlock(); Sound.click(); pickHero(li); };
  $('#homeHero').onclick = () => { Sound.unlock(); Sound.click(); act($('#homeHero'), 'cheer', 1200); };
  $('#rvMinus').onclick = () => { Sound.click(); Prefs.setRivals(Math.max(1, rivals - 1)); title(); };
  $('#rvPlus').onclick = () => { Sound.click(); Prefs.setRivals(Math.min(3, rivals + 1)); title(); };
  app.querySelectorAll('.home-nav [data-go]').forEach((b) => {
    b.onclick = () => {
      Sound.unlock(); Sound.click();
      const go = b.dataset.go;
      if (go === 'pick') pickHero(li); else if (go === 'dex') dex(li); else if (go === 'rank') ranking(); else guide();
    };
  });
  $('#start').onclick = () => startGame(false);
  $('#daily').onclick = () => startGame(true);
  if (fromSplash) setTimeout(() => act($('#homeHero'), 'cheer', 1000), 350);
  Roller3D.load();
}

// ── 캐릭터 선택 ─────────────────────────────────────────────

function pickHero(i = myIndex()) {
  app.className = 'app pick-app';
  const h = HERO_DATA[i];
  const mine = i === myIndex();
  const thumbs = HERO_DATA.map((x, j) => `<button class="pk-thumb ${j === i ? 'on' : ''}" data-i="${j}">${character(x.id, 50)}${j === myIndex() ? '<i class="crown">내 캐릭터</i>' : ''}<span>${x.name}</span></button>`).join('');
  app.innerHTML = `
    <div class="pick">
      <div class="dex-head"><button class="btn small white" id="pkBack">← 처음으로</button><b>캐릭터 선택</b></div>
      <div class="pk-stage" style="--hc:${h.color}">
        <div class="pk-spot"></div>
        <button class="pk-arrow left" id="pkPrev" aria-label="이전">◀</button>
        <div class="pk-hero" id="pkHero">${character(h.id, 230, 'idle')}</div>
        <button class="pk-arrow right" id="pkNext" aria-label="다음">▶</button>
        <div class="pk-name"><b>${h.job} ${h.name}</b><span>${i + 1} / ${HERO_DATA.length}</span></div>
      </div>
      <div class="pk-cards">
        <div class="pk-card"><span class="pk-kind">능력 · ${h.skill}</span><p>${h.desc}</p></div>
        <div class="pk-card skill"><span class="pk-kind">스킬 · ${h.active.name} (한 판에 ${SKILL_USES}번)</span><p>${h.active.desc}</p></div>
        <div class="pk-card lead"><span class="pk-kind">AI 가 맡으면 · ${h.ai.name}</span><p>${AI_NOTE[h.id]}</p></div>
      </div>
      <div class="pk-thumbs">${thumbs}</div>
      <div class="pk-btns">
        <button class="btn white" id="pkDex">자세히 보기</button>
        <button class="btn ${mine ? 'white' : 'yellow'}" id="pkChoose" ${mine ? 'disabled' : ''}>${mine ? '지금 내 캐릭터' : '이 캐릭터로'}</button>
      </div>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  const n = HERO_DATA.length;
  const flip = (to, dir) => {
    Sound.click();
    pickHero(to);
    tween($('#pkHero'), [{ transform: `translateX(${dir * 120}px) scale(.8)`, opacity: 0 }, { transform: 'translateX(0) scale(1)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1.2)' });
  };
  $('#pkPrev').onclick = () => flip((i + n - 1) % n, -1);
  $('#pkNext').onclick = () => flip((i + 1) % n, 1);
  app.querySelectorAll('.pk-thumb').forEach((b) => { b.onclick = () => { const j = Number(b.dataset.i); if (j !== i) flip(j, j > i ? 1 : -1); }; });
  $('#pkBack').onclick = () => { Sound.click(); title(); };
  $('#pkDex').onclick = () => { Sound.click(); dex(i); };
  $('#pkHero').onclick = () => { Sound.click(); act($('#pkHero'), 'dance', 1200); };
  if (!mine) $('#pkChoose').onclick = async () => {
    Prefs.setLeader(h.id);
    Sound.unlock(); Sound.big();
    const hero = $('#pkHero');
    act(hero, 'cheer', 1400);
    const r = hero.getBoundingClientRect(), a = app.getBoundingClientRect(), k = r.width / hero.offsetWidth;
    const x = (r.left - a.left) / k + hero.offsetWidth / 2, y = (r.top - a.top) / k + 40;
    FX.confetti(x, y, 36, 1.3);
    FX.pow(x, y - 10, '결정!', h.color, '#22201D', -6);
    $('#pkChoose').disabled = true;
    await sleep(1000);
    title();
  };
}

const AI_NOTE = {
  tiger: '남겨 둘 돈을 적게 잡고 보이는 역은 거의 다 산다. 목적지를 향해 곧장 달린다.',
  rabbit: '돈을 넉넉히 남겨 두고 신중하게 산다. 이어지는 역이면 좀 더 과감해진다.',
  parrot: '환승역을 좋아해서 큰 역부터 모은다.',
  panda: '같은 호선을 이어서 사고, 돈이 생기면 증축에 쏟는다.'
};

// ── 도감 ───────────────────────────────────────────────────

const ACT_LABEL = { idle: '대기', walk: '걷기', cheer: '환호', sad: '좌절', dance: '춤' };
const DEX_LINE = { tiger: '첫차를 모는 기관사', rabbit: '발 빠른 역무원', parrot: '목청 좋은 안내원', panda: '든든한 보안관' };

function dex(which = 0) {
  app.className = 'app dex-app';
  const h = HERO_DATA[which];
  const tabs = HERO_DATA.map((x, i) => `<button class="dex-tab ${which === i ? 'on' : ''}" data-tab="${i}">${character(x.id, 40)}<span>${x.name}</span></button>`).join('');
  app.innerHTML = `
    <div class="dex">
      <div class="dex-head"><button class="btn small white" id="dexBack">← 처음으로</button><b>캐릭터 도감</b></div>
      <div class="dex-tabs">${tabs}</div>
      <div class="dex-body">
        <div class="dex-stage"><div class="dex-floor"></div><div class="dex-char">${character(h.id, 210)}</div>
          <div class="dex-acts">${Object.entries(ACT_LABEL).map(([a, l]) => `<button class="${a === 'idle' ? 'on' : ''}" data-act="${a}">${l}</button>`).join('')}</div></div>
        <div class="dex-info">
          <div class="dex-name"><b>${h.job} ${h.name}</b><span>${DEX_LINE[h.id]}</span></div>
          <div class="dex-card"><span class="kind">능력 · 늘 켜져 있다</span><h3>${h.skill}</h3><p>${h.desc}</p></div>
          <div class="dex-card skill"><span class="kind">스킬 · 한 판에 ${SKILL_USES}번</span><h3>${h.active.name}</h3><p>${h.active.desc}</p>
            <div class="dex-rule">내 차례에 · 굴리기 전에</div><button class="btn small yellow" id="dexSkill">스킬 연출 보기</button></div>
          <div class="dex-card tip"><span class="kind">AI 가 맡으면 · ${h.ai.name}</span><p>${AI_NOTE[h.id]}</p></div>
        </div>
      </div>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  $('#dexBack').onclick = () => { Sound.click(); title(); };
  app.querySelectorAll('.dex-tab').forEach((t) => { t.onclick = () => { Sound.click(); dex(Number(t.dataset.tab)); }; });
  const big = app.querySelector('.dex-char');
  app.querySelectorAll('.dex-acts button').forEach((b) => {
    b.onclick = () => { Sound.click(); app.querySelectorAll('.dex-acts button').forEach((x) => x.classList.toggle('on', x === b)); act(big, b.dataset.act); };
  });
  $('#dexSkill').onclick = async (ev) => {
    const btn = ev.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true; Sound.unlock();
    await skillCutin({ hero: h.id, name: h.active.name, desc: h.active.desc });
    act(big, 'cheer', 1200);
    btn.disabled = false;
  };
}

// ── 랭킹 ───────────────────────────────────────────────────

function ranking() {
  app.className = 'app dex-app';
  const m = Records.summary();
  const t = m.title, next = t.next;
  const pct = next ? Math.min(100, Math.round((100 * (m.total - t.min)) / (next.min - t.min))) : 100;
  const date = (at) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const rows = m.games.length ? m.games.map((g, i) => `
      <div class="rank-row ${i < 3 ? 'top' + (i + 1) : ''}">
        <span class="no">${i + 1}</span>
        <div class="what"><b>${character(g.hero, 26)} ${g.place}등 / ${g.size}명</b><span>${g.daily ? '오늘의 대결' : '대결'} · ${date(g.at)}</span></div>
        <b class="pts">${g.points}</b>
      </div>`).join('') : '<p class="rank-empty">아직 기록이 없다. 대결에서 등수에 들면 승점이 쌓인다.</p>';
  app.innerHTML = `
    <div class="dex">
      <div class="dex-head"><button class="btn small white" id="dexBack">← 처음으로</button><b>랭킹</b></div>
      <div class="rank-me">
        <span class="kind">이 기기의 내 기록</span>
        <h3>${t.name}</h3>
        <div class="rank-total"><b>${m.total.toLocaleString()}</b><span>누적 승점 · ${m.plays || 0}판 ${m.wins || 0}승</span></div>
        <div class="bar rank-bar"><i style="width:${pct}%"></i></div>
        <p>${next ? `${next.name}까지 ${(next.min - m.total).toLocaleString()}점` : '가장 높은 칭호에 올랐다'}</p>
      </div>
      <div class="rank-rule">1등 +30(상대 한 명마다 +5, 파산으로 이기면 +10) · 2등 +15 · 3등 +5</div>
      <div class="rank-list">${rows}</div>
    </div>`;
  $('#dexBack').onclick = () => { Sound.click(); title(); };
}

// ── 하는 법 ────────────────────────────────────────────────

function guide(then = null) {
  const steps = [
    ['열차 출발', '열차 주사위(1~5역 · 급행 7역+한 번 더)만큼 달린다. 꾹 눌렀다 떼면 손맛 게이지 — 초록에서 떼면 좋은 결과.'],
    ['갈림길', '환승역에서 갈 방향을 고른다. 노란 화살표를 누른다. 왔던 역으로는 되돌아가지 않는다.'],
    ['역 사기 · 증축', '빈 역에 서면 산다(일반역 100 · 환승역 180 · 큰 환승역 260). 내 역에 다시 서면 증축 — 2단계, 3단계는 랜드마크.'],
    ['통행료 · 통과 요금', '남의 역에 서면 통행료, 지나가기만 해도 통행료의 20%. 같은 호선에서 이어진 역이 많을수록(×2~×4), 단계가 높을수록(×3 · ×7) 비싸다.'],
    ['인수', '남의 역은 통행료를 낸 뒤 1.5배 값에 빼앗을 수 있다. 랜드마크는 못 빼앗는다.'],
    ['노선 투자', '내 차례에 굴리기 전, 이어진(2역 이상) 내 역은 어디서든 증축할 수 있다.'],
    ['목적지', `저마다 목적지 역이 있다. 지나가거나 서면 +${GOAL_BONUS}, 새 목적지를 받는다.`],
    ['찬스 역 · 역 사건', '? 역에 서면 찬스 카드. 화재(못 들어감) · 신호 장애(거기서 멈춤) · 인파(+100, 통행료 2배) · 버스킹(한 번 더)이 역마다 터진다.'],
    ['이기기', '통행료를 못 내면 역을 팔아서라도 내고, 그래도 모자라면 파산. 마지막 한 명이 남거나 24:00 막차 때 자산(돈+역 값) 1등이 이긴다.']
  ];
  const s = sheet(`<h2>하는 법</h2>
    <div class="howto">${steps.map(([t, d], i) => `<div class="ht"><b>${i + 1}</b><div><h4>${t}</h4><p>${d}</p></div></div>`).join('')}</div>
    <div class="row"><button class="btn" id="gOk">${then ? '알겠다! 출발' : '닫기'}</button></div>`);
  s.querySelector('#gOk').onclick = () => { Sound.click(); Prefs.markGuide(); closeSheet(); if (then) then(); };
}

// ── 대결 시작 ──────────────────────────────────────────────

function startGame(daily) {
  Sound.unlock(); Sound.click();
  const me = Prefs.getLeader(ids);
  const rivals = ids.filter((x) => x !== me).slice(0, Prefs.getRivals());
  const q = new URLSearchParams(location.search);
  const fixed = parseInt(q.get('seed'), 10);
  const today = new Date();
  const seed = daily ? today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
    : Number.isNaN(fixed) ? (Date.now() & 0x7fffffff) : fixed;
  G.daily = daily;
  G.m = createMatch({ seed, heroes: [me, ...rivals], humans: 1, daily });
  enterGame();
}

function enterGame() {
  app.className = 'app game';
  app.innerHTML = `
    <div class="hud" id="hud">
      <div class="players" id="players"></div>
      <div class="clockbar" id="clock"></div>
    </div>
    <div class="board-wrap" id="board"><div id="cam"><div id="mat"></div><div id="layer"></div></div>
      <div class="stamp-spot" id="stampSpot"></div><div class="roller-float" id="roller"></div>
      <div class="hint" id="hint"></div>
      <button class="btn small white zoom-btn" id="zoom">서울 전체</button>
      <button class="btn small white help-btn2" id="help" aria-label="하는 법">?</button></div>
    <div class="dock" id="dock">
      <div class="me-row" id="meRow"></div>
      <div class="controls">
        <div class="throw-wrap"><button class="btn main" id="throw">열차 출발</button></div>
        <div class="side"><button class="btn small white" id="skillBtn"></button><button class="btn small white" id="investBtn"></button></div>
      </div>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  Camera.attach($('#board'), $('#cam'), canvasSize());
  wireGauge($('#throw'));
  $('#skillBtn').onclick = onSkill;
  $('#investBtn').onclick = openInvest;
  $('#zoom').onclick = () => { Sound.click(); if (Camera.showingWhole()) showPlayer(current(M())); else Camera.whole(); setTimeout(drawZoom, 0); };
  $('#help').onclick = () => { if (!G.busy) guide(); };
  $('#mat').onclick = onMapTap;
  drawBoard();
  drawPieces();
  drawMarks();
  drawHud();
  drawControls();
  Camera.follow(nodeXY(ME().node), 0);
  drawZoom();
  intro();
}

/** 첫 화면: 누가 누구와, 어디서 출발 */
function intro() {
  const m = M();
  const s = sheet(`
    <span class="kind">${G.daily ? '오늘의 대결' : '대결'} · ${m.players.length}명</span>
    <h2 style="margin-top:6px">${hhmm(CLOCK.start)} 첫차 출발!</h2>
    <div class="vs">${m.players.map((p, i) => `<div class="vs-p ${i ? '' : 'me'}" style="--pc:${colorOf(p)}">${character(p.hero, 54, 'cheer')}<b>${i ? nameOf(p) : '나'}</b><span>${p.node}</span></div>`).join('<i>VS</i>')}</div>
    <p>모두 <b>${START_MONEY.toLocaleString()}점</b>으로 시작. 역을 사서 통행료로 상대를 <b>파산</b>시키거나, <b>24:00 막차</b> 때 자산 1등이 이긴다.</p>
    <div class="row"><button class="btn white" id="how">하는 법</button><button class="btn" id="go">출발!</button></div>`);
  s.querySelector('#how').onclick = () => { Sound.click(); guide(() => loop()); };
  s.querySelector('#go').onclick = () => { Sound.click(); closeSheet(); if (!Prefs.seenGuide()) guide(() => loop()); else loop(); };
}

// ── 차례 돌리기 ────────────────────────────────────────────

async function loop() {
  const m = M();
  while (m === M() && m.phase !== 'over') {
    const p = current(m);
    if (p.human) await humanTurn(p); else await aiTurn(p);
  }
  if (m === M() && m.phase === 'over') await results();
}

/** 내 차례: 출발·스킬·노선 투자를 기다린다. 달리는 중엔 갈림길을 고르고, 거래 제안엔 답한다 */
async function humanTurn(p) {
  const m = M();
  showPlayer(p);
  await new Promise((resolve) => { G.wait = resolve; drawControls(); });
  G.wait = null;
  if (m.phase === 'move') {
    const path = await pickPath();
    await play(move(m, path));
  }
  if (m.phase === 'decide') {
    const yes = await offerPrompt();
    await play(decide(m, yes));
  }
}

/** AI 차례: 노선 투자 → 스킬 → 굴리기 → 길 → 거래, 빠르게 */
async function aiTurn(p) {
  const m = M();
  await play([{ type: 'turnStart', player: p.id }]);
  for (let n = chooseInvest(m); n; n = chooseInvest(m)) await play(invest(m, n));
  if (wantsSkill(m)) await play(useSkill(m));
  await play(roll(m));
  if (m.phase === 'move') await play(move(m, choosePath(m)));
  if (m.phase === 'decide') { await sleep(250); await play(decide(m, decideOffer(m))); }
}

async function onThrow(quality = 'normal') {
  const m = M();
  if (G.busy || !m || m.phase !== 'roll' || !current(m).human || !G.wait) return;
  Sound.unlock();
  hideFork();
  // 손맛 게이지: 굿이면 두 번, 퍼펙트면 세 번 굴려 큰 쪽, 삐끗이면 두 번 중 작은 쪽
  const n = quality === 'perfect' ? 3 : quality === 'good' || quality === 'slip' ? 2 : 1;
  const tries = Array.from({ length: n }, () => m.rng.next());
  const pickV = quality === 'slip' ? Math.min(...tries) : Math.max(...tries);
  let used = false;
  const rng = { next: () => (used ? m.rng.next() : ((used = true), pickV)), shuffle: (a) => m.rng.shuffle(a) };
  await play(roll(m, rng));
  G.wait?.();
}

async function onSkill() {
  const m = M();
  if (G.busy || !current(m).human || skillBlocked(m)) { Sound.deny(); if (skillBlocked(m)) toast(skillBlocked(m)); return; }
  Sound.unlock();
  await play(useSkill(m));
  drawControls();
}

// ── 갈림길 고르기 ──────────────────────────────────────────

/** 갈림길마다 갈 역을 고르게 하며 길을 만든다. 갈 곳이 하나면 저절로 나아간다 */
async function pickPath() {
  const m = M(), p = current(m);
  let node = p.node, back = p.prev, left = m.pending.steps;
  const path = [];
  while (left > 0) {
    if (path.length && stopsAt(m, node)) break;
    const next = nextStations(m, node, back);
    if (!next.length) break;
    const choice = next.length === 1 ? next[0] : await askFork(node, back, next, left, path);
    path.push(choice);
    back = node; node = choice; left--;
    drawRoute(path);
  }
  hideFork();
  clearRoute();
  return path;
}

/** 갈림길: 갈 수 있는 다음 역마다 화살표 단추(호선 색·역 이름·그 역의 값) */
function askFork(node, back, next, left, path) {
  const m = M(), p = current(m);
  const pts = [node, ...next].map(nodeXY);
  Camera.frame(pts, { maxZoom: 0.9, pad: 150 });
  drawZoom();
  setHint(`갈림길 — 갈 방향을 고르세요 · 남은 ${left}역`);
  Sound.click();
  return new Promise((resolve) => {
    hideFork();
    for (const n of next) {
      const line = LINES[lineOfEdge(node, n)];
      const [x0, y0] = nodeXY(node), [x, y] = nodeXY(n);
      const ang = Math.atan2(y - y0, x - x0) * 180 / Math.PI;
      const owner = m.owned[n];
      const info = owner && owner !== p.id ? `<em class="bad">${owner === p.id ? '' : '남의 역'}</em>`
        : owner === p.id ? '<em class="mine">내 역</em>' : isChance(n) ? '<em class="chance">찬스</em>' : '';
      const toward = dist(n, p.goal) < dist(node, p.goal) ? '<em class="goal">목적지 쪽</em>' : '';
      const el = document.createElement('button');
      el.className = 'fork';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.setProperty('--lc', line?.color || '#22201D');
      el.innerHTML = `<i class="arrow" style="transform:rotate(${ang}deg)">➜</i><span><b>${line?.name || ''}</b> ${n}</span>${info}${toward}`;
      el.onclick = (ev) => { ev.stopPropagation(); Sound.click(); hideFork(); setHint(''); resolve(n); };
      $('#layer').appendChild(el);
    }
  });
}
function hideFork() { $('#layer')?.querySelectorAll('.fork').forEach((f) => f.remove()); }

function drawRoute(path) {
  clearRoute();
  path.forEach((n, i) => {
    const [x, y] = nodeXY(n);
    const d = document.createElement('div');
    d.className = 'route-dot';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.textContent = i + 1;
    $('#layer').appendChild(d);
  });
}
function clearRoute() { $('#layer')?.querySelectorAll('.route-dot').forEach((d) => d.remove()); }

// ── 거래 제안(내 차례) ─────────────────────────────────────

function offerPrompt() {
  const m = M(), p = current(m), o = m.offer;
  const lines = STATION_LINES[o.node].map((l) => `<i style="--lc:${LINES[l].color}"></i>`).join('');
  const nextOwned = { ...m.owned, [o.node]: p.id };
  const chain = Math.min(4, links(nextOwned, p.id).at[o.node]?.len || 1);
  const lvAfter = o.kind === 'upgrade' ? o.level : m.levels[o.node] || 1;
  const toll = Math.round(stationPrice(o.node) * 0.3 * LEVEL_MULT[lvAfter] * chain);
  const title = o.kind === 'buy' ? '이 역을 살까?' : o.kind === 'upgrade' ? `${LEVEL_NAME[o.level]}(으)로 증축할까?` : `${nameOf(playerById(m, o.from))}의 역을 인수할까?`;
  const btn = o.kind === 'buy' ? '사기' : o.kind === 'upgrade' ? '증축' : '인수';
  Camera.follow([nodeXY(o.node)[0], nodeXY(o.node)[1] + 110], 300);
  return new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'offer-card kind-' + o.kind;
    card.innerHTML = `
      <div class="oc-sign">${lines}<b>${o.node}</b></div>
      <div class="oc-body"><span>${title}</span>
        <em>값 <b>${o.price.toLocaleString()}점</b> · 남는 돈 ${(p.money - o.price).toLocaleString()} · 통행료 약 <b>${toll}</b>${chain > 1 ? ` · <strong>${chain}역 연결 ×${chain}</strong>` : ''}</em></div>
      <div class="oc-btns"><button class="btn small white" data-a="no">지나치기</button><button class="btn small yellow" data-a="yes">${o.price.toLocaleString()}점에 ${btn}</button></div>`;
    $('#board').appendChild(card);
    tween(card, [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.3,.7,.3,1.2)' });
    card.querySelector('[data-a=no]').onclick = () => { Sound.click(); card.remove(); resolve(false); };
    card.querySelector('[data-a=yes]').onclick = () => { Sound.unlock(); card.remove(); resolve(true); };
  });
}

// ── 노선 투자(굴리기 전 증축) ───────────────────────────────

function openInvest() {
  const m = M();
  if (G.busy || !current(m).human || m.phase !== 'roll') { Sound.deny(); return; }
  const can = investable(m);
  if (!can.length) { Sound.deny(); toast('이어진 내 역(2역 이상)이 있어야 어디서든 증축할 수 있다'); return; }
  Sound.click();
  const p = current(m);
  const rows = can.map((n) => {
    const lv = m.levels[n];
    const now = baseToll(m.owned, m.levels, n), after = baseToll(m.owned, { ...m.levels, [n]: lv + 1 }, n);
    return `<button class="inv-row" data-n="${n}"><b>${n}</b><span>${LEVEL_NAME[lv]} → ${LEVEL_NAME[lv + 1]}</span><em>통행료 ${now} → ${after}</em><i>${upgradeFor(m, n, p)}점</i></button>`;
  }).join('');
  const s = sheet(`<h2>노선 투자</h2><p>이어진 내 역은 어디서든 증축할 수 있다. 가진 돈 <b>${p.money.toLocaleString()}점</b></p>
    <div class="inv-list">${rows}</div><div class="row"><button class="btn white" id="invClose">닫기</button></div>`);
  s.querySelectorAll('.inv-row').forEach((b) => {
    b.onclick = async () => {
      closeSheet();
      await play(invest(m, b.dataset.n));
      drawControls();
      if (investable(m).length) openInvest();
    };
  });
  s.querySelector('#invClose').onclick = () => { Sound.click(); closeSheet(); };
}

// ── 그리기 ─────────────────────────────────────────────────

function drawBoard() {
  const m = M();
  const owner = {}, linkEdges = [];
  for (const [n, o] of Object.entries(m.owned)) owner[n] = colorOf(playerById(m, o));
  for (const p of m.players) if (!p.out) for (const e of links(m.owned, p.id).edges) linkEdges.push({ ...e, color: colorOf(p) });
  $('#mat').innerHTML = boardSvg({ owner, level: m.levels, links: linkEdges });
}

function pieceEl(pid) {
  let el = $('#layer').querySelector(`[data-piece="${pid}"]`);
  if (!el) {
    const p = playerById(M(), pid);
    el = document.createElement('div');
    el.className = 'piece' + (p.human ? ' me' : '');
    el.dataset.piece = pid;
    el.style.setProperty('--pc', colorOf(p));
    const s = pieceSize();
    el.style.width = el.style.height = s + 'px';
    el.innerHTML = `<span class="ring"></span>${character(p.hero)}<span class="tag">${p.human ? '나' : nameOf(p)}</span>`;
    $('#layer').appendChild(el);
  }
  return el;
}

/** 같은 역에 여럿이면 옆으로 조금씩 비켜 세운다 */
function place(el, node, slot = 0, count = 1) {
  const [x, y] = nodeXY(node);
  const s = pieceSize();
  const dx = (slot - (count - 1) / 2) * 30;
  el.style.left = x - s / 2 + dx + 'px';
  el.style.top = y - s * 0.92 + 'px';
  el.style.zIndex = depth(y) + 20 + slot;
  return [x + dx, y];
}

function drawPieces() {
  const m = M();
  const at = {};
  for (const p of m.players) {
    const el = pieceEl(p.id);
    if (p.out) { el.style.display = 'none'; continue; }
    el.style.display = '';
    (at[p.node] ||= []).push(p);
  }
  for (const list of Object.values(at)) list.forEach((p, i) => place(pieceEl(p.id), p.node, i, list.length));
  for (const p of m.players) pieceEl(p.id).classList.toggle('turn', current(m) === p && m.phase !== 'over');
}

/** 목적지 깃발(사람마다 색) · 역 사건 표시 */
function drawMarks() {
  const m = M();
  $('#layer').querySelectorAll('.goal-flag, .incident').forEach((e) => e.remove());
  for (const p of m.players) {
    if (p.out) continue;
    const el = document.createElement('div');
    el.className = 'goal-flag' + (p.human ? ' me' : '');
    el.dataset.player = p.id;
    el.style.setProperty('--pc', colorOf(p));
    const [x, y] = nodeXY(p.goal);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.zIndex = depth(y) + 5;
    el.innerHTML = `${p.human ? '<i class="ring"></i><i class="ring r2"></i>' : ''}<span class="gf">${p.human ? '내 목적지' : character(p.hero, 22)}</span>`;
    $('#layer').appendChild(el);
  }
  for (const i of m.incidents) addIncident(i);
}

function drawHud() {
  const m = M();
  $('#players').innerHTML = m.players.map((p) => `
    <div class="pl ${current(m) === p && m.phase !== 'over' ? 'turn' : ''} ${p.out ? 'out' : ''} ${p.human ? 'me' : ''}" data-player="${p.id}" style="--pc:${colorOf(p)}">
      <span class="pa">${character(p.hero, 34)}</span>
      <div class="pi"><b>${p.human ? '나' : nameOf(p)}</b><span class="money">${coin(13)} ${p.out ? '파산' : p.money.toLocaleString()}</span><em>역 ${stationsOf(m, p).length}${p.coupon ? ' · 면제권' : ''}</em></div>
    </div>`).join('');
  drawClock();
}

function drawClock() {
  const m = M();
  const span = m.end - CLOCK.start;
  const pos = (v) => Math.max(0, Math.min(100, (100 * (v - CLOCK.start)) / span));
  const seg = (a, b, cls) => `<i class="${cls}" style="left:${pos(a)}%;width:${pos(b) - pos(a)}%"></i>`;
  const t = timeOf(m);
  const fx = [m.clock < m.sale ? '세일 중' : '', m.clock < m.boom ? '통행료 2배' : ''].filter(Boolean).join(' · ');
  $('#clock').innerHTML = `<span class="now">${hhmm(m.clock)}</span>
    <span class="track">${CLOCK.rush.map(([a, b]) => seg(a, b, 'rush')).join('')}${seg(CLOCK.night, CLOCK.last, 'night')}${seg(CLOCK.last, m.end, 'last')}
      <i class="done" style="width:${pos(m.clock)}%"></i><b class="hand" style="left:${pos(m.clock)}%"></b></span>
    ${TIME_NAME[t] ? `<span class="band time-${t}">${TIME_NAME[t]}</span>` : ''}${fx ? `<span class="band fx">${fx}</span>` : ''}<span class="left">${m.round}바퀴</span>`;
}

function drawControls() {
  const m = M();
  const me = ME();
  const mine = current(m) === me && m.phase === 'roll' && !G.busy && !!G.wait;
  const tb = $('#throw');
  tb.disabled = !mine;
  const who = current(m);
  tb.innerHTML = mine ? `열차 출발${me.dash ? `<small>+${me.dash}역</small>` : '<small>꾹 눌렀다 떼기</small>'}`
    : who.human ? `내 차례<small>${m.phase === 'move' ? '갈 길을 고르는 중' : '달리는 중'}</small>` : `${nameOf(who)} 차례<small>${hhmm(m.clock)}</small>`;
  const sb = $('#skillBtn'), h = heroById(me.hero);
  sb.disabled = !mine || !!skillBlocked(m, me);
  sb.innerHTML = `${h.active.name} <b>×${me.skills}</b>`;
  const ib = $('#investBtn');
  const can = mine ? investable(m, me).length : 0;
  ib.disabled = !can;
  ib.innerHTML = `노선 투자${can ? ` <b>${can}</b>` : ''}`;
  $('#meRow').innerHTML = `<span class="pa" style="--pc:${h.color}">${character(me.hero, 30)}</span>
    <div class="me-goal"><span>내 목적지</span><b>${me.goal}</b><em>${dist(me.node, me.goal)}역 남음 · +${GOAL_BONUS + (h.goalBonus || 0)}</em></div>
    <button class="btn small white" id="goalBtn">보기</button>`;
  $('#goalBtn').onclick = () => { Sound.click(); Camera.frame([nodeXY(me.node), nodeXY(me.goal)], { maxZoom: 0.8, minZoom: 0.25, pad: 120 }); drawZoom(); };
  if (mine && !$('#hint').dataset.keep) setHint(me.rest ? '' : '내 차례 — 열차 출발!');
}

function setHint(t) { const h = $('#hint'); if (h) h.textContent = t; }
function drawZoom() { const z = $('#zoom'); if (z) z.textContent = Camera.showingWhole() ? '돌아가기' : '서울 전체'; }
function showPlayer(p) { Camera.follow(nodeXY(p.node), 380); drawZoom(); }

/** 판 화면 좌표 → 앱 좌표 */
function toApp([x, y]) { const b = $('#board'); return [x + b.offsetLeft, y + b.offsetTop]; }
const nodeApp = (n) => toApp(Camera.toView(nodeXY(n)));
/** 플레이어 판(위 HUD)의 자리 */
function panelSpot(pid) {
  const el = $(`#players [data-player="${pid}"]`);
  if (!el) return [app.clientWidth / 2, 40];
  const ab = app.getBoundingClientRect(), b = el.getBoundingClientRect(), k = b.width / el.offsetWidth;
  return [(b.left - ab.left) / k + el.offsetWidth / 2, (b.top - ab.top) / k + el.offsetHeight / 2];
}

/** 역을 누르면: 주인·단계·통행료·값 */
function onMapTap(ev) {
  const m = M();
  if (!m) return;
  const rect = $('#cam').getBoundingClientRect();
  const k = rect.width / canvasSize().w;
  const x = (ev.clientX - rect.left) / k, y = (ev.clientY - rect.top) / k;
  let best = null, bd = 40;
  for (const n of Object.keys(STATION_LINES)) { const [sx, sy] = nodeXY(n); const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = n; } }
  if (!best) return;
  const me = ME(), o = m.owned[best] ? playerById(m, m.owned[best]) : null;
  const lines = STATION_LINES[best].map((l) => LINES[l].name).join('·');
  const text = isChance(best) ? `${best} · 찬스 역(서면 카드)`
    : o ? `${best}(${lines}) · ${o.human ? '내' : nameOf(o)} ${LEVEL_NAME[m.levels[best]]} · 통행료 ${o === me ? baseToll(m.owned, m.levels, best) : tollFor(m, best, me)}`
      : `${best}(${lines}) · 빈 역 · 값 ${stationPrice(best)}`;
  toast(text);
}

// ── 역 사건 그림 ───────────────────────────────────────────

const INC_ART = {
  fire: '<path d="M20 4c2 7 10 10 10 20a10 10 0 0 1-20 0c0-5 3-8 5-10 0 4 2 6 4 6-1-6 1-11 1-16z" fill="#F2733D" stroke="#22201D" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 20c1 3 5 5 5 9a5 5 0 0 1-10 0c0-3 3-5 5-9z" fill="#F7C94A"/>',
  delay: '<circle cx="20" cy="21" r="14" fill="#FFFDF7" stroke="#22201D" stroke-width="3"/><path d="M20 21V12" stroke="#22201D" stroke-width="3" stroke-linecap="round"/><path class="inc-hand" d="M20 21l7 4" stroke="#E0533D" stroke-width="3" stroke-linecap="round"/><path d="M14 4h12" stroke="#22201D" stroke-width="3" stroke-linecap="round"/>',
  crowd: '<circle cx="11" cy="15" r="5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M3 35c0-7 4-12 8-12s8 5 8 12z" fill="#2EA6DA" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/><circle cx="29" cy="15" r="5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M21 35c0-7 4-12 8-12s8 5 8 12z" fill="#E2337A" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="11" r="5.5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M11 33c0-8 4-13 9-13s9 5 9 13z" fill="#F2B33D" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/>',
  busk: '<path d="M15 30V8l16-4v20" fill="none" stroke="#22201D" stroke-width="3.2" stroke-linejoin="round"/><ellipse cx="11" cy="30" rx="6" ry="4.5" fill="#E2337A" stroke="#22201D" stroke-width="2.6"/><ellipse cx="27" cy="25" rx="6" ry="4.5" fill="#8E63B0" stroke="#22201D" stroke-width="2.6"/>'
};
const incidentArt = (kind, size = 34) => `<svg class="inc-art" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${INC_ART[kind]}</svg>`;
const INC_FX = {
  fire: '<i class="smoke s1"></i><i class="smoke s2"></i><i class="smoke s3"></i><i class="ember"></i>',
  delay: '<i class="pulse"></i><i class="pulse p2"></i>',
  crowd: '<i class="hop h1"></i><i class="hop h2"></i>',
  busk: '<i class="note n1">♪</i><i class="note n2">♫</i><i class="note n3">♪</i>'
};
const INC_TAG = { fire: (i) => `화재 ~${hhmm(i.until)}`, delay: () => '신호 장애', crowd: () => '인파 +100', busk: () => '버스킹' };

function addIncident(i) {
  const el = document.createElement('div');
  el.className = `incident kind-${i.kind}`;
  el.dataset.node = i.node;
  el.innerHTML = `<span class="inc-fx">${INC_FX[i.kind]}</span>${incidentArt(i.kind)}<span class="inc-tag">${INC_TAG[i.kind](i)}</span>`;
  const [x, y] = nodeXY(i.node);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.style.zIndex = depth(y) - 2;
  $('#layer').appendChild(el);
  return el;
}

// ── 카드 · 컷인 ─────────────────────────────────────────────

const CARD_DECK = { good: '찬스 카드', bad: '찬스 카드', warn: '역 사건 카드', newsGood: '뉴스', newsBad: '뉴스' };
/**
 * 모두의 마블 찬스 카드처럼: 카드 더미에서 날아와 뒤집힌다. to 를 주면 다 읽은 뒤 그 역으로 날아가 꽂힌다.
 * quick 이면(AI 차례) 짧게. 화면을 누르면 바로 넘어간다.
 */
async function drawCard({ tone, deck, title, short, art, place = null, to = null, quick = false }) {
  const stage = document.createElement('div');
  stage.className = `card-stage tone-${tone}`;
  stage.innerHTML = `
    <div class="chance">
      <div class="rays"></div>
      <div class="inner">
        <div class="face back"><div class="back-frame"><b>?</b><span>${deck}</span></div></div>
        <div class="face front">
          <div class="cf-head">${deck}<i>${hhmm(M().clock)}</i></div>
          <div class="cf-art">${art}</div>
          ${place ? `<div class="cf-place">${place}역</div>` : ''}
          <div class="cf-title">${title}</div>
          <div class="cf-short">${short}</div>
          <div class="cf-tap">누르면 계속</div>
        </div>
      </div>
    </div>`;
  app.appendChild(stage);
  const card = stage.querySelector('.chance'), inner = stage.querySelector('.inner');
  let skip = null;
  const tapped = new Promise((done) => { skip = done; });
  stage.onclick = () => skip();
  const W = app.clientWidth, H = app.clientHeight;
  Sound.whoosh();
  await tween(card, [
    { transform: `translate(${W / 2 - 30}px, ${-H / 2 + 50}px) scale(.18) rotate(28deg)`, opacity: 0 },
    { transform: 'translate(0, 12px) scale(1.06) rotate(-6deg)', opacity: 1, offset: 0.75 },
    { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 }
  ], { duration: quick ? 380 : 560, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' });
  Sound.stamp();
  await tween(inner, [
    { transform: 'rotateY(0deg) scale(1)' }, { transform: 'rotateY(100deg) scale(1.12)', offset: 0.5 }, { transform: 'rotateY(180deg) scale(1)' }
  ], { duration: quick ? 360 : 520, easing: 'cubic-bezier(.4,.1,.3,1.3)', fill: 'forwards' });
  stage.classList.add('open');
  const r = card.getBoundingClientRect(), a = app.getBoundingClientRect(), k = r.width / card.offsetWidth;
  const cx = (r.left - a.left) / k + card.offsetWidth / 2, cy = (r.top - a.top) / k + card.offsetHeight / 2;
  if (tone === 'good') { Sound.big(); FX.confetti(cx, cy - 60, 30, 1.3); FX.sparkle(cx, cy - 120, 12, '#F2B33D'); }
  else if (tone === 'bad') { Sound.boss(); shake(card, 10, 420); flash(app); }
  else { Sound.penalty(); shake(card, 6, 300); }
  await Promise.race([sleep(quick ? 900 : 1700), tapped]);
  stage.classList.add('leaving');
  if (to) {
    Camera.follow(nodeXY(to), 320);
    await sleep(320);
    const [tx, ty] = nodeApp(to);
    await tween(card, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${tx - cx}px, ${ty - cy - 30}px) scale(.12) rotate(-20deg)`, opacity: 0.9 }], { duration: 400, easing: 'cubic-bezier(.5,0,.8,.6)', fill: 'forwards' });
  } else {
    await tween(card, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(0,-80px) scale(.7) rotate(8deg)', opacity: 0 }], { duration: 280, easing: 'ease-in', fill: 'forwards' });
  }
  stage.remove();
}

/** 스킬 컷인: 캐릭터 색 띠가 가로지르고 큰 캐릭터와 스킬 이름이 튀어나온다 */
async function skillCutin(e) {
  const h = heroById(e.hero);
  Sound.skill();
  const c = document.createElement('div');
  c.className = 'cutin';
  c.style.setProperty('--hc', h.color);
  c.innerHTML = `<div class="cut-band"><div class="cut-lines"></div></div>
    <div class="cut-hero">${character(h.id, 190, 'cheer')}</div>
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
  await sleep(650);
  await Promise.all([
    tween(hero, [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(140%)', opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' }),
    tween(text, [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-140%)', opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' }),
    tween(band, [{ transform: 'skewY(-8deg) scaleY(1)', opacity: 1 }, { transform: 'skewY(-8deg) scaleY(0)', opacity: 0 }], { duration: 240, delay: 60, easing: 'ease-in', fill: 'forwards' })
  ]);
  c.remove();
}

// ── 이벤트 연출 ────────────────────────────────────────────

async function play(events) {
  G.busy = true;
  drawControls();
  for (const e of events) {
    const h = HANDLERS[e.type];
    if (h) await h(e);
  }
  G.busy = false;
  if (!M()) return;
  drawPieces();
  drawHud();
  drawControls();
}

const isMe = (pid) => playerById(M(), pid)?.human;
const quick = (pid) => !isMe(pid);

function toast(text) {
  app.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  app.appendChild(t);
  setTimeout(() => t.remove(), 1700);
}
function stampText(text, color, small) {
  $('#stampSpot').querySelectorAll('.stamp').forEach((s) => s.remove());
  const s = document.createElement('div');
  s.className = 'stamp ' + (color || '');
  s.innerHTML = text + (small ? `<small>${small}</small>` : '');
  $('#stampSpot').appendChild(s);
  setTimeout(() => { s.classList.add('fade'); setTimeout(() => s.remove(), 300); }, 1300);
  Sound.stamp();
}

async function moneyFly(from, to, amount) {
  const n = Math.min(8, 2 + Math.floor(amount / 60));
  const flights = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'fly-coin';
    c.innerHTML = coin(22);
    $('#fx').appendChild(c);
    flights.push(fly(c, [from[0] + (Math.random() - 0.5) * 26, from[1] - 10], to, { duration: 560, arc: 100, delay: i * 50 }));
  }
  await Promise.all(flights);
}
function bump(pid) { const el = $(`#players [data-player="${pid}"]`); if (el) tween(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 300 }); }

/** 길을 따라 한 역씩 달린다 */
async function travel(pid, from, path) {
  const el = pieceEl(pid);
  const fast = quick(pid);
  let prev = nodeXY(from);
  act(el, 'walk');
  for (let k = 0; k < path.length; k++) {
    const to = nodeXY(path[k]);
    Camera.follow(to, fast ? 160 : 220);
    face(el, to[0] - prev[0]);
    place(el, path[k]);
    await hop(el, prev, to, { height: 24, duration: fast ? 120 : 170 });
    Sound.step(k);
    prev = to;
  }
  act(el, 'idle');
  FX.dust(...nodeApp(path[path.length - 1]), 4);
}

const HANDLERS = {
  async turnStart(e) {
    const p = playerById(M(), e.player);
    drawPieces(); drawHud();
    showPlayer(p);
    setHint(`${nameOf(p)} 차례`);
    await sleep(300);
  },
  async turn(e) { drawPieces(); drawHud(); },
  async roll(e) {
    const p = playerById(M(), e.player);
    if (p.human) {
      Sound.toss();
      if (Roller3D.ready()) {
        const board = $('#board');
        const hit = () => { Sound.clatter(); board.removeEventListener('rollhit', hit); };
        board.addEventListener('rollhit', hit);
        await Roller3D.toss(board, BOARDS.metro, e.roll, 'me');
        board.removeEventListener('rollhit', hit);
      } else {
        const spot = $('#roller');
        spot.classList.add('show');
        await Roller.animate(spot, BOARDS.metro, e.roll, 'me');
        setTimeout(() => spot.classList.remove('show'), 600);
      }
      stampText(e.roll.label + '!', e.roll.bonus ? 'yellow' : '', e.dash ? `+${e.dash}역 · 모두 ${e.steps}역` : e.roll.bonus ? '한 번 더!' : '');
      await sleep(250);
    } else {
      Sound.clatter();
      stampText(`${nameOf(p)} ${e.roll.label}`, 'ink opp', e.dash ? `+${e.dash}역` : '');
      await sleep(300);
    }
  },
  async rest(e) { toast(`${isMe(e.player) ? '나' : nameOf(playerById(M(), e.player))} — 신호 대기로 한 번 쉰다`); await sleep(700); },
  async stuck(e) { toast('갈 길이 막혀 움직이지 못했다'); await sleep(600); },
  async move(e) { await travel(e.player, e.from, e.path); },
  async goal(e) {
    const p = playerById(M(), e.player);
    const at = nodeApp(e.node);
    Sound.home();
    FX.confetti(at[0], at[1] - 30, p.human ? 34 : 14);
    FX.pow(at[0], at[1] - 70, `목적지 도착 +${e.bonus}`, colorOf(p), '#FFFDF7', -5);
    await moneyFly(at, panelSpot(p.id), e.bonus);
    bump(p.id);
    drawMarks();
    if (p.human) toast(`새 목적지: ${e.next}역 (${dist(p.node, e.next)}역 떨어짐)`);
    await sleep(p.human ? 500 : 200);
  },
  async pay(e) {
    const p = playerById(M(), e.player), to = e.to ? playerById(M(), e.to) : null;
    const node = e.node || (e.nodes ? e.nodes[e.nodes.length - 1] : p.node);
    const at = nodeApp(node);
    const label = e.why === 'toll' ? `통행료 −${e.amount}` : e.why === 'pass' ? `통과 요금 −${e.amount}` : e.why === 'fine' ? `벌금 −${e.amount}` : `−${e.amount}`;
    if (e.why === 'toll') { Sound.penalty(); act(pieceEl(p.id), 'sad', 900); if (to) act(pieceEl(to.id), 'cheer', 900); }
    else Sound.coin();
    FX.pow(at[0], at[1] - (e.why === 'pass' ? 50 : 70), label, to ? colorOf(to) : '#6E6A5E', '#FFFDF7', e.why === 'pass' ? 4 : -6);
    if (e.why === 'toll') shake($(`#players [data-player="${p.id}"]`), 6, 300);
    await moneyFly(panelSpot(p.id), to ? panelSpot(to.id) : [app.clientWidth / 2, -40], e.amount);
    if (to) { Sound.toll(e.amount > 200); bump(to.id); }
    drawHud();
    await sleep(e.why === 'pass' ? 80 : 250);
  },
  async tollFree(e) {
    const at = nodeApp(e.node);
    Sound.big();
    FX.pow(at[0], at[1] - 70, `면제! (${e.amount})`, '#3E9B6A', '#FFFDF7', 5);
    await sleep(500);
  },
  async sell(e) {
    const p = playerById(M(), e.player);
    toast(`${p.human ? '나' : nameOf(p)} — ${e.node}역을 팔았다 (+${e.amount})`);
    drawBoard();
    await sleep(350);
  },
  async bankrupt(e) {
    const p = playerById(M(), e.player);
    drawBoard();
    const el = pieceEl(p.id);
    act(el, 'sad');
    await knockOut(el, 1);
    el.style.display = 'none';
    await drawCard({ tone: 'bad', deck: '파산', title: `${p.human ? '나' : nameOf(p)} 파산!`, short: `${e.place}등 · 가진 역이 모두 빈 역이 됐다`, art: character(p.hero, 96, 'sad') });
    drawMarks();
  },
  async buy(e) { await estateFx(e, '사기!', Sound.buy); },
  async upgrade(e) { await estateFx(e, e.level >= MAX_LEVEL ? '랜드마크!' : e.free ? '무료 증축!' : '증축!', Sound.big); },
  async takeover(e) { flash(app); await estateFx(e, '인수!', Sound.capture); },
  async pass() {},
  async offer() {},
  async chance(e) {
    const p = playerById(M(), e.player);
    await drawCard({ tone: e.good ? 'good' : 'bad', deck: '찬스 카드', title: e.name, short: e.short, art: character(p.hero, 96, e.good ? 'cheer' : 'sad'), quick: !p.human });
  },
  async news(e) {
    await drawCard({ tone: e.good ? 'good' : 'bad', deck: '뉴스', title: e.name, short: e.short, art: '<span class="news-art">NEWS</span>' });
    drawClock();
  },
  async cash(e) {
    const p = playerById(M(), e.player);
    const at = e.node ? nodeApp(e.node) : panelSpot(p.id);
    Sound.coin();
    if (e.node) FX.pow(at[0], at[1] - 60, `+${e.amount}`, '#2EA6DA', '#FFFDF7', 4);
    if (e.node) await moneyFly(at, panelSpot(p.id), e.amount);
    bump(p.id);
    drawHud();
    await sleep(120);
  },
  async incident(e) {
    await drawCard({ tone: INCIDENTS[e.kind].cash || INCIDENTS[e.kind].again ? 'good' : 'warn', deck: '역 사건 카드', title: e.name, short: e.short, art: incidentArt(e.kind, 96), place: e.node, to: e.node, quick: true });
    const el = addIncident(e);
    const [x, y] = nodeApp(e.node);
    if (e.kind === 'fire') { Sound.capture(); flash(app); shake($('#board'), 8, 420); FX.pow(x, y - 56, '화재 발생!', '#E0533D', '#FFFDF7', -6); }
    else if (e.kind === 'delay') { Sound.penalty(); FX.ring(x, y, '#F2B33D'); }
    else if (e.kind === 'crowd') Sound.bundle();
    else { Sound.home(); FX.sparkle(x, y - 20, 10, '#E2337A'); }
    FX.ring(x, y, '#FFFDF7');
    await tween(el, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.35)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 400, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
    await sleep(200);
  },
  async incidentEnd(e) {
    const el = $('#layer').querySelector(`.incident[data-node="${e.node}"]`);
    if (e.used) { const [x, y] = nodeApp(e.node); FX.pow(x, y - 60, '한 번 더!', '#E2337A', '#FFFDF7', -5); Sound.coin(); }
    if (el) { await tween(el, [{ opacity: 1 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 300, fill: 'forwards' }); el.remove(); }
  },
  async again(e) {
    const p = playerById(M(), e.player);
    toast(`${p.human ? '나' : nameOf(p)} — 한 번 더!`);
    await sleep(400);
  },
  async clock() { drawClock(); },
  async timeShift(e) {
    const say = { rush: '러시아워! 통행료 1.5배', day: '한산한 시간', night: '심야 — 통행료 1.25배', last: '막차 시간! 목적지 보너스 2배' };
    toast(`${hhmm(e.clock)} · ${say[e.time]}`);
    Sound.stamp();
    await sleep(500);
  },
  async extend(e) { toast(`막차가 ${hhmm(e.end)}로 늦춰졌다`); drawClock(); await sleep(400); },
  async skill(e) { await skillCutin(e); },
  async over() {}
};

/** 사기·증축·인수 연출: 토큰이 플레이어 판에서 역으로 날아가고, 역이 그 색으로 물든다 */
async function estateFx(e, word, sound) {
  const p = playerById(M(), e.player);
  const at = nodeApp(e.node);
  if (e.price) await moneyFly(panelSpot(p.id), at, e.price);
  sound.call(Sound);
  drawBoard();
  FX.ring(at[0], at[1], colorOf(p));
  FX.ring(at[0], at[1], '#FFFDF7');
  FX.confetti(at[0], at[1] - 30, p.human ? 22 : 8, 1);
  FX.pow(at[0], at[1] - 70, word, colorOf(p), '#22201D', -5);
  if (e.chain > 1 && (e.linked || e.invest)) FX.pow(at[0] + 40, at[1] - 104, `${e.chain}역 연결 ×${Math.min(4, e.chain)}`, '#22201D', '#FFFDF7', 6);
  act(pieceEl(p.id), 'cheer', 900);
  drawHud();
  await sleep(p.human ? 550 : 250);
}

// ── 결과 ───────────────────────────────────────────────────

async function results() {
  const m = M();
  const me = ME();
  const win = me.place === 1;
  await sleep(300);
  if (win) { Sound.win(); FX.confetti(app.clientWidth / 2, 300, 70, 1.8); } else Sound.lose();
  const pts = matchPoints({ place: me.place, rivals: m.players.length - 1, knockout: m.reason === 'bankrupt' });
  const rec = Records.record({ points: pts, place: me.place, size: m.players.length, hero: me.hero, daily: G.daily, seed: m.seed });
  const rows = m.ranking.map((r) => {
    const p = playerById(m, r.id);
    return `<div class="res-row ${p.human ? 'me' : ''}" style="--pc:${colorOf(p)}"><b class="pl-no">${r.place}</b>${character(p.hero, 40, r.place === 1 ? 'dance' : r.out ? 'sad' : 'idle')}
      <div><b>${p.human ? '나' : nameOf(p)}</b><span>${r.out ? '파산' : `자산 ${r.assets.toLocaleString()} · 역 ${stationsOf(m, p).length}곳`}</span></div></div>`;
  }).join('');
  const s = sheet(`
    <h2>${win ? '승리!' : `${me.place}등`}</h2>
    <p>${m.reason === 'bankrupt' ? '상대가 모두 파산했다' : `${hhmm(m.end)} 막차 — 자산 순위로 끝났다`}</p>
    <div class="res-list">${rows}</div>
    <div class="points-final"><div class="pf-main"><span>이번 판 승점</span><b>+${pts}</b><em class="${rec.best ? 'best' : ''}">${rec.rank ? (rec.best ? '내 최고 기록!' : `내 기록 ${rec.rank}위`) : '10위 밖'}</em></div>
      <div class="pf-sub">누적 ${rec.total.toLocaleString()}점 · <b>${rec.title.name}</b>${rec.promoted ? ' <i>칭호가 올랐다!</i>' : ''}</div></div>
    <div class="row"><button class="btn white" id="home">처음으로</button><button class="btn" id="again">다시 대결</button></div>`);
  s.querySelector('#home').onclick = () => { closeSheet(); title(); };
  s.querySelector('#again').onclick = () => { closeSheet(); startGame(G.daily); };
}

// ── 겹쳐 뜨는 판 ───────────────────────────────────────────

function sheet(html) {
  closeSheet();
  app.insertAdjacentHTML('beforeend', `<div class="sheet-back"></div><div class="sheet">${html}</div>`);
  return app.querySelector('.sheet');
}
function closeSheet() { app.querySelectorAll('.sheet, .sheet-back').forEach((n) => n.remove()); }

// ── 손맛 게이지 ────────────────────────────────────────────
// 출발 단추를 꾹 누르면 힘 게이지가 오르내린다. 떼는 순간의 힘으로 솜씨가 정해진다.

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
  const ready = () => !G.busy && M()?.phase === 'roll' && current(M()).human && !!G.wait;
  const power = () => { const u = ((performance.now() - t0) % GAUGE.period) / GAUGE.period; return u < 0.5 ? u * 2 : 2 - u * 2; };
  const tick = () => { needle.style.left = power() * 100 + '%'; raf = requestAnimationFrame(tick); };
  const start = () => { if (holding || !ready()) return; Sound.unlock(); holding = true; t0 = performance.now(); meter.hidden = false; tick(); };
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
  // 게이지 없이 눌린 클릭(키보드·자동 테스트)은 보통 출발
  btn.addEventListener('click', () => { if (!holding) onThrow('normal'); });
  G.gauge = { start, release };
}

// ── 시작 ───────────────────────────────────────────────────

// 화면 틀: 세로(폰) 390×844 고정, 가로가 긴 창(PC)에서는 높이 780 에 창 비율만큼 넓힌다.
const PHONE = { w: 390, h: 844 };
const WIDE_H = 780;

function fit() {
  const W = window.innerWidth, H = window.innerHeight;
  const wide = W / H >= 1.15 && W >= 820;
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
  if (M() && $('#board')) { Camera.refit(); drawZoom(); }
}
window.addEventListener('resize', fit);
fit();

document.addEventListener('pointerdown', () => Sound.unlock());
// 키보드: Space/Enter 를 누르고 있으면 게이지, 떼면 출발
document.addEventListener('keydown', (e) => {
  if (e.repeat || !M() || app.querySelector('.sheet') || !app.classList.contains('game')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); G.gauge?.start(); }
});
document.addEventListener('keyup', (e) => {
  if (!M() || app.querySelector('.sheet') || !app.classList.contains('game')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); G.gauge?.release(); }
});

// 개발 중 콘솔 확인용
window.__game = { get m() { return G.m; }, get G() { return G; } };

splash();
