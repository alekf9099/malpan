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
  monopolyOf, monoThreats, HOT_WIN, LINE_WIN, isLoop, roundsOf, ringIn, cornerAt, hotsOf, takeoverFor, DOUBLE_JAIL
} from '../core/match.js';
import { aiSteps, actOk, applyAct, fastForward, sig, isBot, AUTO_LIMIT } from '../core/lockstep.js';
import { chanceById } from '../core/events.js';
import { HEROES as HERO_DATA, heroById, STARTERS, skillDesc, activeDesc, chargeOf } from '../core/heroes.js';
import { SALARY, ringOf } from '../core/boards/loop.js';
import { tourArt } from './tour-art.js';
import { skillArt } from './skill-art.js';
import * as SFX from './skill-fx.js';
import * as EFX from './estate-fx.js';
import { createRng } from '../core/rng.js';
import { LINES, STATION_LINES, ALL_EDGES, dist, lineOfEdge } from '../core/boards/seoul.js';
import { BOARDS } from '../core/boards/index.js';
import { links, chainOf, LEVEL_NAME, LEVEL_MULT, MAX_LEVEL, stationPrice, baseToll, HOTSPOTS } from '../core/estate.js';
import { INCIDENTS } from '../core/incidents.js';
import { matchPoints, rpDelta, RP_TABLE, tierOf } from '../core/ranking.js';
import { tierBadge } from './tier-art.js';
import { character, act, face, coin, ownerFlag } from './art.js';
import { boardSvg, nodeXY, depth, pieceSize, canvasSize, useBoard, groundOf, buildingArt, preloadBuildings, liftOf, centerSpots } from './board-view.js';
import { hotArt } from './hot-art.js';
import * as Camera from './camera.js';
import { sleep, tween, hop, drop, knockOut, squish, shake, flash, fly } from './anim.js';
import * as FX from './fx.js';
import * as Roller from './roller.js';
import * as Roller3D from './roller3d.js';
import * as Records from './records.js';
import * as Prefs from './prefs.js';
import * as Daily from './daily.js';
import * as Cloud from './cloud.js';
import * as Online from './online.js';
import * as RunStore from './run-store.js';
import { relicArt, heartArt } from './relic-art.js';
import { newRun, stagePlan, stageMatch, finishStage, pickRelic, tally, freshStats, bonusDone, bonusById, stageWon, runReward, relicById, RUN_STAGES, RUN_LIVES, REWARD } from '../core/expedition.js';
import { ATTEND_REWARDS } from '../core/missions.js';
import { Sound } from './sound.js';

// 게임 이름은 여기 한 곳에서만 바꾼다
export const GAME_TITLE = { main: '역전', hanja: '驛戰', sub: '역을 차지하라 — 서울 지하철 땅따먹기' };

const app = document.getElementById('app');
const G = { m: null, busy: false, size: 4, wait: null, daily: false, me: 'p0', online: null, run: null };
const $ = (sel) => app.querySelector(sel);
const M = () => G.m;
const ids = HERO_DATA.map((h) => h.id);
// 내 자리: 혼자 할 땐 p0, 온라인은 방에 들어간 순서의 자리(G.me). 다른 사람 자리는 방 이름으로 부른다
const ME = () => playerById(M(), G.me);
const isMine = (p) => !!p && p.id === G.me;
const colorOf = (p) => heroById(p.hero).color;
const nameOf = (p) => G.online?.names[p.id] || (p.boss ? `보스 ${heroById(p.hero).name}` : heroById(p.hero).name);
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
/** 지금(대결 중이 아니면 로비에서 고른) 판: 'loop' · 'korea' · 'world'(고리 판) · false(노선도) — 캐릭터 설명·충전이 판마다 달라서 */
const loopy = () => (G.m ? (isLoop(G.m) ? G.m.region : false) : Prefs.getBoard() === 'map' ? false : Prefs.getBoard());
/** 판에 쓰는 칸 이름(관광 맵은 짧은 이름이 따로 있다) */
const tileName = (n) => (G.m && ringIn(G.m) ? ringIn(G.m).nameOf(n) : n);
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
  run: '<svg viewBox="0 0 24 24"><path d="M4 19 L9 13 L13 16 L20 6"/><circle cx="20" cy="6" r="2"/><path d="M3 4 V20 H21"/></svg>',
  online: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="8" r="3"/><path d="M2.5 19 Q2.5 13.5 8 13.5 Q13.5 13.5 13.5 19 Z M14 13.6 Q21.5 13 21.5 19 H15.5"/></svg>',
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
  G.run = null;
  leaveOnline();
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
          <button class="lb-float" data-go="online"><span>${ICON.online}</span><b>온라인 대결</b></button>
        </div>
        <div class="lb-side right">
          <button class="lb-float hot" data-go="daily"><span>${ICON.today}</span><b>오늘의 대결</b><i class="lb-date">${today.getMonth() + 1}/${today.getDate()}</i></button>
          <button class="lb-float run" data-go="run"><span>${ICON.run}</span><b>원정</b>${RunStore.ongoing() ? '<i class="dot"></i>' : ''}</button>
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
          <div class="lb-seg lb-board" role="radiogroup" aria-label="판">${[['loop', '순환선'], ['korea', '국내'], ['world', '해외'], ['map', '노선도']].map(([k, n]) => `<button role="radio" data-b="${k}" class="${k === Prefs.getBoard() ? 'on' : ''}" aria-checked="${k === Prefs.getBoard()}">${n}</button>`).join('')}</div>
          <div class="lb-seg" role="radiogroup" aria-label="상대 수"><span>상대</span>${[1, 2, 3].map((n) => `<button role="radio" data-n="${n}" class="${n === rivals ? 'on' : ''}" aria-checked="${n === rivals}">${n}</button>`).join('')}<span>명</span></div>
        </div>
        <button class="lb-start" id="start"><span class="lb-go">${ICON.play}</span><span class="lb-st"><b>대결 시작</b><small>${ringOf(Prefs.getBoard()) ? `${ringOf(Prefs.getBoard()).name} · ${ringOf(Prefs.getBoard()).startName} 출발` : '노선도 · 06:00 첫차 → 24:00 막차'}</small></span></button>
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
    else if (k === 'online') onlineMenu();
    else if (k === 'run') runPage();
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
  foreman: '비싼 내 역부터 착공 · 랜드마크끼리 환승',
  broker: '남의 역 도착 시 적극 인수'
};

// ── 도감 ───────────────────────────────────────────────────

