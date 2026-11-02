// 클라우드 저장 · 전체 랭킹(Firebase Auth + Firestore).
// 설정(firebase-config.js)이 비었거나 SDK 를 못 불러오면 꺼진 채로 — 게임은 기기 저장(localStorage)만으로 그대로 돈다.
//
//   users/{uid}    내 저장 하나: { records, daily, prefs, name, at(마지막으로 바뀐 때, 밀리초), updated(서버 시각) } — 나만 읽고 쓴다
//   ranking/{uid}  전체 랭킹 한 줄: { name, hero, rp, total, plays, wins, updated } — 누구나 읽고, 자기 줄만 쓴다
//
// 기기 저장이 먼저다: 게임은 늘 localStorage 를 읽고 쓰고, 저장할 때마다 queue() 가 잠시 모았다가 클라우드로 올린다.
// 켤 때(start) 클라우드 쪽이 더 늦게 바뀌었으면 그것을 기기로 내려받고 onSync 로 알린다.
//
// 지금은 익명 로그인(기기마다 uid 하나). 나중에 구글 · 이메일 로그인을 붙일 때는 linkWithPopup / linkWithCredential 로
// 지금 익명 계정에 이으면 uid 가 그대로라 users/{uid} 기록도 그대로 따라간다. 다른 기기에서 같은 계정으로 들어오면
// start() 의 내려받기가 그 기록을 가져온다(처음 보는 uid 면 merge 로 더 많이 한 쪽을 남긴다).

import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const KEYS = { records: 'yeokjeon.records.v1', daily: 'yeokjeon.daily.v1', prefs: 'yeokjeon.prefs.v1' };
const META = 'yeokjeon.cloud.v1'; // { uid(마지막으로 맞춘 계정), name, localAt(마지막 기기 저장), syncedAt(마지막으로 올린 것) }
export const NAME_MAX = 10;

let fb = null;          // { app, auth, fs, db, uid }
let state = 'off';      // off(설정 없음) · connecting · on · error
let starting = null;
let timer = null;
const listeners = new Set();

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 못 해도 진행 */ } };
const meta = () => readJSON(META) || {};
const setMeta = (patch) => writeJSON(META, { ...meta(), ...patch });
// Firestore 는 undefined 를 못 받는다 — JSON 으로 한 번 걸러 순수 값만
const plain = (v) => JSON.parse(JSON.stringify(v));

/** 'off' · 'connecting' · 'on' · 'error' */
export const status = () => (FIREBASE_CONFIG ? state : 'off');
export const enabled = () => !!FIREBASE_CONFIG;
export const myUid = () => fb?.uid || null;
/** 연결된 Firebase 묶음 { app, auth, fs(firestore 모듈), db, uid } — 온라인 대결(online.js)이 함께 쓴다. 연결 전이면 null */
export const firebase = () => fb;
export const myName = () => meta().name || '';
/** 클라우드에서 기록을 내려받아 기기 저장이 바뀌었을 때 */
export const onSync = (fn) => listeners.add(fn);

/** 연결 + 익명 로그인 + 내려받기. 여러 번 불러도 한 번만 한다 */
export function start() {
  if (!FIREBASE_CONFIG) return Promise.resolve(false);
  starting ||= (async () => {
    state = 'connecting';
    try {
      const [appMod, authMod, fs] = await Promise.all(['app', 'auth', 'firestore'].map((m) => import(`${SDK}firebase-${m}.js`)));
      const app = appMod.initializeApp(FIREBASE_CONFIG);
      const auth = authMod.getAuth(app);
      // 전에 로그인한 계정이 있으면 그대로(브라우저에 남아 있다), 없으면 익명으로 새로
      const known = await new Promise((res) => { const off = authMod.onAuthStateChanged(auth, (u) => { off(); res(u); }); });
      const user = known || (await authMod.signInAnonymously(auth)).user;
      fb = { app, auth, fs, db: fs.getFirestore(app), uid: user.uid };
      if (!meta().name) setMeta({ name: `승객${user.uid.slice(-4).toUpperCase()}` });
      await pull();
      state = 'on';
      return true;
    } catch (err) {
      state = 'error';
      console.warn('[cloud] 연결 실패 — 기기에만 저장합니다', err);
      starting = null;
      return false;
    }
  })();
  return starting;
}

