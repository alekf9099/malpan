// 화면 컨트롤러 — 역전(驛戰): 역을 차지하라.
// 규칙은 core(match.js)가 전부 처리하고, 여기서는 core 가 돌려준 이벤트를 차례로 연출한다.
//   스플래시 → 로비(위 프로필·승차권, 배너, 내 캐릭터, 출석·미션, 대결 시작, 아래 탭) → 캐릭터 · 미션 · 랭킹 · 도감 → 대결 매칭 → 대결 화면 → 결과
// 대결 화면: 위 플레이어 판(돈·역 수·차례) + 시계 / 가운데 서울 노선도 / 아래 내 조작판(출발·스킬·노선 투자)
// 내 차례에는 갈림길마다 갈 방향을 고르고, AI 차례는 저절로 빠르게 흘러간다.
// 명소역에 서면 그 역 카드가 뒤집히고, KTX(갈 역)·명동(찬스 카드 두 장)은 내가 고른다.

import {
  createMatch, roll, pickDie, dieOptions, dieSteps, dieChoices, dieAt, areaOf, move, decide, choose, useSkill, skillBlocked, skillTargets, skillCost, buyoutFor, cramTargets, GATHER_RATE, GATHER_MAX, CRAM_COUNT,
  invest, investable, current, playerById, alive, assets, stationsOf,
  tollFor, upgradeFor, priceFor, nextStations, stopsAt, timeOf, hhmm, CLOCK, START_MONEY, GOAL_BONUS, PASS_RATE, isChance, incidentAt,
  monopolyOf, HOT_WIN, LINE_WIN, isLoop, roundsOf
} from '../core/match.js';
import { choosePath, chooseDie, decideOffer, wantsSkill, chooseInvest, chooseOption } from '../core/ai.js';
import { chanceById } from '../core/events.js';
import { HEROES as HERO_DATA, heroById, STARTERS, skillDesc, activeDesc, chargeOf } from '../core/heroes.js';
import { LOOP_START, SALARY, CORNERS, ahead, forward } from '../core/boards/loop.js';
import { skillArt } from './skill-art.js';
import * as SFX from './skill-fx.js';
import { createRng } from '../core/rng.js';
import { LINES, STATION_LINES, ALL_EDGES, dist, lineOfEdge } from '../core/boards/seoul.js';
import { BOARDS } from '../core/boards/index.js';
import { links, chainOf, LEVEL_NAME, LEVEL_MULT, MAX_LEVEL, stationPrice, baseToll, HOTSPOTS } from '../core/estate.js';
import { INCIDENTS } from '../core/incidents.js';
import { matchPoints, rpDelta, RP_TABLE } from '../core/ranking.js';
import { tierBadge } from './tier-art.js';
import { character, act, face, coin, ownerFlag } from './art.js';
import { boardSvg, nodeXY, depth, pieceSize, canvasSize, useBoard } from './board-view.js';
import { hotArt } from './hot-art.js';
import * as Camera from './camera.js';
import { sleep, tween, hop, drop, knockOut, squish, shake, flash, fly } from './anim.js';
import * as FX from './fx.js';
import * as Roller from './roller.js';
import * as Roller3D from './roller3d.js';
import * as Records from './records.js';
import * as Prefs from './prefs.js';
import * as Daily from './daily.js';
import { ATTEND_REWARDS } from '../core/missions.js';
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
      <div class="sp-cast">${HERO_DATA.filter((h) => STARTERS.includes(h.id)).map((h, i) => `<span style="animation-delay:${1.3 + i * 0.12}s">${character(h.id, 64, 'cheer')}</span>`).join('')}</div>
      <div class="sp-tap">터치하여 시작</div>
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

const isOpen = (id) => Records.unlocked().includes(id);
/** 지금 보여 줄 판이 순환선인가: 게임 중이면 그 판, 로비·도감이면 고른 판 */
const loopy = () => (G.m ? isLoop(G.m) : Prefs.getBoard() === 'loop');
const myIndex = () => ids.indexOf(Prefs.getLeader(Records.unlocked()));
const ticketPill = (n = Records.tickets()) => `<span class="tickets" title="승차권 — 캐릭터를 여는 데 쓴다"><i>승차권</i><b>${n.toLocaleString()}</b>장</span>`;
/** 잠긴 캐릭터는 그림자로 */
const charOrShadow = (id, size, start) => `<span class="${isOpen(id) ? '' : 'shadow'}">${character(id, size, start)}</span>`;

/** 아래 탭·옆 단추 그림(먹선 아이콘) */
const ICON = {
  chars: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21 Q4 14 12 14 Q20 14 20 21 Z"/></svg>',
  mission: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 9 L10.5 11.5 L15.5 6.5 M8 16 H16"/></svg>',
  lobby: '<svg viewBox="0 0 24 24"><path d="M3 11 L12 4 L21 11 V20 H15 V14 H9 V20 H3 Z"/></svg>',
  rank: '<svg viewBox="0 0 24 24"><path d="M7 4 H17 V9 Q17 14 12 14 Q7 14 7 9 Z M12 14 V18 M8 20 H16 M7 6 H4 Q4 10 7 10 M17 6 H20 Q20 10 17 10"/></svg>',
  dex: '<svg viewBox="0 0 24 24"><path d="M4 5 Q8 3 12 6 Q16 3 20 5 V19 Q16 17 12 20 Q8 17 4 19 Z M12 6 V20"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10 H21 M8 3 V7 M16 3 V7"/></svg>',
  help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5 Q9.5 7 12 7 Q14.5 7 14.5 9.3 Q14.5 11 12 12 V14 M12 17 V17.2"/></svg>',
  today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7 V12 L15 14"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9 H8 L13 5 V19 L8 15 H4 Z M16 9 Q18 12 16 15 M18.5 7 Q22 12 18.5 17"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9 H8 L13 5 V19 L8 15 H4 Z M16 9 L21 15 M21 9 L16 15"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M5 9 H18 L14.5 5.5 M19 15 H6 L9.5 18.5"/></svg>',
  ticket: '<svg viewBox="0 0 24 24"><path d="M3 7 H21 V10 Q19 10 19 12 Q19 14 21 14 V17 H3 V14 Q5 14 5 12 Q5 10 3 10 Z M14 7 V17" /></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5 L19 12 L8 19 Z"/></svg>'
};
const TABS = [['chars', '캐릭터'], ['mission', '미션'], ['lobby', '로비'], ['rank', '랭킹'], ['dex', '도감']];
/** 아래 탭(GNB) — 로비·캐릭터·미션·랭킹·도감 어디서나 같은 자리에 남는다 */
const gnbHTML = (on) => {
  const ready = Daily.claimable();
  return `<nav class="lb-tabs gnb">${TABS.map(([k, n]) => `<button data-tab-go="${k}" class="${k === on ? 'on' : ''}" ${k === on ? 'aria-current="page"' : ''}>${ICON[k]}<b>${n}</b>${k === 'mission' && ready ? `<i class="dot n">${ready}</i>` : ''}</button>`).join('')}</nav>`;
};
function bindGnb() {
  app.querySelectorAll('[data-tab-go]').forEach((b) => {
    b.onclick = () => {
      if (b.classList.contains('on')) return;
      Sound.unlock(); Sound.click();
      const k = b.dataset.tabGo;
      if (k === 'lobby') title();
      else if (k === 'chars') pickHero();
      else if (k === 'mission') missionsPage();
      else if (k === 'rank') ranking();
      else dex(myIndex());
    };
  });
}