const ACT_LABEL = { idle: '대기', walk: '걷기', cheer: '환호', sad: '좌절', dance: '춤' };
const DEX_LINE = {
  driver: '새벽 첫차를 모는 20년 차 기관사', staff: '노선도를 통째로 외운 역무원', worker: '환승 3번은 기본인 출근길 직장인', student: '정기권 한 장으로 서울을 누비는 새내기',
  youtuber: '구독자 10만, 서울 명소 정복이 목표', rider: '골목길은 내비보다 빠삭한 배달 라이더', nurse: '밤샘 근무에도 지치지 않는 간호사', foreman: '역 공사 현장만 30년, 안전모를 벗은 적 없는 현장소장', broker: '역세권이라면 냄새부터 맡는 부동산 중개인'
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
  // 클라우드가 켜져 있으면 전체 랭킹부터, 아니면 내 기록부터
  const tab = Cloud.enabled() ? 'global' : 'mine';
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
      <div class="rank-list">
        <div class="rank-tabs" role="tablist">${[['global', '전체 랭킹'], ['mine', '내 최고 기록']].map(([t, label]) => `<button role="tab" data-t="${t}" aria-selected="${t === tab}" class="${t === tab ? 'on' : ''}">${label}</button>`).join('')}</div>
        <div class="rank-pane" data-p="global"${tab === 'global' ? '' : ' hidden'}>
          <div class="rank-sec"><span id="rgPlace">${Cloud.enabled() ? '' : '온라인 랭킹 준비 중 · 지금은 이 기기 기록만 남아요'}</span><button class="btn small white" id="rgName" hidden>이름 바꾸기</button></div>
          <div class="rank-rows" id="rgList">${Cloud.enabled() ? '<p class="rank-empty">불러오는 중…</p>' : ''}</div>
        </div>
        <div class="rank-pane rank-rows" data-p="mine"${tab === 'mine' ? '' : ' hidden'}>${rows}</div>
      </div>
      ${gnbHTML('rank')}
    </div>`;
  $('#dexBack').onclick = () => { Sound.click(); title(); };
  app.querySelectorAll('.rank-tabs button').forEach((b) => {
    b.onclick = () => {
      Sound.click();
      app.querySelectorAll('.rank-tabs button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
      app.querySelectorAll('.rank-pane').forEach((p) => { p.hidden = p.dataset.p !== b.dataset.t; });
    };
  });
  bindGnb();
  if (Cloud.enabled()) fillGlobalRank(m.rp, m.plays);
}

/** 전체 랭킹(클라우드): 위 50명 + 내 순위 + 이름 바꾸기 */
async function fillGlobalRank(rp, plays) {
  const list = await Cloud.top(50);
  const box = $('#rgList');
  if (!box) return; // 그사이 다른 화면으로 갔다
  if (!list) { box.innerHTML = '<p class="rank-empty">온라인 랭킹에 연결하지 못했어요 · 기기 기록은 그대로 남아요</p>'; return; }
  box.innerHTML = list.length ? list.map((r, i) => {
    const t = tierOf(r.rp || 0);
    return `<div class="rank-row ${i < 3 ? 'top' + (i + 1) : ''} ${r.me ? 'me' : ''}">
        <span class="no">${i + 1}</span>
        <div class="what"><b>${r.hero && heroById(r.hero) ? character(r.hero, 26) : ''} ${esc(r.name || '승객')}${r.me ? ' <em>나</em>' : ''}</b><span>${tierBadge(t, 14)} ${t.label} · ${r.plays || 0}판 ${r.wins || 0}승</span></div>
        <b class="pts">${(r.rp || 0).toLocaleString()}<small>RP</small></b>
      </div>`;
  }).join('') : '<p class="rank-empty">아직 아무도 없어요 · 첫 대결을 끝내면 이름이 올라가요</p>';
  const place = plays ? await Cloud.myPlace(rp) : null;
  const pl = $('#rgPlace');
  if (pl) pl.textContent = `${Cloud.myName()}${place ? ` · 전체 ${place}위` : plays ? '' : ' · 한 판 끝내면 등록'}`;
  const btn = $('#rgName');
  if (btn) {
    btn.hidden = false;
    btn.onclick = () => {
      Sound.click();
      const v = prompt(`랭킹에 보일 이름(${Cloud.NAME_MAX}자까지)`, Cloud.myName());
      if (v == null) return;
      Cloud.setName(v);
      ranking();
    };
  }
}
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── 하는 법 ────────────────────────────────────────────────

/** 순환선 판 도움말 */
const LOOP_GUIDE = [
  ['순환선', '2호선 32칸 고리를 시계 방향으로 · 모두 시청에서 출발 · 18바퀴'],
  ['이동', '주사위 2개 중 하나를 골라 이동(1~6칸) · 뒤로는 못 감'],
  ['더블', `두 주사위가 같은 눈이면 그 눈만큼 가고 한 번 더 · 한 차례에 ${DOUBLE_JAIL}번 이어지면 신도림 환승 미로로 끌려가 한 턴 쉬기`],
  ['월급', `시청을 지날 때마다 +${SALARY} · 시청에 서면 1.5배`],
  ['지름길', '3호선 을지로3가↔교대 · 4호선 동대문↔사당 — 지나거나 출발할 때 판을 가로지를 수 있음'],
  ['모서리 칸', '성수 팝업 축제(내 역 통행료 2배) · 강남 급행 환승(앞 12칸 중 원하는 칸) · 신도림 환승 미로(한 턴 쉬기)'],
  ['구매 · 증축', '빈 칸 도착 시 구매 · 내 칸 재도착 시 증축, 3단계는 랜드마크 · 지나가기만 하면 요금 없음'],
  ['통행료', '남의 칸 도착 시 통행료 · 이어서 가진 칸 ×2~×4 · 단계 ×3 · ×7 · 통행료 뒤 1.5배에 인수 가능'],
  ['노선 투자', '주사위 전, 이어진 내 칸(2칸 이상)은 어디서든 증축'],
  ['스킬', '주사위를 던질 때마다 1칸 충전 · 다 차면 주사위 전에 사용'],
  ['찬스 · 명소', '? 칸은 찬스 카드 · DDP·잠실·홍대는 명소 칸(도착 효과)'],
  ['적립금', '벌금 · 수리비 · 미로 이용료(50)가 판 가운데 단지에 쌓이고, 축제 칸에 서면 통째로 가져간다'],
  ['독점 승리', '명소 3칸 전부 또는 5칸 연속 보유 시 즉시 승리'],
  ['승리 조건', '최후의 1인, 독점, 또는 막차 시 자산 1위']
];

/** 관광 맵 도움말(판 데이터로) — 순환선은 LOOP_GUIDE */
function ringGuide(r) {
  if (r.id === 'loop') return LOOP_GUIDE;
  const corner = (k) => Object.values(r.corners).find((c) => c.kind === k)?.name;
  return [
    [r.name, `32칸 고리를 시계 방향으로 · 모두 ${r.startName}에서 출발 · 18바퀴`],
    LOOP_GUIDE[1],
    ['더블', `두 주사위가 같은 눈이면 그 눈만큼 가고 한 번 더 · 한 차례에 ${DOUBLE_JAIL}번 이어지면 ${corner('maze')}로 끌려가 한 턴 쉬기`],
    [r.payName, `${r.startName}을 지날 때마다 +${SALARY} · ${r.startName}에 서면 1.5배`],
    ['지름길', `${r.shortcuts.map(([a, b, , l]) => `${l} ${r.nameOf(a)}↔${r.nameOf(b)}`).join(' · ')} — 지나거나 출발할 때 판을 가로지를 수 있음`],
    ['모서리 칸', `${corner('festival')}(내 칸 통행료 2배) · ${corner('express')}(앞 12칸 중 원하는 칸) · ${corner('maze')}(한 턴 쉬기)`],
    LOOP_GUIDE[6], LOOP_GUIDE[7], LOOP_GUIDE[8], LOOP_GUIDE[9],
    [r.chanceName, `? 칸은 ${r.chanceName} — 찬스 카드를 뽑는다`],
    ['적립금', `벌금 · 수리비 · ${corner('maze')} 이용료(50)가 판 가운데 단지에 쌓이고, ${corner('festival')} 칸에 서면 통째로 가져간다`],
    ['독점 승리', `모서리·${r.chanceName} 칸 사이 ${r.lineWin}칸 구간을 통째로 가지면 즉시 승리`],
    LOOP_GUIDE[13]
  ];
}

function guide(then = null) {
  const ring = ringOf(loopy());
  const steps = ring ? ringGuide(ring) : [
    ['지역', '판마다 서울의 한 지역(도심 · 강남 · 서남 · 동부, 72역)에서 대결 · 12바퀴'],
    ['이동', '주사위 2개 중 하나를 골라 이동(1~6역) · 눈마다 도착할 곳이 미리 보임'],
    ['더블', `같은 눈이면 그 눈만큼 가고 한 번 더 · ${DOUBLE_JAIL}번 이어지면 그 자리에서 한 턴 쉬기`],
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

/** 대결 시작(AI 상대). rivalCount: 상대 수(없으면 로비에서 고른 수) */
async function startGame(daily, rivalCount = Prefs.getRivals()) {
  Sound.unlock(); Sound.click();
  const me = Prefs.getLeader(Records.unlocked());
  const q = new URLSearchParams(location.search);
  const fixed = parseInt(q.get('seed'), 10);
  const today = new Date();
  const seed = daily ? today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
    : Number.isNaN(fixed) ? (Date.now() & 0x7fffffff) : fixed;
  // 상대는 아홉 중 무작위(잠긴 캐릭터도 나온다) — 같은 시드면 같은 상대
  const rivals = createRng((seed ^ 0x5bd1e995) >>> 0 || 1).shuffle(ids.filter((x) => x !== me)).slice(0, rivalCount);
  const m = createMatch({ seed, heroes: [me, ...rivals], humans: 1, daily, region: ringOf(Prefs.getBoard()) ? Prefs.getBoard() : null });
  if (!(await matchmaking(me, rivals, daily, areaOf(m)))) return;
  G.daily = daily;
  G.run = null;
  G.me = 'p0';
  G.m = m;
  G.stats = { buy: 0, upgrade: 0, landmark: 0, takeover: 0, goal: 0, hot: 0, toll: 0 };
  G.hudMoney = {};
  G.combo = null;
  G.entered = new Set([current(m).id]); // 첫 차례를 맞은 사람 — 출발 칸에는 차례가 온 사람만 서 있게(첫 차례는 turnStart 없이 시작)
  enterGame();
}

// ── 온라인 대결: 방 만들기 · 참가 · 대기실 ───────────────────

const BOARD_NAMES = { loop: '순환선', korea: '국내', world: '해외', map: '노선도' };
const ONLINE_ERR = { offline: '온라인에 연결하지 못했어요', nothing: '그런 방이 없어요', full: '방이 꽉 찼어요', started: '이미 시작한 방이에요', taken: '방을 만들지 못했어요 · 다시 눌러 주세요' };
const onlineErr = (err) => ONLINE_ERR[err?.message] || (err?.code === 'permission-denied' ? '권한이 없어요 · 규칙(firestore.rules)을 확인해 주세요' : '연결이 불안정해요 · 다시 해 주세요');
const inviteLink = (code) => `${location.origin}${location.pathname}?room=${code}`;

// ── 원정 모드(로그라이크): 원정 지도 · 스테이지 · 유물 고르기 · 결과 ────────

const hearts = (n) => `<span class="run-hearts" aria-label="목숨 ${n}">${Array.from({ length: RUN_LIVES }, (_, i) => heartArt(i < n)).join('')}</span>`;
const relicChip = (id) => { const r = relicById(id); return r ? `<span class="relic-chip" title="${r.desc}">${relicArt(id, 22)}<b>${r.name}</b></span>` : ''; };

/** 원정 지도: 스테이지 길 · 목숨 · 모은 유물 · 다음 스테이지. 진행 중인 원정이 없으면 새 원정 안내 */
function runPage() {
  const run = RunStore.ongoing();
  if (run?.over) { runOver(run); return; }
  if (run?.offer) { relicPick(run); return; }
  const rec = RunStore.record();
  const path = (at) => `<div class="run-path">${RUN_STAGES.map((st, i) => `<div class="rp-node ${i < at ? 'done' : i === at ? 'now' : ''} ${st.boss ? 'boss' : ''}"><i>${st.boss ? '보스' : i + 1}</i><span>${st.name}</span></div>`).join('<b class="rp-line"></b>')}</div>`;
  if (!run) {
    const hero = Prefs.getLeader(Records.unlocked()), h = heroById(hero), board = Prefs.getBoard();
    const s = sheet(`<span class="kind">원정 · 로그라이크</span><h2>역전 원정</h2>
      <p>짧은 판 <b>${RUN_STAGES.length}개</b>를 이어서 · <b>1등</b>이면 통과하고 <b>유물</b> 3장 중 하나를 얻는다 · 지면 목숨 하나 · 목숨 <b>${RUN_LIVES}개</b> · 마지막은 보스</p>
      ${path(0)}
      <div class="run-who" style="--pc:${h.color}">${character(hero, 46, 'cheer')}<div><b>${h.name}</b><span>${BOARD_NAMES[board]} 판 · 로비에서 고른 캐릭터와 판으로</span></div></div>
      <p class="run-rec">${rec.runs ? `최고 ${rec.best ? `${rec.best}스테이지 통과` : '첫 스테이지'} · 완주 ${rec.clears}번 · 원정 ${rec.runs}번` : '첫 원정'} · 보상: 스테이지마다 승차권 ${REWARD.stage}장 · 완주 +${REWARD.clear}장</p>
      <div class="row"><button class="btn white" id="rnClose">닫기</button><button class="btn" id="rnNew">원정 시작</button></div>`);
    s.classList.add('run-sheet');
    s.querySelector('#rnClose').onclick = () => { Sound.click(); closeSheet(); };
    s.querySelector('#rnNew').onclick = () => {
      Sound.unlock(); Sound.click();
      RunStore.save(newRun({ seed: (Date.now() & 0x7fffffff) || 1, hero, board }));
      runPage();
    };
    return;
  }
  const plan = stagePlan(run), h = heroById(run.hero), b = bonusById(plan.bonus);
  const s = sheet(`<span class="kind">원정 · ${BOARD_NAMES[run.board]} 판</span><h2>역전 원정</h2>
    <div class="run-top" style="--pc:${h.color}">${character(run.hero, 40)}<b>${h.name}</b>${hearts(run.lives)}</div>
    ${path(run.stage)}
    <div class="run-stage ${plan.boss ? 'boss' : ''}">
      <span class="kind">${plan.boss ? '보스 스테이지' : `스테이지 ${run.stage + 1}`}${run.tries ? ` · 다시 도전 ${run.tries}` : ''}</span>
      <h3>${plan.name}</h3>
      <div class="rs-vs">${plan.rivals.map((id, i) => `<span class="rs-rival ${plan.boss && i === 0 ? 'boss' : ''}" style="--pc:${heroById(id).color}">${character(id, 34, plan.boss && i === 0 ? 'cheer' : 'idle')}<i>${plan.boss && i === 0 ? '보스' : heroById(id).name}</i></span>`).join('')}</div>
      <p>상대 ${plan.rivals.length}명 · ${plan.rounds}바퀴 · 1등이면 통과 · 상대 자금 ${(START_MONEY + plan.cash).toLocaleString()}으로 시작${plan.relics ? ` · 상대마다 유물 ${plan.relics}개` : ''}${plan.boss ? ` · 보스는 자금 +${plan.boss.cash} · 유물 ${plan.boss.relics}개` : ''}</p>
      <p class="run-bonus"><b>보너스</b> ${b.text} — 해내면 다음 유물 4장 중에서</p>
    </div>
    <div class="run-relics"><b>유물 ${run.relics.length}</b>${run.relics.length ? run.relics.map(relicChip).join('') : '<span class="run-none">아직 없음 · 스테이지를 통과하면 얻는다</span>'}</div>
    <div class="row"><button class="btn white" id="rnQuit">포기</button><button class="btn white" id="rnClose">닫기</button><button class="btn" id="rnGo">출발</button></div>`);
  s.classList.add('run-sheet');
  s.querySelector('#rnClose').onclick = () => { Sound.click(); closeSheet(); };
  s.querySelector('#rnGo').onclick = () => { Sound.unlock(); Sound.click(); startStage(); };
  s.querySelector('#rnQuit').onclick = () => {
    Sound.click();
    const q = sheet(`<span class="kind">원정</span><h2>원정을 그만둘까요?</h2><p>여기까지 통과한 스테이지만큼 승차권을 받고 끝나요(${runReward(run)}장).</p>
      <div class="row"><button class="btn white" id="qNo">계속하기</button><button class="btn" id="qYes">그만두기</button></div>`);
    q.querySelector('#qNo').onclick = () => { Sound.click(); runPage(); };
    q.querySelector('#qYes').onclick = () => { Sound.click(); runOver({ ...run, over: true }); };
  };
}

/** 스테이지 시작: 원정 상태로 판을 꾸려 대결 화면으로 */
function startStage() {
  const run = RunStore.ongoing();
  if (!run || run.over) return;
  closeSheet();
  leaveOnline();
  const plan = stagePlan(run);
  const m = stageMatch(run, plan);
  G.run = { run, plan };
  G.daily = false;
  G.me = 'p0';
  G.m = m;
  G.stats = freshStats();
  G.hudMoney = {};
  G.combo = null;
  G.entered = new Set([current(m).id]);
  enterGame();
}

/** 스테이지가 끝났다: 통과 · 실패, 보너스, 목숨 → 유물 고르기 · 다시 도전 · 원정 결과 */
async function stageResults() {
  const m = M(), me = ME(), { run, plan } = G.run;
  const won = stageWon(m), bonus = won && bonusDone(plan.bonus, G.stats), b = bonusById(plan.bonus);
  const next = finishStage(run, { won, bonus });
  Daily.addMatch({ ...G.stats, play: 1, win: won ? 1 : 0 });
  RunStore.save(next); // 다 끝났어도 남겨 둔다 — 결과를 보기 전에 꺼도 다음에 원정 결과(보상)부터
  G.run = null;
  const reason = me.out ? '파산' : m.reason === 'bankrupt' ? '모든 상대 파산' : m.reason === 'monopoly' ? `${winnerName(m)} 독점` : `${hhmm(m.end)} 막차 · ${me.place}등`;
  const s = sheet(`
    <div class="rs-head ${won ? 'win' : ''}" style="--pc:${colorOf(me)}">
      <div class="rs-rays"></div>
      <div class="rs-hero">${character(me.hero, 104, won ? 'dance' : 'sad')}</div>
      <b class="rs-place">${won ? (plan.last ? '보스 격파!' : '통과!') : '실패'}</b><span>${plan.name} · ${reason}</span>
    </div>
    <div class="run-res">
      <p class="run-bonus ${bonus ? 'ok' : ''}"><b>보너스</b> ${b.text} — ${bonus ? '달성! 다음 유물 4장 중에서' : won ? '못 함' : '통과해야 인정돼요'}</p>
      <div class="run-top">${hearts(next.lives)}<span>${won ? `${next.stage}/${RUN_STAGES.length} 스테이지 통과` : next.over ? '목숨이 다 떨어졌어요' : `목숨 하나를 잃었어요 · 같은 스테이지를 새 판으로`}</span></div>
    </div>
    <div class="row"><button class="btn white" id="rsHome">로비</button><button class="btn" id="rsNext">${next.over ? '원정 결과' : won ? '유물 고르기' : '다시 도전'}</button></div>`);
  s.classList.add('result-sheet');
  if (won) { Sound.win(); buzz([40, 30, 40, 30, 90]); } else Sound.lose();
  tween(s.querySelector('.rs-head'), [{ transform: 'translateY(-60px) scale(.8)', opacity: 0 }, { transform: 'translateY(6px) scale(1.04)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 480, easing: 'cubic-bezier(.3,.7,.3,1.2)' });
  const go = () => { if (next.over) runOver(next); else if (next.offer) relicPick(next); else { title(); runPage(); } };
  s.querySelector('#rsNext').onclick = () => { Sound.click(); title(); go(); };
  s.querySelector('#rsHome').onclick = () => { Sound.click(); title(); if (next.over) runOver(next); };
}

/** 유물 고르기: 후보 3~4장 중 하나 */
function relicPick(run) {
  const s = sheet(`<span class="kind">원정 · ${run.stage}/${RUN_STAGES.length} 통과</span><h2>유물 고르기</h2><p>하나를 골라 원정 끝까지 가져가요</p>
    <div class="relic-cards ${run.offer.length > 3 ? 'four' : ''}">${run.offer.map((id) => { const r = relicById(id); return `<button class="relic-card" data-r="${id}">${relicArt(id, 52)}<b>${r.name}</b><span>${r.desc}</span></button>`; }).join('')}</div>`);
  s.classList.add('run-sheet');
  s.querySelectorAll('.relic-card').forEach((c, i) => {
    tween(c, [{ transform: 'translateY(30px) rotate(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, delay: i * 90, easing: 'cubic-bezier(.3,.7,.3,1.2)', fill: 'backwards' });
    c.onclick = () => {
      Sound.unlock(); Sound.heung(2);
      RunStore.save(pickRelic(run, c.dataset.r));
      toast(`${relicById(c.dataset.r).name} 획득!`);
      runPage();
    };
  });
}

/** 원정이 끝났다(완주 · 목숨 다함 · 포기): 보상 승차권 · 기록 */
function runOver(run) {
  const reward = runReward(run);
  const rec = RunStore.finish(run);
  if (reward) Records.addTickets(reward);
  const h = heroById(run.hero);
  const s = sheet(`
    <div class="rs-head ${run.won ? 'win' : ''}" style="--pc:${h.color}">
      <div class="rs-rays"></div>
      <div class="rs-hero">${character(run.hero, 104, run.won ? 'dance' : 'idle')}</div>
      <b class="rs-place">${run.won ? '원정 완주!' : '원정 끝'}</b><span>${run.stage}/${RUN_STAGES.length} 스테이지 · 보너스 ${run.bonuses}번 · 유물 ${run.relics.length}개</span>
    </div>
    <div class="run-relics">${run.relics.map(relicChip).join('') || '<span class="run-none">유물 없음</span>'}</div>
    <div class="rs-gain run-gain">${ticketPill()}<b>+${reward}장</b></div>
    <p class="run-rec">최고 ${rec.best}스테이지 · 완주 ${rec.clears}번 · 원정 ${rec.runs}번</p>
    <div class="row"><button class="btn white" id="roHome">로비</button><button class="btn" id="roAgain">새 원정</button></div>`);
  s.classList.add('result-sheet');
  if (run.won) { Sound.win(); FX.confetti(200, 120, 70, 1.6); }
  s.querySelector('#roHome').onclick = () => { Sound.click(); title(); };
  s.querySelector('#roAgain').onclick = () => { Sound.click(); title(); runPage(); };
}

/** 온라인 대결 첫 창: 이어 하기 · 방 만들기 · 코드로 참가 */
async function onlineMenu(code = '') {
  if (!Cloud.enabled()) { toast('온라인 대결을 쓸 수 없어요'); return; }
  let size = Math.max(2, Math.min(4, Prefs.getRivals() + 1));
  const s = sheet(`<span class="kind">친구와 같이 · 빈자리는 AI</span><h2>온라인 대결</h2>
    <div class="on-resume" id="onResume" hidden></div>
    <div class="on-box on-quick"><div><b>빠른 매칭</b><p>${BOARD_NAMES[Prefs.getBoard()]} 판 · 최대 ${quickSize()}명 · ${QUICK_WAIT}초 안에 못 찾으면 AI 와</p></div>
      <button class="btn" id="onQuick">찾기</button></div>
    <div class="on-box"><b>방 만들기</b><p>${BOARD_NAMES[Prefs.getBoard()]} 판 · 코드를 친구에게 보내면 같이 해요</p>
      <div class="on-line"><div class="lb-seg on-size" role="radiogroup" aria-label="자리 수"><span>자리</span>${[2, 3, 4].map((n) => `<button role="radio" data-s="${n}" class="${n === size ? 'on' : ''}" aria-checked="${n === size}">${n}</button>`).join('')}</div>
      <button class="btn small" id="onMake">만들기</button></div></div>
    <div class="on-box"><b>코드로 참가</b>
      <div class="on-line"><input class="on-code" id="onCode" maxlength="${Online.CODE_LEN}" placeholder="코드 ${Online.CODE_LEN}자리" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${code}">
      <button class="btn small" id="onJoin">참가</button></div></div>
    <div class="row"><button class="btn white" id="onClose">닫기</button></div>`);
  const busy = (on) => s.querySelectorAll('button').forEach((b) => { b.disabled = on; });
  s.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { Sound.click(); size = +b.dataset.s; s.querySelectorAll('[data-s]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); }); }; });
  s.querySelector('#onClose').onclick = () => { Sound.click(); closeSheet(); };
  s.querySelector('#onQuick').onclick = () => { Sound.unlock(); Sound.click(); quickMatch(); };
  const input = s.querySelector('#onCode');
  input.oninput = () => { input.value = Online.normCode(input.value); };
  s.querySelector('#onMake').onclick = async () => {
    Sound.unlock(); Sound.click(); busy(true);
    try { roomPage(await Online.createRoom({ size, board: Prefs.getBoard(), hero: Prefs.getLeader(Records.unlocked()) })); }
    catch (err) { console.warn(err); toast(onlineErr(err)); busy(false); }
  };
  const join = async () => {
    const c = Online.normCode(input.value);
    if (c.length !== Online.CODE_LEN) { Sound.deny(); toast(`코드 ${Online.CODE_LEN}자리를 넣어 주세요`); return; }
    Sound.unlock(); Sound.click(); busy(true);
    try { const room = await Online.joinRoom(c, { hero: Prefs.getLeader(Records.unlocked()) }); if (room.status === 'play') startOnline(c, room); else roomPage(c); }
    catch (err) { console.warn(err); toast(onlineErr(err)); busy(false); }
  };
  s.querySelector('#onJoin').onclick = join;
  input.onkeydown = (e) => { if (e.key === 'Enter') join(); };
  if (code.length === Online.CODE_LEN) { join(); return; }
  // 하다 만 판이 있으면 이어 하기
  const last = Online.lastRoom();
  if (!last) return;
  const room = await Online.getRoom(last);
  if (!document.body.contains(s) || !room || room.status !== 'play' || !room.uids.includes(Online.myUid())) return;
  const box = s.querySelector('#onResume');
  box.hidden = false;
  box.innerHTML = `<button class="btn" id="onBack">진행 중인 대결로 돌아가기 · ${last}</button>`;
  box.querySelector('#onBack').onclick = () => { Sound.click(); startOnline(last, room); };
}

/** 빠른 매칭: 이만큼(초) 기다려도 사람이 다 안 차면 있는 사람 + AI 로 시작 · 아무도 없으면 AI 대결로 */
const QUICK_WAIT = 20;
/** 들어간 방의 방장이 이만큼 더 지나도 시작하지 않으면(방장이 사라졌다) AI 대결로 */
const QUICK_GIVEUP = 20;

const quickSize = () => Math.max(2, Math.min(4, Prefs.getRivals() + 1));

/** 빠른 매칭 시작: 기다리는 방을 찾아 들어가거나 새로 연다. deadline 은 다시 찾을 때 이어 쓰는 마감 시각 */
async function quickMatch(deadline = Date.now() + QUICK_WAIT * 1000) {
  if (!Cloud.enabled()) { toast('온라인 대결을 쓸 수 없어요'); return; }
  const s = quickSheet();
  s.querySelector('#qmBody').innerHTML = '<p class="qm-note">기다리는 방을 찾는 중…</p>';
  let found;
  try { found = await Online.quickMatch({ size: quickSize(), board: Prefs.getBoard(), hero: Prefs.getLeader(Records.unlocked()) }); }
  catch (err) { console.warn(err); if (document.body.contains(s)) quickToAi('온라인에 연결하지 못해 AI 와 시작해요'); return; }
  if (!document.body.contains(s)) { Online.leaveRoom(found.code); return; } // 그사이 그만뒀다
  quickWait(found.code, found.host, deadline);
}

function quickSheet() {
  const board = Prefs.getBoard();
  const s = sheet(`<span class="kind">빠른 매칭 · ${BOARD_NAMES[board]} · 최대 ${quickSize()}명</span><h2>상대 찾는 중</h2>
    <div id="qmBody"></div>
    <div class="row"><button class="btn white" id="qmCancel">그만두기</button></div>`);
  s.classList.add('room-sheet', 'quick-sheet');
  s.querySelector('#qmCancel').onclick = () => { Sound.click(); closeSheet(); };
  return s;
}

/** 빠른 매칭 방에서 기다리기: 방장은 다 차거나 마감이 되면 시작(혼자면 AI 대결로), 손님은 방장을 기다린다 */
function quickWait(code, host, deadline) {
  const s = app.querySelector('.quick-sheet') || quickSheet();
  const body = s.querySelector('#qmBody');
  const uid = Online.myUid(), board = Prefs.getBoard();
  let room = null, alive = true, going = false;
  const timers = [];
  const end = () => { alive = false; stop(); timers.forEach(clearInterval); };
  s.querySelector('#qmCancel').onclick = () => { Sound.click(); end(); Online.leaveRoom(code); closeSheet(); };
  const go = async () => {
    if (going || !room) return;
    going = true;
    if (room.uids.length < 2) { end(); Online.leaveRoom(code); quickToAi('사람을 못 찾아 AI 와 시작해요'); return; }
    try { await Online.startRoom(code, planRoom); } catch (err) { console.warn(err); going = false; }
  };
  const draw = () => {
    if (!room) return;
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const seats = Array.from({ length: room.size }, (_, i) => room.seats[i] || null);
    body.innerHTML = `
      <div class="qm-count"><b>${left}</b><span>${host ? (room.uids.length < 2 ? '초 뒤 AI 와 대결' : '초 뒤 시작 · 빈자리는 AI') : '초 · 방장이 시작하면 바로'}</span><i style="width:${(left / QUICK_WAIT) * 100}%"></i></div>
      <div class="room-seats">${seats.map((x) => x
        ? `<div class="rm-seat ${x.uid === uid ? 'me' : ''}" style="--pc:${heroById(x.hero)?.color || '#888'}">${character(x.hero, 40, 'cheer')}<b>${esc(x.name)}${x.uid === uid ? ' (나)' : ''}</b><i>${x.uid === room.host ? '방장' : '참가'}</i></div>`
        : '<div class="rm-seat ai wait"><span class="rm-ai">?</span><b>찾는 중</b><i>못 찾으면 AI</i></div>').join('')}</div>
      <p class="qm-note">차례 제한 ${room.turn || Online.TURN_SEC}초 · 나가면 AI 가 이어받아요</p>`;
  };
  const stop = Online.watchRoom(code, (r) => {
    if (!alive) return;
    if (!r || r.status === 'gone' || !r.uids.includes(uid)) {
      // 방장이 다른 방으로 옮겼거나 방이 사라졌다 — 남은 시간으로 다시 찾는다
      end(); closeSheet(); Online.forget();
      if (!host) quickMatch(Math.max(deadline, Date.now() + 8000));
      return;
    }
    room = r;
    if (r.status === 'play') { end(); startOnline(code, r); return; }
    if (host && r.uids.length >= r.size) go();
    draw();
  });
  timers.push(setInterval(() => {
    if (!alive) return;
    draw();
    if (Date.now() < deadline) return;
    if (host) go();
    else if (Date.now() > deadline + QUICK_GIVEUP * 1000) { end(); Online.leaveRoom(code); quickToAi('방장이 응답하지 않아 AI 와 시작해요'); }
  }, 500));
  if (!host) return;
  timers.push(setInterval(() => Online.beat(code), 10000));
  // 동시에 방을 연 사람이 있으면 하나로 합친다(코드가 앞선 방으로 — 서로 옮겨 다니지 않게)
  timers.push(setInterval(async () => {
    if (!alive || going || !room || room.uids.length > 1) return;
    const other = (await Online.openRooms(board)).find((r) => r.code < code);
    if (!other || !alive || going || room.uids.length > 1) return;
    end();
    await Online.leaveRoom(code);
    try { await Online.joinRoom(other.code, { hero: Prefs.getLeader(Records.unlocked()) }); quickWait(other.code, false, deadline); }
    catch { quickMatch(deadline); }
  }, 4000));
}

/** 사람을 못 찾았다: 지금 고른 판 · 인원으로 AI 대결 */
function quickToAi(text) {
  closeSheet();
  toast(text);
  startGame(false, quickSize() - 1);
}

/** 대기실: 방 코드 · 자리(빈자리는 AI) · 방장은 자리 수 · 판 · 차례 제한을 고르고 시작 */
function roomPage(code) {
  closeSheet();
  const uid = Online.myUid();
  let room = null, stop = () => {};
  const s = sheet(`<span class="kind">온라인 대결 · 대기실</span><div id="roomBody"><p>방에 들어가는 중…</p></div>`);
  s.classList.add('room-sheet');
  const body = s.querySelector('#roomBody');
  const draw = () => {
    const host = room.host === uid;
    const seats = Array.from({ length: room.size }, (_, i) => room.seats[i] || null);
    body.innerHTML = `
      <div class="room-code"><span>방 코드</span><b>${code}</b><button class="btn small white" id="rmCopy">초대 링크</button></div>
      <p>${BOARD_NAMES[room.board] || '순환선'} 판 · 차례 ${room.turn || Online.TURN_SEC}초 · ${room.size}자리 · 사람 ${room.seats.length}명${room.seats.length < room.size ? ` · 빈자리 ${room.size - room.seats.length}곳은 AI` : ''}</p>
      <div class="room-seats">${seats.map((x, i) => x
        ? `<div class="rm-seat ${x.uid === uid ? 'me' : ''}" style="--pc:${heroById(x.hero)?.color || '#888'}">${character(x.hero, 40)}<b>${esc(x.name)}${x.uid === uid ? ' (나)' : ''}</b><i>${i === 0 ? '방장' : `${i + 1}번`}</i></div>`
        : '<div class="rm-seat ai"><span class="rm-ai">AI</span><b>빈자리</b><i>시작하면 AI</i></div>').join('')}</div>
      ${host ? `<div class="rm-opts"><div class="lb-seg" role="radiogroup" aria-label="자리 수"><span>자리</span>${[2, 3, 4].map((n) => `<button role="radio" data-s="${n}" class="${n === room.size ? 'on' : ''}" ${n < room.seats.length ? 'disabled' : ''}>${n}</button>`).join('')}</div>
        <div class="lb-seg lb-board" role="radiogroup" aria-label="판">${Object.entries(BOARD_NAMES).map(([k, n]) => `<button role="radio" data-b="${k}" class="${k === room.board ? 'on' : ''}">${n}</button>`).join('')}</div>
        <div class="lb-seg lb-board" role="radiogroup" aria-label="차례 제한"><span>차례</span>${Online.TURN_CHOICES.map((t) => `<button role="radio" data-t="${t}" class="${t === (room.turn || Online.TURN_SEC) ? 'on' : ''}">${t}초</button>`).join('')}</div></div>`
        : '<p class="rm-wait">방장이 시작하면 바로 시작해요</p>'}
      <div class="row"><button class="btn white" id="rmLeave">나가기</button>${host ? `<button class="btn" id="rmGo" ${room.seats.length < 2 ? 'disabled' : ''}>${room.seats.length < 2 ? '친구를 기다리는 중' : '시작'}</button>` : ''}</div>`;
    body.querySelector('#rmCopy').onclick = async () => {
      Sound.click();
      const link = inviteLink(code);
      try {
        if (navigator.share) await navigator.share({ title: `${GAME_TITLE.main} 온라인 대결`, text: `방 코드 ${code}`, url: link });
        else { await navigator.clipboard.writeText(link); toast('초대 링크를 복사했어요'); }
      } catch { /* 공유 창을 닫았다 */ }
    };
    body.querySelector('#rmLeave').onclick = () => { Sound.click(); stop(); Online.leaveRoom(code); closeSheet(); };
    body.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { Sound.click(); Online.updateRoom(code, { size: +b.dataset.s }).catch((e) => toast(onlineErr(e))); }; });
    body.querySelectorAll('[data-b]').forEach((b) => { b.onclick = () => { Sound.click(); Online.updateRoom(code, { board: b.dataset.b }).catch((e) => toast(onlineErr(e))); }; });
    body.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { Sound.click(); Online.updateRoom(code, { turn: +b.dataset.t }).catch((e) => toast(onlineErr(e))); }; });
    const go = body.querySelector('#rmGo');
    if (go) go.onclick = async () => {
      Sound.unlock(); Sound.click(); go.disabled = true;
      try { await Online.startRoom(code, planRoom); } catch (e) { toast(onlineErr(e)); go.disabled = false; }
    };
  };
  stop = Online.watchRoom(code, (r) => {
    if (!document.body.contains(s)) { stop(); return; }
    if (!r || r.status === 'gone' || !r.uids.includes(uid)) { stop(); closeSheet(); Online.forget(); toast(r?.status === 'gone' ? '방장이 방을 닫았어요' : '방에서 나왔어요'); return; }
    room = r;
    if (r.status === 'play') { stop(); startOnline(code, r); return; }
    draw();
  });
}

/** 방장이 시작할 때: 시드 · 캐릭터(겹치면 다른 캐릭터로) · 빈자리 AI 를 정한다 */
function planRoom(room) {
  const seed = (Date.now() & 0x7fffffff) || 1;
  const taken = new Set();
  const heroes = room.seats.map((x) => {
    let h = x.hero;
    if (!ids.includes(h) || taken.has(h)) h = ids.find((y) => !taken.has(y) && !room.seats.some((o) => o.hero === y)) || ids.find((y) => !taken.has(y));
    taken.add(h);
    return h;
  });
  const bots = createRng((seed ^ 0x5bd1e995) >>> 0 || 1).shuffle(ids.filter((y) => !taken.has(y))).slice(0, room.size - room.seats.length);
  return { status: 'play', seed, heroes: [...heroes, ...bots] };
}

/** 판 시작(또는 새로고침 뒤 이어 하기 · 판이 어긋나 다시 맞추기): 지금까지 올라온 행동으로 따라잡고 대결 화면으로 */
async function startOnline(code, room, again = false) {
  if (!again) closeSheet();
  leaveOnline();
  const uid = Online.myUid(), seat = room.uids.indexOf(uid);
  if (seat < 0) { toast('이 방의 사람이 아니에요'); return; }
  const m = createMatch({ seed: room.seed, heroes: room.heroes, humans: room.uids.length, region: ringOf(room.board) ? room.board : null });
  const O = {
    code, room, n: 0, inbox: [], log: [], waiter: null, turnKey: null, step: null, stop: () => {},
    live: new Map(), // uid → { seen(마지막으로 접속 표시를 받은 기기 시각), left, got(한 번이라도 받았나) }
    owners: Object.fromEntries(room.uids.map((u, i) => ['p' + i, u])),
    names: Object.fromEntries(room.seats.map((x, i) => ['p' + i, x.name]))
  };
  delete O.names['p' + seat];
  G.online = O;
  // 접속 표시: 시작할 때는 모두 있는 것으로(GONE_MS 안에 소식이 없으면 나간 것)
  const t0 = Date.now();
  for (const u of room.uids) O.live.set(u, { seen: t0, left: false, got: false });
  const stopBeat = Online.startPresence(code);
  const stopLive = Online.watchPresence(code, (u, s) => O.live.set(u, { seen: Date.now(), left: s.left, got: true }));
  // 첫 묶음(지금까지의 행동)을 받을 때까지 기다린다
  let stopActs = () => {};
  await new Promise((ready) => { stopActs = Online.watchActs(code, (a) => onAct(O, a), ready); });
  O.stop = () => { stopBeat(); stopLive(); stopActs(); };
  if (G.online !== O) { O.stop(); return; }
  const used = O.inbox.length ? fastForward(m, O.inbox, O.owners) : 0;
  O.inbox.splice(0, used);
  O.n = used;
  G.daily = false;
  G.run = null;
  G.me = 'p' + seat;
  G.m = m;
  G.stats = { buy: 0, upgrade: 0, landmark: 0, takeover: 0, goal: 0, hot: 0, toll: 0 };
  G.hudMoney = {};
  G.combo = null;
  G.entered = used ? new Set(m.players.map((p) => p.id)) : new Set([current(m).id]);
  enterGame(!!used || again);
  if (ME().bot) toast('내 자리는 AI 가 이어받았어요 · 지켜보는 중');
}

/** 온라인 대결 중 나가기: 내 자리는 AI 가 이어받는다 */
function quitOnline() {
  const O = G.online;
  if (!O) return;
  const s = sheet(`<span class="kind">온라인 대결 · 방 ${O.code}</span><h2>나갈까요?</h2><p>나가면 내 자리는 <b>AI</b> 가 끝까지 이어받고, 이 판의 기록은 남지 않아요.</p>
    <div class="row"><button class="btn white" id="qStay">계속하기</button><button class="btn" id="qGo">나가기</button></div>`);
  s.querySelector('#qStay').onclick = () => { Sound.click(); closeSheet(); };
  s.querySelector('#qGo').onclick = () => { Sound.click(); closeSheet(); Online.markLeft(O.code); Online.forget(); title(); };
}

/** 온라인 연결 끊기(로비로 돌아갈 때) */
function leaveOnline() {
  const O = G.online;
  if (!O) return;
  G.online = null;
  O.stop();
  O.cancel?.();
  O.step = null;
  stopClock();
}


/** 대결 화면. resumed: 온라인 이어 하기 — 첫 화면 없이 바로 차례로 */
function enterGame(resumed = false) {
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
      <button class="btn small white help-btn2" id="help" aria-label="도움말">?</button>${G.online ? '<button class="btn small white quit-btn" id="quit">나가기</button>' : ''}</div>
    <div class="dock" id="dock">
      <div class="me-row" id="meRow"></div>
      <div class="controls">
        <div class="throw-wrap"><button class="btn main" id="throw">출발</button></div>
        <div class="side"><button class="btn small white skill-btn" id="skillBtn"></button><button class="btn small white" id="investBtn"></button></div>
      </div>
    </div>
    <div class="fx-layer" id="fx"></div>`;
  FX.useLayer($('#fx'));
  useBoard(isLoop(M()) ? M().region : 'map');
  if (isLoop(M())) preloadBuildings();
  Camera.setFollowZoom(isLoop(M()) ? 0.68 : undefined, isLoop(M()));
  Camera.attach($('#board'), $('#cam'), canvasSize());
  $('#throw').onclick = () => onThrow();
  $('#skillBtn').onclick = onSkill;
  $('#investBtn').onclick = openInvest;
  $('#zoom').onclick = () => { Sound.click(); if (G.regionView) showPlayer(current(M())); else showRegion(); };
  $('#help').onclick = () => { if (!G.busy) guide(); };
  if ($('#quit')) $('#quit').onclick = quitOnline;
  $('#mat').onclick = onMapTap;
  drawBoard();
  drawPieces();
  drawMarks();
  drawHud();
  drawControls();
  Camera.follow(nodeXY(ME().node), 0);
  drawZoom();
  if (resumed) loop(); else intro();
}

