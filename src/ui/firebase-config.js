// Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 firebaseConfig 를 그대로 붙인다. null 이면 클라우드 저장 · 전체 랭킹이 꺼지고
// 지금처럼 이 기기(localStorage)에만 저장한다.
// 웹 앱 설정값은 비밀이 아니다(브라우저에 그대로 내려간다). 데이터는 firestore.rules 로 지킨다.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCUvm9319fxxzZ2DlYF5K3ziSNMlFKvOR4',
  authDomain: 'test-game-9cded.firebaseapp.com',
  projectId: 'test-game-9cded',
  storageBucket: 'test-game-9cded.firebasestorage.app',
  messagingSenderId: '78994854700',
  appId: '1:78994854700:web:e9d6aa0adf5879f5a25289',
  measurementId: 'G-NFMZPRLSZT'
};
