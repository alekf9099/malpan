// 온라인 대결 방 — Firestore 로 방을 만들고 들어가고, 판이 시작되면 사람 행동만 주고받는다(규칙 계산은 core/lockstep.js).
//
//   rooms/{code}         방 하나: { host, status(wait · play), size(자리 수 2~4), board, seats[{ uid, name, hero }], uids[자리 순서],
//                                  seed · heroes(시작할 때 방장이 정한다), created, updated }
//   rooms/{code}/acts/{n} 행동 하나: { n, by, seat, a, v(JSON 글자), h(판 서명), at } — 방 사람만 읽고, 자기 이름으로만 새로 쓴다(고치기 · 지우기 없음)
//
// 같은 순번(n)에는 하나만 쓸 수 있다(규칙이 덮어쓰기를 막는다). 차례인 사람만 쓰므로 순번이 겹치지 않는다.

import * as Cloud from './cloud.js';

/** 헷갈리는 글자(0 · O · 1 · I · L)를 뺀 방 코드 글자 */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 4;
const SAVE = 'yeokjeon.online.v1'; // 마지막으로 들어간 방(새로고침 뒤 이어 하기)

const pad = (n) => String(n).padStart(6, '0');
const fbOrNull = async () => ((await Cloud.start()) ? Cloud.firebase() : null);

export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
export const lastRoom = () => { try { return localStorage.getItem(SAVE) || ''; } catch { return ''; } };
const remember = (code) => { try { if (code) localStorage.setItem(SAVE, code); else localStorage.removeItem(SAVE); } catch { /* 없어도 진행 */ } };

/** 방 만들기 → 코드(실패하면 throw). 나는 첫 자리 */
export async function createRoom({ size, board, hero }) {
  const fb = await fbOrNull();
  if (!fb) throw new Error('offline');
  const { fs, db, uid } = fb;
  for (let tries = 0; tries < 6; tries++) {
    const code = Array.from({ length: CODE_LEN }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    const ref = fs.doc(db, 'rooms', code);
    try {
      await fs.runTransaction(db, async (tx) => {
        const old = await tx.get(ref);
        if (old.exists() && old.data().status !== 'gone') throw new Error('taken');
        tx.set(ref, { host: uid, status: 'wait', size, board, seats: [{ uid, name: Cloud.myName(), hero }], uids: [uid], created: fs.serverTimestamp(), updated: fs.serverTimestamp() });
      });
      remember(code);
      return code;
    } catch (err) {
      if (err.message !== 'taken') throw err;
    }
  }
  throw new Error('taken');
}

/** 코드로 들어가기 → 방 데이터. 못 들어가면 throw(nothing · full · started · offline) */
export async function joinRoom(code, { hero }) {
  const fb = await fbOrNull();
  if (!fb) throw new Error('offline');
  const { fs, db, uid } = fb;
  const ref = fs.doc(db, 'rooms', code);
  const room = await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status === 'gone') throw new Error('nothing');
    const r = snap.data();
    if (r.uids.includes(uid)) return r; // 이미 들어와 있다(새로고침)
    if (r.status !== 'wait') throw new Error('started');
    if (r.uids.length >= r.size) throw new Error('full');
    const seats = [...r.seats, { uid, name: Cloud.myName(), hero }];
    tx.update(ref, { seats, uids: [...r.uids, uid], updated: fs.serverTimestamp() });
    return { ...r, seats, uids: [...r.uids, uid] };
  });
  remember(code);
  return room;
}

/** 방에서 나가기(시작 전). 방장이 나가면 방을 닫는다 */
export async function leaveRoom(code) {
  remember('');
  const fb = Cloud.firebase();
  if (!fb || !code) return;
  const { fs, db, uid } = fb;
  const ref = fs.doc(db, 'rooms', code);
  try {
    await fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const r = snap.data();
      if (r.host === uid) { tx.update(ref, { status: 'gone', updated: fs.serverTimestamp() }); return; }
      if (r.status !== 'wait' || !r.uids.includes(uid)) return;
      tx.update(ref, { seats: r.seats.filter((s) => s.uid !== uid), uids: r.uids.filter((u) => u !== uid), updated: fs.serverTimestamp() });
    });
  } catch (err) { console.warn('[online] 나가기 실패', err); }
}

