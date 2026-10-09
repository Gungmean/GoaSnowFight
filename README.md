# ❄️ 고아 눈싸움 (GoaSnowFight)

웹 브라우저 기반의 레트로 도트 감성 1:1 눈싸움 액션 게임입니다.

---

## 🎮 게임 조작법
- **WASD**: 이동
- **마우스**: 360도 자유 조준 (브롤스타즈 스타일 궤적 가이드)
- **좌클릭 (길게 누르기 / 차징)**: 눈덩이 압축 차징 (차징할수록 사정거리 및 탄속 증가, 차징 중 이속 감소)
- **좌클릭 놓기**: 눈덩이 투척
- **Shift**: 회피 구르기 (코스트 1 소모, 무적 판정 및 가감속 다이빙)
- **Q 키**: 트리플 샷 (3방향 부채꼴 투척, 코스트 2)
- **E 키**: 눈사람 빙벽 (투사체 차단 방벽 설치, 코스트 3)
- **마우스 우클릭**: 메가 눈폭탄 (광역 폭발 투척, 코스트 4)

---

## ⚙️ 로컬 실행 방법
1. 저장소를 클론하거나 다운로드합니다.
2. `start_server.bat`을 더블 클릭합니다.
   - 브라우저(`http://localhost:3000`)가 자동으로 열리며 즉시 플레이할 수 있습니다.
   - 또는 터미널에서 `node server.js` 입력

---

## 🛠️ 기술 스택
- **Front-end**: HTML5 Canvas, Vanilla JavaScript (ES6+), CSS3 Pixel Art Layout
- **Audio**: Web Audio API Retro 8-bit Sound Synthesizer
- **Server**: Node.js HTTP & WebSocket Server
