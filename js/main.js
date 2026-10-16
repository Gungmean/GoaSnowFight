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

  // 닉네임 설정 관련 요소들
  const inputNickname = document.getElementById('input-player-nickname');
  const btnDiceNickname = document.getElementById('btn-dice-nickname');
  const btnSaveNickname = document.getElementById('btn-save-nickname');
  const nicknameToast = document.getElementById('nickname-save-toast');
  const modalCurrentNick = document.getElementById('modal-current-nick');
  const btnModalEditNick = document.getElementById('btn-modal-edit-nick');

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

  // HUD 요소들 (4칸 탄창 바 & Shift 구르기 + Q 단일 스킬 슬롯)
  const ammoCountText = document.getElementById('ammo-count-text');
  const ammoFills = [
    document.getElementById('ammo-fill-0'),
    document.getElementById('ammo-fill-1'),
    document.getElementById('ammo-fill-2'),
    document.getElementById('ammo-fill-3')
  ];
  const slotRoll = document.getElementById('slot-roll');
  const slotQ = document.getElementById('slot-q');
  const slotQIcon = document.getElementById('slot-q-icon');
  const slotQName = document.getElementById('slot-q-name');
  const mobileQIcon = document.getElementById('mobile-q-icon');
  const mobileQLabel = document.getElementById('mobile-q-label');
  const modalCurrentSkill = document.getElementById('modal-current-skill');

  const playerHeartsContainer = document.getElementById('player-hearts');
  const playerNameLabel = document.getElementById('player-name-label');
  const botHeartsContainer = document.getElementById('bot-hearts');
  const botNameLabel = document.getElementById('bot-name-label');

  // 실시간 핑(지연시간) HUD 배지
  const hudPingBadge = document.getElementById('hud-ping-badge');
  const pingIndicatorDot = document.getElementById('ping-indicator-dot');
  const pingIndicatorText = document.getElementById('ping-indicator-text');

  // 타이틀 및 인게임 앰비언트 눈송이 파티클 배경
  initTitleSnow(titleCanvas);
  const ambientSnowCanvas = document.getElementById('ambient-snow-canvas');
  if (ambientSnowCanvas) initTitleSnow(ambientSnowCanvas);

  // 게임 엔진 에셋 프리로드 (백그라운드 병렬 로드)
  let isGameReady = false;
  const initPromise = game.init().then(() => {
    isGameReady = true;
  });

  // 모바일 가상 조이스틱 & 액션 패드 매니저 초기화
  const mobileControls = new MobileControls(game);
  game.mobileControls = mobileControls;
  window.mobileControlsInstance = mobileControls;

  // ==========================================
  // 닉네임 관리 시스템 (로컬스토리지 영구 보관 & 실시간 동기화)
  // ==========================================
  const NICKNAME_KEY = 'snow_player_name';

  function generateRandomNickname() {
    const adjectives = ['눈꽃', '얼음', '질풍', '겨울', '눈사람', '북극곰', '펭귄', '하얀', '꽁꽁', '차가운', '빛나는', '날쌘', '산타', '루돌프'];
    const nouns = ['마스터', '스나이퍼', '장인', '대장', '고수', '헌터', '기사', '눈싸움꾼', '눈뭉치', '요정', '달인'];
    const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randNum = Math.floor(10 + Math.random() * 90);
    return `${randAdj}${randNoun}_${randNum}`;
  }

  function getPlayerNickname() {
    let name = localStorage.getItem(NICKNAME_KEY);
    if (!name || !name.trim()) {
      name = generateRandomNickname();
      localStorage.setItem(NICKNAME_KEY, name);
    }
    return name.trim();
  }
  window.getPlayerNickname = getPlayerNickname;

  let toastTimer = null;
  function showNicknameToast(msg = '✓ 닉네임이 저장되었습니다!') {
    if (!nicknameToast) return;
    nicknameToast.innerText = msg;
    nicknameToast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      nicknameToast.classList.add('hidden');
    }, 2000);
  }

  function applyAndSaveNickname(newName, isSilent = false) {
    const trimmed = (newName || '').trim().slice(0, 10);
    if (!trimmed) {
      if (!isSilent) alert('닉네임을 1자 이상 10자 이하로 입력해주세요!');
      return false;
    }
    localStorage.setItem(NICKNAME_KEY, trimmed);
    if (inputNickname) inputNickname.value = trimmed;
    if (modalCurrentNick) modalCurrentNick.innerText = trimmed;
    if (playerNameLabel) playerNameLabel.innerText = `${trimmed} (1P)`;
    if (game && game.player) game.player.name = trimmed;
    if (!isSilent) {
      showNicknameToast();
      if (window.sounds) window.sounds.playClick();
    }
    return true;
  }

  // 초기 닉네임 바인딩
  const curNickname = getPlayerNickname();
  if (inputNickname) inputNickname.value = curNickname;
  if (modalCurrentNick) modalCurrentNick.innerText = curNickname;
  if (playerNameLabel) playerNameLabel.innerText = `${curNickname} (1P)`;

  // 닉네임 저장 버튼
  if (btnSaveNickname) {
    btnSaveNickname.addEventListener('click', () => {
      applyAndSaveNickname(inputNickname ? inputNickname.value : '');
    });
  }

  // 엔터 키 입력 시 저장
  if (inputNickname) {
    inputNickname.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyAndSaveNickname(inputNickname.value);
        inputNickname.blur();
      }
    });
  }

  // 랜덤 주사위 닉네임 버튼
  if (btnDiceNickname) {
    btnDiceNickname.addEventListener('click', () => {
      const randNick = generateRandomNickname();
      applyAndSaveNickname(randNick);
    });
  }

  // 모달 내 닉네임 변경 바로가기 버튼
  if (btnModalEditNick) {
    btnModalEditNick.addEventListener('click', () => {
      if (window.sounds) window.sounds.playClick();
      modalGameModes.classList.add('hidden');
      if (inputNickname) {
        inputNickname.focus();
        inputNickname.select();
      }
    });
  }

  // 실시간 핑(지연시간) HUD 갱신 콜백 연결
  game.network.onPingUpdate = (ping) => {
    if (pingIndicatorText) {
      pingIndicatorText.innerText = `${ping}ms`;
    }
    if (pingIndicatorDot) {
      pingIndicatorDot.className = 'ping-dot ' + (ping < 50 ? 'good' : ping < 120 ? 'moderate' : 'bad');
    }
  };

  // 1. "게임 시작" 클릭 -> 모드 선택 모달 열기
  btnStartGame.addEventListener('click', () => {
    window.sounds.playClick();
    if (modalCurrentNick) modalCurrentNick.innerText = getPlayerNickname();
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

  // ==========================================
  // 5. 단일 장착 스킬(Q) 선택 및 UI 동기화
  // ==========================================
  function syncEquippedSkillUI() {
    const sk = game.player.skillManager.getEquippedSkill();
    if (slotQIcon) slotQIcon.innerText = sk.icon;
    if (slotQName) slotQName.innerText = sk.shortName || sk.name;
    if (mobileQIcon) mobileQIcon.innerText = sk.icon;
    if (mobileQLabel) mobileQLabel.innerText = sk.shortName || sk.name;
    if (modalCurrentSkill) modalCurrentSkill.innerText = `${sk.icon} ${sk.name}`;

    const deckCards = document.querySelectorAll('.deck-card.selectable');
    deckCards.forEach((card) => {
      const cardSkillId = card.getAttribute('data-skill-id');
      const statusElem = card.querySelector('.deck-status');
      if (cardSkillId === sk.id) {
        card.classList.add('equipped');
        if (statusElem) statusElem.innerText = '✓ 현재 Q 장착 중';
      } else {
        card.classList.remove('equipped');
        if (statusElem) statusElem.innerText = '클릭하여 Q에 장착';
      }
    });
  }

  // 초기 장착 스킬 UI 반영
  syncEquippedSkillUI();

  // 스킬 카드 클릭 시 해당 스킬을 Q 슬롯에 단일 장착
  document.querySelectorAll('.deck-card.selectable').forEach((card) => {
    card.addEventListener('click', () => {
      const skillId = card.getAttribute('data-skill-id');
      if (skillId && game.player.skillManager.setEquippedSkill(skillId)) {
        window.sounds.playClick();
        syncEquippedSkillUI();
      }
    });
  });

  btnSkillDeck.addEventListener('click', () => {
    window.sounds.playClick();
    syncEquippedSkillUI();
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

  // 9-2. 하단 HUD 스킬 슬롯 터치/클릭 즉시 발동 지원 (Shift 구르기 + Q 단일 장착 스킬)
  if (slotRoll) {
    slotRoll.addEventListener('click', () => {
      if (!game.canPlayerAct()) return;
      window.sounds.playClick();
      game.player.triggerRoll();
    });
  }
  if (slotQ) {
    slotQ.addEventListener('click', () => {
      if (!game.canPlayerAct()) return;
      const eqId = game.player.skillManager.equippedSkillId;
      const target = mobileControls.getAutoTargetCoords(eqId === 'e' ? 110 : 800);
      const res = game.player.skillManager.castEquippedSkill(target.x, target.y, game.snowballs, game.particles, game.sound);
      if (res && game.mode === 'MULTIPLAYER') {
        game.network.sendSkill(res.skillType, res.payload);
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

  // 훈련장 진입 함수 (사용자 클릭 제스처가 유효한 동안 즉시 전체화면 및 훈련장 시작)
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
  // HUD 갱신 루프 (HP 하트, 브롤스타즈 4칸 탄창 바, 구르기 & Q 스킬 쿨다운)
  // ==========================================
  function updateHUD() {
    if (game.isRunning) {
      const p = game.player;
      const b = game.bot;

      // 1. 브롤스타즈 스타일 4칸 탄창(애모) 바 갱신
      const fullAmmo = Math.floor(p.ammo);
      const partialAmmo = p.ammo - fullAmmo;
      if (ammoCountText) {
        ammoCountText.innerText = `${fullAmmo} / ${p.maxAmmo}`;
      }
      for (let i = 0; i < p.maxAmmo; i++) {
        const fillEl = ammoFills[i];
        if (!fillEl) continue;
        if (i < fullAmmo) {
          fillEl.style.width = '100%';
          fillEl.classList.add('full');
          fillEl.classList.remove('reloading');
        } else if (i === fullAmmo && partialAmmo > 0) {
          fillEl.style.width = `${Math.floor(partialAmmo * 100)}%`;
          fillEl.classList.remove('full');
          fillEl.classList.add('reloading');
        } else {
          fillEl.style.width = '0%';
          fillEl.classList.remove('full', 'reloading');
        }
      }

      // 2. 구르기 슬롯 (코스트 없음, 쿨타임만 표시)
      updateSlotCooldown(slotRoll, p.currentRollCooldown, p.rollCooldown);

      // 3. 단일 장착 스킬 Q 슬롯 (코스트 없음, 쿨타임만 표시)
      const eqSkill = p.skillManager.getEquippedSkill();
      updateSlotCooldown(slotQ, eqSkill.currentCooldown, eqSkill.cooldown);

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

  function updateSlotCooldown(slotElem, curCd, maxCd) {
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
      slotElem.classList.remove('no-cost');
      slotElem.classList.add('ready');
      if (overlay) overlay.style.height = '0%';
      if (text) text.innerText = '';
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