/** 클라우드 → 기기. 같은 계정이면 더 늦게 바뀐 쪽, 처음 보는 계정이면 종류마다 더 많이 한 쪽을 남긴다 */
async function pull() {
  const { fs, db, uid } = fb;
  const snap = await fs.getDoc(fs.doc(db, 'users', uid));
  const m = meta();
  if (!snap.exists()) { await push(); return; }
  const remote = snap.data();
  if (remote.name && !m.nameSet) setMeta({ name: remote.name });
  let changed = false;
  if (m.uid === uid) {
    if ((remote.at || 0) > (m.localAt || 0)) {
      for (const [k, key] of Object.entries(KEYS)) if (remote[k]) writeJSON(key, remote[k]);
      setMeta({ localAt: remote.at, syncedAt: remote.at, name: remote.name || m.name });
      changed = true;
    }
  } else {
    const local = Object.fromEntries(Object.entries(KEYS).map(([k, key]) => [k, readJSON(key)]));
    const pick = {
      records: score(remote.records, (d) => [d.plays || 0, d.tickets || 0]) > score(local.records, (d) => [d.plays || 0, d.tickets || 0]),
      daily: score(remote.daily, (d) => [d.attend?.count || 0, 0]) > score(local.daily, (d) => [d.attend?.count || 0, 0]),
      prefs: !local.prefs
    };
    for (const [k, key] of Object.entries(KEYS)) if (pick[k] && remote[k]) { writeJSON(key, remote[k]); changed = true; }
  }
  setMeta({ uid });
  if (changed) listeners.forEach((fn) => fn());
  // 기기 쪽이 더 새것이었거나 섞었으면 다시 올린다
  if ((meta().localAt || 0) > (remote.at || 0) || m.uid !== uid) await push();
}
/** 비교용 점수: [큰 값, 다음 값] → 한 수 */
const score = (d, f) => { if (!d) return -1; const [a, b] = f(d); return a * 1e6 + b; };

/** 기기에 저장할 때마다 부른다: 바뀐 때를 적고, 잠시 모았다가 올린다 */
export function queue() {
  setMeta({ localAt: Date.now() });
  if (!fb) return;
  clearTimeout(timer);
  timer = setTimeout(() => { push(); }, 1500);
}

/** 기기 → 클라우드(내 저장 + 랭킹 한 줄) */
async function push() {
  if (!fb) return;
  const { fs, db, uid } = fb;
  const at = meta().localAt || Date.now(), name = myName();
  const data = { at, name, updated: fs.serverTimestamp() };
  for (const [k, key] of Object.entries(KEYS)) { const v = readJSON(key); if (v) data[k] = plain(v); }
  try {
    await fs.setDoc(fs.doc(db, 'users', uid), data);
    const r = data.records;
    if (r?.plays) {
      // 랭킹 얼굴: 고른 캐릭터, 없으면 마지막으로 한 판의 캐릭터
      const last = (r.games || []).reduce((a, g) => (!a || g.at > a.at ? g : a), null);
      await fs.setDoc(fs.doc(db, 'ranking', uid), {
        name, hero: String(data.prefs?.hero || last?.hero || '').slice(0, 24), rp: Math.round(r.rp || 0), total: Math.round(r.total || 0),
        plays: Math.round(r.plays || 0), wins: Math.round(r.wins || 0), updated: fs.serverTimestamp()
      });
    }
    setMeta({ uid, syncedAt: at });
  } catch (err) {
    console.warn('[cloud] 올리기 실패 — 다음 저장 때 다시', err);
  }
}

/** 랭킹에 보일 이름 바꾸기(빈칸 · 너무 긴 이름은 자른다). 바뀐 이름 */
export function setName(name) {
  const v = String(name || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!v) return myName();
  setMeta({ name: v, nameSet: true });
  queue();
  return v;
}

/** 전체 랭킹 위에서 n 줄: [{ id, name, hero, rp, plays, wins, me }] · 못 불러오면 null */
export async function top(n = 50) {
  if (!(await start()) || !fb) return null;
  const { fs, db, uid } = fb;
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'ranking'), fs.orderBy('rp', 'desc'), fs.limit(n)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data(), me: d.id === uid }));
  } catch (err) {
    console.warn('[cloud] 랭킹 못 불러옴', err);
    return null;
  }
}

/** 전체에서 내 순위(RP 가 나보다 높은 사람 수 + 1). 기록이 없거나 못 세면 null */
export async function myPlace(rp) {
  if (!fb) return null;
  const { fs, db } = fb;
  try {
    const c = await fs.getCountFromServer(fs.query(fs.collection(db, 'ranking'), fs.where('rp', '>', rp)));
    return c.data().count + 1;
  } catch { return null; }
}