/** 첫 화면: 누가 누구와, 어디서 출발 */
function intro() {
  const m = M();
  const s = sheet(`
    <span class="kind">${G.online ? `온라인 대결 · 방 ${G.online.code}` : G.run ? `원정 ${G.run.plan.index + 1}/${RUN_STAGES.length} · ${G.run.plan.name}` : G.daily ? '오늘의 대결' : '대결'} · ${areaOf(m).name}${isLoop(m) ? '' : ' 지역'} · ${m.players.length}명</span>
    <h2 style="margin-top:6px">${hhmm(CLOCK.start)} 첫차</h2>
    <div class="vs">${m.players.map((p, i) => `<div class="vs-p ${isMine(p) ? 'me' : ''}" style="--pc:${colorOf(p)}">${character(p.hero, 54, 'cheer')}<b>${isMine(p) ? '나' : nameOf(p)}</b><span>${tileName(p.node)}</span></div>`).join('<i>VS</i>')}</div>
    <p>${isLoop(m) ? `${ringIn(m).intro} · 가운데 <b>적립금 단지</b>는 축제 칸에 서면 통째로<br>` : ''}시작 자금 <b>${(G.run ? ME().money : START_MONEY).toLocaleString()}</b>${G.run && m.players.some((p) => p.money !== ME().money) ? ` · 상대 ${m.players.slice(1).map((p) => p.money.toLocaleString()).join(' · ')}` : ''} · 승리 조건: 상대 <b>파산</b> / <b>${hotsOf(m).length ? `명소역 ${m.hotWin}곳 · ` : ''}${isLoop(m) ? `${m.lineWin}칸 연속` : `한 노선 ${m.lineWin}역`}</b> 독점 / <b>${roundsOf(m)}바퀴 막차</b> 자산 1위</p>
    ${G.run ? `<p class="run-bonus"><b>원정</b> 1등이면 통과 · ${roundsOf(m)}바퀴 · 보너스: ${bonusById(G.run.plan.bonus).text}</p>${G.run.run.relics.length ? `<div class="run-relics">${G.run.run.relics.map((id) => `<span class="relic-chip" title="${relicById(id).desc}">${relicArt(id, 22)}<b>${relicById(id).name}</b></span>`).join('')}</div>` : ''}` : ''}
    <div class="row"><button class="btn white" id="how">도움말</button><button class="btn" id="go">시작</button></div>`);
  s.querySelector('#how').onclick = () => { Sound.click(); guide(() => loop()); };
  s.querySelector('#go').onclick = () => { Sound.click(); closeSheet(); if (!Prefs.seenGuide()) guide(() => loop()); else loop(); };
}

