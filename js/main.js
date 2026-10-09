// main.js - 화면 상태 관리, UI 모달 및 HUD 바인딩
document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas');
  const game = new Game(canvas);
  window.gameInstance = game;

  // 화면 요소들
  const titleScreen = document.getElementById('title-screen');
  const gameScreen = document.getElementById('game-screen');
  const titleCanvas = document.getElementById('title-snow-canvas');

  // 버튼들
  const btnStartGame = document.getElementById('btn-start-game');
  const btnSkillDeck = document.getElementById('btn-skill-deck');
  const btnBackToTitle = document.getElementById('btn-back-to-title');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const btnResetTraining = document.getElementById('btn-reset-training');
  const btnToggleLine = document.getElementById('btn-toggle-line');

  // 모달들
  const modalGameModes = document.getElementById('modal-game-modes');
  const modalSkillDeck = document.getElementById('modal-skill-deck');
  const modalQuickMatch = document.getElementById('modal-quick-match');
  const modalRoomCode = document.getElementById('modal-room-code');

  // 게임 모드 선택 버튼들
  const btnModeTraining = document.getElementById('btn-mode-training');
  const btnModeQuickMatch = document.getElementById('btn-mode-quick');
  const btnModeRoomCode = document.getElementById('btn-mode-room');
  const btnCloseModes = document.getElementById('btn-close-modes');
  const btnCloseDeck = document.getElementById('btn-close-deck');
  const btnCancelMatch = document.getElementById('btn-cancel-match');
  const btnCloseRoom = document.getElementById('btn-close-room');

  // 더미 모드 버튼들
  const botModeSelect = document.getElementById('bot-mode-select');

  // HUD 요소들
  const costBarFill = document.getElementById('cost-bar-fill');
  const costNumber = document.getElementById('cost-number');
  const slotRoll = document.getElementById('slot-roll');
  const slotQ = document.getElementById('slot-q');
  const slotE = document.getElementById('slot-e');
  const slotRmb = document.getElementById('slot-rmb');

  const playerHeartsContainer = document.getElementById('player-hearts');
  const botHeartsContainer = document.getElementById('bot-hearts');
  const botNameLabel = document.getElementById('bot-name-label');

  // 타이틀 및 인게임 앰비언트 눈송이 파티클 배경
  initTitleSnow(titleCanvas);
  const ambientSnowCanvas = document.getElementById('ambient-snow-canvas');
  if (ambientSnowCanvas) initTitleSnow(ambientSnowCanvas);

  // 게임 엔진 에셋 프리로드
  await game.init();

  // 모바일 가상 조이스틱 & 액션 패드 매니저 초기화
  const mobileControls = new MobileControls(game);
  game.mobileControls = mobileControls;
  window.mobileControlsInstance = mobileControls;

  // 1. "게임 시작" 클릭 -> 모드 선택 모달 열기
  btnStartGame.addEventListener('click', () => {
    window.sounds.playClick();
    modalGameModes.classList.remove('hidden');
  });

  // 모달 닫기
  btnCloseModes.addEventListener('click', () => {
    window.sounds.playClick();
    modalGameModes.classList.add('hidden');
  });

  // 2. 모드: "훈련장" 진입!
  btnModeTraining.addEventListener('click', () => {
    window.sounds.playClick();
    modalGameModes.classList.add('hidden');
    enterTrainingMode();
  });

  // 닉네임 생성기 (로컬스토리지 보관)
  function getPlayerNickname() {
    let name = localStorage.getItem('snow_player_name');
    if (!name) {
      const adjectives = ['눈꽃', '얼음', '질풍', '겨울', '눈사람', '북극곰', '펭귄', '하얀'];
      const nouns = ['마스터', '스나이퍼', '장인', '대장', '고수', '헌터', '기사'];
      const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const randNoun = nouns[Math.floor(Math.random() * nouns.length)];
      const randNum = Math.floor(10 + Math.random() * 90);
      name = `${randAdj}${randNoun}_${randNum}`;
      localStorage.setItem('snow_player_name', name);
    }
    return name;
  }

  // 네트워크 방 생성 및 에러 콜백 등록
  game.network.onRoomCreated = (roomCode) => {
    const createdBox = document.getElementById('created-room-box');
    const codeElem = document.getElementById('created-room-code');
    const btnCreate = document.getElementById('btn-create-room');
    if (codeElem) codeElem.innerText = roomCode;
    if (createdBox) createdBox.classList.remove('hidden');
    if (btnCreate) btnCreate.classList.add('hidden');
  };

  game.network.onError = (errMsg) => {
    alert(`[매칭 안내] ${errMsg}`);
  };

  // 매칭 시작 시 검색 타이머 정지 래핑
  const baseMatchStart = game.network.onMatchStart;
  game.network.onMatchStart = (data) => {
    stopMatchSearchTimer();
    if (baseMatchStart) baseMatchStart(data);
  };

  // 3. 모드: "빠른 매칭"
  btnModeQuickMatch.addEventListener('click', () => {
    window.sounds.playClick();
    modalGameModes.classList.add('hidden');
    modalQuickMatch.classList.remove('hidden');
    startMatchSearchTimer();
    game.network.joinQueue(getPlayerNickname());
  });

  btnCancelMatch.addEventListener('click', () => {
    window.sounds.playClick();
    game.network.leaveQueue();
    modalQuickMatch.classList.add('hidden');
    stopMatchSearchTimer();
  });

  // 4. 모드: "방 코드로 매칭"
  btnModeRoomCode.addEventListener('click', () => {
    window.sounds.playClick();
    modalGameModes.classList.add('hidden');
    modalRoomCode.classList.remove('hidden');
    // 방 생성 박스 초기화
    const createdBox = document.getElementById('created-room-box');
    const btnCreate = document.getElementById('btn-create-room');
    if (createdBox) createdBox.classList.add('hidden');
    if (btnCreate) btnCreate.classList.remove('hidden');
  });

  btnCloseRoom.addEventListener('click', () => {
    window.sounds.playClick();
    game.network.cancelRoom();
    modalRoomCode.classList.add('hidden');
  });

  document.getElementById('btn-create-room')?.addEventListener('click', () => {
    window.sounds.playClick();
    game.network.createRoom(getPlayerNickname());
  });

  document.getElementById('btn-join-room')?.addEventListener('click', () => {
    window.sounds.playClick();
    const codeInput = document.getElementById('room-code-input');
    const code = codeInput ? codeInput.value.trim() : '';
    if (!code || code.length !== 6) {
      alert('6자리 방 코드를 정확히 입력해주세요!');
      return;
    }
    game.network.joinRoom(code, getPlayerNickname());
  });

  // 5. "스킬 편성" 클릭 -> 스킬 덱 모달 열기
  btnSkillDeck.addEventListener('click', () => {
    window.sounds.playClick();
    modalSkillDeck.classList.remove('hidden');
  });

  btnCloseDeck.addEventListener('click', () => {
    window.sounds.playClick();
    modalSkillDeck.classList.add('hidden');
  });

  // 6. 더미 모드 선택 변경
  botModeSelect.addEventListener('change', (e) => {
    window.sounds.playClick();
    game.bot.setMode(e.target.value);
    botNameLabel.innerText = game.bot.name;
  });

  // 7. 훈련장 초기화
  btnResetTraining.addEventListener('click', () => {
    window.sounds.playClick();
    game.reset();
  });

  // 7-1. 중앙 분할선 토글 (테스트 기능: 라인 제거/생성 및 전 구역 자유 이동)
  if (btnToggleLine) {
    btnToggleLine.addEventListener('click', () => {
      window.sounds.playClick();
      const isActive = game.toggleCenterLine();
      if (isActive) {
        btnToggleLine.innerText = '🚧 라인 OFF';
        btnToggleLine.classList.remove('warning');
        btnToggleLine.title = '중앙 분할선 끄기 (전체 영역 자유 이동)';
      } else {
        btnToggleLine.innerText = '🚧 라인 ON';
        btnToggleLine.classList.add('warning');
        btnToggleLine.title = '중앙 분할선 켜기 (1P/2P 영역 제한)';
      }
    });
  }

  // 8. 타이틀로 돌아가기
  btnBackToTitle.addEventListener('click', () => {
    window.sounds.playClick();
    game.stop();
    stopMatchSearchTimer();
    gameScreen.classList.add('hidden');
    titleScreen.classList.remove('hidden');

    // 타이틀로 돌아갈 때 전체화면 해제
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  });

  // 9. 사운드 토글
  btnSoundToggle.addEventListener('click', () => {
    const isMuted = window.sounds.toggleMute();
    btnSoundToggle.innerText = isMuted ? '🔇' : '🔊';
    btnSoundToggle.title = isMuted ? '사운드 켜기' : '사운드 끄기';
  });

  // 9-1. 모바일 가상 조이스틱 토글 버튼
  const btnToggleMobile = document.getElementById('btn-toggle-mobile');
  if (btnToggleMobile) {
    btnToggleMobile.addEventListener('click', () => {
      window.sounds.playClick();
      mobileControls.toggle();
    });
  }

  // 9-2. 하단 HUD 스킬 슬롯 터치/클릭 즉시 발동 지원
  if (slotRoll) {
    slotRoll.addEventListener('click', () => {
      if (!game.isRunning) return;
      window.sounds.playClick();
      game.player.triggerRoll();
    });
  }
  if (slotQ) {
    slotQ.addEventListener('click', () => {
      if (!game.isRunning) return;
      const target = mobileControls.getAutoTargetCoords();
      const ok = game.player.skillManager.castQ(target.x, target.y, game.snowballs, game.particles, game.sound);
      if (ok && game.mode === 'MULTIPLAYER') {
        game.network.sendSkill('q', { targetX: target.x, targetY: target.y });
      }
    });
  }
  if (slotE) {
    slotE.addEventListener('click', () => {
      if (!game.isRunning) return;
      const target = mobileControls.getAutoTargetCoords(110);
      const ok = game.player.skillManager.castE(target.x, target.y, game.particles, game.sound);
      if (ok && game.mode === 'MULTIPLAYER') {
        game.network.sendSkill('e', { targetX: target.x, targetY: target.y });
      }
    });
  }
  if (slotRmb) {
    slotRmb.addEventListener('click', () => {
      if (!game.isRunning) return;
      const target = mobileControls.getAutoTargetCoords();
      const ok = game.player.skillManager.castRMB(target.x, target.y, game.snowballs, game.particles, game.sound);
      if (ok && game.mode === 'MULTIPLAYER') {
        game.network.sendSkill('rmb', { targetX: target.x, targetY: target.y });
      }
    });
  }

  // 전체화면 요청 헬퍼
  function requestGameFullscreen() {
    if (!document.fullscreenElement) {
      const el = document.documentElement;
      const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (rfs) {
        rfs.call(el).then(() => {
          setTimeout(() => game.resize(), 80);
        }).catch((err) => {
          console.warn('전체화면 자동 전환 실패 (브라우저 정책/설정):', err);
        });
      }
    }
  }
  window.requestGameFullscreen = requestGameFullscreen;

  // 10. 전체화면 토글
  const btnFullscreen = document.getElementById('btn-fullscreen');
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
      window.sounds.playClick();
      if (!document.fullscreenElement) {
        requestGameFullscreen();
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  // 브라우저 전체화면 상태 변경 감지 (ESC 키로 탈출 등)
  document.addEventListener('fullscreenchange', () => {
    if (btnFullscreen) {
      btnFullscreen.innerText = document.fullscreenElement ? '🗗' : '⛶';
      btnFullscreen.title = document.fullscreenElement ? '창모드로 전환 (ESC)' : '전체화면으로 전환';
    }
    setTimeout(() => {
      game.resize();
    }, 80);
  });

  // 훈련장 진입 함수 (게임 진입 시 자동으로 전체화면 전환)
  function enterTrainingMode() {
    requestGameFullscreen();

    titleScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    game.resize();
    game.startTraining();
  }

  // 매칭 검색 타이머 UI
  let matchInterval = null;
  let matchSec = 0;
  function startMatchSearchTimer() {
    matchSec = 0;
    const timerElem = document.getElementById('match-timer-text');
    matchInterval = setInterval(() => {
      matchSec++;
      const m = String(Math.floor(matchSec / 60)).padStart(2, '0');
      const s = String(matchSec % 60).padStart(2, '0');
      if (timerElem) timerElem.innerText = `${m}:${s}`;
    }, 1000);
  }

  function stopMatchSearchTimer() {
    if (matchInterval) clearInterval(matchInterval);
    matchInterval = null;
  }

  // ==========================================
  // HUD 갱신 루프 (HP 하트, 클래시 로얄 코스트 바, 스킬 쿨다운)
  // ==========================================
  function updateHUD() {
    if (game.isRunning) {
      const p = game.player;
      const b = game.bot;

      // 1. 코스트 바 갱신 (0 ~ 10)
      const costPct = (p.cost / p.maxCost) * 100;
      costBarFill.style.width = `${costPct}%`;
      costNumber.innerText = `${Math.floor(p.cost * 10) / 10}`;

      // 2. 구르기 슬롯
      updateSlotCooldown(slotRoll, p.currentRollCooldown, p.rollCooldown, p.cost >= 1);

      // 3. 스킬 슬롯 Q, E, RMB
      const skQ = p.skillManager.skills.q;
      const skE = p.skillManager.skills.e;
      const skRmb = p.skillManager.skills.rmb;

      updateSlotCooldown(slotQ, skQ.currentCooldown, skQ.cooldown, p.cost >= skQ.cost);
      updateSlotCooldown(slotE, skE.currentCooldown, skE.cooldown, p.cost >= skE.cost);
      updateSlotCooldown(slotRmb, skRmb.currentCooldown, skRmb.cooldown, p.cost >= skRmb.cost);

      // 4. 플레이어 & 봇/상대방 하트 UI 갱신
      renderHearts(playerHeartsContainer, p.hp, p.maxHp);
      if (game.mode === 'MULTIPLAYER' && game.opponent) {
        renderHearts(botHeartsContainer, game.opponent.hp, game.opponent.maxHp);
        if (botNameLabel && botNameLabel.innerText !== game.opponent.name) {
          botNameLabel.innerText = game.opponent.name;
        }
      } else {
        renderHearts(botHeartsContainer, b.hp, b.maxHp);
        if (botNameLabel && botNameLabel.innerText !== b.name) {
          botNameLabel.innerText = b.name;
        }
      }
    }
    requestAnimationFrame(updateHUD);
  }

  function updateSlotCooldown(slotElem, curCd, maxCd, hasCost) {
    if (!slotElem) return;
    const overlay = slotElem.querySelector('.cd-overlay');
    const text = slotElem.querySelector('.cd-text');

    if (curCd > 0) {
      slotElem.classList.add('on-cooldown');
      slotElem.classList.remove('ready');
      if (overlay) {
        overlay.style.height = `${(curCd / maxCd) * 100}%`;
      }
      if (text) {
        text.innerText = `${curCd.toFixed(1)}s`;
      }
    } else {
      slotElem.classList.remove('on-cooldown');
      if (overlay) overlay.style.height = '0%';
      if (text) text.innerText = '';

      if (hasCost) {
        slotElem.classList.add('ready');
        slotElem.classList.remove('no-cost');
      } else {
        slotElem.classList.remove('ready');
        slotElem.classList.add('no-cost');
      }
    }
  }

  function renderHearts(container, hp, maxHp) {
    if (!container) return;
    let heartsHtml = '';
    for (let i = 0; i < maxHp; i++) {
      if (i < hp) {
        heartsHtml += '<span class="heart active">❤️</span>';
      } else {
        heartsHtml += '<span class="heart empty">🖤</span>';
      }
    }
    container.innerHTML = heartsHtml;
  }

  updateHUD();

  // 타이틀 화면 눈송이 렌더러
  function initTitleSnow(canvasElem) {
    if (!canvasElem) return;
    const ctx = canvasElem.getContext('2d');
    let flakes = [];

    function resizeCanvas() {
      canvasElem.width = window.innerWidth;
      canvasElem.height = window.innerHeight;
      flakes = [];
      for (let i = 0; i < 80; i++) {
        flakes.push({
          x: Math.random() * canvasElem.width,
          y: Math.random() * canvasElem.height,
          r: Math.random() * 3 + 1,
          speed: Math.random() * 50 + 25,
          drift: Math.random() * 20 - 10,
          alpha: Math.random() * 0.6 + 0.3
        });
      }
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let last = performance.now();
    function animate(t) {
      const dt = (t - last) / 1000;
      last = t;

      ctx.clearRect(0, 0, canvasElem.width, canvasElem.height);
      for (const f of flakes) {
        f.y += f.speed * dt;
        f.x += f.drift * dt;
        if (f.y > canvasElem.height) {
          f.y = -10;
          f.x = Math.random() * canvasElem.width;
        }
        if (f.x < 0) f.x = canvasElem.width;
        if (f.x > canvasElem.width) f.x = 0;

        ctx.fillStyle = `rgba(255, 255, 255, ${f.alpha})`;
        ctx.fillRect(Math.floor(f.x), Math.floor(f.y), f.r, f.r);
      }
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }
});