/** 로비 배너: 지금 할 만한 일을 돌아가며 보여 준다 */
function lobbyBanners() {
  const out = [];
  const at = Daily.attendance(), left = Daily.missions().filter((m) => !m.done).length, ready = Daily.claimable();
  if (!at.today) out.push({ go: 'attend', tag: '출석', text: `출석 보상 · 승차권 ${at.next.reward}장`, tone: 'red' });
  if (ready) out.push({ go: 'mission', tag: '미션', text: `미션 보상 ${ready}개 수령 가능`, tone: 'red' });
  else if (left) out.push({ go: 'mission', tag: '미션', text: `오늘의 미션 ${left}개 남음`, tone: 'blue' });
  const lock = HERO_DATA.find((x) => !isOpen(x.id));
  if (lock) out.push({ go: 'chars', tag: '새 캐릭터', text: Records.tickets() >= lock.price ? `${lock.job} ${lock.name} 해금 가능!` : `${lock.job} ${lock.name} · 승차권 ${lock.price}장`, tone: Records.tickets() >= lock.price ? 'red' : 'green' });
  const t = new Date();
  out.push({ go: 'daily', tag: '오늘의 대결', text: `${t.getMonth() + 1}월 ${t.getDate()}일 · 모두 같은 맵`, tone: 'ink' });
  return out;
}
const BANNER_ICON = { attend: 'cal', mission: 'mission', chars: 'chars', daily: 'today' };
/** 배너 한 장: 그림 · 꼬리표 · 글 · 넘김 점 */
const bannerHTML = (list, i) => {
  const x = list[i];
  return `<span class="bn-body tone-${x.tone}"><span class="bn-ic">${ICON[BANNER_ICON[x.go]]}</span><span class="bn-tx"><i>${x.tag}</i><b>${x.text}</b></span><span class="bn-go">›</span></span>
    ${list.length > 1 ? `<span class="bn-dots">${list.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>` : ''}`;
};

function title(fromSplash = false) {
  G.m = null;
  app.className = 'app home-app';
  document.title = `${GAME_TITLE.main}(${GAME_TITLE.hanja}): 역을 차지하라`;
  const li = myIndex(), h = HERO_DATA[li];
  const rank = Records.summary();
  const tier = rank.tier;
  const banners = lobbyBanners();
  const at = Daily.attendance(), ready = Daily.claimable();
  const today = new Date();
  const missions = Daily.missions(), mDone = missions.filter((x) => x.done).length;
  const rivals = Prefs.getRivals();
  // 배경 반짝이: 자리·크기·박자는 매번 같게(화면이 다시 그려져도 튀지 않게)
  const sparks = Array.from({ length: 10 }, (_, i) => `<i style="left:${(i * 37 + 9) % 94}%;top:${(i * 53 + 14) % 70}%;--s:${4 + (i % 3) * 3}px;--d:${2.4 + (i % 4) * .7}s;--w:${(i * .37) % 2}s"></i>`).join('');
  app.style.setProperty('--lbc', h.color);
  app.innerHTML = `
    <div class="lb-bg" aria-hidden="true">
      <div class="lb-rays"></div>
      <svg class="lb-lines" viewBox="0 0 390 520" preserveAspectRatio="none">${[1, 2, 3, 4].map((id, i) => `<path d="M-20 ${250 + i * 26} C 110 ${170 + i * 30}, 250 ${360 + i * 12}, 410 ${232 + i * 30}" stroke="${LINES[id].color}"/>`).join('')}
        ${[1, 2, 3, 4].map((_, i) => `<path class="run" d="M-20 ${250 + i * 26} C 110 ${170 + i * 30}, 250 ${360 + i * 12}, 410 ${232 + i * 30}" style="animation-delay:${-i * 1.3}s"/>`).join('')}</svg>
      <div class="lb-spark">${sparks}</div>
    </div>
    <div class="lobby ${fromSplash ? 'enter' : ''}">
      <header class="lb-top">
        <button class="lb-prof glass" id="lbProf" aria-label="랭킹">
          <span class="lb-ava" style="--pc:${h.color};--tc:${tier.color}">${character(h.id, 40)}</span>
          <span class="lb-pi"><b>${tierBadge(tier, 16)} ${tier.label}</b><span class="lb-xp"><i style="width:${tier.pct}%;background:${tier.color}"></i></span><em>${tier.hi ? `${rank.rp} / ${tier.hi} RP` : `${rank.rp} RP`}${rank.plays ? ` · ${rank.wins}승` : ''}</em></span>
        </button>
        <button class="lb-tix glass" id="tix" aria-label="승차권 — 캐릭터를 여는 데 쓴다"><span class="tk-ic">${ICON.ticket}</span><b>${Records.tickets().toLocaleString()}</b><i>+</i></button>
        <button class="lb-icon glass" id="snd" aria-label="소리">${Sound.isOn() ? ICON.sound : ICON.mute}</button>
      </header>
      <button class="lb-banner glass" id="lbBanner">${bannerHTML(banners, 0)}</button>
      <div class="lb-stage">
        <div class="lb-logo" aria-hidden="true"><span>${GAME_TITLE.main}</span><em>${GAME_TITLE.hanja}</em></div>
        <div class="lb-side left">
          <button class="lb-float" data-go="attend"><span>${ICON.cal}</span><b>출석</b>${at.today ? '' : '<i class="dot"></i>'}</button>
          <button class="lb-float" data-go="mission"><span>${ICON.mission}</span><b>미션 ${mDone}/${missions.length}</b>${ready ? `<i class="dot n">${ready}</i>` : ''}</button>
        </div>
        <div class="lb-side right">
          <button class="lb-float hot" data-go="daily"><span>${ICON.today}</span><b>오늘의 대결</b><i class="lb-date">${today.getMonth() + 1}/${today.getDate()}</i></button>
          <button class="lb-float" data-go="guide"><span>${ICON.help}</span><b>도움말</b></button>
        </div>
        <div class="lb-podium" aria-hidden="true"><i></i></div>
        <div class="lb-hero" id="homeHero">${character(h.id, 210, 'idle')}</div>
        <div class="lb-card">
          <div class="lb-nm"><em>${h.job}</em><b>${h.name}</b><button class="lb-change" id="pickBtn" aria-label="캐릭터 변경">${ICON.swap}</button></div>
          <div class="lb-chips">
            <span class="lb-chip"><i>고유</i>${h.skill}</span>
            <span class="lb-chip sk">${skillArt(h.active.id, 18)}${h.active.name}<i>${chargeOf(h, loopy())}칸</i></span>
          </div>
        </div>
      </div>
      <div class="lb-play">
        <div class="lb-opts">
          <div class="lb-seg lb-board" role="radiogroup" aria-label="판">${[['loop', '순환선'], ['map', '노선도']].map(([k, n]) => `<button role="radio" data-b="${k}" class="${k === Prefs.getBoard() ? 'on' : ''}" aria-checked="${k === Prefs.getBoard()}">${n}</button>`).join('')}</div>
          <div class="lb-seg" role="radiogroup" aria-label="상대 수"><span>상대</span>${[1, 2, 3].map((n) => `<button role="radio" data-n="${n}" class="${n === rivals ? 'on' : ''}" aria-checked="${n === rivals}">${n}</button>`).join('')}<span>명</span></div>
        </div>
        <button class="lb-start" id="start"><span class="lb-go">${ICON.play}</span><span class="lb-st"><b>대결 시작</b><small>${Prefs.getBoard() === 'loop' ? '2호선 순환선 · 시청 출발' : '노선도 · 06:00 첫차 → 24:00 막차'}</small></span></button>
      </div>
      ${gnbHTML('lobby')}
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  bindGnb();
  const go = (k) => {
    Sound.unlock(); Sound.click();
    if (k === 'chars') pickHero(li);
    else if (k === 'mission') missionsPage();
    else if (k === 'rank') ranking();
    else if (k === 'dex') dex(li);
    else if (k === 'guide') guide();
    else if (k === 'attend') openAttendance();
    else if (k === 'daily') startGame(true);
  };
  app.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
  $('#snd').onclick = () => { Sound.toggle(); Sound.unlock(); $('#snd').innerHTML = Sound.isOn() ? ICON.sound : ICON.mute; };
  $('#lbProf').onclick = () => go('rank');
  $('#pickBtn').onclick = () => go('chars');
  $('#homeHero').onclick = () => { Sound.unlock(); Sound.click(); act($('#homeHero'), 'cheer', 1200); };
  $('#tix').onclick = () => { Sound.unlock(); Sound.click(); const lock = HERO_DATA.findIndex((x) => !isOpen(x.id)); pickHero(lock < 0 ? li : lock); };
  app.querySelectorAll('.lb-seg button[data-n]').forEach((b) => {
    b.onclick = () => {
      Sound.unlock(); Sound.click();
      Prefs.setRivals(+b.dataset.n);
      app.querySelectorAll('.lb-seg button[data-n]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
      tween(b, [{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 220 });
    };
  });
  // 판 고르기: 순환선(부루마블식) · 노선도 — 스킬 칸 수·설명이 판마다 달라 로비를 다시 그린다
  app.querySelectorAll('.lb-seg button[data-b]').forEach((b) => {
    b.onclick = () => { if (b.classList.contains('on')) return; Sound.unlock(); Sound.click(); Prefs.setBoard(b.dataset.b); title(); };
  });
  $('#start').onclick = () => startGame(false);
  // 배너는 3.5초마다 넘어간다(누르면 그 일로)
  let bi = 0;
  const banner = $('#lbBanner');
  banner.onclick = () => go(banners[bi].go);
  clearInterval(G.bannerTimer);
  if (banners.length > 1) G.bannerTimer = setInterval(() => {
    if (!document.body.contains(banner)) { clearInterval(G.bannerTimer); return; }
    bi = (bi + 1) % banners.length;
    banner.innerHTML = bannerHTML(banners, bi);
    tween(banner.querySelector('.bn-body'), [{ transform: 'translateX(14px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280 });
  }, 3500);
  if (fromSplash) setTimeout(() => act($('#homeHero'), 'cheer', 1000), 350);
  // 오늘 출석을 안 했으면 로비에 들어오자마자 출석 판을 띄운다
  if (!at.today) setTimeout(() => { if (app.classList.contains('home-app') && !app.querySelector('.sheet')) openAttendance(); }, fromSplash ? 700 : 300);
  Roller3D.load();
}

// ── 출석 · 미션 ────────────────────────────────────────────

/** 7일 출석 판. 오늘 칸을 누르면 승차권 */
function openAttendance() {
  const at = Daily.attendance();
  const cycle = Math.floor(at.count / 7) * 7; // 이번 7일 묶음이 시작한 횟수
  const doneInCycle = at.count - cycle;
  const cells = ATTEND_REWARDS.map((r, i) => {
    const got = i < doneInCycle, now = !at.today && i === doneInCycle;
    return `<button class="at-cell ${got ? 'got' : ''} ${now ? 'now' : ''} ${i === 6 ? 'big' : ''}" ${now ? 'id="atClaim"' : 'disabled'}>
      <span>${i + 1}일</span><b>${r}</b><em>장</em>${got ? '<i class="at-stamp">받음</i>' : ''}</button>`;
  }).join('');
  const s = sheet(`<span class="kind">출석 보상</span><h2 style="margin-top:6px">${at.today ? '출석 완료' : '출석 체크'}</h2>
    <p>매일 1회 · 7일차 승차권 100장</p>
    <div class="at-grid">${cells}</div>
    <div class="row"><button class="btn ${at.today ? 'white' : ''}" id="atOk">${at.today ? '닫기' : '받기'}</button></div>`);
  const claim = () => {
    const n = Daily.checkIn();
    if (!n) { closeSheet(); return; }
    Sound.unlock(); Sound.big();
    const cell = s.querySelector('#atClaim');
    if (cell) {
      cell.classList.add('got'); cell.classList.remove('now');
      cell.insertAdjacentHTML('beforeend', '<i class="at-stamp">받음</i>');
      const r = cell.getBoundingClientRect(), a = app.getBoundingClientRect(), k = r.width / cell.offsetWidth;
      FX.confetti((r.left - a.left) / k + cell.offsetWidth / 2, (r.top - a.top) / k, 30, 1.2);
    }
    s.querySelector('h2').textContent = `승차권 +${n}장!`;
    const ok = s.querySelector('#atOk');
    ok.textContent = '닫기'; ok.className = 'btn white';
    ok.onclick = () => { Sound.click(); closeSheet(); if (app.classList.contains('home-app')) title(); else if (app.classList.contains('mission-app')) missionsPage(); };
  };
  s.querySelector('#atOk').onclick = at.today ? () => { Sound.click(); closeSheet(); } : claim;
  s.querySelector('#atClaim')?.addEventListener('click', claim);
}

/** 미션 탭: 출석 한 줄 + 오늘의 미션 3개 */
function missionsPage() {
  app.className = 'app dex-app mission-app';
  const at = Daily.attendance(), list = Daily.missions();
  const ms = Daily.untilReset(), hh = Math.floor(ms / 3600000), mm = Math.floor((ms % 3600000) / 60000);
  const rows = list.map((m) => `
    <div class="ms-row ${m.claimed ? 'claimed' : m.done ? 'done' : ''}">
      <div class="ms-txt"><b>${m.text}</b><div class="ms-bar"><i style="width:${(100 * m.have) / m.goal}%"></i></div><span>${m.have.toLocaleString()} / ${m.goal.toLocaleString()}</span></div>
      <button class="ms-btn" data-id="${m.id}" ${m.done && !m.claimed ? '' : 'disabled'}><b>+${m.reward}</b><span>${m.claimed ? '완료' : m.done ? '받기' : '진행 중'}</span></button>
    </div>`).join('');
  app.innerHTML = `
    <div class="dex">
      <div class="dex-head"><button class="btn small white" id="msBack">← 로비</button><b>미션</b>${ticketPill()}</div>
      <button class="ms-attend" id="msAttend">${ICON.cal}<div><b>출석 보상 ${at.count % 7 + (at.today ? 0 : 1)}일차</b><span>${at.today ? '수령 완료 · 내일 다시' : `승차권 ${at.next.reward}장`}</span></div><i>${at.today ? '보기' : '받기'}</i></button>
      <div class="ms-head"><b>오늘의 미션</b><span>초기화까지 ${hh}시간 ${mm}분</span></div>
      <div class="ms-list">${rows}</div>
      <p class="ms-note">대결 종료 시 진행도 반영 · 매일 0시 초기화</p>
      ${gnbHTML('mission')}
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  $('#msBack').onclick = () => { Sound.click(); title(); };
  bindGnb();
  $('#msAttend').onclick = () => { Sound.click(); openAttendance(); };
  app.querySelectorAll('.ms-btn').forEach((b) => {
    b.onclick = () => {
      const n = Daily.claim(b.dataset.id);
      if (!n) return;
      Sound.unlock(); Sound.big();
      const r = b.getBoundingClientRect(), a = app.getBoundingClientRect(), k = r.width / b.offsetWidth;
      FX.confetti((r.left - a.left) / k + b.offsetWidth / 2, (r.top - a.top) / k, 24, 1.1);
      FX.pow((r.left - a.left) / k, (r.top - a.top) / k - 10, `승차권 +${n}`, '#F2B33D', '#22201D', -5);
      setTimeout(missionsPage, 700);
    };
  });
}

// ── 캐릭터 선택 ─────────────────────────────────────────────

function pickHero(i = myIndex()) {
  app.className = 'app pick-app';
  const h = HERO_DATA[i];
  const mine = i === myIndex();
  const open = isOpen(h.id), have = Records.tickets();
  const thumbs = HERO_DATA.map((x, j) => `<button class="pk-thumb ${j === i ? 'on' : ''} ${isOpen(x.id) ? '' : 'locked'}" data-i="${j}">${charOrShadow(x.id, 40)}${j === myIndex() ? '<i class="crown">내 캐릭터</i>' : ''}${isOpen(x.id) ? '' : `<i class="lock">${x.price}</i>`}<span class="pk-tn">${x.name}</span></button>`).join('');
  const choose = open ? `<button class="btn ${mine ? 'white' : 'yellow'}" id="pkChoose" ${mine ? 'disabled' : ''}>${mine ? '사용 중' : '선택'}</button>`
    : `<button class="btn ${have >= h.price ? 'yellow' : 'white'}" id="pkUnlock" ${have >= h.price ? '' : 'disabled'}><b>잠금 해제</b><small>${have >= h.price ? `승차권 ${h.price}장` : `승차권 ${h.price - have}장 부족`}</small></button>`;
  app.innerHTML = `
    <div class="pick">
      <div class="dex-head"><button class="btn small white" id="pkBack">← 로비</button><b>캐릭터</b>${ticketPill(have)}</div>
      <div class="pk-stage" style="--hc:${h.color}">
        <div class="pk-spot"></div>
        <button class="pk-arrow left" id="pkPrev" aria-label="이전">◀</button>
        <div class="pk-hero ${open ? '' : 'locked'}" id="pkHero">${character(h.id, 230, 'idle')}${open ? '' : '<i class="pk-lock">잠김</i>'}</div>
        <button class="pk-arrow right" id="pkNext" aria-label="다음">▶</button>
        <div class="pk-name"><b>${h.job} ${h.name}</b><span>${i + 1} / ${HERO_DATA.length}</span></div>
      </div>
      <div class="pk-cards">
        <div class="pk-card"><span class="pk-kind">고유 · ${h.skill}</span><p>${skillDesc(h, loopy())}</p></div>
        ${skillCard(h, 'pk')}
        <div class="pk-card lead"><span class="pk-kind">AI 성향 · ${h.ai.name}</span><p>${AI_NOTE[h.id]}</p></div>
      </div>
      <div class="pk-thumbs">${thumbs}</div>
      <div class="pk-btns">
        <button class="btn white" id="pkDex">정보</button>
        ${choose}
      </div>
      ${gnbHTML('chars')}
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
  bindGnb();
  $('#pkDex').onclick = () => { Sound.click(); dex(i); };
  $('#pkHero').onclick = () => { Sound.click(); if (open) act($('#pkHero'), 'dance', 1200); };
  const burst = (word) => {
    const hero = $('#pkHero');
    const r = hero.getBoundingClientRect(), a = app.getBoundingClientRect(), k = r.width / hero.offsetWidth;
    const x = (r.left - a.left) / k + hero.offsetWidth / 2, y = (r.top - a.top) / k + 40;
    FX.confetti(x, y, 36, 1.3);
    FX.pow(x, y - 10, word, h.color, '#22201D', -6);
  };
  if (!open) {
    const b = $('#pkUnlock');
    if (have >= h.price) b.onclick = async () => {
      if (!Records.unlock(h.id, h.price)) { Sound.deny(); return; }
      Sound.unlock(); Sound.big();
      b.disabled = true;
      const hero = $('#pkHero');
      hero.classList.remove('locked');
      hero.querySelector('.pk-lock')?.remove();
      flash(app);
      burst('해금!');
      act(hero, 'cheer', 1400);
      await sleep(1200);
      pickHero(i);
    };
    return;
  }
  if (!mine) $('#pkChoose').onclick = async () => {
    Prefs.setLeader(h.id);
    Sound.unlock(); Sound.big();
    act($('#pkHero'), 'cheer', 1400);
    burst('선택 완료!');
    $('#pkChoose').disabled = true;
    await sleep(1000);
    title();
  };
}

const AI_NOTE = {
  driver: '보이는 역은 대부분 구매 · 목적지로 직진',
  staff: '여유 자금 유지 · 연결되는 역만 적극 구매',
  worker: '환승역 우선 수집',
  student: '같은 노선 연결 · 증축 집중',
  youtuber: '명소역 위주 이동 · 비싼 내 역을 떡상',
  rider: '충전되면 바로 동시 배달로 질주',
  nurse: '구조를 믿고 공격적으로 구매',
  broker: '남의 역 도착 시 적극 인수'
};

// ── 도감 ───────────────────────────────────────────────────

const ACT_LABEL = { idle: '대기', walk: '걷기', cheer: '환호', sad: '좌절', dance: '춤' };
const DEX_LINE = {
  driver: '새벽 첫차를 모는 20년 차 기관사', staff: '노선도를 통째로 외운 역무원', worker: '환승 3번은 기본인 출근길 직장인', student: '정기권 한 장으로 서울을 누비는 새내기',
  youtuber: '구독자 10만, 서울 명소 정복이 목표', rider: '골목길은 내비보다 빠삭한 배달 라이더', nurse: '밤샘 근무에도 지치지 않는 간호사', broker: '역세권이라면 냄새부터 맡는 부동산 중개인'
};

function dex(which = 0) {
  app.className = 'app dex-app';
  const h = HERO_DATA[which];
  const tabs = HERO_DATA.map((x, i) => `<button class="dex-tab ${which === i ? 'on' : ''}" data-tab="${i}">${charOrShadow(x.id, 34)}<span>${x.name}</span></button>`).join('');
  const lockNote = isOpen(h.id) ? '' : `<div class="dex-card lockcard"><span class="kind">잠김</span><p>승차권 <b>${h.price}장</b>으로 해금(보유 ${Records.tickets()}장) · 잠겨 있어도 AI 상대로 등장</p></div>`;
  app.innerHTML = `
    <div class="dex">
      <div class="dex-head"><button class="btn small white" id="dexBack">← 로비</button><b>도감</b></div>
      <div class="dex-tabs">${tabs}</div>
      <div class="dex-body">
        <div class="dex-stage"><div class="dex-floor"></div><div class="dex-char">${character(h.id, 210)}</div>
          <div class="dex-acts">${Object.entries(ACT_LABEL).map(([a, l]) => `<button class="${a === 'idle' ? 'on' : ''}" data-act="${a}">${l}</button>`).join('')}</div></div>
        <div class="dex-info">
          <div class="dex-name"><b>${h.job} ${h.name}</b><span>${DEX_LINE[h.id]}</span></div>${lockNote}
          <div class="dex-card"><span class="kind">고유</span><h3>${h.skill}</h3><p>${skillDesc(h, loopy())}</p></div>
          ${skillCard(h, 'dex')}
          <div class="dex-card tip"><span class="kind">AI 성향 · ${h.ai.name}</span><p>${AI_NOTE[h.id]}</p></div>
        </div>
      </div>
      ${gnbHTML('dex')}
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  $('#dexBack').onclick = () => { Sound.click(); title(); };
  bindGnb();
  app.querySelectorAll('.dex-tab').forEach((t) => { t.onclick = () => { Sound.click(); dex(Number(t.dataset.tab)); }; });
  const big = app.querySelector('.dex-char');
  app.querySelectorAll('.dex-acts button').forEach((b) => {
    b.onclick = () => { Sound.click(); app.querySelectorAll('.dex-acts button').forEach((x) => x.classList.toggle('on', x === b)); act(big, b.dataset.act); };
  });
  $('#dexSkill').onclick = async (ev) => {
    const btn = ev.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true; Sound.unlock();
    await skillCutin({ hero: h.id, skill: h.active.id, name: h.active.name, desc: activeDesc(h, loopy()) });
    act(big, 'cheer', 1200);
    btn.disabled = false;
    skillDemo(h);
  };
}

// ── 랭킹 ───────────────────────────────────────────────────

function ranking() {
  app.className = 'app dex-app';
  const m = Records.summary();
  const tier = m.tier;
  const date = (at) => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const rows = m.games.length ? m.games.map((g, i) => `
      <div class="rank-row ${i < 3 ? 'top' + (i + 1) : ''}">
        <span class="no">${i + 1}</span>
        <div class="what"><b>${character(g.hero, 26)} ${g.place}등 / ${g.size}명</b><span>${g.daily ? '오늘의 대결' : '대결'} · ${date(g.at)}</span></div>
        <b class="pts">${g.points}</b>
      </div>`).join('') : '<p class="rank-empty">기록 없음 · 첫 대결을 시작해 보세요</p>';
  app.innerHTML = `
    <div class="dex">
      <div class="dex-head"><button class="btn small white" id="dexBack">← 로비</button><b>랭킹</b></div>
      <div class="rank-me tier-card" style="--tc:${tier.color}">
        <span class="kind">랭크</span>
        <div class="tc-main">${tierBadge(tier, 72)}<div><h3>${tier.label}</h3><div class="rank-total"><b>${m.rp.toLocaleString()}</b><span>RP · ${m.plays || 0}판 ${m.wins || 0}승</span></div></div></div>
        <div class="bar rank-bar"><i style="width:${tier.pct}%;background:${tier.color}"></i></div>
        <p>${tier.hi ? `다음 단계까지 ${tier.hi - m.rp} RP` : '최고 티어'} · 누적 승점 ${m.total.toLocaleString()}</p>
      </div>
      <div class="rank-rule">RP(4인) 1등 +${RP_TABLE[4][0]} · 2등 +${RP_TABLE[4][1]} · 3등 ${RP_TABLE[4][2]} · 4등 ${RP_TABLE[4][3]} · 조기 승리 +5 · 티어 바닥 아래로는 내려가지 않음<br>승점: 판당 +10 · 보유 역 +1 · 1등 +30 · 2등 +15 · 3등 +5 · 승점만큼 승차권 지급(보유 ${Records.tickets()}장)</div>
      <div class="rank-list">${rows}</div>
      ${gnbHTML('rank')}
    </div>`;
  $('#dexBack').onclick = () => { Sound.click(); title(); };
  bindGnb();
}

// ── 하는 법 ────────────────────────────────────────────────

/** 순환선 판 도움말 */
const LOOP_GUIDE = [
  ['순환선', '2호선 32칸 고리를 시계 방향으로 · 모두 시청에서 출발 · 18바퀴'],
  ['이동', '주사위 2개 중 하나를 골라 이동(1~5칸 · 급행 7칸+한 번 더) · 뒤로는 못 감'],
  ['월급', `시청을 지날 때마다 +${SALARY} · 시청에 서면 1.5배`],
  ['지름길', '3호선 을지로3가↔교대 · 4호선 동대문↔사당 — 지나거나 출발할 때 판을 가로지를 수 있음'],
  ['모서리 칸', '성수 팝업 축제(내 역 통행료 2배) · 강남 급행 환승(앞 12칸 중 원하는 칸) · 신도림 환승 미로(한 턴 쉬기)'],
  ['구매 · 증축', '빈 칸 도착 시 구매 · 내 칸 재도착 시 증축, 3단계는 랜드마크 · 지나가기만 하면 요금 없음'],
  ['통행료', '남의 칸 도착 시 통행료 · 이어서 가진 칸 ×2~×4 · 단계 ×3 · ×7 · 통행료 뒤 1.5배에 인수 가능'],
  ['노선 투자', '주사위 전, 이어진 내 칸(2칸 이상)은 어디서든 증축'],
  ['스킬', '주사위를 던질 때마다 1칸 충전 · 다 차면 주사위 전에 사용'],
  ['찬스 · 명소', '? 칸은 찬스 카드 · DDP·잠실·홍대는 명소 칸(도착 효과)'],
  ['독점 승리', '명소 3칸 전부 또는 5칸 연속 보유 시 즉시 승리'],
  ['승리 조건', '최후의 1인, 독점, 또는 막차 시 자산 1위']
];

function guide(then = null) {
  const steps = loopy() ? LOOP_GUIDE : [
    ['지역', '판마다 서울의 한 지역(도심 · 강남 · 서남 · 동부, 72역)에서 대결 · 12바퀴'],
    ['이동', '주사위 2개 중 하나를 골라 이동(1~5역 · 급행 7역+한 번 더) · 눈마다 도착할 곳이 미리 보임'],
    ['갈림길', '환승역에서 노란 화살표로 방향 선택 · 왔던 길로는 못 돌아감'],
    ['구매 · 증축', '빈 역 도착 시 구매(일반 100 · 환승 180 · 3개 노선 260) · 내 역 재도착 시 증축, 3단계는 랜드마크'],
    ['통행료', '남의 역 도착 시 통행료, 지나가기만 해도 20% · 같은 노선 연결 ×2~×4 · 단계 ×3 · ×7'],
    ['인수', '통행료를 낸 뒤 1.5배 가격에 인수 · 랜드마크는 인수 불가'],
    ['노선 투자', '주사위 전, 연결된 내 역(2역 이상)은 어디서든 증축'],
    ['스킬', '주사위를 던질 때마다 1칸 충전 · 다 차면(캐릭터마다 3~5칸) 주사위 전에 사용 · 쓰면 다시 0칸'],
    ['목적지', `목적지를 지나거나 도착 시 +${GOAL_BONUS} · 새 목적지 지급`],
    ['명소역', '그림 간판이 있는 역 11곳 · 가격 1.5배 · 도착 시 특수 효과(서울역 KTX, 김포공항 이동 2배, 명동 카드 선택 등) · 목적지로 자주 등장'],
    ['찬스 · 인파', '? 역 도착 시 찬스 카드 · 인파 역(도착 시 +100, 통행료 2배)은 스킬·명소역으로 발생'],
    ['독점 승리', `지역 명소역 전부(5곳인 지역은 4곳) 또는 한 노선 ${LINE_WIN}역 연결 시 즉시 승리 · 1곳 전이면 경고 표시`],
    ['승리 조건', '통행료를 못 내면 역 매각 후 파산 · 최후의 1인, 독점, 또는 24:00 막차 시 자산(돈+역 가격) 1위']
  ];
  const s = sheet(`<h2>도움말</h2>
    <div class="howto">${steps.map(([t, d], i) => `<div class="ht"><b>${i + 1}</b><div><h4>${t}</h4><p>${d}</p></div></div>`).join('')}</div>
    <div class="row"><button class="btn" id="gOk">${then ? '시작' : '닫기'}</button></div>`);
  s.querySelector('#gOk').onclick = () => { Sound.click(); Prefs.markGuide(); closeSheet(); if (then) then(); };
}

// ── 대결 매칭 ──────────────────────────────────────────────
// 다른 사람과 붙는 온라인 대결 자리. 아직 서버가 없어 findHumans 는 늘 빈 목록이고, 빈자리는 AI 승객이 채운다.
// 로딩 바는 노선 모양 — 열차가 역을 하나씩 지나며 최소 MATCH_MIN_MS 동안 상대를 찾는다.

const MATCH_MIN_MS = 3000;
/** 온라인 상대 찾기(서버를 붙일 자리). 지금은 아무도 없다 */
const findHumans = async () => [];
const MM_STEPS = [
  [0, '상대 찾는 중', '대결 가능한 플레이어 탐색'],
  [0.35, '노선 확인 중', '1~9호선 플레이어 확인'],
  [0.7, '응답 대기 중', '잠시만 기다려 주세요']
];
const MM_STOPS = ['출발', '탐색', '신호', '응답', '매칭'];
const MM_TIPS = [
  '명소역 5곳 독점 시 즉시 승리',
  '남의 역은 지나가기만 해도 통과 요금',
  '서울역 도착 시 KTX 순간이동',
  '같은 노선 연결 시 통행료 최대 4배',
  '승차권으로 새 캐릭터 해금'
];
const TRAIN_ICON = (c) => `<svg viewBox="0 0 64 30" width="64" height="30" aria-hidden="true">
  <path d="M3 25 V9 Q3 4 8 4 H50 Q60 4 62 14 V25 Z" fill="#FFFDF7" stroke="#22201D" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M3 18 H62" stroke="${c}" stroke-width="4"/>
  <rect x="8" y="8" width="9" height="6" rx="1.5" fill="#9FD3EC" stroke="#22201D" stroke-width="2"/><rect x="21" y="8" width="9" height="6" rx="1.5" fill="#9FD3EC" stroke="#22201D" stroke-width="2"/><rect x="34" y="8" width="9" height="6" rx="1.5" fill="#9FD3EC" stroke="#22201D" stroke-width="2"/>
  <path d="M50 8 Q57 8 59 14 H50 Z" fill="#9FD3EC" stroke="#22201D" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="14" cy="26" r="3" fill="#22201D"/><circle cx="48" cy="26" r="3" fill="#22201D"/></svg>`;

/** 매칭 화면. 최소 3초 동안 상대를 찾고, 사람이 없으면 AI 로 채운다. 출발하면 true, 취소하면 false */
function matchmaking(me, rivals, daily, area) {
  app.className = 'app match-app';
  const h = heroById(me), lc = LINES[2].color;
  app.innerHTML = `
    <div class="mm">
      <div class="mm-head"><b>대결 매칭</b><span>${daily ? '오늘의 대결' : '대결'} · ${area.name} · ${rivals.length + 1}명</span></div>
      <div class="mm-board">
        <div class="mm-board-top"><i class="mm-dot"></i>매칭<em id="mmClock">0.0초</em></div>
        <div class="mm-led" id="mmLed">${MM_STEPS[0][1]}</div>
        <div class="mm-sub" id="mmSub">${MM_STEPS[0][2]}</div>
      </div>
      <div class="mm-slots">
        <div class="mm-slot me" style="--pc:${h.color}"><div class="mm-face">${character(me, 64, 'idle')}</div><b>나</b><span>${h.job}</span></div>
        ${rivals.map((_, i) => `<div class="mm-slot wait" data-i="${i}"><div class="mm-face"><i class="mm-ring"></i><b class="mm-q">?</b></div><b>찾는 중</b><span>&nbsp;</span></div>`).join('')}
      </div>
      <div class="mm-line" style="--lc:${lc}">
        <div class="mm-rail"><i class="mm-fill" id="mmFill"></i></div>
        ${MM_STOPS.map((n, i) => `<div class="mm-st" style="left:${i * 25}%"><i></i><span>${n}</span></div>`).join('')}
        <div class="mm-train" id="mmTrain">${TRAIN_ICON(lc)}</div>
      </div>
      <div class="mm-meta"><b id="mmPct">0%</b><span id="mmTip">TIP · ${MM_TIPS[0]}</span></div>
      <button class="btn white" id="mmCancel">취소</button>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  const led = (big, small) => {
    const el = $('#mmLed');
    if (el.textContent !== big) { el.textContent = big; tween(el, [{ opacity: 0.2 }, { opacity: 1 }], { duration: 220 }); }
    if (small != null) $('#mmSub').textContent = small;
  };
  return new Promise((resolve) => {
    let done = false, timer = 0, passed = 0, tip = 0, lastTip = 0;
    const t0 = performance.now();
    const humans = findHumans();
    $('#mmCancel').onclick = () => { if (done) return; done = true; clearInterval(timer); Sound.click(); title(); resolve(false); };
    const found = async () => {
      const people = await humans;
      if (done) return;
      $('#mmCancel').disabled = true;
      led(people.length ? '매칭 완료!' : 'AI 매칭 완료!', `${area.name}${area.loop ? '' : ' 지역'} · ${area.sub}${people.length ? '' : ' · AI 대결'}`);
      $('#mmPct').textContent = '100%';
      Sound.chime();
      for (const [i, id] of rivals.entries()) {
        await sleep(280);
        if (done) return;
        const r = heroById(id);
        const slot = app.querySelector(`.mm-slot[data-i="${i}"]`);
        slot.classList.remove('wait');
        slot.classList.add('found');
        slot.style.setProperty('--pc', r.color);
        slot.innerHTML = `<div class="mm-face">${character(id, 64, 'cheer')}</div><b>${r.name}</b><span><i class="mm-ai">AI</i>${r.job}</span>`;
        tween(slot, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
        Sound.coin();
      }
      await sleep(550);
      if (done) return;
      led('곧 출발', `${hhmm(CLOCK.start)} 첫차`);
      Sound.whoosh();
      tween($('#mmTrain'), [{ transform: 'translateX(0)' }, { transform: 'translateX(60vw)' }], { duration: 600, easing: 'ease-in', fill: 'forwards' });
      await sleep(650);
      if (done) return;
      done = true;
      resolve(true);
    };
    // 타이머로 돌린다(탭이 가려져도 시간대로 흘러 3초 뒤 매칭이 끝난다)
    const tick = () => {
      const now = performance.now();
      if (done) { clearInterval(timer); return; }
      const t = Math.min(1, (now - t0) / MATCH_MIN_MS);
      const p = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // 천천히 출발해 천천히 선다
      $('#mmFill').style.width = p * 100 + '%';
      $('#mmTrain').style.left = `calc(${p} * (100% - 64px))`; // 열차 앞머리가 마지막 역에 닿게
      $('#mmPct').textContent = Math.floor(p * 99) + '%';
      $('#mmClock').textContent = ((now - t0) / 1000).toFixed(1) + '초';
      const st = Math.min(4, Math.floor(p * 4 + 0.02));
      while (passed < st) { passed++; app.querySelectorAll('.mm-st')[passed].classList.add('on'); Sound.step(passed); }
      const step = MM_STEPS.filter(([at]) => t >= at).pop();
      led(step[1], step[2]);
      if (now - lastTip > 1500 && t < 1) { lastTip = now; tip = (tip + 1) % MM_TIPS.length; if (now - t0 > 100) $('#mmTip').textContent = 'TIP · ' + MM_TIPS[tip]; }
      if (t >= 1) { clearInterval(timer); found(); }
    };
    app.querySelectorAll('.mm-st')[0].classList.add('on');
    timer = setInterval(tick, 33);
  });
}

// ── 대결 시작 ──────────────────────────────────────────────

async function startGame(daily) {
  Sound.unlock(); Sound.click();
  const me = Prefs.getLeader(Records.unlocked());
  const q = new URLSearchParams(location.search);
  const fixed = parseInt(q.get('seed'), 10);
  const today = new Date();
  const seed = daily ? today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
    : Number.isNaN(fixed) ? (Date.now() & 0x7fffffff) : fixed;
  // 상대는 여덟 중 무작위(잠긴 캐릭터도 나온다) — 같은 시드면 같은 상대
  const rivals = createRng((seed ^ 0x5bd1e995) >>> 0 || 1).shuffle(ids.filter((x) => x !== me)).slice(0, Prefs.getRivals());
  const m = createMatch({ seed, heroes: [me, ...rivals], humans: 1, daily, region: Prefs.getBoard() === 'loop' ? 'loop' : null });
  if (!(await matchmaking(me, rivals, daily, areaOf(m)))) return;
  G.daily = daily;
  G.m = m;
  G.stats = { buy: 0, upgrade: 0, landmark: 0, takeover: 0, goal: 0, hot: 0, toll: 0 };
  G.hudMoney = {};
  G.combo = null;
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
      <button class="btn small white zoom-btn" id="zoom">전체 지도</button>
      <button class="btn small white help-btn2" id="help" aria-label="도움말">?</button></div>
    <div class="dock" id="dock">
      <div class="me-row" id="meRow"></div>
      <div class="controls">
        <div class="throw-wrap"><button class="btn main" id="throw">출발</button></div>
        <div class="side"><button class="btn small white skill-btn" id="skillBtn"></button><button class="btn small white" id="investBtn"></button></div>
      </div>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  useBoard(isLoop(M()) ? 'loop' : 'map');
  Camera.setFollowZoom(isLoop(M()) ? 0.6 : undefined, isLoop(M()));
  Camera.attach($('#board'), $('#cam'), canvasSize());
  $('#throw').onclick = () => onThrow();
  $('#skillBtn').onclick = onSkill;
  $('#investBtn').onclick = openInvest;
  $('#zoom').onclick = () => { Sound.click(); if (G.regionView) showPlayer(current(M())); else showRegion(); };
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
    <span class="kind">${G.daily ? '오늘의 대결' : '대결'} · ${areaOf(m).name}${isLoop(m) ? '' : ' 지역'} · ${m.players.length}명</span>
    <h2 style="margin-top:6px">${hhmm(CLOCK.start)} 첫차</h2>
    <div class="vs">${m.players.map((p, i) => `<div class="vs-p ${i ? '' : 'me'}" style="--pc:${colorOf(p)}">${character(p.hero, 54, 'cheer')}<b>${i ? nameOf(p) : '나'}</b><span>${p.node}</span></div>`).join('<i>VS</i>')}</div>
    <p>${isLoop(m) ? `모두 <b>시청</b>에서 출발 · 한 바퀴 돌 때마다 <b>월급 ${SALARY}</b> · 모서리 칸: 축제·급행·미로 · <b>3·4호선 지름길</b>로 판을 가로지른다<br>` : ''}시작 자금 <b>${START_MONEY.toLocaleString()}</b> · 승리 조건: 상대 <b>파산</b> / <b>명소역 ${m.hotWin}곳 · ${isLoop(m) ? `${m.lineWin}칸 연속` : `한 노선 ${m.lineWin}역`}</b> 독점 / <b>${roundsOf(m)}바퀴 막차</b> 자산 1위</p>
    <div class="row"><button class="btn white" id="how">도움말</button><button class="btn" id="go">시작</button></div>`);
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

// ── 손맛: 내 차례 배너 · 진동 · 큰 통행료 · 돈 카운트업 ──

/** 휴대폰 진동(지원하는 기기에서, 소리를 켠 경우만) */
const buzz = (pattern) => {
  // 화면을 한 번이라도 누른 뒤에만(브라우저가 막는다)
  if (!Sound.isOn() || !navigator.vibrate || navigator.userActivation?.hasBeenActive === false) return;
  try { navigator.vibrate(pattern); } catch { /* 진동 없음 */ }
};

/** 내 차례 배너: 캐릭터와 "내 차례!"가 가로질러 들어온다 */
async function turnBanner(p) {
  const m = M();
  const el = document.createElement('div');
  el.className = 'turn-banner';
  el.style.setProperty('--pc', colorOf(p));
  el.innerHTML = `<div class="tbn-in">${character(p.hero, 76, 'cheer')}<div><b>내 차례!</b><span>${hhmm(m.clock)} · ${m.round}바퀴</span></div></div>`;
  app.appendChild(el);
  Sound.heung(2);
  buzz(25);
  const inner = el.querySelector('.tbn-in');
  await tween(inner, [{ transform: 'translateX(-130%) skewX(-12deg)' }, { transform: 'translateX(5%) skewX(-12deg)', offset: 0.65 }, { transform: 'translateX(0) skewX(-12deg)' }], { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' });
  await sleep(520);
  await tween(el, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(40%)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
  el.remove();
}

/** 큰 통행료: 화면 가운데 큰 숫자 + 흔들림 + 진동 */
async function bigHit(text, color) {
  const el = document.createElement('div');
  el.className = 'big-hit';
  el.style.setProperty('--hc', color);
  el.innerHTML = `<b>${text}</b>`;
  app.appendChild(el);
  Sound.boss();
  flash(app);
  shake(app, 12, 500);
  buzz([70, 40, 110]);
  await tween(el.firstChild, [{ transform: 'scale(3)', opacity: 0 }, { transform: 'scale(.9)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'forwards' });
  await sleep(650);
  await tween(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
  el.remove();
}

/** 숫자가 from → to 로 차오른다(탭이 가려져도 끝값은 꼭 맞춘다) */
function countUp(el, from, to, ms = 480) {
  const t0 = performance.now();
  const set = (v) => { el.textContent = Math.round(v).toLocaleString(); };
  const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); set(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  step();
  setTimeout(() => set(to), ms + 60);
}

/** 내 차례: 출발·스킬·노선 투자를 기다린다. 달리는 중엔 갈림길을 고르고, 거래 제안엔 답한다 */
async function humanTurn(p) {
  const m = M();
  showPlayer(p);
  if (m.phase === 'roll' && !p.rest) await turnBanner(p);
  await new Promise((resolve) => { G.wait = resolve; drawControls(); });
  G.wait = null;
  if (m.phase === 'pick') {
    const i = await pickDiePrompt();
    await play(pickDie(m, i));
  }
  if (m.phase === 'move') {
    const path = await pickPath();
    await play(move(m, path));
  }
  if (m.phase === 'choose') {
    const v = await choicePrompt();
    await play(choose(m, v));
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
  const sk = wantsSkill(m);
  if (sk) await play(useSkill(m, sk.target));
  for (let n = chooseInvest(m); n; n = chooseInvest(m)) await play(invest(m, n));
  if (m.phase === 'roll' && current(m) === p) await play(roll(m));
  if (m.phase === 'pick') await play(pickDie(m, chooseDie(m)));
  if (m.phase === 'move') await play(move(m, choosePath(m)));
  if (m.phase === 'choose') { await sleep(300); await play(choose(m, chooseOption(m))); }
  if (m.phase === 'decide') { await sleep(250); await play(decide(m, decideOffer(m))); }
}

async function onThrow() {
  const m = M();
  if (G.busy || !m || m.phase !== 'roll' || !current(m).human || !G.wait) return;
  Sound.unlock();
  hideFork();
  await play(roll(m));
  G.wait?.();
}

async function onSkill() {
  const m = M();
  if (G.busy || app.querySelector('.sheet')) return;
  Sound.unlock();
  Sound.click();
  const target = await skillSheet();
  if (target === undefined) return;
  const p = current(m);
  await play(useSkill(m, target));
  drawControls();
  // 직통 열차처럼 차례가 이어지면(거래·고르기·다음 사람) 기다리던 차례를 푼다
  if (m.phase !== 'roll' || current(m) !== p) G.wait?.();
}

// ── 스킬 창 ────────────────────────────────────────────────

/** 충전 칸: 찬 칸은 캐릭터 색, 다 차면 반짝 */
function skillPips(charge, cost) {
  return `<span class="sk-pips ${charge >= cost ? 'full' : ''}">${Array.from({ length: cost }, (_, i) => `<i class="${i < charge ? 'on' : ''}"></i>`).join('')}</span>`;
}

/** 캐릭터 고르기·도감의 스킬 카드 */
function skillCard(h, kind) {
  const a = { ...h.active, desc: activeDesc(h, loopy()), charge: chargeOf(h, loopy()) };
  return `<div class="${kind === 'pk' ? 'pk-card' : 'dex-card'} skill sk-card" style="--hc:${h.color}">
    <span class="sk-icon">${skillArt(a.id, 44)}</span>
    <div class="sk-body"><span class="${kind === 'pk' ? 'pk-kind' : 'kind'}">스킬 · 충전 ${a.charge}칸</span>
      <h3>${a.name}</h3><p>${a.desc}</p>${skillPips(a.charge, a.charge)}
      ${kind === 'dex' ? '<div class="dex-rule">던질 때마다 1칸 · 다 차면 주사위 전에 사용</div><button class="btn small yellow" id="dexSkill">미리 보기</button>' : ''}</div>
  </div>`;
}

/** 스킬 대상 한 줄: 그 역에 쓰면 어떻게 되나 */
function targetRow(m, p, id, n) {
  const owner = m.owned[n] ? playerById(m, m.owned[n]) : null;
  const lv = m.levels[n] || 0;
  const toll = owner ? baseToll(m.owned, m.levels, n) : 0;
  const rivals = alive(m).filter((q) => q !== p);
  let info, note = '';
  if (id === 'direct') {
    info = n === p.goal ? '<i class="good">목적지</i>' : !owner ? (isChance(n) ? '찬스 역' : `빈 역 · ${priceFor(m, n)}`) : owner === p ? '내 역' : `<i class="bad">${nameOf(owner)} 역 · 통행료 ${p.coupon ? '면제' : tollFor(m, n, p)}</i>`;
    info += ` · ${dist(p.node, n)}역`;
    if (n === p.goal) note = `<em class="goal">+${GOAL_BONUS + (heroById(p.hero).goalBonus || 0)}</em>`;
    else if (HOTSPOTS[n]) note = '<em class="hot">명소</em>';
  } else if (id === 'buyout') {
    info = `${nameOf(owner)} 역 · ${LEVEL_NAME[lv]} · 통행료 ${toll}`;
    note = `<em class="price">${buyoutFor(m, n).toLocaleString()}</em>`;
  } else {
    info = `${LEVEL_NAME[lv]} · 통행료 ${toll}`;
    if (id === 'gather') note = `<em class="price">+${rivals.reduce((s, q) => s + Math.min(GATHER_MAX, Math.round(tollFor(m, n, q) * GATHER_RATE)), 0)}</em>`;
    else if (id === 'hype') note = `<em class="price">→ ${toll * 2}</em>`;
    else if (id === 'gate') note = `<em class="price">근처 상대 ${rivals.filter((q) => dist(q.node, n) <= 8).length}</em>`;
  }
  const lines = (STATION_LINES[n] || []).map((l) => `<i style="--lc:${LINES[l].color}"></i>`).join('');
  return `<button class="sk-row" data-v="${n}" style="--pc:${owner ? colorOf(owner) : '#FFFDF7'}">
    <span class="sk-lines">${lines}</span><div><b>${hotArt(n, 18) || ''}${n}</b><span>${info}</span></div>${note}</button>`;
}

/** 대상 순서: 쓸 만한 것부터 */
function sortTargets(m, p, id, list) {
  const score = (n) => {
    if (id === 'direct') return (n === p.goal ? 1e6 : 0) + (HOTSPOTS[n] ? 1e4 : 0) + (!m.owned[n] ? 1e3 : 0) - dist(p.node, n);
    return baseToll(m.owned, m.levels, n);
  };
  return list.slice().sort((a, b) => score(b) - score(a));
}

/**
 * 스킬 창: 캐릭터 · 스킬 아이콘 · 설명 · 충전 칸. 쓸 수 있으면 [사용](역을 고르는 스킬은 역 목록).
 * 고른 대상(역을 안 고르면 null)을 돌려주고, 닫으면 undefined.
 */
function skillSheet() {
  const m = M(), me = ME(), h = heroById(me.hero), a = h.active;
  const cost = skillCost(me), why = skillBlocked(m, me);
  const mine = current(m) === me && !!G.wait;
  const blocked = !mine ? '내 차례 주사위 전에 사용' : why;
  const targets = !blocked ? skillTargets(m, me) : null;
  const ready = me.charge >= cost;
  const list = targets ? sortTargets(m, me, a.id, targets) : null;
  const extra = a.id === 'cram' && !blocked ? `<div class="sk-preview">${cramTargets(m, me).slice(0, CRAM_COUNT).map((n) => `<span>${n} <b>${LEVEL_NAME[m.levels[n]]} → ${LEVEL_NAME[n === '잠실' ? 3 : m.levels[n] + 1]}</b></span>`).join('')}</div>` : '';
  const s = sheet(`
    <div class="sk-sheet ${ready ? 'ready' : ''}" style="--hc:${h.color}">
      <div class="sk-top">
        <div class="sk-burst"></div>
        <div class="sk-char">${character(h.id, 118, ready ? 'cheer' : 'idle')}</div>
        <div class="sk-medal">${skillArt(a.id, 58)}</div>
      </div>
      <span class="sk-who">${h.job} ${h.name}의 스킬</span>
      <h2>${a.name}</h2>
      <p class="sk-desc">${activeDesc(h, isLoop(m))}</p>
      <div class="sk-charge">${skillPips(me.charge, cost)}<b>${ready ? '충전 완료' : `충전 ${me.charge} / ${cost}`}</b><em>던질 때마다 1칸</em></div>
      ${extra}
      ${list ? `<div class="sk-pick"><span class="sk-pick-h">${a.target} 선택</span><div class="sk-list">${list.map((n) => targetRow(m, me, a.id, n)).join('')}</div></div>` : ''}
      <div class="row"><button class="btn white" id="skClose">닫기</button>
        ${list ? '' : `<button class="btn ${blocked ? 'white' : 'yellow'} sk-go" id="skUse" ${blocked ? 'disabled' : ''}>${blocked ? `<small>${blocked}</small>` : '사용'}</button>`}</div>
    </div>`);
  if (list) { clearDest(); for (const n of list.slice(0, 12)) addDest(n, me, null, 2); }
  return new Promise((resolve) => {
    const done = (v) => { closeSheet(); clearDest(); resolve(v); };
    s.querySelector('#skClose').onclick = () => { Sound.click(); done(undefined); };
    app.querySelector('.sheet-back').onclick = () => done(undefined);
    s.querySelector('#skUse')?.addEventListener('click', () => { Sound.click(); done(null); });
    s.querySelectorAll('.sk-row').forEach((b) => { b.onclick = () => { Sound.click(); done(b.dataset.v); }; });
  });
}

// ── 주사위 고르기 ──────────────────────────────────────────

/** 이 눈으로 가면 어떻게 되나(한 줄) */
function dieNote(m, p, o) {
  if (o.goal) return '<i class="good">목적지 도착!</i>';
  if (o.ends.length !== 1) return `도착 후보 ${o.ends.length}곳`;
  const n = o.ends[0], owner = m.owned[n] ? playerById(m, m.owned[n]) : null;
  if (owner && owner !== p) return `<i class="bad">${nameOf(owner)} 역 · 통행료 ${p.coupon ? '면제' : tollFor(m, n, p)}</i>`;
  if (owner === p) return `${n} · 내 역`;
  if (HOTSPOTS[n]) return `<i class="good">${n} · 명소역</i>`;
  if (isChance(n)) return `${n} · 찬스`;
  return `${n} · 빈 역 ${priceFor(m, n)}`;
}

/** 주사위 둘 중 하나 고르기: 눈마다 도착할 곳을 지도 고리와 단추에 보여 준다 */
function pickDiePrompt() {
  const m = M(), p = current(m);
  const opts = dieChoices(m).map((i) => {
    const r = dieAt(m, i);
    const list = dieOptions(m, i);
    return { i, r, steps: dieSteps(m, i), ends: [...new Set(list.map((x) => x[x.length - 1]))], goal: list.some((x) => x.includes(p.goal)) };
  });
  clearDest();
  for (const o of opts) for (const n of o.ends) addDest(n, p, o.ends.length === 1 ? `${o.r.label} · ${n}` : null, o.i);
  Camera.frame([p.node, ...opts.flatMap((o) => o.ends)].map(nodeXY), { maxZoom: 0.8, minZoom: 0.28, pad: 200 });
  G.regionView = false; drawZoom();
  setHint('주사위 선택');
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'die-pick';
    box.innerHTML = `${opts.length > 2 ? `<div class="dp-head">${skillArt('combo', 20)} 동시 배달 · 하나 또는 합 · 통과 요금 없음</div>` : ''}<div class="dp-row ${opts.length > 2 ? 'three' : ''}">${opts.map((o) => `
      <button class="dp-btn opt${o.i} ${o.r.bonus ? 'express' : ''} ${o.r.sum ? 'sum' : ''}" data-i="${o.i}">
        <span class="dp-face">${o.r.sum ? `${o.r.value}<small>합</small>` : o.r.bonus ? '급행' : o.r.value}</span>
        <span class="dp-txt"><b>${o.steps}역${o.r.bonus ? (opts.length > 2 ? ' · 한 번 더' : ' + 한 번 더') : ''}</b><em>${dieNote(m, p, o)}</em></span>
      </button>`).join('')}</div>`;
    // 가로 화면에서는 판을 가리지 않게 오른쪽 패널(조작판 자리)에 띄운다
    (document.body.classList.contains('land') ? app : $('#board')).appendChild(box);
    tween(box, [{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: 'cubic-bezier(.3,.7,.3,1.2)' });
    box.querySelectorAll('.dp-btn').forEach((b) => {
      b.onclick = () => { Sound.click(); box.remove(); clearDest(); setHint(''); resolve(Number(b.dataset.i)); };
    });
  });
}

// ── 갈림길 고르기 ──────────────────────────────────────────

/** 갈림길마다 갈 역을 고르게 하며 길을 만든다. 갈 곳이 하나면 저절로 나아간다 */
async function pickPath() {
  const m = M(), p = current(m);
  let node = p.node, back = p.prev, left = m.pending.steps;
  const path = [];
  // 굴리자마자 도착할 역(갈림길이 있으면 도착 후보들)을 먼저 보여 준다
  const first = [...reachEnds(node, back, left, 0)];
  drawDest(first, p);
  Camera.frame([node, ...first].map(nodeXY), { maxZoom: 0.8, minZoom: 0.28, pad: 200 });
  drawZoom();
  await sleep(first.length === 1 ? 750 : 450);
  while (left > 0) {
    if (path.length && stopsAt(m, node)) break;
    const next = nextStations(m, node, back);
    if (!next.length) break;
    if (next.length > 1) drawDest([...reachEnds(node, back, left, path.length)], p);
    const choice = next.length === 1 ? next[0] : await askFork(node, back, next, left, path);
    path.push(choice);
    back = node; node = choice; left--;
    drawRoute(path);
    drawDest([...reachEnds(node, back, left, path.length)], p);
  }
  hideFork();
  clearRoute();
  clearDest();
  return path;
}

/** 지금 자리에서 남은 칸으로 닿을 수 있는 끝 역들 — pickPath 와 같은 규칙(되돌아가지 않기 · 불난 역 피하기 · 신호 장애에서 멈춤) */
function reachEnds(node, back, left, moved, out = new Set()) {
  const m = M();
  if (left <= 0 || (moved && stopsAt(m, node))) { out.add(node); return out; }
  const next = nextStations(m, node, back);
  if (!next.length) { out.add(node); return out; }
  for (const n of next) reachEnds(n, node, left - 1, moved + 1, out);
  return out;
}

/** 도착 예정 표시: 하나면 "도착 · 역 이름", 여럿이면 후보마다 작은 "도착?" */
function drawDest(ends, p) {
  clearDest();
  const one = ends.length === 1;
  for (const n of ends) {
    const [x, y] = nodeXY(n);
    const d = document.createElement('div');
    d.className = 'dest' + (one ? ' one' : '');
    d.style.left = x + 'px'; d.style.top = y + 'px';
    d.style.setProperty('--pc', colorOf(p));
    d.innerHTML = `<i class="dr"></i><span class="db">${one ? `도착 <b>${n}</b>` : '도착?'}</span>`;
    $('#layer').appendChild(d);
  }
}
function clearDest() { $('#layer')?.querySelectorAll('.dest').forEach((d) => d.remove()); }
/** 주사위 고르기용 고리 하나: text 가 있으면 말풍선, opt 는 눈마다 색을 달리 */
function addDest(n, p, text, opt) {
  const [x, y] = nodeXY(n);
  const d = document.createElement('div');
  d.className = `dest opt${opt}` + (text ? ' one' : '');
  d.style.left = x + 'px'; d.style.top = y + 'px';
  d.style.setProperty('--pc', opt ? '#22201D' : colorOf(p));
  d.innerHTML = `<i class="dr"></i>${text ? `<span class="db">${text}</span>` : ''}`;
  $('#layer').appendChild(d);
}

/** 갈림길: 갈 수 있는 다음 역마다 화살표 단추(호선 색·역 이름·그 역의 값) */
function askFork(node, back, next, left, path) {
  const m = M(), p = current(m);
  const ends = next.map((n) => [...reachEnds(n, node, left - 1, path.length + 1)]);
  const pts = [node, ...next, ...ends.flat()].map(nodeXY);
  Camera.frame(pts, { maxZoom: 0.9, minZoom: 0.28, pad: 220 });
  drawZoom();
  setHint(`방향 선택 · 남은 ${left}역`);
  Sound.click();
  return new Promise((resolve) => {
    hideFork();
    for (const [i, n] of next.entries()) {
      const line = LINES[lineOfEdge(node, n)];
      const [x0, y0] = nodeXY(node), [x, y] = nodeXY(n);
      const ang = Math.atan2(y - y0, x - x0) * 180 / Math.PI;
      const owner = m.owned[n];
      const info = owner && owner !== p.id ? `<em class="bad">${owner === p.id ? '' : '남의 역'}</em>`
        : owner === p.id ? '<em class="mine">내 역</em>' : isChance(n) ? '<em class="chance">찬스</em>' : '';
      const toward = dist(n, p.goal) < dist(node, p.goal) ? '<em class="goal">목적지 쪽</em>' : '';
      const end = ends[i].length === 1 ? `<em class="arrive">도착 ${ends[i][0]}</em>` : `<em class="arrive">도착 후보 ${ends[i].length}</em>`;
      const el = document.createElement('button');
      el.className = 'fork';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.setProperty('--lc', line?.color || '#22201D');
      el.innerHTML = `<i class="arrow" style="transform:rotate(${ang}deg)">➜</i><span><b>${line?.name || ''}</b> ${n}</span>${info}${toward}${end}`;
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

// ── 명소역에서 고르기(내 차례) ───────────────────────────────

/** KTX: 갈 역 고르기 · 명동: 찬스 카드 두 장 중 하나 */
function choicePrompt() {
  const m = M(), p = current(m), c = m.choice;
  return new Promise((resolve) => {
    let s;
    if (c.kind === 'festival') {
      const rows = c.options.map((n) => `<button class="warp-row" data-v="${n}" style="--pc:${colorOf(p)}">${hotArt(n, 34) || '<span class="wr-flag">축제</span>'}<div><b>${n}</b><span>통행료 ${baseToll(m.owned, m.levels, n)} → <i class="good">${baseToll(m.owned, m.levels, n) * 2}</i></span></div></button>`).join('');
      s = sheet(`<span class="kind">성수 · 팝업 축제</span><h2 style="margin-top:6px">축제를 열 내 역</h2><p>${c.options.length}곳 중 하나 · 통행료 2배(3바퀴)</p><div class="warp-list">${rows}</div>`);
    } else if (c.kind === 'card') {
      const cards = c.options.map((id) => {
        const k = chanceById(id);
        return `<button class="pick-card ${k.good ? 'good' : 'bad'}" data-v="${id}"><span class="pk-deck">찬스 카드</span><b>${k.name}</b><em>${k.short}</em></button>`;
      }).join('');
      s = sheet(`<span class="kind">${hotArt('명동', 22)} 명동 · 쇼핑 거리</span><h2 style="margin-top:6px">카드 선택</h2><div class="pick-cards">${cards}</div>`);
    } else {
      const rows = c.options.map((n) => {
        const o = m.owned[n] ? playerById(m, m.owned[n]) : null;
        const note = n === p.goal ? `<em class="goal">내 목적지 +${GOAL_BONUS}</em>` : '';
        const own = !o ? (isChance(n) ? '찬스 역' : `빈 역 · ${priceFor(m, n)}`) : o === p ? '내 역' : `<i class="bad">${nameOf(o)} 역 · 통행료 ${p.coupon ? '면제' : tollFor(m, n, p)}</i>`;
        return `<button class="warp-row" data-v="${n}" style="--pc:${o ? colorOf(o) : '#FFFDF7'}">${hotArt(n, 34) || `<span class="wr-flag">${isLoop(m) ? `${ahead(p.node, n)}칸` : '목적지'}</span>`}<div><b>${n}</b><span>${own}${isLoop(m) ? (n === LOOP_START ? ' · 월급!' : '') : ` · ${dist(p.node, n)}역`}</span></div>${note}</button>`;
      }).join('');
      s = sheet(isLoop(m) ? `<span class="kind">강남 · 급행 환승</span><h2 style="margin-top:6px">내릴 칸 선택</h2><p>앞 ${c.options.length}칸 중 하나 · 시청을 넘으면 월급</p><div class="warp-list">${rows}</div>`
        : `<span class="kind">${hotArt('서울역', 22)} 서울역 · KTX 순간이동</span><h2 style="margin-top:6px">도착역 선택</h2><div class="warp-list">${rows}</div>`);
    }
    s.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { Sound.click(); closeSheet(); resolve(b.dataset.v); }; });
  });
}

// ── 거래 제안(내 차례) ─────────────────────────────────────

function offerPrompt() {
  const m = M(), p = current(m), o = m.offer;
  const lines = STATION_LINES[o.node].map((l) => `<i style="--lc:${LINES[l].color}"></i>`).join('');
  const nextOwned = { ...m.owned, [o.node]: p.id };
  const chain = Math.min(4, links(nextOwned, p.id).at[o.node]?.len || 1);
  const lvAfter = o.kind === 'upgrade' ? o.level : m.levels[o.node] || 1;
  const toll = Math.round(stationPrice(o.node) * 0.3 * LEVEL_MULT[lvAfter] * chain);
  const title = o.kind === 'buy' ? '역 구매' : o.kind === 'upgrade' ? `${LEVEL_NAME[o.level]} 증축` : `${nameOf(playerById(m, o.from))}의 역 인수`;
  const btn = o.kind === 'buy' ? '구매' : o.kind === 'upgrade' ? '증축' : '인수';
  Camera.follow([nodeXY(o.node)[0], nodeXY(o.node)[1] + 110], 300);
  return new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'offer-card kind-' + o.kind;
    card.innerHTML = `
      <div class="oc-sign">${lines}<b>${o.node}</b>${HOTSPOTS[o.node] ? `<em class="oc-hot">${hotArt(o.node, 18)} 명소역 · ${HOTSPOTS[o.node].tag}</em>` : ''}</div>
      <div class="oc-body"><span>${title}</span>
        <em>가격 <b>${o.price.toLocaleString()}</b> · 잔액 ${(p.money - o.price).toLocaleString()} · 예상 통행료 <b>${toll}</b>${chain > 1 ? ` · <strong>${chain}역 연결 ×${chain}</strong>` : ''}</em></div>
      <div class="oc-btns"><button class="btn small white" data-a="no">패스</button><button class="btn small yellow" data-a="yes">${btn} · ${o.price.toLocaleString()}</button></div>`;
    (document.body.classList.contains('land') ? app : $('#board')).appendChild(card);
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
  if (!can.length) { Sound.deny(); toast('연결된 내 역(2역 이상)이 필요해요'); return; }
  Sound.click();
  const p = current(m);
  const rows = can.map((n) => {
    const lv = m.levels[n];
    const now = baseToll(m.owned, m.levels, n), after = baseToll(m.owned, { ...m.levels, [n]: lv + 1 }, n);
    return `<button class="inv-row" data-n="${n}"><b>${n}</b><span>${LEVEL_NAME[lv]} → ${LEVEL_NAME[lv + 1]}</span><em>통행료 ${now} → ${after}</em><i>${upgradeFor(m, n, p)}점</i></button>`;
  }).join('');
  const s = sheet(`<h2>노선 투자</h2><p>연결된 내 역은 어디서든 증축 · 보유 <b>${p.money.toLocaleString()}</b></p>
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
  $('#mat').innerHTML = boardSvg({ owner, level: m.levels, links: linkEdges, region: areaOf(m).set });
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
    if (p.out || !p.goal) continue;
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

/** 플레이어 판의 독점 진행: ★ = 가진 명소역 수, 독점 하나 앞이면 빨갛게(판이 좁아 짧게) */
function monoNote(m, p) {
  const s = monopolyOf(m, p);
  const near = s.hot >= m.hotWin - 1 || s.line >= m.lineWin - 1;
  return s.hot ? ` <i class="${near ? 'near' : ''}" title="명소역 ${s.hot}곳">★${s.hot}</i>` : near ? ' <i class="near">독점!</i>' : '';
}

function drawHud() {
  const m = M();
  $('#players').innerHTML = m.players.map((p) => `
    <div class="pl ${current(m) === p && m.phase !== 'over' ? 'turn' : ''} ${p.out ? 'out' : ''} ${p.human ? 'me' : ''}" data-player="${p.id}" style="--pc:${colorOf(p)}">
      <span class="pa">${character(p.hero, 34)}${p.out ? '' : hudCharge(p)}</span>
      <div class="pi"><b>${p.human ? '나' : nameOf(p)}</b><span class="money">${coin(13)} <i class="mv">${p.out ? '파산' : p.money.toLocaleString()}</i></span><em>역 ${stationsOf(m, p).length}${monoNote(m, p)}${p.coupon ? ' 면제' : ''}</em></div>
    </div>`).join('');
  // 돈이 바뀌었으면 숫자가 차오르고(늘면 초록, 줄면 빨강) 반짝인다
  G.hudMoney ||= {};
  for (const p of m.players) {
    const prev = G.hudMoney[p.id];
    if (prev != null && prev !== p.money && !p.out) {
      const el = $(`#players [data-player="${p.id}"] .money`);
      if (el) { countUp(el.querySelector('.mv'), prev, p.money); el.classList.add(p.money > prev ? 'gain' : 'loss'); }
    }
    G.hudMoney[p.id] = p.money;
  }
  drawClock();
}

/** 플레이어 판의 스킬 충전 막대 — 다 차면 스킬 아이콘 */
function hudCharge(p) {
  const cost = skillCost(p), k = Math.min(p.charge, cost);
  return `<i class="pl-sk ${k >= cost ? 'ready' : ''}" style="--k:${(100 * k) / cost}%;--hc:${heroById(p.hero).color}">${k >= cost ? skillArt(heroById(p.hero).active.id, 16) : ''}</i>`;
}

function drawClock() {
  const m = M();
  const span = m.end - CLOCK.start;
  const pos = (v) => Math.max(0, Math.min(100, (100 * (v - CLOCK.start)) / span));
  const seg = (a, b, cls) => `<i class="${cls}" style="left:${pos(a)}%;width:${pos(b) - pos(a)}%"></i>`;
  const t = timeOf(m);
  $('#clock').innerHTML = `<span class="now">${hhmm(m.clock)}</span>
    <span class="track">${seg(CLOCK.last, m.end, 'last')}
      <i class="done" style="width:${pos(m.clock)}%"></i><b class="hand" style="left:${pos(m.clock)}%"></b></span>
    ${t === 'last' ? `<span class="band time-last">${TIME_NAME.last}</span>` : ''}<span class="left">${Math.min(m.round, roundsOf(m))} / ${roundsOf(m)}바퀴</span>`;
}

function drawControls() {
  const m = M();
  const me = ME();
  const mine = current(m) === me && m.phase === 'roll' && !G.busy && !!G.wait;
  const tb = $('#throw');
  tb.disabled = !mine;
  const who = current(m);
  tb.innerHTML = mine ? `출발${me.dash ? `<small>+${me.dash}역</small>` : '<small>주사위 2개</small>'}`
    : who.human ? `내 차례<small>${m.phase === 'pick' ? '주사위 선택 중' : m.phase === 'move' ? '방향 선택 중' : '이동 중'}</small>` : `${nameOf(who)} 차례<small>${hhmm(m.clock)}</small>`;
  const sb = $('#skillBtn'), h = heroById(me.hero);
  const cost = skillCost(me), ready = me.charge >= cost;
  sb.classList.toggle('ready', ready);
  sb.classList.toggle('usable', mine && !skillBlocked(m, me));
  sb.style.setProperty('--hc', h.color);
  sb.style.setProperty('--k', (100 * Math.min(me.charge, cost)) / cost);
  sb.style.setProperty('--n', cost);
  sb.innerHTML = `<span class="sk-ring">${skillArt(h.active.id, 26)}</span><span class="sk-txt"><b>${h.active.name}</b><em>${ready ? '충전 완료' : `${me.charge}/${cost}`}</em></span>`;
  const ib = $('#investBtn');
  const can = mine ? investable(m, me).length : 0;
  ib.disabled = !can;
  ib.innerHTML = `노선 투자${can ? ` <b>${can}</b>` : ''}`;
  if (isLoop(m)) {
    const left = ahead(me.node, LOOP_START) || 32;
    $('#meRow').innerHTML = `<span class="pa" style="--pc:${h.color}">${character(me.hero, 30)}</span>
      <div class="me-goal"><span>다음 월급</span><b>시청까지 ${left}칸</b><em>+${SALARY + (h.loop?.goalBonus ?? 0)}</em></div>`;
  } else {
    $('#meRow').innerHTML = `<span class="pa" style="--pc:${h.color}">${character(me.hero, 30)}</span>
      <div class="me-goal"><span>내 목적지</span><b>${me.goal}</b><em>${dist(me.node, me.goal)}역 · +${GOAL_BONUS + (h.goalBonus || 0)}</em></div>
      <button class="btn small white" id="goalBtn">보기</button>`;
    $('#goalBtn').onclick = () => { Sound.click(); Camera.frame([nodeXY(me.node), nodeXY(me.goal)], { maxZoom: 0.8, minZoom: 0.25, pad: 120 }); drawZoom(); };
  }
  if (mine && !$('#hint').dataset.keep) setHint(me.rest ? '' : '내 차례');
}

function setHint(t) { const h = $('#hint'); if (h) h.textContent = t; }
function drawZoom() { const z = $('#zoom'); if (z) z.textContent = G.regionView ? '내 위치' : M() && isLoop(M()) ? '판 전체' : '지역 지도'; }
/** 이 판의 지역 전체를 한눈에 */
function showRegion(ms) {
  if (isLoop(M())) Camera.whole(ms);
  else Camera.frame(areaOf(M()).stations.map(nodeXY), { maxZoom: 0.7, minZoom: 0.1, pad: 140, ms });
  G.regionView = true;
  drawZoom();
}
function showPlayer(p) { G.regionView = false; Camera.follow(nodeXY(p.node), 380); drawZoom(); }

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
  let best = null, bd = isLoop(m) ? 70 : 40;
  for (const n of isLoop(m) ? areaOf(m).stations : Object.keys(STATION_LINES)) { const [sx, sy] = nodeXY(n); const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = n; } }
  if (!best) return;
  if (isLoop(m) && CORNERS[best]) { toast(`${best} · ${CORNERS[best].name}: ${CORNERS[best].short}`); return; }
  const me = ME(), o = m.owned[best] ? playerById(m, m.owned[best]) : null;
  const lines = STATION_LINES[best].map((l) => LINES[l].name).join('·');
  const hot = HOTSPOTS[best] ? ` · 명소역 ${HOTSPOTS[best].tag}: ${HOTSPOTS[best].desc}` : '';
  const text = isChance(best) ? `${best} · 찬스 역`
    : o ? `${best}(${lines}) · ${o.human ? '내' : nameOf(o)} ${LEVEL_NAME[m.levels[best]]} · 통행료 ${o === me ? baseToll(m.owned, m.levels, best) : tollFor(m, best, me)}`
      : `${best}(${lines}) · 빈 역 · ${stationPrice(best)}`;
  toast(text + hot);
}

// ── 역 사건 그림 ───────────────────────────────────────────

const INC_ART = {
  fire: '<path d="M20 4c2 7 10 10 10 20a10 10 0 0 1-20 0c0-5 3-8 5-10 0 4 2 6 4 6-1-6 1-11 1-16z" fill="#F2733D" stroke="#22201D" stroke-width="2.6" stroke-linejoin="round"/><path d="M20 20c1 3 5 5 5 9a5 5 0 0 1-10 0c0-3 3-5 5-9z" fill="#F7C94A"/>',
  delay: '<circle cx="20" cy="21" r="14" fill="#FFFDF7" stroke="#22201D" stroke-width="3"/><path d="M20 21V12" stroke="#22201D" stroke-width="3" stroke-linecap="round"/><path class="inc-hand" d="M20 21l7 4" stroke="#E0533D" stroke-width="3" stroke-linecap="round"/><path d="M14 4h12" stroke="#22201D" stroke-width="3" stroke-linecap="round"/>',
  crowd: '<circle cx="11" cy="15" r="5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M3 35c0-7 4-12 8-12s8 5 8 12z" fill="#2EA6DA" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/><circle cx="29" cy="15" r="5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M21 35c0-7 4-12 8-12s8 5 8 12z" fill="#E2337A" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="11" r="5.5" fill="#FFFDF7" stroke="#22201D" stroke-width="2.4"/><path d="M11 33c0-8 4-13 9-13s9 5 9 13z" fill="#F2B33D" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/>',
  gate: '<rect x="5" y="14" width="6" height="22" rx="2" fill="#6E6A5E" stroke="#22201D" stroke-width="2.6"/><rect x="9" y="12" width="28" height="8" rx="3" fill="#FFFDF7" stroke="#22201D" stroke-width="2.6"/><path d="M15 12l-4 8M23 12l-4 8M31 12l-4 8" stroke="#E0533D" stroke-width="3.4"/><rect x="9" y="12" width="28" height="8" rx="3" fill="none" stroke="#22201D" stroke-width="2.6"/><circle class="inc-lamp" cx="8" cy="10" r="3.5" fill="#E0533D" stroke="#22201D" stroke-width="2.4"/>',
  festival: '<path d="M20 26 Q17 32 21 37" fill="none" stroke="#22201D" stroke-width="2.2"/><ellipse cx="13" cy="15" rx="8" ry="10" fill="#E2588F" stroke="#22201D" stroke-width="2.6"/><ellipse cx="27" cy="13" rx="8" ry="10" fill="#F2B33D" stroke="#22201D" stroke-width="2.6"/><ellipse cx="20" cy="21" rx="8" ry="10" fill="#2F6BD8" stroke="#22201D" stroke-width="2.6"/>',
  hype: '<path d="M6 31l8-8 6 4 12-14" fill="none" stroke="#22201D" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 31l8-8 6 4 12-14" fill="none" stroke="#E2588F" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M25 10h9v9z" fill="#E2588F" stroke="#22201D" stroke-width="2.6" stroke-linejoin="round"/>',
  busk: '<path d="M15 30V8l16-4v20" fill="none" stroke="#22201D" stroke-width="3.2" stroke-linejoin="round"/><ellipse cx="11" cy="30" rx="6" ry="4.5" fill="#E2337A" stroke="#22201D" stroke-width="2.6"/><ellipse cx="27" cy="25" rx="6" ry="4.5" fill="#8E63B0" stroke="#22201D" stroke-width="2.6"/>'
};
const incidentArt = (kind, size = 34) => `<svg class="inc-art" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${INC_ART[kind]}</svg>`;
const INC_FX = {
  fire: '<i class="smoke s1"></i><i class="smoke s2"></i><i class="smoke s3"></i><i class="ember"></i>',
  delay: '<i class="pulse"></i><i class="pulse p2"></i>',
  crowd: '<i class="hop h1"></i><i class="hop h2"></i>',
  busk: '<i class="note n1">♪</i><i class="note n2">♫</i><i class="note n3">♪</i>',
  gate: '<i class="pulse"></i>',
  hype: '<i class="spark k1">✦</i><i class="spark k2">✦</i><i class="spark k3">✦</i>',
  festival: '<i class="spark k1">✦</i><i class="spark k2">✦</i><i class="spark k3">✦</i>'
};
const INC_TAG = { fire: (i) => `화재 ~${hhmm(i.until)}`, delay: () => '신호 장애', crowd: () => '인파 +100', busk: () => '버스킹', gate: (i) => (i.once ? '통제 · 1명' : `통제 ~${hhmm(i.until)}`), hype: (i) => `떡상 ×${i.tollX || 2} ~${hhmm(i.until)}`, festival: (i) => `축제 ×2 ~${hhmm(i.until)}` };

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
          <div class="cf-tap">터치하여 계속</div>
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
  if (tone === 'good' || tone === 'hot') { Sound.big(); FX.confetti(cx, cy - 60, 30, 1.3); FX.sparkle(cx, cy - 120, 12, '#F2B33D'); }
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
    <div class="cut-text"><span class="who">${h.job} ${h.name}의 스킬</span><span class="cut-icon">${skillArt(e.skill || h.active.id, 64)}</span><b>${e.name}</b><span class="what">${e.desc}</span>${e.node ? `<span class="tgt">▶ ${e.node}</span>` : ''}</div>`;
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

// ── 스킬 실전 미리 보기(도감) ──────────────────────────────
// 작은 노선 하나 위에서 그 스킬이 실제 판에서 어떻게 도는지 단계별로 보여 준다. 모션은 게임과 같은 skill-fx.

const DEMO_ST = [['시청', 34, 132], ['을지로', 90, 106], ['동대문', 148, 124], ['왕십리', 204, 98], ['성수', 258, 118], ['잠실', 302, 88]];
const DEMO_LINE = LINES[2]?.color || '#3CB44A';
const DEMO_S = 40;

/** 스킬마다: 처음 판 모습 + 단계(설명 · 연출) */
const DEMO = {
  direct: { me: 0, steps: [
    ['같은 호선 역 하나 고르기', (d) => d.pick(5)],
    ['열차 타고 바로 이동', (d) => d.ride(0, 5)],
    ['도착역에서 평소처럼 구매·통행료', async (d) => { d.paint(5, d.me.color); await SFX.word(d.layer, d.top(5), '구매!', { color: d.me.color, s: DEMO_S }); }]
  ] },
  gate: { me: 4, own: { 3: 'me' }, rivals: [0], steps: [
    ['통제할 내 역 고르기', (d) => d.pick(3)],
    ['차단기 설치 · 3바퀴 유지', async (d) => { await SFX.gate(d.layer, d.at(3), { s: DEMO_S, z: 300, hold: 300 }); d.mark(3, 'gate'); }],
    ['지나가던 상대는 그 역에서 강제 정차', async (d) => { await d.walk(d.r[0], [1, 2, 3]); await SFX.word(d.layer, d.top(3), '정차!', { color: '#E0533D', s: DEMO_S }); }],
    ['통행료는 내 차지', (d) => SFX.coins(d.layer, d.at(3), d.at(4), { s: DEMO_S })]
  ] },
  gather: { me: 1, own: { 4: 'me' }, level: { 4: 2 }, rivals: [0, 2], steps: [
    ['회식 장소(내 역) 고르기', (d) => d.pick(4)],
    ['건배! 상대 전원 소집', async (d) => { await SFX.cheers(d.layer, d.at(4), { s: DEMO_S, z: 300 }); await Promise.all(d.r.map((r, i) => d.fly(r, 4, i * 160))); }],
    ['모두 회식비(통행료 25%, 한 명 80까지)', (d) => Promise.all(d.r.map((r, i) => sleep(i * 200).then(() => SFX.coins(d.layer, d.at(4), d.at(1), { s: DEMO_S, n: 3 }))))]
  ] },
  cram: { me: 0, own: { 1: 'me', 3: 'me', 4: 'me' }, level: { 1: 1, 3: 2, 4: 1 }, steps: [
    ['비싼 내 역 2곳 자동 선택', async (d) => { SFX.ripple(d.layer, d.at(3), { color: '#F7C94A', s: DEMO_S }); await SFX.ripple(d.layer, d.at(4), { color: '#F7C94A', s: DEMO_S }); }],
    ['번개 증축 · 비용 0', async (d) => { for (const i of [3, 4]) { await SFX.bolt(d.layer, d.at(i), { s: DEMO_S, z: 300 }); d.level(i, 1); } }],
    ['통행료가 바로 오른다', (d) => SFX.word(d.layer, d.top(3), '무료 증축!', { color: '#8E5BC8', s: DEMO_S })]
  ] },
  hype: { me: 0, own: { 2: 'me' }, rivals: [3, 5], goals: [4, 1], steps: [
    ['떡상시킬 내 역 고르기', (d) => d.pick(2)],
    ['빛기둥! 통행료 2배', async (d) => { await SFX.hype(d.layer, d.at(2), { s: DEMO_S, z: 300, hold: 200 }); d.mark(2, 'hype'); }],
    ['상대들 목적지가 모두 이 역으로', (d) => d.moveGoals(2)]
  ] },
  combo: { me: 0, own: { 2: 'r0', 3: 'r0' }, rivals: [5], steps: [
    ['상자 둘 · 동시 배달 준비', async (d) => { d.boxes = await SFX.boxes(d.layer, d.at(0), { s: DEMO_S, z: 300 }); }],
    ['주사위 하나, 또는 둘의 합', (d) => d.dice()],
    ['통과 요금 없이 질주', async (d) => { await d.walk(d.me, [1, 2, 3, 4, 5], d.boxes); await SFX.word(d.layer, d.top(3), '통과 요금 0', { color: '#4C9A3A', s: DEMO_S }); }]
  ] },
  transfuse: { me: 1, rivals: [4], money: { me: 40, r0: 900 }, steps: [
    ['자산 1등 자동 지목', (d) => SFX.ripple(d.layer, d.at(4), { color: '#E0533D', s: DEMO_S })],
    ['1등에게서 60 수혈', async (d) => { await SFX.transfuse(d.layer, d.at(4), d.at(1), { s: DEMO_S, z: 300 }); d.cash('r0', 840); d.cash('me', 100); }],
    ['내가 꼴찌면 120', (d) => SFX.word(d.layer, d.top(1), '꼴찌면 ×2', { color: '#E0533D', s: DEMO_S })]
  ] },
  buyout: { me: 1, own: { 3: 'r0' }, level: { 3: 2 }, rivals: [5], steps: [
    ['사들일 남의 역 고르기', (d) => d.pick(3)],
    ['망치 쾅! 30% 싸게 낙찰', async (d) => { await SFX.gavel(d.layer, d.at(3), { s: DEMO_S, z: 300 }); d.paint(3, d.me.color); }],
    ['그 자리에서 내 역 · 독점에도 계산', (d) => SFX.word(d.layer, d.top(3), '강제 매수!', { color: d.me.color, s: DEMO_S })]
  ] }
};

async function skillDemo(h) {
  const plan = DEMO[h.active.id];
  if (!plan) return;
  const others = HERO_DATA.filter((x) => x.id !== h.id);
  const steps = [['주사위 던질 때마다 1칸 · ' + chargeOf(h, loopy()) + '칸이면 충전 완료'], ...plan.steps];
  const s = sheet(`
    <span class="kind">실전 미리 보기</span>
    <h2 class="dm-title">${skillArt(h.active.id, 30)} ${h.active.name}</h2>
    <div class="dm-stage" id="dmStage"></div>
    <ol class="dm-steps">${steps.map((x, i) => `<li data-i="${i}"><i>${i + 1}</i><span>${x[0]}</span></li>`).join('')}</ol>
    <div class="row"><button class="btn white" id="dmClose">닫기</button><button class="btn yellow" id="dmAgain" disabled>다시 보기</button></div>`);
  s.classList.add('demo-sheet');
  s.style.setProperty('--hc', h.color);
  let run = 0;
  s.querySelector('#dmClose').onclick = () => { run++; Sound.click(); closeSheet(); };
  s.querySelector('#dmAgain').onclick = () => { Sound.click(); play(); };
  async function play() {
    const id = ++run;
    const live = () => id === run && document.body.contains(s);
    const btn = s.querySelector('#dmAgain');
    btn.disabled = true;
    const layer = s.querySelector('#dmStage');
    const d = demoStage(layer, h, others, plan);
    const lis = s.querySelectorAll('.dm-steps li');
    lis.forEach((li) => li.classList.remove('on', 'done'));
    for (let i = 0; i < steps.length; i++) {
      if (!live()) return;
      lis.forEach((li, j) => { li.classList.toggle('on', j === i); li.classList.toggle('done', j < i); });
      await sleep(250);
      if (i === 0) await d.charge(chargeOf(h, loopy()));
      else await steps[i][1](d);
      await sleep(550);
    }
    if (!live()) return;
    lis.forEach((li) => { li.classList.remove('on'); li.classList.add('done'); });
    btn.disabled = false;
  }
  await sleep(200);
  play();
}

/** 시연판 그리기 + 시연용 동작들 */
function demoStage(layer, h, others, plan) {
  const own = plan.own || {}, lv = { ...(plan.level || {}) };
  const me = { color: h.color, hero: h.id };
  const r = (plan.rivals || []).map((n, i) => ({ color: others[i].color, hero: others[i].id, node: n, goal: plan.goals?.[i] }));
  me.node = plan.me;
  const colorOf = (o) => (o === 'me' ? me.color : r[Number(o.slice(1))]?.color || others[0].color);
  const pts = DEMO_ST.map(([, x, y]) => [x, y]);
  layer.innerHTML = `<svg class="dm-map" viewBox="0 0 336 180" aria-hidden="true">
      <polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#22201D" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/>
      <polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${DEMO_LINE}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(([x, y], i) => `<circle class="dm-st" data-i="${i}" cx="${x}" cy="${y}" r="9" fill="${own[i] ? colorOf(own[i]) : '#FFFDF7'}" stroke="#22201D" stroke-width="3"/>
        <text x="${x}" y="${y + 24}" text-anchor="middle">${DEMO_ST[i][0]}</text>`).join('')}
    </svg>`;
  const piece = (who) => {
    const el = document.createElement('div');
    el.className = 'dm-piece';
    el.style.setProperty('--pc', who.color);
    el.innerHTML = `<span class="ring"></span>${character(who.hero, DEMO_S)}`;
    layer.appendChild(el);
    who.el = el;
    setAt(who, who.node);
    return el;
  };
  const setAt = (who, i) => { who.node = i; const [x, y] = pts[i]; who.el.style.left = x - DEMO_S / 2 + 'px'; who.el.style.top = y - DEMO_S * 0.92 + 'px'; who.el.style.zIndex = 100 + y; };
  piece(me);
  r.forEach(piece);
  const tags = {};
  const drawLv = (i) => {
    let t = layer.querySelector(`.dm-lv[data-i="${i}"]`);
    if (!lv[i]) { t?.remove(); return; }
    if (!t) { t = document.createElement('i'); t.className = 'dm-lv'; t.dataset.i = i; t.style.left = pts[i][0] + 12 + 'px'; t.style.top = pts[i][1] - 22 + 'px'; layer.appendChild(t); }
    t.textContent = '▲' + lv[i];
    return t;
  };
  Object.keys(lv).forEach(drawLv);
  const flags = r.map((q) => {
    if (q.goal == null) return null;
    const f = document.createElement('i');
    f.className = 'dm-goal';
    f.style.setProperty('--pc', q.color);
    f.style.left = pts[q.goal][0] + 'px'; f.style.top = pts[q.goal][1] + 'px';
    layer.appendChild(f);
    return f;
  });
  if (plan.money) for (const [k, v] of Object.entries(plan.money)) {
    const who = k === 'me' ? me : r[Number(k.slice(1))];
    const t = document.createElement('i');
    t.className = 'dm-money';
    t.textContent = v;
    who.el.appendChild(t);
    tags[k] = t;
  }
  const hop1 = async (who, i, extra) => {
    const from = pts[who.node], to = pts[i];
    face(who.el, to[0] - from[0]);
    setAt(who, i);
    if (extra) SFX.carry(extra, to, DEMO_S);
    await hop(who.el, from, to, { height: 16, duration: 200 });
    Sound.step(i);
  };
  return {
    layer, me, r,
    at: (i) => pts[i],
    top: (i) => [pts[i][0], pts[i][1] - DEMO_S * 1.5],
    paint(i, c) { const st = layer.querySelector(`.dm-st[data-i="${i}"]`); st?.setAttribute('fill', c); if (st) tween(st, [{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }, { transform: 'scale(1)' }], { duration: 300 }); SFX.ripple(layer, pts[i], { color: c, s: DEMO_S }); },
    level(i, k) { lv[i] = (lv[i] || 0) + k; const t = drawLv(i); if (t) tween(t, [{ transform: 'scale(1)' }, { transform: 'scale(1.7)' }, { transform: 'scale(1)' }], { duration: 320 }); Sound.big(); },
    mark(i, id) { const m = document.createElement('i'); m.className = 'dm-mark'; m.innerHTML = skillArt(id, 20); m.style.left = pts[i][0] - 26 + 'px'; m.style.top = pts[i][1] - 30 + 'px'; layer.appendChild(m); tween(m, [{ transform: 'scale(0)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 300 }); },
    cash(k, v) { const t = tags[k]; if (!t) return; t.textContent = v; tween(t, [{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.4)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 320 }); },
    async charge(n) {
      const g = document.createElement('div');
      g.className = 'dm-charge';
      g.innerHTML = `<span class="sk-art-sm">${skillArt(h.active.id, 18)}</span>${Array.from({ length: n }, () => '<i></i>').join('')}`;
      layer.appendChild(g);
      const pips = g.querySelectorAll('i');
      for (let k = 0; k < n; k++) {
        await sleep(260);
        pips[k].classList.add('on');
        Sound.chip(k);
        act(me.el, 'walk', 240);
      }
      g.classList.add('full');
      Sound.big();
      act(me.el, 'cheer', 900);
      await SFX.word(layer, [me.el.offsetLeft + DEMO_S / 2, me.el.offsetTop - 14], '충전 완료!', { color: h.color, s: DEMO_S });
    },
    async pick(i) {
      const ring = document.createElement('i');
      ring.className = 'dm-pick';
      ring.style.left = pts[i][0] + 'px'; ring.style.top = pts[i][1] + 'px';
      layer.appendChild(ring);
      Sound.click();
      await SFX.ripple(layer, pts[i], { color: h.color, s: DEMO_S });
      await sleep(200);
    },
    async ride(a, b) {
      layer.querySelectorAll('.dm-pick').forEach((x) => x.remove());
      const path = [];
      for (let i = a; i !== b; i += a < b ? 1 : -1) path.push(pts[i]);
      path.push(pts[b]);
      const tr = SFX.train(layer, path[0], { s: DEMO_S, line: DEMO_LINE, rider: character(h.id, 28), z: 250 });
      await tr.arrive(path[1]);
      await SFX.board(me.el, true);
      await tr.run(path.slice(1), { speed: 0.32 });
      setAt(me, b);
      await SFX.board(me.el, false);
      tr.leave();
      await sleep(250);
    },
    async walk(who, list, extra) { act(who.el, 'walk'); for (const i of list) await hop1(who, i, extra); act(who.el, 'idle'); if (extra) { extra.forEach((x) => x.remove()); } },
    async fly(who, i, delay) {
      const from = pts[who.node];
      setAt(who, i);
      const k = r.indexOf(who);
      who.el.style.left = parseFloat(who.el.style.left) + (k ? 14 : -14) + 'px';
      await SFX.summon(who.el, [from[0] + (k ? -14 : 14), from[1]], pts[i], { s: DEMO_S, delay });
      act(who.el, 'sad', 900);
    },
    async moveGoals(i) {
      Sound.whoosh();
      await Promise.all(flags.map((f, k) => f && tween(f, [{ left: f.style.left, top: f.style.top }, { left: pts[i][0] + (k ? 10 : -10) + 'px', top: pts[i][1] - 4 + 'px' }], { duration: 520, delay: k * 120, easing: 'cubic-bezier(.3,.7,.3,1.2)', fill: 'forwards' })));
      await SFX.word(layer, [pts[i][0], pts[i][1] - DEMO_S * 1.5], '모두의 목적지!', { color: '#E2588F', s: DEMO_S });
    },
    async dice() {
      const box = document.createElement('div');
      box.className = 'dm-dice';
      box.innerHTML = '<b>3</b><b>2</b><b class="sum">3+2</b>';
      layer.appendChild(box);
      const bs = box.querySelectorAll('b');
      for (const b of bs) { await sleep(180); b.classList.add('in'); Sound.toss(); }
      await sleep(400);
      bs[2].classList.add('pick');
      Sound.stamp();
      await sleep(500);
      box.remove();
    }
  };
}

// ── 이벤트 연출 ────────────────────────────────────────────

/** 일일 미션용: 이번 판에 내가 한 일을 센다 */
function countForMissions(e) {
  const s = G.stats, m = M();
  if (!s || !m) return;
  const me = ME();
  if (e.player === me.id) {
    if (e.type === 'buy') s.buy++;
    if (e.type === 'upgrade') { s.upgrade++; if (e.level >= MAX_LEVEL) s.landmark++; }
    if (e.type === 'takeover') s.takeover++;
    if (e.type === 'goal') s.goal++;
    if (e.type === 'hotspot') s.hot++;
  }
  if (e.type === 'pay' && e.to === me.id && (e.why === 'toll' || e.why === 'pass')) s.toll += e.amount;
}

async function play(events) {
  G.busy = true;
  drawControls();
  for (const e of events) {
    countForMissions(e);
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

/** 요소 가운데의 앱 좌표(FX 층 기준) */
function appSpot(el) {
  const r = el.getBoundingClientRect(), a = app.getBoundingClientRect(), k = a.width / app.offsetWidth || 1;
  return [(r.left - a.left + r.width / 2) / k, (r.top - a.top + r.height / 2) / k];
}

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
  drawDest([path[path.length - 1]], playerById(M(), pid));
  act(el, 'walk');
  // 동시 배달: 상자를 이고 초록 잔상을 남기며 달린다
  const load = G.combo?.pid === pid ? G.combo.boxes : null;
  if (load) el.classList.add('combo');
  for (let k = 0; k < path.length; k++) {
    const to = nodeXY(path[k]);
    Camera.follow(to, fast ? 160 : 220);
    face(el, to[0] - prev[0]);
    place(el, path[k]);
    if (load) SFX.carry(load, to, pieceSize());
    await hop(el, prev, to, { height: 24, duration: fast ? 120 : 170 });
    Sound.step(k);
    prev = to;
  }
  act(el, 'idle');
  clearDest();
  FX.dust(...nodeApp(path[path.length - 1]), 4);
  if (load) {
    el.classList.remove('combo');
    G.combo = null;
    SFX.word($('#layer'), [prev[0], prev[1] - pieceSize() * 1.9], '배달 완료!', { color: '#4C9A3A', s: pieceSize(), z: depth(prev[1]) + 90 });
    load.forEach((b) => tween(b, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) translateY(-20px)' }], { duration: 300, fill: 'forwards' }).then(() => b.remove()));
  }
}

/** 두 역을 잇는 같은 호선의 길(직통 열차가 지나갈 역들) */
function linePath(from, to) {
  if (M() && isLoop(M())) {
    const k = ahead(from, to);
    return { path: [from, ...forward(from, k || 1)], line: 2 };
  }
  let best = null;
  for (const l of STATION_LINES[from] || []) {
    if (!STATION_LINES[to]?.includes(l)) continue;
    const prev = { [from]: null }, q = [from];
    while (q.length && !(to in prev)) {
      const n = q.shift();
      for (const e of ALL_EDGES) {
        if (e.line !== l) continue;
        const o = e.a === n ? e.b : e.b === n ? e.a : null;
        if (o && !(o in prev)) { prev[o] = n; q.push(o); }
      }
    }
    if (!(to in prev)) continue;
    const path = [];
    for (let n = to; n; n = prev[n]) path.unshift(n);
    if (!best || path.length < best.path.length) best = { path, line: l };
  }
  return best || { path: [from, to], line: STATION_LINES[from]?.[0] };
}
/** 판(#layer) 위 스킬 모션 공통 옵션 */
const sfxAt = (n, more = {}) => ({ s: pieceSize(), z: depth(nodeXY(n)[1]) + 60, ...more });

const HANDLERS = {
  async turnStart(e) {
    const p = playerById(M(), e.player);
    // 못 쓰고 남은 동시 배달 상자는 다음 차례에 치운다
    if (G.combo && G.combo.pid !== p.id) { G.combo.boxes.forEach((b) => b.remove()); G.combo = null; }
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
        await Roller3D.toss(board, BOARDS.metro, { pair: e.rolls }, 'me');
        board.removeEventListener('rollhit', hit);
      } else {
        const spot = $('#roller');
        spot.classList.add('show');
        await Roller.animate(spot, BOARDS.metro, e.rolls[0], 'me');
        setTimeout(() => spot.classList.remove('show'), 600);
      }
      stampText(`${e.rolls[0].label} · ${e.rolls[1].label}`, '', M().pending?.combo ? '동시 배달 · 합도 가능' : e.rolls[0].face === e.rolls[1].face ? '같은 눈!' : '하나를 고르세요');
      await sleep(250);
    } else Sound.clatter();
  },
  async die(e) {
    const p = playerById(M(), e.player);
    const sub = e.fly ? `×2 · 총 ${e.steps}역` : e.dash ? `+${e.dash} · 총 ${e.steps}역` : e.roll.bonus ? '한 번 더!' : '';
    if (p.human) { stampText(e.roll.label + '!', e.roll.bonus ? 'yellow' : '', sub); await sleep(200); }
    else { stampText(`${nameOf(p)} ${e.roll.label}`, 'ink opp', sub); await sleep(300); }
  },
  async rest(e) { toast(`${isMe(e.player) ? '나' : nameOf(playerById(M(), e.player))} — 한 턴 휴식`); await sleep(700); },
  async stuck(e) { toast('길이 막혀 이동 불가'); await sleep(600); },
  async move(e) { await travel(e.player, e.from, e.path); },
  async goal(e) {
    const p = playerById(M(), e.player);
    const at = nodeApp(e.node);
    Sound.home();
    if (p.human) buzz(30);
    FX.confetti(at[0], at[1] - 30, p.human ? 34 : 14);
    FX.pow(at[0], at[1] - 70, `목적지 도착 +${e.bonus}`, colorOf(p), '#FFFDF7', -5);
    await moneyFly(at, panelSpot(p.id), e.bonus);
    bump(p.id);
    drawMarks();
    if (p.human) toast(`새 목적지 ${e.next} (${dist(p.node, e.next)}역)`);
    await sleep(p.human ? 500 : 200);
  },
  async pay(e) {
    const p = playerById(M(), e.player), to = e.to ? playerById(M(), e.to) : null;
    const node = e.node || (e.nodes ? e.nodes[e.nodes.length - 1] : p.node);
    if (e.why === 'transfuse' && to) {
      const a = nodeXY(p.node), b = nodeXY(to.node);
      Camera.frame([a, b], { maxZoom: 1, ms: 360 });
      await sleep(380);
      await SFX.transfuse($('#layer'), a, b, { s: pieceSize(), z: Math.max(depth(a[1]), depth(b[1])) + 60, n: e.amount > 60 ? 7 : 5 });
    }
    const at = nodeApp(node);
    const label = e.why === 'toll' ? `통행료 −${e.amount}` : e.why === 'pass' ? `통과 요금 −${e.amount}` : e.why === 'fine' ? `벌금 −${e.amount}` : e.why === 'fashion' ? `패션 거리 −${e.amount}` : e.why === 'transfuse' ? `수혈 −${e.amount}` : `−${e.amount}`;
    if (e.why === 'toll' && e.amount >= 250) await bigHit(`통행료 −${e.amount.toLocaleString()}`, to ? colorOf(to) : '#E0533D');
    if (e.why === 'toll') { Sound.penalty(); act(pieceEl(p.id), 'sad', 900); if (to) act(pieceEl(to.id), 'cheer', 900); if (p.human || to?.human) buzz(p.human ? [40, 30, 40] : 30); }
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
    toast(`${p.human ? '나' : nameOf(p)} · ${e.node} ${e.aid ? '현금화' : '매각'} +${e.amount}`);
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
    await drawCard({ tone: 'bad', deck: '파산', title: `${p.human ? '나' : nameOf(p)} 파산!`, short: `${e.place}등 · 보유 역 모두 반납`, art: character(p.hero, 96, 'sad') });
    drawMarks();
  },
  async buy(e) { if (isMe(e.player)) buzz(20); await estateFx(e, '구매!', Sound.buy); },
  async upgrade(e) {
    if (e.free) { Camera.follow(nodeXY(e.node), 260); await sleep(240); await SFX.bolt($('#layer'), nodeXY(e.node), sfxAt(e.node)); }
    if (e.level >= MAX_LEVEL && isMe(e.player)) await bigHit('랜드마크!', '#F2B33D');
    await estateFx(e, e.level >= MAX_LEVEL ? '랜드마크!' : e.free ? '무료 증축!' : '증축!', Sound.big);
  },
  async takeover(e) {
    if (e.buyout) { Camera.follow(nodeXY(e.node), 260); await sleep(240); await SFX.gavel($('#layer'), nodeXY(e.node), sfxAt(e.node)); }
    flash(app);
    await estateFx(e, e.buyout ? '강제 매수!' : '인수!', Sound.capture);
  },
  async pass() {},
  async offer() {},
  async chance(e) {
    const p = playerById(M(), e.player);
    await drawCard({ tone: e.good ? 'good' : 'bad', deck: '찬스 카드', title: e.name, short: e.short, art: character(p.hero, 96, e.good ? 'cheer' : 'sad'), quick: !p.human });
  },
  async cash(e) {
    const p = playerById(M(), e.player);
    const at = e.node ? nodeApp(e.node) : panelSpot(p.id);
    if (e.why === 'salary') {
      Sound.home();
      FX.confetti(at[0], at[1] - 30, p.human ? 24 : 10);
      FX.pow(at[0], at[1] - 70, `${e.landed ? '시청 도착! ' : ''}월급 +${e.amount}`, '#E0533D', '#FFFDF7', -5);
      if (p.human) buzz(25);
    } else Sound.coin();
    if (e.node && e.why !== 'salary') FX.pow(at[0], at[1] - 60, `+${e.amount}`, '#2EA6DA', '#FFFDF7', 4);
    if (e.why === 'shortcut') { const sp = panelSpot(p.id); FX.pow(sp[0], sp[1] + 30, `지름길 수당 +${e.amount}`, '#4C9A3A', '#FFFDF7', 4); }
    if (e.node) await moneyFly(at, panelSpot(p.id), e.amount);
    bump(p.id);
    drawHud();
    await sleep(120);
  },
  async incident(e) {
    if (e.kind === 'festival') {
      Camera.follow(nodeXY(e.node), 300);
      await sleep(300);
      const el = addIncident(e);
      const [x, y] = nodeApp(e.node);
      Sound.home(); FX.confetti(x, y - 30, 26); FX.ring(x, y, '#E2588F');
      FX.pow(x, y - 64, '팝업 축제! ×2', '#E2588F', '#FFFDF7', -6);
      await tween(el, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.4)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
      await sleep(300);
      return;
    }
    if (e.kind === 'gate' || e.kind === 'hype') {
      // 스킬로 생긴 표지: 컷인 뒤에 그 역에 꽂힌다
      Camera.follow(nodeXY(e.node), 300);
      await sleep(300);
      await (e.kind === 'gate' ? SFX.gate : SFX.hype)($('#layer'), nodeXY(e.node), sfxAt(e.node, { hold: 350 }));
      const el = addIncident(e);
      const [x, y] = nodeApp(e.node);
      FX.ring(x, y, e.kind === 'gate' ? '#E0533D' : '#E2588F');
      if (e.kind === 'hype') FX.sparkle(x, y - 30, 14, '#E2588F');
      await tween(el, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.4)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
      await sleep(350);
      return;
    }
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
    if (e.used) { const [x, y] = nodeApp(e.node); const gate = e.kind === 'gate'; FX.pow(x, y - 60, gate ? '강제 정차!' : '한 번 더!', gate ? '#E0533D' : '#E2337A', '#FFFDF7', -5); if (gate) Sound.clank(); else Sound.coin(); }
    if (el) { await tween(el, [{ opacity: 1 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 300, fill: 'forwards' }); el.remove(); }
  },
  async again(e) {
    const p = playerById(M(), e.player);
    toast(`${p.human ? '나' : nameOf(p)} · 한 번 더!`);
    await sleep(400);
  },
  async clock() { drawClock(); },
  async timeShift(e) {
    if (e.time !== 'last') return;
    toast(`${hhmm(e.clock)} 막차 · 목적지 보너스 ×2`);
    Sound.stamp();
    await sleep(500);
  },
  async extend(e) { toast(`막차 연장 · ${hhmm(e.end)}`); drawClock(); await sleep(400); },
  async skill(e) {
    await skillCutin(e);
    drawHud();
    const p = playerById(M(), e.player);
    if (e.skill === 'gather') {
      Camera.follow(nodeXY(e.node), 300);
      await sleep(280);
      await SFX.cheers($('#layer'), nodeXY(e.node), sfxAt(e.node));
    } else if (e.skill === 'combo') {
      Camera.follow(nodeXY(p.node), 260);
      await sleep(200);
      G.combo = { pid: p.id, boxes: await SFX.boxes($('#layer'), nodeXY(p.node), sfxAt(p.node, { z: depth(nodeXY(p.node)[1]) + 40 })) };
    }
  },
  async charged(e) {
    const p = playerById(M(), e.player);
    drawHud();
    if (!p.human) return;
    drawControls();
    const b = $('#skillBtn');
    if (!b) return;
    const [x, y] = appSpot(b);
    Sound.big(); buzz(25);
    FX.sparkle(x, y, 16, heroById(p.hero).color);
    FX.pow(x - 40, y - 50, '스킬 충전 완료!', heroById(p.hero).color, '#FFFDF7', -4);
    tween(b, [{ transform: 'scale(1)' }, { transform: 'scale(1.18) rotate(-3deg)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1.4)' });
    await sleep(250);
  },
  async rescue(e) {
    const p = playerById(M(), e.player);
    await drawCard({ tone: 'good', deck: '응급 대기', title: `${p.human ? '나' : nameOf(p)} 긴급 구조!`, short: `빚 ${e.debt} 탕감 · ${e.amount}으로 재출발 (1회)`, art: character(p.hero, 96, 'cheer'), quick: !p.human });
    drawHud();
  },
  async hotspot(e) {
    const p = playerById(M(), e.player);
    await drawCard({ tone: 'hot', deck: '명소역', title: e.tag, short: e.desc, art: hotArt(e.node, 110), place: e.node, quick: !p.human });
  },
  async choice() {},
  async corner(e) {
    const p = playerById(M(), e.player);
    const at = nodeApp(e.node);
    if (e.kind === 'start') return;
    FX.ring(at[0], at[1], '#FFFDF7');
    const art = { festival: incidentArt('festival', 96), express: skillArt('direct', 96), maze: incidentArt('delay', 96) }[e.kind];
    await drawCard({ tone: e.kind === 'maze' ? 'warn' : 'good', deck: '모서리 칸', title: `${e.node} · ${e.name}`, short: e.short, art, quick: !p.human });
    if (e.kind === 'maze') act(pieceEl(p.id), 'sad', 900);
  },
  async warp(e) {
    const p = playerById(M(), e.player);
    const el = pieceEl(p.id);
    if (e.by === 'direct' || e.by === 'express') {
      // 직통 열차: 열차가 들어와 태우고, 같은 호선을 따라 달려 내려 준다
      const { path, line } = linePath(e.from, e.to);
      const pts = path.map(nodeXY), end = pts[pts.length - 1], lc = LINES[line]?.color || colorOf(p);
      const total = pts.slice(1).reduce((t, b, i) => t + Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]), 0);
      const speed = Math.max(quick(p.id) ? 1.3 : 0.85, total / 3200);
      Camera.follow(pts[0], 260);
      const tr = SFX.train($('#layer'), pts[0], { s: pieceSize(), line: lc, rider: character(p.hero, 40), z: (y) => depth(y) + 20 });
      await tr.arrive(pts[1]);
      await SFX.board(el, true);
      drawDest([e.to], p);
      await tr.run(pts.slice(1), { speed, onStep: (k, b, ms) => Camera.follow(b, ms) });
      place(el, e.to);
      await SFX.board(el, false);
      clearDest();
      const to = nodeApp(e.to);
      FX.dust(to[0], to[1], 8);
      FX.ring(to[0], to[1], lc);
      SFX.word($('#layer'), [end[0], end[1] - pieceSize() * 1.8], `${e.to} 도착!`, { color: lc, s: pieceSize(), z: depth(end[1]) + 90 });
      tr.leave();
      drawPieces();
      await sleep(350);
      return;
    }
    if (e.by === 'gather') {
      // 회식 소집: 크게 날아와 그 역에 내려앉는다
      place(el, e.to);
      await SFX.summon(el, nodeXY(e.from), nodeXY(e.to), { s: pieceSize() });
      const to = nodeApp(e.to);
      FX.dust(to[0], to[1], 8);
      Sound.stamp();
      act(el, 'sad', 800);
      drawPieces();
      await sleep(120);
      return;
    }
    const from = nodeApp(e.from);
    Sound.whoosh();
    const WARP_TEXT = { direct: ['직통 열차!', '#2F6FD0'], gather: ['회식 소집!', '#E0533D'] };
    const [wt, wc] = WARP_TEXT[e.by] || ['KTX 출발!', '#2EA6DA'];
    FX.pow(from[0], from[1] - 70, wt, wc, '#FFFDF7', -5);
    await tween(el, [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(-90px) scale(.4)', opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
    drawDest([e.to], p);
    Camera.follow(nodeXY(e.to), 520);
    await sleep(560);
    place(el, e.to);
    await tween(el, [{ transform: 'translateY(-110px) scale(.4)', opacity: 0 }, { transform: 'translateY(8px) scale(1.1)', opacity: 1, offset: 0.75 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.3,.7,.3,1.2)', fill: 'forwards' });
    el.getAnimations().forEach((a) => a.cancel());
    clearDest();
    const to = nodeApp(e.to);
    FX.dust(to[0], to[1], 8);
    FX.ring(to[0], to[1], '#2EA6DA');
    Sound.stamp();
    drawPieces();
    await sleep(250);
  },
  async newGoal(e) {
    const p = playerById(M(), e.player);
    drawMarks();
    if (p.human) toast(e.by === 'hype' ? `떡상! 목적지 → ${e.goal}` : `새 목적지 ${e.goal} (${dist(p.node, e.goal)}역)`);
    await sleep(p.human ? 500 : 150);
  },
  async monoWarn(e) {
    const p = playerById(M(), e.player);
    const what = e.kind === 'hot' ? `명소역 ${e.have}/${e.need}곳` : `${LINES[e.line]?.name || ''} ${e.have}역 연결`;
    await drawCard({ tone: p.human ? 'good' : 'warn', deck: '독점 경고', title: `${p.human ? '나' : nameOf(p)} 독점 1곳 전!`,
      short: p.human ? `${what} · 1곳 더 가지면 승리` : `${what} · 남은 ${e.kind === 'hot' ? '명소역' : '노선 끝 역'}을 견제하세요`, art: character(p.hero, 96, 'cheer') });
  },
  async monopoly(e) {
    const p = playerById(M(), e.player);
    flash(app);
    await drawCard({ tone: p.human ? 'good' : 'bad', deck: '독점 승리', title: `${p.human ? '나' : nameOf(p)} ${e.kind === 'hot' ? '명소 독점!' : '노선 독점!'}`,
      short: e.kind === 'hot' ? `명소역 ${M().hotWin}곳 독점` : `${LINES[e.line]?.name || ''} ${M().lineWin}역 연결`, art: character(p.hero, 96, 'dance') });
  },
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

const winnerName = (m) => { const w = playerById(m, m.winner); return w?.human ? '나' : nameOf(w); };

const CHEST = `<svg viewBox="0 0 80 64" width="104" height="83" aria-hidden="true">
  <rect x="8" y="28" width="64" height="32" rx="5" fill="#C9822E" stroke="#22201D" stroke-width="3"/>
  <rect x="8" y="40" width="64" height="7" fill="#F2B33D" stroke="#22201D" stroke-width="2.4"/>
  <g class="lid"><path d="M8 30 V20 Q8 8 40 8 Q72 8 72 20 V30 Z" fill="#DE9A3E" stroke="#22201D" stroke-width="3" stroke-linejoin="round"/>
  <path d="M12 26 H68" stroke="#F2B33D" stroke-width="4"/></g>
  <rect x="34" y="32" width="12" height="13" rx="3" fill="#F2B33D" stroke="#22201D" stroke-width="2.4"/><circle cx="40" cy="38" r="2" fill="#22201D"/></svg>`;

async function results() {
  const m = M();
  const me = ME();
  const win = me.place === 1;
  const pts = matchPoints({ place: me.place, rivals: m.players.length - 1, knockout: m.reason !== 'lastTrain', stations: me.out ? 0 : stationsOf(m, me).length });
  const rp = rpDelta({ place: me.place, size: m.players.length, knockout: m.reason !== 'lastTrain' });
  const rec = Records.record({ points: pts, rp, place: me.place, size: m.players.length, hero: me.hero, daily: G.daily, seed: m.seed });
  const canOpen = HERO_DATA.find((x) => !isOpen(x.id) && rec.tickets >= x.price);
  const fresh = Daily.addMatch({ ...G.stats, play: 1, win: win ? 1 : 0 });
  const got = rec.rp - rec.rpBefore;
  const rows = m.ranking.map((r) => {
    const p = playerById(m, r.id);
    return `<div class="res-row ${p.human ? 'me' : ''}" style="--pc:${colorOf(p)}"><b class="pl-no">${r.place}</b>${character(p.hero, 40, r.place === 1 ? 'dance' : r.out ? 'sad' : 'idle')}
      <div><b>${p.human ? '나' : nameOf(p)}</b><span>${r.out ? '파산' : `자산 ${r.assets.toLocaleString()} · 역 ${stationsOf(m, p).length}곳`}</span></div></div>`;
  }).join('');
  const reason = m.reason === 'bankrupt' ? '모든 상대 파산' : m.reason === 'monopoly' ? `${winnerName(m)} · ${m.mono?.kind === 'hot' ? `명소역 ${m.hotWin}곳 독점` : `${LINES[m.mono?.line]?.name || ''} ${m.lineWin}역 독점`}` : `${hhmm(m.end)} 막차 · 자산 순위`;
  const s = sheet(`
    <div class="rs-head ${win ? 'win' : ''}" style="--pc:${colorOf(me)}">
      <div class="rs-rays"></div>
      <div class="rs-hero">${character(me.hero, 104, win ? 'dance' : 'sad')}</div>
      <b class="rs-place">${win ? '승리!' : `${me.place}등`}</b><span>${reason}</span>
    </div>
    <div class="res-list rs-hide">${rows}</div>
    <div class="rs-reward">
      <button class="rs-chest" id="rsChest">${CHEST}<span>터치하여 열기</span></button>
      <div class="rs-gain"><div class="rs-tix">${ticketPill(rec.tickets - pts)}<b>+<i id="rsTix">0</i>장</b></div>
        <span>승점 +${pts}${rec.best ? ' · 최고 기록!' : ''}</span></div>
    </div>
    <div class="rs-tier" style="--tc:${rec.tierBefore.color}">
      <span class="rs-badge" id="rsBadge">${tierBadge(rec.tierBefore, 44)}</span>
      <div class="rs-tb"><b id="rsTierName">${rec.tierBefore.label}</b><div class="bar"><i id="rsBar" style="width:${rec.tierBefore.pct}%;background:${rec.tierBefore.color}"></i></div><span><i id="rsRp">${rec.rpBefore}</i> RP</span></div>
      <em class="rs-delta ${got >= 0 ? 'up' : 'down'}">${got >= 0 ? '+' : ''}${got} RP${got > rp ? '<small>강등 보호</small>' : ''}</em>
    </div>
    <div class="rs-extra">${canOpen ? `<i class="hot">${canOpen.job} ${canOpen.name} 해금 가능!</i>` : ''}${fresh.length ? `<i>미션 완료 · ${fresh.map((x) => x.text).join(' · ')}</i>` : ''}</div>
    <div class="row"><button class="btn white" id="home">로비</button><button class="btn" id="again">다시 하기</button></div>`);
  s.classList.add('result-sheet');
  s.querySelector('#home').onclick = () => { closeSheet(); title(); };
  s.querySelector('#again').onclick = () => { closeSheet(); startGame(G.daily); };
  const live = () => document.body.contains(s);

  // 1) 등수 발표
  if (win) { Sound.win(); buzz([40, 30, 40, 30, 90]); } else Sound.lose();
  await tween(s.querySelector('.rs-head'), [{ transform: 'translateY(-60px) scale(.8)', opacity: 0 }, { transform: 'translateY(6px) scale(1.04)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.3,.7,.3,1.2)' });
  if (win) { const r = s.querySelector('.rs-head').getBoundingClientRect(), a = app.getBoundingClientRect(), k = r.width / s.querySelector('.rs-head').offsetWidth; FX.confetti((r.left - a.left) / k + 160, (r.top - a.top) / k + 40, 70, 1.6); }
  // 2) 순위 줄이 아래 등수부터 하나씩
  const list = s.querySelector('.res-list');
  list.classList.remove('rs-hide');
  const rowsEl = [...list.children].reverse();
  for (const r of rowsEl) {
    if (!live()) return;
    r.classList.add('show');
    Sound.click();
    await sleep(150);
  }
  // 3) 보상 상자: 누르거나 1.4초 뒤 열린다
  const chest = s.querySelector('#rsChest');
  chest.classList.add('ready');
  await Promise.race([sleep(1400), new Promise((ok) => { chest.onclick = ok; })]);
  if (!live()) return;
  chest.classList.remove('ready');
  chest.classList.add('open');
  chest.onclick = null;
  Sound.big(); buzz(40);
  const cr = chest.getBoundingClientRect(), ar = app.getBoundingClientRect(), ck = cr.width / chest.offsetWidth;
  FX.confetti((cr.left - ar.left) / ck + chest.offsetWidth / 2, (cr.top - ar.top) / ck + 20, 36, 1.3);
  FX.sparkle((cr.left - ar.left) / ck + chest.offsetWidth / 2, (cr.top - ar.top) / ck, 14, '#F2B33D');
  s.querySelector('.rs-gain').classList.add('show');
  countUp(s.querySelector('#rsTix'), 0, pts, 700);
  const pill = s.querySelector('.rs-tix .tickets b');
  if (pill) countUp(pill, rec.tickets - pts, rec.tickets, 700);
  await sleep(760);
  if (!live()) return;
  // 4) 랭크 막대
  const bar = s.querySelector('#rsBar');
  countUp(s.querySelector('#rsRp'), rec.rpBefore, rec.rp, 800);
  if (rec.tierUp || rec.tierDown) {
    bar.style.transition = 'width .45s ease-in';
    bar.style.width = rec.tierUp ? '100%' : '0%';
    await sleep(480);
    if (!live()) return;
    const badge = s.querySelector('#rsBadge');
    badge.innerHTML = tierBadge(rec.tier, 44);
    s.querySelector('.rs-tier').style.setProperty('--tc', rec.tier.color);
    s.querySelector('#rsTierName').textContent = rec.tier.label;
    bar.style.transition = 'none';
    bar.style.width = rec.tierUp ? '0%' : '100%';
    bar.style.background = rec.tier.color;
    void bar.offsetWidth;
    if (rec.tierUp) {
      Sound.big(); buzz([50, 40, 120]);
      tween(badge, [{ transform: 'scale(.3) rotate(-30deg)' }, { transform: 'scale(1.5) rotate(8deg)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
      const br = badge.getBoundingClientRect(), bk = br.width / (badge.offsetWidth || 1);
      FX.pow((br.left - ar.left) / bk + 60, (br.top - ar.top) / bk, '승급!', rec.tier.color, '#22201D', -6);
      FX.confetti((br.left - ar.left) / bk + 22, (br.top - ar.top) / bk, 40, 1.4);
    } else Sound.lose();
  }
  bar.style.transition = 'width .6s cubic-bezier(.3,.7,.3,1)';
  bar.style.width = rec.tier.pct + '%';
}

// ── 겹쳐 뜨는 판 ───────────────────────────────────────────

function sheet(html) {
  closeSheet();
  app.insertAdjacentHTML('beforeend', `<div class="sheet-back"></div><div class="sheet">${html}</div>`);
  return app.querySelector('.sheet');
}
function closeSheet() { app.querySelectorAll('.sheet, .sheet-back').forEach((n) => n.remove()); }

// ── 시작 ───────────────────────────────────────────────────

// 화면 틀: 가로가 기본 — 높이 420 에 창 비율만큼 넓힌 판(760~980)을 화면에 맞춰 키우고 줄인다(폰 가로 · PC 같은 틀).
// 세로로 들면 돌려 달라고 안내하고, '세로로 계속'을 고르면 예전 세로 틀(390×844)로 그린다.
const PHONE = { w: 390, h: 844 };
const LAND_H = 420;

function fit() {
  const W = window.innerWidth, H = window.innerHeight;
  const tall = H > W * 1.05;
  const land = !(tall && G.portrait);
  document.body.classList.toggle('land', land);
  document.body.classList.toggle('turn-me', tall && !G.portrait);
  const sh = land ? LAND_H : PHONE.h;
  const sw = land ? Math.round(Math.min(980, Math.max(760, (W / H) * sh))) : PHONE.w;
  const k = land ? Math.min(H / sh, W / sw) : Math.min(1, H / sh, W / sw);
  const root = document.documentElement.style;
  root.setProperty('--sw', sw + 'px');
  root.setProperty('--sh', sh + 'px');
  const stage = document.getElementById('stage');
  stage.style.transform = `scale(${k})`;
  stage.style.marginBottom = sh * (k - 1) + 'px';
  if (M() && $('#board')) { Camera.refit(); drawZoom(); }
}
document.getElementById('keepPortrait')?.addEventListener('click', () => { G.portrait = true; fit(); });
window.addEventListener('resize', fit);
fit();

document.addEventListener('pointerdown', () => Sound.unlock());
// 키보드: Space/Enter 로 출발
document.addEventListener('keydown', (e) => {
  if (e.repeat || !M() || app.querySelector('.sheet') || !app.classList.contains('game')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onThrow(); }
});

// 개발 중 콘솔 확인용
window.__game = { get m() { return G.m; }, get G() { return G; } };

splash();