// ── 차례 돌리기 ────────────────────────────────────────────

async function loop() {
  const m = M();
  // 원정: 내가 파산하면 남은 AI 끼리 끝까지 두지 않고 바로 결과
  const done = () => m.phase === 'over' || (G.run && ME().out);
  while (m === M() && !done()) {
    const p = current(m);
    if (isBot(p)) await aiTurn(p); // AI 상대 · 사람이 나가 AI 가 이어받은 자리
    else if (isMine(p)) await humanTurn(p);
    else await remoteTurn(p);
  }
  if (m === M() && done()) await results();
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

/**
 * 내 차례(한 단계씩 — 차례가 이어지면 바깥 loop 가 다시 부른다): 굴리기 전엔 출발·스킬·노선 투자를 기다리고,
 * 달리는 중엔 갈림길을, 명소역에선 고르기를, 거래 제안엔 답을 기다린다.
 * 온라인이면 단계마다 차례 시계가 돌고, 다 되면 AI 가 그 단계를 대신 둔다(auto). 방에서 나에 대한 대신 두기가 먼저 오면 그것을 따른다.
 */
async function humanTurn(p) {
  const m = M();
  // 온라인에서 내가 첫 자리가 아니면 첫 차례에 출발 칸으로 내려선다
  if (G.entered && !G.entered.has(p.id)) await play([{ type: 'turnStart', player: p.id }]);
  let r;
  if (m.phase === 'roll') {
    showPlayer(p);
    if (!p.rest) await turnBanner(p);
    r = await myStep(new Promise((resolve) => { G.wait = resolve; drawControls(); }));
    G.wait = null;
  } else if (m.phase === 'pick') r = await myStep(pickDiePrompt(), 'pick');
  else if (m.phase === 'move') r = await myStep(pickPath(), 'move');
  else if (m.phase === 'choose') r = await myStep(choicePrompt(), 'choose');
  else if (m.phase === 'decide') r = await myStep(offerPrompt(), 'decide');
  else return;
  if (m !== M()) return;
  if (r.time || r.remote) {
    clearPrompts();
    if (r.time) { toast('시간 초과 · 이번 단계는 AI 가 대신 둬요'); await doAct('auto'); } else await takeAct();
    return;
  }
  if (r.kind) await doAct(r.kind, r.v);
}

/** 내 단계 하나를 기다린다 → { kind, v }(내가 골랐다) · { time }(시간 초과) · { remote }(방에서 먼저 온 행동) */
function myStep(prompt, kind) {
  const O = G.online;
  if (!O) return prompt.then((v) => ({ kind, v }));
  const m = M(), p = current(m), phase = m.phase;
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; O.step = null; stopClock(); resolve(r); };
    // 굴리기 전 단계는 투자 · 스킬을 써도 이어진다 — 그 행동을 넣는 동안 시계를 멈췄다가 새로 건다
    const arm = () => {
      const step = { finish, paused: false };
      step.pause = () => { step.paused = true; stopClock(); };
      step.resume = () => { if (!done && m === M() && current(m) === p && m.phase === phase) arm(); };
      O.step = step;
      startClock(p, turnSec(), () => { if (!G.busy && !step.paused) finish({ time: true }); });
      if (O.inbox.length) finish({ remote: true });
    };
    prompt.then((v) => finish({ kind, v }));
    arm();
  });
}

/** 내 고르기 창 · 갈림길 · 거래 카드를 모두 치운다(시간 초과 · 끼어들기) */
function clearPrompts() {
  hideFork(); clearDest(); clearRoute(); closeSheet(); setHint('');
  app.querySelectorAll('.die-pick, .offer-card').forEach((n) => n.remove());
  drawControls();
}

/** AI 차례: 노선 투자 → 스킬 → 굴리기 → 길 → 거래, 빠르게. 사람이 나가 AI 가 이어받은 자리도 */
async function aiTurn(p) {
  const m = M();
  for (const step of aiSteps(m)) {
    if (m !== M()) return;
    if (step.pause) await sleep(step.pause); else await play(step.events);
  }
}

/** 내 행동 하나: 판에 넣고 연출한다. 온라인이면 넣기 전에 방에도 올린다(그동안 차례 시계는 멈춘다) */
async function doAct(a, v) {
  const m = M(), O = G.online;
  if (O) { O.step?.pause(); sendMine(a, v); }
  await play(applyAct(m, { a, v }) || []);
  O?.step?.resume();
}

// ── 온라인 대결: 다른 사람 차례 · 차례 시계 · 심판 ─────────────

/** 차례 제한(초) */
const turnSec = () => G.online?.room.turn || Online.TURN_SEC;
/** 제한 시간이 지나고 이만큼 더 기다린 뒤 심판이 대신 두기를 올린다(그 사람 화면이 조금 늦을 수 있어서) */
const GRACE_MS = 8000;
/** 접속 표시가 이만큼 끊기면 나간 것으로 본다 */
const GONE_MS = 50000;

/** 다른 사람 차례: 그 사람이 올린 행동을 하나 받아 판에 넣는다. 그동안 시계를 돌리고, 내가 심판이면 시간 초과 · 나간 자리를 챙긴다 */
async function remoteTurn(p) {
  const m = M(), O = G.online;
  const key = `${m.round}:${m.turn}`;
  if (O.turnKey !== key) { O.turnKey = key; await play([{ type: 'turnStart', player: p.id }]); }
  if (m !== M()) return;
  setHint(`${nameOf(p)} 차례 · 기다리는 중`);
  const n0 = O.n, owner = O.owners[p.id];
  let deadline = Date.now() + turnSec() * 1000, sent = false;
  startClock(p, turnSec(), () => {});
  // 심판: 나간 자리는 바로, 시간을 넘긴 자리는 조금 더 기다렸다가 대신 두기를 올린다(올린 것도 행동으로 돌아와 모두 같이 넣는다)
  const watch = setInterval(() => {
    if (sent || O.n !== n0 || G.online !== O || !amReferee(p)) return;
    if (isGone(O, owner)) { sent = true; sendMeta('bot'); }
    else if (Date.now() > deadline + GRACE_MS) { sent = true; sendMeta('auto'); }
  }, 1000);
  await takeAct();
  clearInterval(watch);
  stopClock();
}