/** 방장: 자리 수 · 판 바꾸기, 시작하기 */
export async function updateRoom(code, patch) {
  const fb = Cloud.firebase();
  if (!fb) return;
  const { fs, db } = fb;
  await fs.updateDoc(fs.doc(db, 'rooms', code), { ...patch, updated: fs.serverTimestamp() });
}

/** 방장: 시작. plan(지금 방) → 바꿀 값(시드 · 캐릭터) — 그사이 누가 들어와도 맞게 거래(transaction) 안에서 정한다 */
export async function startRoom(code, plan) {
  const fb = Cloud.firebase();
  if (!fb) throw new Error('offline');
  const { fs, db, uid } = fb;
  const ref = fs.doc(db, 'rooms', code);
  await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().host !== uid) throw new Error('nothing');
    const r = snap.data();
    if (r.status !== 'wait') return;
    tx.update(ref, { ...plan(r), updated: fs.serverTimestamp() });
  });
}

/** 방이 바뀔 때마다 fn(room | null). 끊기 함수를 돌려준다 */
export function watchRoom(code, fn) {
  const fb = Cloud.firebase();
  if (!fb) return () => {};
  const { fs, db } = fb;
  return fs.onSnapshot(fs.doc(db, 'rooms', code), (snap) => fn(snap.exists() ? snap.data() : null), (err) => { console.warn('[online] 방 연결 끊김', err); fn(null); });
}

/** 방 하나 읽기(이어 하기 확인용) */
export async function getRoom(code) {
  const fb = await fbOrNull();
  if (!fb || !code) return null;
  const { fs, db } = fb;
  try { const snap = await fs.getDoc(fs.doc(db, 'rooms', code)); return snap.exists() ? snap.data() : null; } catch { return null; }
}

/** 행동 받기: 새 행동이 올 때마다 fn(act) — n 순서대로, 빠짐없이. 첫 묶음(지금까지의 행동)을 다 넘기면 ready(). 끊기 함수를 돌려준다 */
export function watchActs(code, fn, ready = () => {}) {
  const fb = Cloud.firebase();
  if (!fb) { ready(); return () => {}; }
  let first = true;
  const { fs, db } = fb;
  const got = new Map();
  let next = 0;
  return fs.onSnapshot(fs.query(fs.collection(db, 'rooms', code, 'acts'), fs.orderBy('n')), (snap) => {
    for (const ch of snap.docChanges()) {
      if (ch.type !== 'added') continue;
      const d = ch.doc.data();
      let v = null;
      try { v = d.v == null ? null : JSON.parse(d.v); } catch { /* 깨진 값은 null */ }
      got.set(d.n, { n: d.n, by: d.by, seat: d.seat, a: d.a, v, h: d.h });
    }
    while (got.has(next)) { fn(got.get(next)); got.delete(next); next++; }
    if (first) { first = false; ready(); }
  }, (err) => { console.warn('[online] 행동 연결 끊김', err); if (first) { first = false; ready(); } });
}

/** 내 행동 올리기(순번 n 자리에). 실패하면 throw */
export async function sendAct(code, act) {
  const fb = Cloud.firebase();
  if (!fb) throw new Error('offline');
  const { fs, db, uid } = fb;
  await fs.setDoc(fs.doc(db, 'rooms', code, 'acts', pad(act.n)), {
    n: act.n, by: uid, seat: act.seat, a: act.a, v: act.v === undefined ? null : JSON.stringify(act.v), h: act.h, at: fs.serverTimestamp()
  });
}

export const myUid = () => Cloud.myUid();
export const forget = () => remember('');