/** 방에서 다음 행동을 하나 받아 판에 넣는다 */
async function takeAct() {
  const m = M(), O = G.online;
  const a = await nextAct(O);
  if (m !== M() || !a) return;
  if (!actOk(m, a, O.owners)) return; // 차례가 아닌 사람 · 맞지 않는 단계의 행동은 모두 똑같이 건너뛴다
  if (a.h && a.h !== sig(m) && !O.warned) { O.warned = true; console.warn('[online] 판 서명이 다르다', a, sig(m)); toast('판이 어긋났어요 · 다시 맞추는 중'); resync(); return; }
  await play(applyAct(m, a) || []);
}

/** 심판: 차례인 사람을 뺀, 아직 있는 사람 자리 중 가장 앞 — 그 한 기기만 대신 두기를 올린다 */
function amReferee(p) {
  const O = G.online, m = M();
  const ref = m.players.find((q) => q.human && !q.bot && q !== p && !isGone(O, O.owners[q.id]));
  return ref?.id === G.me;
}

/**
 * 그 사람이 나갔나: 「나가기」를 눌렀거나 접속 표시가 GONE_MS 넘게 끊겼다.
 * 접속 표시를 한 번도 못 받은 사람(규칙이 막았거나 아직 안 왔다)은 나간 것으로 보지 않는다 — 그때는 시간 초과만으로 챙긴다
 */
function isGone(O, uid) {
  if (uid === Online.myUid()) return false;
  const s = O.live.get(uid);
  return !!s?.got && (s.left || Date.now() - s.seen > GONE_MS);
}

/** 받은 행동 중 다음 순번 하나(아직 없으면 올 때까지) */
function nextAct(O) {
  return new Promise((resolve) => {
    const take = () => { O.waiter = null; const a = O.inbox.shift(); O.n = a.n + 1; resolve(a); };
    if (O.inbox.length) take(); else O.waiter = take;
    O.cancel = () => { O.waiter = null; resolve(null); };
  });
}

/** 방에서 행동이 왔다: 이미 넣은 것(내가 올린 것)은 넘기고, 나머지는 줄 세운다. 내 단계를 기다리던 중이면 끼어든다 */
function onAct(O, a) {
  O.log[a.n] = a;
  if (a.n < O.n) return;
  O.inbox.push(a);
  O.waiter?.();
  if (O.step && !O.step.paused) O.step.finish({ remote: true });
}

/** 내 행동을 방에 올린다(순번은 바로 차지한다). 심판의 대신 두기가 먼저 그 순번을 가져갔으면 판을 처음부터 다시 맞춘다 */
function sendMine(a, v) {
  const m = M(), O = G.online;
  const rec = { n: O.n++, seat: current(m).id, a, v: v === undefined ? null : v, h: sig(m) };
  O.log[rec.n] = { ...rec, by: Online.myUid() };
  const send = async (tries) => {
    try { await Online.sendAct(O.code, rec); } catch (err) {
      if (G.online !== O) return;
      if (err?.code === 'permission-denied') { toast('늦었어요 · 판을 다시 맞추는 중'); resync(); return; }
      if (tries < 3) { await sleep(800 * (tries + 1)); return send(tries + 1); }
      console.warn('[online] 행동을 못 보냈다', err);
      toast('연결이 끊겨 행동을 못 보냈어요 · 새로고침해 주세요');
    }
  };
  send(0);
}

/** 심판의 대신 두기(auto · bot): 판에 바로 넣지 않고 올리기만 — 서버가 받아 준 것만 돌아와 모두 같이 넣는다(겹치면 늦은 쪽이 거절된다) */
function sendMeta(a) {
  const m = M(), O = G.online;
  Online.sendAct(O.code, { n: O.n, seat: current(m).id, a, v: null, h: sig(m) }).catch((err) => console.warn('[online] 대신 두기 못 올림(먼저 둔 행동이 있다)', err?.code));
}

/** 판을 처음부터 다시 맞춘다(서버의 행동 기록으로) */
async function resync() {
  const O = G.online;
  if (!O) return;
  startOnline(O.code, O.room, true);
}

/** 차례 시계: 남은 초를 판 위에 보이고, 다 되면 onEnd(내 차례면 마지막 5초 째깍) */
function startClock(p, sec, onEnd) {
  stopClock();
  const board = $('#board');
  if (!board) return;
  const el = document.createElement('div');
  el.className = 'turn-clock' + (isMine(p) ? ' me' : '');
  el.style.setProperty('--pc', colorOf(p));
  board.appendChild(el);
  const end = Date.now() + sec * 1000;
  let last = -1;
  const tick = () => {
    const ms = Math.max(0, end - Date.now()), left = Math.ceil(ms / 1000);
    if (left !== last) {
      last = left;
      el.innerHTML = `<b>${left}</b><span>${isMine(p) ? '내 차례' : esc(nameOf(p))}</span><i style="width:${(ms / (sec * 1000)) * 100}%"></i>`;
      el.classList.toggle('hurry', left <= 5);
      if (left <= 5 && left > 0 && isMine(p)) Sound.click();
    }
    if (ms <= 0) onEnd(); // 연출 중이라 못 끝냈으면 다음 째깍에 다시 묻는다
  };
  G.clock = { el, timer: setInterval(tick, 250) };
  tick();
}
function stopClock() {
  if (!G.clock) return;
  clearInterval(G.clock.timer);
  G.clock.el.remove();
  G.clock = null;
}

async function onThrow() {
  const m = M();
  if (G.busy || !m || m.phase !== 'roll' || !isMine(current(m)) || !G.wait) return;
  Sound.unlock();
  hideFork();
  await doAct('roll');
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
  await doAct('skill', target);
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
    info += isLoop(m) ? ` · ${ringIn(m).ahead(p.node, n)}칸` : ` · ${dist(p.node, n)}역`;
    if (n === p.goal) note = `<em class="goal">+${GOAL_BONUS + (heroById(p.hero).goalBonus || 0)}</em>`;
    else if (HOTSPOTS[n]) note = '<em class="hot">명소</em>';
  } else if (id === 'buyout') {
    info = `${nameOf(owner)} 역 · ${LEVEL_NAME[lv]} · 통행료 ${toll}`;
    note = `<em class="price">${buyoutFor(m, n).toLocaleString()}</em>`;
  } else {
    info = `${LEVEL_NAME[lv]} · 통행료 ${toll}`;
    if (id === 'gather') note = `<em class="price">+${rivals.reduce((s, q) => s + Math.min(GATHER_MAX, Math.round(tollFor(m, n, q) * GATHER_RATE)), 0)}</em>`;
    else if (id === 'hype') note = `<em class="price">→ ${toll * 2}</em>`;
    else if (id === 'build') note = `<em class="price">→ ${baseToll(m.owned, { ...m.levels, [n]: MAX_LEVEL }, n)}</em>`;
    else if (id === 'gate') note = `<em class="price">근처 상대 ${rivals.filter((q) => dist(q.node, n) <= 8).length}</em>`;
  }
  const lines = (STATION_LINES[n] || []).map((l) => `<i style="--lc:${LINES[l].color}"></i>`).join('');
  return `<button class="sk-row" data-v="${n}" style="--pc:${owner ? colorOf(owner) : '#FFFDF7'}">
    <span class="sk-lines">${lines}</span><div><b>${hotArt(n, 18) || ''}${tileName(n)}</b><span>${info}</span></div>${note}</button>`;
}

/** 대상 순서: 쓸 만한 것부터 */
function sortTargets(m, p, id, list) {
  const score = (n) => {
    if (id === 'direct') return (n === p.goal ? 1e6 : 0) + (HOTSPOTS[n] ? 1e4 : 0) + (!m.owned[n] ? 1e3 : 0) - (isLoop(m) ? ringIn(m).ahead(p.node, n) : dist(p.node, n));
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
    if (c.kind === 'transfer') {
      const rows = c.options.map((n) => n === p.node
        ? `<button class="warp-row" data-v="${n}" style="--pc:#FFFDF7"><span class="wr-flag">그대로</span><div><b>${n}에 머물기</b><span>환승하지 않음</span></div></button>`
        : `<button class="warp-row" data-v="${n}" style="--pc:${colorOf(p)}">${hotArt(n, 34) || '<span class="wr-flag">랜드마크</span>'}<div><b>${n}</b><span>내 랜드마크 · 통행료 ${baseToll(m.owned, m.levels, n)}${isLoop(m) ? `${ringIn(m).index(n) < ringIn(m).index(p.node) ? ` · ${ringIn(m).payName}!` : ''}` : ` · ${dist(p.node, n)}역`}</span></div></button>`).join('');
      s = sheet(`<span class="kind">${skillArt('build', 22)} 현장소장 · 환승센터</span><h2 style="margin-top:6px">환승할 랜드마크</h2><p>내 랜드마크로 바로${isLoop(m) ? ` · ${ringIn(m).startName}을 넘으면 ${ringIn(m).payName}` : ''}</p><div class="warp-list">${rows}</div>`);
    } else if (c.kind === 'festival') {
      const rows = c.options.map((n) => `<button class="warp-row" data-v="${n}" style="--pc:${colorOf(p)}">${hotArt(n, 34) || '<span class="wr-flag">축제</span>'}<div><b>${n}</b><span>통행료 ${baseToll(m.owned, m.levels, n)} → <i class="good">${baseToll(m.owned, m.levels, n) * 2}</i></span></div></button>`).join('');
      s = sheet(`<span class="kind">${cornerAt(m, c.node)?.name || '팝업 축제'}</span><h2 style="margin-top:6px">축제를 열 내 칸</h2><p>${c.options.length}곳 중 하나 · 통행료 2배(3바퀴)</p><div class="warp-list">${rows}</div>`);
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
        return `<button class="warp-row" data-v="${n}" style="--pc:${o ? colorOf(o) : '#FFFDF7'}">${hotArt(n, 34) || `<span class="wr-flag">${isLoop(m) ? `${ringIn(m).ahead(p.node, n)}칸` : '목적지'}</span>`}<div><b>${tileName(n)}</b><span>${own}${isLoop(m) ? (n === ringIn(m).start ? ` · ${ringIn(m).payName}!` : '') : ` · ${dist(p.node, n)}역`}</span></div>${note}</button>`;
      }).join('');
      s = sheet(isLoop(m) ? `<span class="kind">${cornerAt(m, c.node)?.name || '급행 환승'}</span><h2 style="margin-top:6px">내릴 칸 선택</h2><p>앞 ${c.options.length}칸 중 하나 · ${ringIn(m).startName}을 넘으면 ${ringIn(m).payName}</p><div class="warp-list">${rows}</div>`
        : `<span class="kind">${hotArt('서울역', 22)} 서울역 · KTX 순간이동</span><h2 style="margin-top:6px">도착역 선택</h2><div class="warp-list">${rows}</div>`);
    }
    s.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { Sound.click(); closeSheet(); resolve(b.dataset.v); }; });
  });
}

// ── 거래 제안(내 차례) ─────────────────────────────────────

function offerPrompt() {
  const m = M(), p = current(m), o = m.offer;
  const lines = (STATION_LINES[o.node] || []).map((l) => `<i style="--lc:${LINES[l].color}"></i>`).join('');
  const tour = ringIn(m)?.icons?.[o.node];
  const nextOwned = { ...m.owned, [o.node]: p.id };
  const chain = Math.min(4, links(nextOwned, p.id).at[o.node]?.len || 1);
  const lvAfter = o.kind === 'upgrade' ? o.level : m.levels[o.node] || 1;
  const toll = Math.round(stationPrice(o.node) * 0.3 * LEVEL_MULT[lvAfter] * chain);
  const title = o.kind === 'buy' ? '역 구매' : o.kind === 'upgrade' ? `${LEVEL_NAME[o.level]} 증축` : `${nameOf(playerById(m, o.from))}의 역 인수`;
  const btn = o.kind === 'buy' ? '구매' : o.kind === 'upgrade' ? '증축' : '인수';
  // 도착 안내판이 떠 있으면 칸과 안내판이 같이 보이게(구매 카드 자리만큼 아래를 비운다)
  if (G.land) landFrame([[nodeXY(o.node)[0], nodeXY(o.node)[1] + 150]]);
  else Camera.follow([nodeXY(o.node)[0], nodeXY(o.node)[1] + 110], 300);
  return new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'offer-card kind-' + o.kind;
    card.innerHTML = `
      <div class="oc-sign">${lines}<b>${tileName(o.node)}</b>${HOTSPOTS[o.node] ? `<em class="oc-hot">${hotArt(o.node, 18)} 명소역 · ${HOTSPOTS[o.node].tag}</em>` : tour ? `<em class="oc-hot">${tourArt(tour, 18)} ${ringIn(m).groupOf[o.node]}</em>` : ''}</div>
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
  if (G.busy || !isMine(current(m)) || m.phase !== 'roll') { Sound.deny(); return; }
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
      await doAct('invest', b.dataset.n);
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
  const threats = monoThreats(m).map((t) => ({ node: t.node, color: colorOf(playerById(m, t.player)) }));
  // 통행료 팻말: 내가 서면 낼 값(내 칸이면 남이 낼 값)
  const tolls = {};
  if (isLoop(m)) {
    const me = ME();
    for (const n of Object.keys(m.owned)) {
      const payer = m.owned[n] !== me.id ? me : alive(m).find((q) => q.id !== me.id);
      tolls[n] = payer ? tollFor(m, n, payer) : baseToll(m.owned, m.levels, n);
    }
  }
  $('#mat').innerHTML = boardSvg({ owner, level: m.levels, links: linkEdges, region: areaOf(m).set, threats, tolls });
}

function pieceEl(pid) {
  let el = $('#layer').querySelector(`[data-piece="${pid}"]`);
  if (!el) {
    const p = playerById(M(), pid);
    el = document.createElement('div');
    el.className = 'piece' + (isMine(p) ? ' me' : '');
    el.dataset.piece = pid;
    el.style.setProperty('--pc', colorOf(p));
    const s = pieceSize();
    el.style.width = el.style.height = s + 'px';
    el.innerHTML = `<span class="ring"></span>${character(p.hero)}<span class="tag">${isMine(p) ? '나' : nameOf(p)}</span>`;
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
    // 아직 첫 차례가 안 온 사람은 출발 칸에 세우지 않는다(차례가 오면 그때 내려선다)
    if (p.out || (G.entered && !G.entered.has(p.id) && current(m) !== p)) { el.style.display = 'none'; continue; }
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
    el.className = 'goal-flag' + (isMine(p) ? ' me' : '');
    el.dataset.player = p.id;
    el.style.setProperty('--pc', colorOf(p));
    const [x, y] = nodeXY(p.goal);
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.zIndex = depth(y) + 5;
    el.innerHTML = `${isMine(p) ? '<i class="ring"></i><i class="ring r2"></i>' : ''}<span class="gf">${isMine(p) ? '내 목적지' : character(p.hero, 22)}</span>`;
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
    <div class="pl ${current(m) === p && m.phase !== 'over' ? 'turn' : ''} ${p.out ? 'out' : ''} ${isMine(p) ? 'me' : ''}" data-player="${p.id}" style="--pc:${colorOf(p)}">
      <span class="pa">${character(p.hero, 34)}${p.out ? '' : hudCharge(p)}</span>
      <div class="pi"><b>${isMine(p) ? '나' : nameOf(p)}${p.human && p.bot ? '<small class="pl-bot">AI</small>' : ''}</b><span class="money">${coin(13)} <i class="mv">${p.out ? '파산' : p.money.toLocaleString()}</i></span><em>역 ${stationsOf(m, p).length}${monoNote(m, p)}${p.coupon ? ' 면제' : ''}</em></div>
    </div>`).join('');
  // 돈이 바뀌었으면 숫자가 차오르고(늘면 초록, 줄면 빨강) 반짝인다
  G.hudMoney ||= {};
  for (const p of m.players) {
    const prev = G.hudMoney[p.id];
    if (prev != null && prev !== p.money && !p.out) {
      const el = $(`#players [data-player="${p.id}"] .money`);
      if (el) { countUp(el.querySelector('.mv'), prev, p.money); el.classList.add(p.money > prev ? 'gain' : 'loss'); moneyDelta(el, p.money - prev); }
    }
    G.hudMoney[p.id] = p.money;
  }
  drawClock();
  drawPot();
}

/** 판 가운데 적립금 단지 위 금액(고리 판). 바뀌면 톡 튄다 */
function drawPot() {
  const m = M(), cs = centerSpots(), layer = $('#layer');
  if (!m || !cs || !layer) return;
  let tag = layer.querySelector('.pot-tag');
  if (!tag) {
    tag = document.createElement('div');
    tag.className = 'pot-tag';
    tag.style.left = cs.pot[0] + 'px'; tag.style.top = cs.pot[1] - 92 + 'px';
    tag.style.zIndex = depth(cs.pot[1]) + 30;
    layer.appendChild(tag);
  }
  const v = m.pot || 0;
  if (tag.dataset.v !== String(v)) {
    const was = tag.dataset.v != null;
    tag.dataset.v = v;
    tag.innerHTML = `<small>적립금</small>${v.toLocaleString()}`;
    if (was) tween(tag, [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.35)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 360, easing: 'cubic-bezier(.3,.7,.3,1.4)' });
  }
}
/** 판 가운데 무대의 한 자리를 앱 좌표로(카메라 반영) */
const centerApp = (k) => { const cs = centerSpots(); return cs ? toApp(Camera.toView(cs[k])) : null; };

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
  const was = G.clockPos, now = pos(m.clock);
  G.clockPos = now;
  $('#clock').innerHTML = `<span class="now">${hhmm(m.clock)}</span>
    <span class="track">${seg(CLOCK.last, m.end, 'last')}
      <i class="done" style="width:${pos(m.clock)}%"></i><b class="hand" style="left:${pos(m.clock)}%"></b></span>
    ${t === 'last' ? `<span class="band time-last">${TIME_NAME.last}</span>` : ''}<span class="left">${Math.min(m.round, roundsOf(m))} / ${roundsOf(m)}바퀴</span>`;
  // 바퀴가 넘어가면 시곗바늘이 미끄러져 가고 시각이 톡 튄다
  if (was != null && was !== now) {
    const ms = { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1.2)' };
    tween($('#clock .hand'), [{ left: was + '%' }, { left: now + '%' }], ms);
    tween($('#clock .done'), [{ width: was + '%' }, { width: now + '%' }], ms);
    tween($('#clock .now'), [{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-4deg)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 420 });
  }
}

/** 돈이 바뀌면 플레이어 판 위로 +/− 숫자가 떠오른다 */
function moneyDelta(el, d) {
  const [x, y] = appSpot(el);
  const t = document.createElement('div');
  t.className = 'fx-delta ' + (d > 0 ? 'gain' : 'loss');
  t.textContent = (d > 0 ? '+' : '−') + Math.abs(d).toLocaleString();
  t.style.left = x + 'px'; t.style.top = y + 'px';
  $('#fx').appendChild(t);
  tween(t, [{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 }, { transform: 'translate(-50%,-120%) scale(1.15)', opacity: 1, offset: 0.22 }, { transform: 'translate(-50%,-150%) scale(1)', opacity: 1, offset: 0.6 },
    { transform: 'translate(-50%,-230%) scale(.95)', opacity: 0 }], { duration: 1100, easing: 'ease-out' }).then(() => t.remove());
}

/** 순환선 칸이 눌렸다 튀어 오른다(말이 밟을 때 · 땅이 바뀔 때). 노선도에는 칸이 없어 그냥 넘어간다 */
function pressTile(n, k = 1) {
  const mat = $('#mat');
  if (!mat) return;
  // 칸(.lt)은 눕힌 판 좌표라 (d, d) 로 밀어야 화면에서 곧장 아래로 눌린다 · 서 있는 것(.lb)은 화면 좌표
  const press = (el, dx, dy) => el.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, ${dy}px)`, offset: 0.3 }, { transform: `translate(${-dx * 0.4}px, ${-dy * 0.4}px)`, offset: 0.65 }, { transform: 'translate(0, 0)' }], { duration: 260 + 60 * k, easing: 'ease-out' });
  mat.querySelectorAll(`.lt[data-n="${n}"]`).forEach((el) => press(el, 6 * k, 6 * k));
  mat.querySelectorAll(`.lb[data-n="${n}"]`).forEach((el) => press(el, 0, 5 * k));
}

function drawControls() {
  const m = M();
  const me = ME();
  const mine = current(m) === me && m.phase === 'roll' && !G.busy && !!G.wait;
  const tb = $('#throw');
  tb.disabled = !mine;
  const who = current(m);
  tb.innerHTML = mine ? `출발${me.dash ? `<small>+${me.dash}역</small>` : '<small>주사위 2개</small>'}`
    : isMine(who) ? `내 차례<small>${m.phase === 'pick' ? '주사위 선택 중' : m.phase === 'move' ? '방향 선택 중' : '이동 중'}</small>` : `${nameOf(who)} 차례<small>${hhmm(m.clock)}</small>`;
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
    const r = ringIn(m), left = r.ahead(me.node, r.start) || 32;
    $('#meRow').innerHTML = `<span class="pa" style="--pc:${h.color}">${character(me.hero, 30)}</span>
      <div class="me-goal"><span>다음 ${r.payName}</span><b>${r.startName}까지 ${left}칸</b><em>+${SALARY + (h.loop?.goalBonus ?? 0)}</em></div>`;
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
/** 감옥(더블 연속) 칸 이름 — 고리 판의 미로 모서리(환승 미로 · 휴게소 · 환승 라운지), 노선도 판은 '휴식' */
function jailName() {
  const r = ringIn(M()), n = r && Object.keys(r.corners).find((k) => r.corners[k].kind === 'maze');
  return n ? r.corners[n].name : '휴식';
}

/** 받침에 맞춰 '로' · '으로'(ㄹ 받침은 '로') */
function ro(word) {
  const c = word.charCodeAt(word.length - 1) - 0xac00, jong = c >= 0 && c < 11172 ? c % 28 : 0;
  return word + (jong && jong !== 8 ? '으로' : '로');
}

/** 플레이어 판(위 HUD)의 자리 */
function panelSpot(pid) {
  const el = $(`#players [data-player="${pid}"]`);
  if (!el) return [app.clientWidth / 2, 40];
  const ab = app.getBoundingClientRect(), b = el.getBoundingClientRect(), k = b.width / el.offsetWidth;
  return [(b.left - ab.left) / k + el.offsetWidth / 2, (b.top - ab.top) / k + el.offsetHeight / 2];
}

/**
 * 칸 하나를 사람(p) 눈으로 풀어 쓴 것: { kind, color, title, sub, rows: [[이름, 값, 강조]], note }
 * 판 가운데 도착 칸 안내판이 쓴다
 */
function tileFacts(n, p = ME()) {
  const m = M(), ring = ringIn(m);
  const cn = cornerAt(m, n);
  if (cn) return { kind: '모서리 칸', color: '#22201D', title: cn.name, sub: cn.name === n ? '' : n, rows: [], note: cn.short };
  if (isChance(n)) return { kind: '찬스', color: '#E39A1E', title: ring?.chanceName || '찬스', sub: '', rows: [], note: '찬스 카드를 한 장 뽑아요 — 좋은 일일 수도, 나쁜 일일 수도' };
  const o = m.owned[n] ? playerById(m, m.owned[n]) : null, lv = m.levels[n] || 0;
  const color = ring?.colorOf?.(n) || LINES[(STATION_LINES[n] || [])[0]]?.color || '#8A8173';
  const sub = (STATION_LINES[n] || []).map((l) => LINES[l].name).join('·') || ring?.groupOf?.[n] || '';
  const hot = HOTSPOTS[n] ? { tag: HOTSPOTS[n].tag, desc: HOTSPOTS[n].desc } : null;
  const title = tileName(n);
  if (!o) {
    return { kind: hot ? `빈 칸 · 명소 ${hot.tag}` : '빈 칸', color, title, sub, rows: [['값', priceFor(m, n)], ['통행료', baseToll({ [n]: 'x' }, { [n]: 1 }, n)]],
      note: hot ? hot.desc : '사면 내 칸 — 남이 서면 통행료를 받아요' };
  }
  const mine = o === p, land = lv >= MAX_LEVEL;
  const rows = [['단계', LEVEL_NAME[lv]], ['통행료', mine ? baseToll(m.owned, m.levels, n) : p.coupon ? '면제' : tollFor(m, n, p), !mine]];
  if (!mine && !land) rows.push(['인수', takeoverFor(m, n, p)]);
  const note = mine ? (land ? '랜드마크 — 아무도 못 뺏어요' : `증축하면 통행료가 올라요 · 증축 ${upgradeFor(m, n, p)}`)
    : land ? '랜드마크라 인수할 수 없어요' : '통행료를 내고, 돈이 되면 인수할 수 있어요';
  return { kind: mine ? '내 칸' : `${nameOf(o)} 칸`, owner: colorOf(o), color, title, sub, rows, note: hot ? `${note} · 명소 ${hot.tag}` : note };
}

/** 도착 칸 안내: 판 가운데(로고 간판 자리)에 칸 설명판 + 그 칸에 위치 표시 + 둘을 잇는 점선 */
async function showLanding(pid, n) {
  const m = M(), cs = centerSpots(), layer = $('#layer');
  if (!m || !cs || !layer) return;
  clearLanding();
  const p = playerById(m, pid), pc = colorOf(p);
  const [x, y] = nodeXY(n), [sx, sy] = cs.sign;
  // 위치 표시: 바닥 고리 + 머리 위 화살표
  const mark = document.createElement('div');
  mark.className = 'land-mark';
  mark.style.left = x + 'px'; mark.style.top = y + 'px'; mark.style.setProperty('--pc', pc);
  mark.style.setProperty('--lift', pieceSize() * 1.6 + 'px');
  mark.innerHTML = '<i class="lm-ring"></i><i class="lm-pin"></i>';
  // 안내판 → 칸 점선(안내판 아래 가운데에서 칸으로 휘어 내려간다)
  const link = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  link.setAttribute('class', 'land-link');
  const ax = sx, ay = sy + 70, mx = (ax + x) / 2, my = Math.min(ay, y) - 60;
  link.innerHTML = `<path d="M${ax} ${ay} Q${mx} ${my} ${x} ${y - 6}" fill="none" stroke="#22201D" stroke-width="9" stroke-linecap="round" opacity=".35"/>`
    + `<path d="M${ax} ${ay} Q${mx} ${my} ${x} ${y - 6}" fill="none" stroke="${pc}" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 12"/>`;
  // 안내판
  const card = document.createElement('div');
  card.className = 'land-info';
  card.style.left = sx + 'px'; card.style.top = sy + 'px'; card.style.zIndex = depth(sy) + 40;
  card.style.setProperty('--pc', pc);
  fillLanding(card, p, n);
  layer.append(link, mark, card);
  $('#mat')?.classList.add('landing');
  tween(card, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
  // 카메라: 도착 칸과 판 가운데 안내판이 한 화면에
  G.land = { n, pid, x, y, sx, sy, w: card.offsetWidth, h: card.offsetHeight };
  landFrame([], isMine(p) ? 380 : 260);
  await sleep(isMine(p) ? 520 : 320);
}
/** 안내판 내용(칸을 사거나 올리면 다시 채운다) */
function fillLanding(card, p, n) {
  const f = tileFacts(n, p);
  card.style.setProperty('--tc', f.color);
  card.innerHTML = `<div class="li-top"><span class="li-who">${character(p.hero, 30)}<b>${isMine(p) ? '나' : nameOf(p)}</b> 도착</span><span class="li-kind"${f.owner ? ` style="--oc:${f.owner}"` : ''}>${f.kind}</span></div>`
    + `<div class="li-title">${f.title}${f.sub ? `<small>${f.sub}</small>` : ''}</div>`
    + (f.rows.length ? `<div class="li-rows">${f.rows.map(([k, v, bad]) => `<span><i>${k}</i><b class="${bad ? 'bad' : ''}">${typeof v === 'number' ? v.toLocaleString() : v}</b></span>`).join('')}</div>` : '')
    + `<p class="li-note">${f.note}</p>`;
}
/** 도착 칸이 바뀌었으면(구매 · 증축 · 인수) 안내판을 새로 채운다 */
function refreshLanding(n) {
  const card = $('#layer .land-info'), L = G.land;
  if (!card || !L || L.n !== n) return;
  fillLanding(card, playerById(M(), L.pid), n);
  tween(card, [{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.06)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1.4)' });
}
/** 도착 칸 + 안내판이 다 보이게. 안내판은 멀리 볼수록 커지므로(글자가 읽히게) 배율을 몇 번 맞춰 본다 */
function landFrame(extra = [], ms = 300) {
  const L = G.land;
  if (!L) return;
  for (let k = 0; k < 3; k++) {
    const z = Math.max(1, 0.8 / Camera.scale()), hw = (L.w / 2) * z + 14, hh = (L.h / 2) * z + 14;
    Camera.frame([[L.x, L.y - 50], [L.sx - hw, L.sy - hh], [L.sx + hw, L.sy + hh], ...extra], { maxZoom: 0.8, minZoom: 0.2, pad: 36, ms });
  }
}
function clearLanding() {
  const layer = $('#layer');
  layer?.querySelectorAll('.land-info, .land-mark, .land-link').forEach((el) => el.remove());
  $('#mat')?.classList.remove('landing');
  G.land = null;
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
  const cn = cornerAt(m, best);
  if (cn) { toast(`${cn.name === best ? cn.name : `${best} · ${cn.name}`}: ${cn.short}`); return; }
  const me = ME(), o = m.owned[best] ? playerById(m, m.owned[best]) : null;
  // 노선도 역은 호선, 관광 맵 칸은 구역
  const lines = (STATION_LINES[best] || []).map((l) => LINES[l].name).join('·') || ringIn(m)?.groupOf?.[best] || '';
  const hot = HOTSPOTS[best] ? ` · 명소역 ${HOTSPOTS[best].tag}: ${HOTSPOTS[best].desc}` : '';
  const name = tileName(best);
  const text = isChance(best) ? `${ringIn(m)?.chanceName || '찬스'} 칸 · 찬스 카드`
    : o ? `${name}(${lines}) · ${isMine(o) ? '내' : nameOf(o)} ${LEVEL_NAME[m.levels[best]]} · 통행료 ${o === me ? baseToll(m.owned, m.levels, best) : tollFor(m, best, me)}`
      : `${name}(${lines}) · 빈 칸 · ${stationPrice(best)}`;
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
  build: '<path d="M8 32v5M32 32v5" stroke="#22201D" stroke-width="3" stroke-linecap="round"/><rect x="4" y="24" width="32" height="8" rx="2" fill="#FFFDF7" stroke="#22201D" stroke-width="2.6"/><path d="M11 24l-4 8M19 24l-4 8M27 24l-4 8M35 24l-4 8" stroke="#F28C28" stroke-width="3.4"/><rect x="4" y="24" width="32" height="8" rx="2" fill="none" stroke="#22201D" stroke-width="2.6"/><path d="M9 19a11 11 0 0 1 22 0z" fill="#F4BF2A" stroke="#22201D" stroke-width="2.6" stroke-linejoin="round"/><rect x="5" y="18" width="30" height="4" rx="2" fill="#F4BF2A" stroke="#22201D" stroke-width="2.6"/>',
  opening: '<path d="M4 16 Q20 22 36 16" fill="none" stroke="#22201D" stroke-width="7" stroke-linecap="round"/><path d="M4 16 Q20 22 36 16" fill="none" stroke="#E0533D" stroke-width="4" stroke-linecap="round"/><path d="M20 19l-7 14 5-2 2 5zM20 19l7 14-5-2-2 5z" fill="#E0533D" stroke="#22201D" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="19" r="4.5" fill="#F7C94A" stroke="#22201D" stroke-width="2.4"/>',
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
  festival: '<i class="spark k1">✦</i><i class="spark k2">✦</i><i class="spark k3">✦</i>',
  build: '<i class="dust"></i>',
  opening: '<i class="spark k1">✦</i><i class="spark k2">✦</i><i class="spark k3">✦</i>'
};
const INC_TAG = { fire: (i) => `화재 ~${hhmm(i.until)}`, delay: () => '신호 장애', crowd: () => '인파 +100', busk: () => '버스킹', gate: (i) => (i.once ? '통제 · 1명' : `통제 ~${hhmm(i.until)}`), hype: (i) => `떡상 ×${i.tollX || 2} ~${hhmm(i.until)}`, festival: (i) => `축제 ×2 ~${hhmm(i.until)}`, build: (i) => `공사 ~${hhmm(i.until)}`, opening: (i) => `개통 ×2 ~${hhmm(i.until)}` };

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
async function drawCard({ tone, deck, title, short, art, place = null, to = null, quick = false, from = null }) {
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
  // 카드 더미(판 가운데)가 보이면 거기서, 아니면 화면 오른쪽 위에서 날아온다
  const [sx, sy] = from ? [from[0] - W / 2, from[1] - H / 2] : [W / 2 - 30, -H / 2 + 50];
  Sound.whoosh();
  await tween(card, [
    { transform: `translate(${sx}px, ${sy}px) scale(.18) rotate(28deg)`, opacity: 0 },
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
  build: { me: 0, own: { 2: 'me', 4: 'me' }, level: { 2: 1, 4: 3 }, rivals: [3], steps: [
    ['공사할 내 역 고르기', (d) => d.pick(2)],
    ['착공! 펜스를 치고 공사 시작', async (d) => { await SFX.construct(d.layer, d.at(2), { s: DEMO_S, z: 300 }); d.mark(2, 'build'); }],
    ['공사 중엔 상대가 서도 통행료 0', async (d) => { await d.walk(d.r[0], [2]); await SFX.word(d.layer, d.top(2), '통행료 0', { color: '#E39A1E', s: DEMO_S }); }],
    ['공사가 끝나면 랜드마크로 개통 · 1바퀴 통행료 2배', async (d) => { d.layer.querySelectorAll('.dm-mark').forEach((x) => x.remove()); await SFX.ribbon(d.layer, d.at(2), { s: DEMO_S, z: 300 }); d.level(2, 2); }],
    ['고유 능력 환승센터: 내 랜드마크에 서면 다른 랜드마크로', async (d) => { await d.walk(d.me, [1, 2]); await d.ride(2, 4); }]
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
/** 미션 · 원정 보너스 목표에 쓰는 판 기록(세는 기준은 core/expedition 의 tally) */
function countForMissions(e) {
  if (G.stats && M()) tally(G.stats, e, ME().id);
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

const isMe = (pid) => isMine(playerById(M(), pid));
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
  clearLanding();
  const el = pieceEl(pid);
  const fast = quick(pid);
  let prev = nodeXY(from);
  drawDest([path[path.length - 1]], playerById(M(), pid));
  act(el, 'walk');
  // 동시 배달: 상자를 이고 초록 잔상을 남기며 달린다
  const load = G.combo?.pid === pid ? G.combo.boxes : null;
  if (load) el.classList.add('combo');
  // 남은 칸 수가 머리 위에서 줄어든다(두 칸 이상일 때)
  const n = path.length, s = pieceSize();
  const left = n > 1 ? document.createElement('div') : null;
  if (left) { left.className = 'step-left'; left.style.setProperty('--pc', colorOf(playerById(M(), pid))); $('#layer').appendChild(left); }
  const showLeft = (at, k) => {
    if (!left) return;
    left.textContent = n - k;
    left.style.left = at[0] + 'px'; left.style.top = at[1] - s * 1.62 + 'px'; left.style.zIndex = depth(at[1]) + 95;
    tween(left, [{ transform: 'translate(-50%,-50%) scale(1.45)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 200, easing: 'cubic-bezier(.3,.7,.3,1.4)', fill: 'forwards' });
  };
  // 출발은 천천히, 가운데는 빠르게, 마지막 칸은 크게 뛰어 쿵
  const pace = (k) => (n <= 2 ? 1 : k === 0 ? 1.2 : k === n - 1 ? 1.35 : 0.85);
  showLeft(prev, 0);
  for (let k = 0; k < n; k++) {
    const to = nodeXY(path[k]), last = k === n - 1;
    Camera.follow(to, fast ? 160 : 220);
    face(el, to[0] - prev[0]);
    place(el, path[k]);
    if (load) SFX.carry(load, to, s);
    if (left) { left.style.left = to[0] + 'px'; left.style.top = to[1] - s * 1.62 + 'px'; }
    await hop(el, prev, to, { height: last ? 34 : 24, duration: (fast ? 120 : 170) * pace(k) });
    Sound.step(k);
    pressTile(path[k], last ? 1.4 : 0.55);
    if (!last) showLeft(to, k + 1);
    prev = to;
  }
  left?.remove();
  act(el, 'idle');
  clearDest();
  const endAt = nodeApp(path[n - 1]);
  FX.dust(...endAt, fast ? 5 : 8);
  if (!fast) FX.ring(endAt[0], endAt[1], colorOf(playerById(M(), pid)));
  squish(el, 0.72);
  if (load) {
    el.classList.remove('combo');
    G.combo = null;
    SFX.word($('#layer'), [prev[0], prev[1] - pieceSize() * 1.9], '배달 완료!', { color: '#4C9A3A', s: pieceSize(), z: depth(prev[1]) + 90 });
    load.forEach((b) => tween(b, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%,-50%) translateY(-20px)' }], { duration: 300, fill: 'forwards' }).then(() => b.remove()));
  }
}

/** 두 역을 잇는 같은 호선의 길(직통 열차가 지나갈 역들) */
function linePath(from, to) {
  const r = M() && ringIn(M());
  if (r) {
    const k = r.ahead(from, to);
    return { path: [from, ...r.forward(from, k || 1)], line: 2, color: r.lineColor };
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
    clearLanding();
    const first = G.entered && !G.entered.has(p.id);
    G.entered?.add(p.id);
    drawPieces(); drawHud();
    showPlayer(p);
    // 첫 차례: 출발 칸에 위에서 톡 내려선다
    if (first) { const pe = pieceEl(p.id); tween(pe, [{ transform: 'translateY(-60px) scale(.6)', opacity: 0 }, { transform: 'translateY(0) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1.3)' }); }
    setHint(`${nameOf(p)} 차례`);
    // 차례가 온 사람: 플레이어 판이 톡 튀어나오고 말이 제자리에서 한 번 뛴다
    const card = $(`#players [data-player="${p.id}"]`);
    if (card) tween(card, [{ transform: 'translateX(-10px) scale(.96)' }, { transform: 'translateX(4px) translateY(-2px) scale(1.05)', offset: 0.55 }, { transform: 'translateY(-2px) scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
    const pe = pieceEl(p.id);
    if (pe.style.display !== 'none') { act(pe, 'cheer', 600); squish(pe, 0.78); }
    await sleep(300);
  },
  async turn(e) { drawPieces(); drawHud(); },
  // 온라인: 시간 초과로 AI 가 한 단계를 대신 뒀다 · 사람이 나가(또는 시간 초과가 이어져) AI 가 끝까지 이어받는다
  async autoStep(e) {
    const p = playerById(M(), e.player);
    if (!isMine(p)) toast(`${nameOf(p)} 시간 초과 · AI 가 대신 둬요${e.count >= AUTO_LIMIT - 1 && e.count < AUTO_LIMIT ? ' (한 번 더면 AI 로)' : ''}`);
    else if (e.count === AUTO_LIMIT - 1) toast(`시간 초과 ${e.count}번 · 한 번 더면 AI 가 끝까지 이어받아요`);
  },
  async botTakeover(e) {
    const p = playerById(M(), e.player);
    const why = e.why === 'left' ? '나갔어요' : `시간 초과 ${AUTO_LIMIT}번`;
    toast(isMine(p) ? `${why} · 내 자리는 AI 가 이어받아요` : `${nameOf(p)} ${why} · AI 가 이어받아요`);
    drawHud(); drawControls();
    await sleep(400);
  },
  async roll(e) {
    const p = playerById(M(), e.player);
    clearLanding();
    if (isMine(p)) {
      const cs = centerSpots();
      if (cs) { Camera.follow(cs.tray, 260); await sleep(280); }
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
      stampText(`${e.rolls[0].label} · ${e.rolls[1].label}`, '', M().pending?.combo ? '동시 배달 · 합도 가능' : e.rolls[0].face === e.rolls[1].face ? '더블!' : '하나를 고르세요');
      await sleep(250);
    } else Sound.clatter();
  },
  /** 더블: 그 눈으로 가고 한 번 더 — 한 번만 더 나오면 감옥이라고 미리 알린다 */
  async double(e) {
    const p = playerById(M(), e.player);
    Sound.big();
    if (isMine(p)) buzz(30);
    G.doubleNote = e.count >= DOUBLE_JAIL - 1 ? `더블 ${e.count}번 · 한 번 더 나오면 ${ringIn(M()) ? `${jailName()}행` : '한 턴 휴식'}!` : '더블 · 이동 뒤 한 번 더';
    stampText(e.count > 1 ? `더블 ${e.count}번!` : '더블!', 'yellow', G.doubleNote);
    await sleep(isMine(p) ? 700 : 450);
  },
  /** 더블 연속: 감옥(환승 미로)으로 끌려가 한 턴 쉰다 */
  async jail(e) {
    const p = playerById(M(), e.player);
    G.doubleNote = null;
    Sound.horn(); flash(app);
    if (isMine(p)) buzz([40, 60, 40]);
    stampText(`더블 ${e.count}번!`, 'ink', e.to !== e.from ? `${ro(jailName())} · 한 턴 쉬기` : '그 자리에서 한 턴 쉬기');
    await sleep(isMine(p) ? 900 : 600);
    if (e.to !== e.from) await HANDLERS.warp({ player: e.player, from: e.from, to: e.to, by: 'jail' });
    act(pieceEl(p.id), 'sad', 900);
    await sleep(300);
  },
  async die(e) {
    const p = playerById(M(), e.player);
    const sub = e.fly ? `×2 · 총 ${e.steps}역` : e.dash ? `+${e.dash} · 총 ${e.steps}역` : G.doubleNote || '';
    G.doubleNote = null;
    if (isMine(p)) { stampText(e.roll.label + '!', e.roll.bonus ? 'yellow' : '', sub); await sleep(200); }
    else { stampText(`${nameOf(p)} ${e.roll.label}`, 'ink opp', sub); await sleep(300); }
  },
  async rest(e) { toast(`${isMe(e.player) ? '나' : nameOf(playerById(M(), e.player))} — 한 턴 휴식`); await sleep(700); },
  async stuck(e) { toast('길이 막혀 이동 불가'); await sleep(600); },
  async move(e) { await travel(e.player, e.from, e.path); await showLanding(e.player, e.path[e.path.length - 1]); },
  async goal(e) {
    const p = playerById(M(), e.player);
    const at = nodeApp(e.node);
    Sound.home();
    if (isMine(p)) buzz(30);
    FX.confetti(at[0], at[1] - 30, isMine(p) ? 34 : 14);
    FX.pow(at[0], at[1] - 70, `목적지 도착 +${e.bonus}`, colorOf(p), '#FFFDF7', -5);
    await moneyFly(at, panelSpot(p.id), e.bonus);
    bump(p.id);
    drawMarks();
    if (isMine(p)) toast(`새 목적지 ${e.next} (${dist(p.node, e.next)}역)`);
    await sleep(isMine(p) ? 500 : 200);
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
    const label = e.why === 'toll' ? `통행료 −${e.amount}` : e.why === 'pass' ? `통과 요금 −${e.amount}` : e.why === 'fine' ? `벌금 −${e.amount}` : e.why === 'fashion' ? `패션 거리 −${e.amount}` : e.why === 'transfuse' ? `수혈 −${e.amount}` : e.why === 'rest' ? `이용료 −${e.amount}` : e.why === 'repair' ? `수리비 −${e.amount}` : `−${e.amount}`;
    if (e.why === 'toll' && e.amount >= 250) await bigHit(`통행료 −${e.amount.toLocaleString()}`, to ? colorOf(to) : '#E0533D');
    if (e.why === 'toll') { pressTile(node, 1.2); FX.ring(at[0], at[1], to ? colorOf(to) : '#E0533D'); Sound.penalty(); act(pieceEl(p.id), 'sad', 900); if (to) act(pieceEl(to.id), 'cheer', 900); if (isMine(p) || isMine(to)) buzz(isMine(p) ? [40, 30, 40] : 30); }
    else Sound.coin();
    FX.pow(at[0], at[1] - (e.why === 'pass' ? 50 : 70), label, to ? colorOf(to) : '#6E6A5E', '#FFFDF7', e.why === 'pass' ? 4 : -6);
    if (e.why === 'toll') shake($(`#players [data-player="${p.id}"]`), 6, 300);
    await moneyFly(panelSpot(p.id), to ? panelSpot(to.id) : e.pot != null ? centerApp('pot') || [app.clientWidth / 2, -40] : [app.clientWidth / 2, -40], e.amount);
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
    toast(`${isMine(p) ? '나' : nameOf(p)} · ${e.node} ${e.aid ? '현금화' : '매각'} +${e.amount}`);
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
    await drawCard({ tone: 'bad', deck: '파산', title: `${isMine(p) ? '나' : nameOf(p)} 파산!`, short: `${e.place}등 · 보유 역 모두 반납`, art: character(p.hero, 96, 'sad') });
    drawMarks();
  },
  async buy(e) { if (isMe(e.player)) buzz(20); await estateFx(e, '구매!', Sound.buy); refreshLanding(e.node); },
  async upgrade(e) {
    if (e.opened) {
      // 착공한 역이 개통: 테이프 커팅
      Camera.follow(nodeXY(e.node), 260); await sleep(240);
      drawBoard();
      await SFX.ribbon($('#layer'), nodeXY(e.node), sfxAt(e.node));
      if (isMe(e.player)) await bigHit('랜드마크 개통!', '#E39A1E');
      await estateFx(e, '개통!', Sound.big);
      return;
    }
    if (e.free) { Camera.follow(nodeXY(e.node), 260); await sleep(240); await SFX.bolt($('#layer'), nodeXY(e.node), sfxAt(e.node)); }
    if (e.level >= MAX_LEVEL && isMe(e.player)) await bigHit('랜드마크!', '#F2B33D');
    await estateFx(e, e.level >= MAX_LEVEL ? '랜드마크!' : e.free ? '무료 증축!' : '증축!', Sound.big);
    refreshLanding(e.node);
  },
  async takeover(e) {
    if (e.buyout) { Camera.follow(nodeXY(e.node), 260); await sleep(240); await SFX.gavel($('#layer'), nodeXY(e.node), sfxAt(e.node)); }
    flash(app);
    await estateFx(e, e.buyout ? '강제 매수!' : '인수!', Sound.capture);
    refreshLanding(e.node);
  },
  async pass() {},
  async offer() {},
  async chance(e) {
    const p = playerById(M(), e.player);
    await drawCard({ tone: e.good ? 'good' : 'bad', deck: '찬스 카드', title: e.name, short: e.short, art: character(p.hero, 96, e.good ? 'cheer' : 'sad'), quick: !isMine(p), from: centerApp('deck') });
  },
  async cash(e) {
    const p = playerById(M(), e.player);
    const at = e.node ? nodeApp(e.node) : panelSpot(p.id);
    if (e.why === 'pot') {
      const from = centerApp('pot') || at;
      Sound.big(); buzz(30);
      FX.confetti(from[0], from[1] - 40, 22);
      FX.pow(at[0], at[1] - 70, `적립금 +${e.amount.toLocaleString()}`, '#C9822E', '#FFFDF7', -5);
      drawPot();
      await moneyFly(from, panelSpot(p.id), Math.max(e.amount, 200));
      bump(p.id); drawHud();
      await sleep(200);
      return;
    }
    if (e.why === 'salary') {
      Sound.home();
      FX.confetti(at[0], at[1] - 30, isMine(p) ? 24 : 10);
      const r = ringIn(M());
      FX.pow(at[0], at[1] - 70, `${e.landed ? `${r.startName} 도착! ` : ''}${r.payName} +${e.amount}`, '#E0533D', '#FFFDF7', -5);
      if (isMine(p)) buzz(25);
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
    if (e.kind === 'build' || e.kind === 'opening') {
      Camera.follow(nodeXY(e.node), 300);
      await sleep(e.kind === 'build' ? 300 : 120);
      if (e.kind === 'build') await SFX.construct($('#layer'), nodeXY(e.node), sfxAt(e.node));
      const el = addIncident(e);
      const [x, y] = nodeApp(e.node);
      FX.ring(x, y, '#E39A1E');
      if (e.kind === 'opening') { FX.confetti(x, y - 30, 20); FX.pow(x, y - 64, '개통 축제! ×2', '#F2B33D', '#22201D', -6); }
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
    if (e.cancelled) { const [x, y] = nodeApp(e.node); FX.pow(x, y - 60, '공사 중단!', '#6E6A5E', '#FFFDF7', -5); Sound.penalty(); }
    if (e.used) {
      // 한 번 쓰는 함정이 걸렸을 때: 출입 통제 · 떡상(끌어온 손님) · 버스킹(한 번 더)
      const [x, y] = nodeApp(e.node), stop = e.kind === 'gate' || e.kind === 'hype';
      FX.pow(x, y - 60, e.kind === 'gate' ? '강제 정차!' : e.kind === 'hype' ? '떡상 손님!' : '한 번 더!', e.kind === 'gate' ? '#E0533D' : '#E2337A', '#FFFDF7', -5);
      if (stop) Sound.clank(); else Sound.coin();
    }
    if (el) { await tween(el, [{ opacity: 1 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 300, fill: 'forwards' }); el.remove(); }
  },
  async again(e) {
    const p = playerById(M(), e.player);
    toast(`${isMine(p) ? '나' : nameOf(p)} · ${p.doubles ? `더블 ${p.doubles}번 · ` : ''}한 번 더!`);
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
    if (!isMine(p)) return;
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
    await drawCard({ tone: 'good', deck: '응급 대기', title: `${isMine(p) ? '나' : nameOf(p)} 긴급 구조!`, short: `빚 ${e.debt} 탕감 · ${e.amount}으로 재출발 (1회)`, art: character(p.hero, 96, 'cheer'), quick: !isMine(p) });
    drawHud();
  },
  async hotspot(e) {
    const p = playerById(M(), e.player);
    await drawCard({ tone: 'hot', deck: '명소역', title: e.tag, short: e.desc, art: hotArt(e.node, 110), place: e.node, quick: !isMine(p) });
  },
  async choice() {},
  async corner(e) {
    const p = playerById(M(), e.player);
    const at = nodeApp(e.node);
    if (e.kind === 'start') return;
    FX.ring(at[0], at[1], '#FFFDF7');
    const ic = cornerAt(M(), e.node)?.icon;
    const art = ic ? tourArt(ic, 96) : { festival: incidentArt('festival', 96), express: skillArt('direct', 96), maze: incidentArt('delay', 96) }[e.kind];
    await drawCard({ tone: e.kind === 'maze' ? 'warn' : 'good', deck: '모서리 칸', title: e.node === e.name ? e.name : `${e.node} · ${e.name}`, short: e.short, art, quick: !isMine(p) });
    if (e.kind === 'maze') act(pieceEl(p.id), 'sad', 900);
  },
  async warp(e) {
    const p = playerById(M(), e.player);
    const el = pieceEl(p.id);
    if (e.by === 'direct' || e.by === 'express' || e.by === 'transfer') {
      // 직통 열차: 열차가 들어와 태우고, 같은 호선을 따라 달려 내려 준다
      const { path, line, color } = linePath(e.from, e.to);
      const pts = path.map(nodeXY), end = pts[pts.length - 1], lc = color || LINES[line]?.color || colorOf(p);
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
    const WARP_TEXT = { direct: ['직통 열차!', '#2F6FD0'], gather: ['회식 소집!', '#E0533D'], jail: [`${jailName()}행!`, '#6B3FA0'] };
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
    if (isMine(p)) toast(e.by === 'hype' ? `떡상! 목적지 → ${e.goal}` : `새 목적지 ${e.goal} (${dist(p.node, e.goal)}역)`);
    await sleep(isMine(p) ? 500 : 150);
  },
  async monoWarn(e) {
    const m = M(), p = playerById(m, e.player);
    const what = e.kind === 'hot' ? `명소역 ${e.have}/${e.need}곳` : isLoop(m) ? `${e.have}칸 연속` : `${LINES[e.line]?.name || ''} ${e.have}역 연결`;
    await drawCard({ tone: isMine(p) ? 'good' : 'warn', deck: '독점 경고', title: `${isMine(p) ? '나' : nameOf(p)} 독점 1곳 전!`,
      short: isMine(p) ? `${what} · 1곳 더 가지면 승리` : `${what} · 남은 ${e.kind === 'hot' ? '명소역' : isLoop(m) ? '칸' : '노선 끝 역'}을 견제하세요`, art: character(p.hero, 96, 'cheer') });
    // 판에서 그 칸(들)을 짚어 준다 — '독점!' 깃발이 선 곳
    const spots = monoThreats(m).filter((t) => t.player === p.id).map((t) => nodeXY(t.node));
    if (!spots.length) return;
    drawBoard();
    Camera.frame(spots, { maxZoom: 0.75, pad: 160, ms: 420 });
    await sleep(440);
    Sound.horn();
    for (const s of spots) { const [x, y] = toApp(Camera.toView(s)); FX.ring(x, y - 10, '#E0533D'); }
    await sleep(isMine(p) ? 700 : 900);
  },
  async monopoly(e) {
    const p = playerById(M(), e.player);
    flash(app);
    await drawCard({ tone: isMine(p) ? 'good' : 'bad', deck: '독점 승리', title: `${isMine(p) ? '나' : nameOf(p)} ${e.kind === 'hot' ? '명소 독점!' : '노선 독점!'}`,
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
  // 땅에 닿는 순간 칸을 새 색으로 칠하고 눌러 준다
  const xy = nodeXY(e.node), opt = { s: pieceSize(), z: depth(xy[1]) + 70, color: colorOf(p), quick: !isMine(p), onHit: () => { drawBoard(); pressTile(e.node, 1.3); } };
  // 순환선: 칸의 입체 건물이 그 자리에서 솟는다(판에 남을 건물과 같은 그림)
  const g = groundOf(e.node, e.type === 'upgrade' ? e.level : 1);
  const iso = (lv) => { if (!g) return null; const a = buildingArt(lv, colorOf(p)); return { art: a.html, size: [a.w, a.h], anchor: a.anchor, level: lv }; };
  const spot = (lv) => (g ? [g[0], g[1] - liftOf(lv)] : xy);
  if (e.type === 'upgrade' && (e.level >= 2 || g)) await EFX.rise($('#layer'), spot(e.level), { ...opt, level: e.level, ...(iso(e.level) || {}) });
  else if (e.type === 'takeover') await EFX.plant($('#layer'), xy, { ...opt, from: e.from ? colorOf(playerById(M(), e.from)) : null });
  else if (e.type === 'buy' && g) await Promise.all([EFX.rise($('#layer'), spot(1), { ...opt, ...iso(1) }), EFX.plant($('#layer'), xy, { ...opt, onHit: () => {} })]);
  else if (e.type === 'buy') await EFX.plant($('#layer'), xy, opt);
  else drawBoard();
  FX.ring(at[0], at[1], colorOf(p));
  FX.ring(at[0], at[1], '#FFFDF7');
  FX.confetti(at[0], at[1] - 30, isMine(p) ? 22 : 8, 1);
  FX.pow(at[0], at[1] - 70, word, colorOf(p), '#22201D', -5);
  if (e.chain > 1 && (e.linked || e.invest)) FX.pow(at[0] + 40, at[1] - 104, `${e.chain}역 연결 ×${Math.min(4, e.chain)}`, '#22201D', '#FFFDF7', 6);
  act(pieceEl(p.id), 'cheer', 900);
  drawHud();
  await sleep(isMine(p) ? 550 : 250);
}

// ── 결과 ───────────────────────────────────────────────────

const winnerName = (m) => { const w = playerById(m, m.winner); return isMine(w) ? '나' : nameOf(w); };

const CHEST = `<svg viewBox="0 0 80 64" width="104" height="83" aria-hidden="true">
  <rect x="8" y="28" width="64" height="32" rx="5" fill="#C9822E" stroke="#22201D" stroke-width="3"/>
  <rect x="8" y="40" width="64" height="7" fill="#F2B33D" stroke="#22201D" stroke-width="2.4"/>
  <g class="lid"><path d="M8 30 V20 Q8 8 40 8 Q72 8 72 20 V30 Z" fill="#DE9A3E" stroke="#22201D" stroke-width="3" stroke-linejoin="round"/>
  <path d="M12 26 H68" stroke="#F2B33D" stroke-width="4"/></g>
  <rect x="34" y="32" width="12" height="13" rx="3" fill="#F2B33D" stroke="#22201D" stroke-width="2.4"/><circle cx="40" cy="38" r="2" fill="#22201D"/></svg>`;

async function results() {
  if (G.run) return stageResults();
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
    return `<div class="res-row ${isMine(p) ? 'me' : ''}" style="--pc:${colorOf(p)}"><b class="pl-no">${r.place}</b>${character(p.hero, 40, r.place === 1 ? 'dance' : r.out ? 'sad' : 'idle')}
      <div><b>${isMine(p) ? '나' : nameOf(p)}</b><span>${r.out ? '파산' : `자산 ${r.assets.toLocaleString()} · 역 ${stationsOf(m, p).length}곳`}</span></div></div>`;
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
    <div class="row"><button class="btn white" id="home">로비</button><button class="btn" id="again">${G.online ? '새 방' : '다시 하기'}</button></div>`);
  s.classList.add('result-sheet');
  if (G.online) Online.forget(); // 끝난 판은 이어 하기에서 뺀다
  s.querySelector('#home').onclick = () => { closeSheet(); title(); };
  s.querySelector('#again').onclick = () => { closeSheet(); if (G.online) { title(); onlineMenu(); } else startGame(G.daily); };
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

// 클라우드 저장: 켜 두고(설정이 없으면 아무 일도 안 한다), 내려받아 기록이 바뀌면 로비를 다시 그린다
Cloud.onSync(() => {
  Daily.reload(); Prefs.reload();
  if (!G.m && app.classList.contains('home-app')) title();
});
Cloud.start();

splash();
// 초대 링크(?room=코드): 로비가 뜨면 그 방으로
const invited = Online.normCode(new URLSearchParams(location.search).get('room'));
if (invited.length === Online.CODE_LEN) {
  history.replaceState(null, '', location.pathname);
  const wait = setInterval(() => { if (app.classList.contains('home-app') && !app.querySelector('.sheet')) { clearInterval(wait); onlineMenu(invited); } }, 300);
}
