// game.js - 메인 게임 엔진, 렌더링 루프 및 입력/충돌/멀티플레이 처리
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // 가상 해상도 (background.png 기준 1672 x 940)
    this.virtualWidth = 1672;
    this.virtualHeight = 940;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // 모듈 초기화
    this.sprites = new SpriteManager();
    this.particles = new ParticleSystem();
    this.sound = window.sounds;

    // 모드: 'TRAINING' | 'MULTIPLAYER'
    this.mode = 'TRAINING';

    // 게임 엔티티
    this.player = new Player({ x: 420, y: 460, isPlayer: true, name: '1P (나)' });
    this.bot = new TrainingBot({ x: 1250, y: 460, mode: 'DUMMY' });
    this.opponent = null; // RemotePlayer
    this.snowballs = [];

    // 멀티플레이 네트워크 매니저
    this.network = new NetworkManager();
    this.matchCountdown = 0;
    this.matchResult = null; // null | 'VICTORY' | 'DEFEAT'
    this.processedHitIds = new Set(); // 중복 피격/회피 방지용 투사체 ID 세트

    // 플레이어 구르기 즉시 네트워크 브로드캐스트 연결
    this.player.onRoll = (p) => {
      if (this.mode === 'MULTIPLAYER') {
        this.network.sendRoll(p);
      }
    };

    // 경기장 분할선 좌표 (배경 사진 기준 x = 836)
    this.centerLineX = 836;
    this.showCenterLine = true;

    // 루프 제어
    this.lastTime = performance.now();
    this.isRunning = false;

    // 조준 좌표 (가상 좌표계)
    this.mouseVirtualX = 900;
    this.mouseVirtualY = 460;
    this.isMouseDown = false;

    // 카메라 셰이크
    this.shakeDuration = 0;
    this.shakeIntensity = 0;

    // 모바일 가상 조이스틱 & 액션 컨트롤러
    this.mobileControls = null;

    this.bindEvents();
    this.bindNetworkEvents();
  }

  canPlayerAct() {
    return this.isRunning && this.matchCountdown <= 0 && !this.matchResult && !this.player.isDead;
  }

  async init() {
    await this.sprites.loadAll();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.network.connect();
  }

  bindNetworkEvents() {
    this.network.onMatchStart = ({ role, opponentName, countdownSec, round, isRematch, myWins, oppWins, myRecord }) => {
      console.log(`[GAME] 1:1 대전 시작! (Round ${round || 1}) 내 역할: ${role}, 상대: ${opponentName}`);
      this.mode = 'MULTIPLAYER';
      this.opponent = new RemotePlayer({ x: 1250, y: 460, name: opponentName });
      this.player.respawn(null, null);
      // 멀티플레이에서는 항상 중앙 라인 활성화 및 영역 제한 강제
      this.showCenterLine = true;
      this.player.bounds.maxX = 800;

      const myCustomNick = (typeof window.getPlayerNickname === 'function' ? window.getPlayerNickname() : (localStorage.getItem('snow_player_name') || '눈싸움고수'));
      this.player.name = myCustomNick;
      const playerLabel = document.getElementById('player-name-label');
      if (playerLabel) playerLabel.innerText = `${myCustomNick} (1P)`;
      const pingBadge = document.getElementById('hud-ping-badge');
      if (pingBadge) pingBadge.classList.remove('hidden');
      this.snowballs = [];
      this.processedHitIds.clear();
      this.player.skillManager.activeBarriers = [];
      this.matchResult = null;
      this.matchCountdown = countdownSec || 3;

      if (myRecord && typeof window.refreshMyRecordUI === 'function') {
        window.refreshMyRecordUI(myRecord);
      }

      // 결과/재대결 오버레이 숨기기 및 버튼 초기화
      const resultOverlay = document.getElementById('match-result-overlay');
      if (resultOverlay) resultOverlay.classList.add('hidden');
      const btnRematch = document.getElementById('btn-rematch');
      if (btnRematch) {
        btnRematch.disabled = false;
        btnRematch.classList.remove('accepted');
        btnRematch.innerText = '🔄 재대결 신청 (0/2)';
      }
      const rematchStatus = document.getElementById('rematch-status-text');
      if (rematchStatus) {
        rematchStatus.innerText = '상대방과 재대결하려면 아래 버튼을 누르세요!';
      }

      // 훈련장 전용 UI 숨기기
      const botLabel = document.getElementById('bot-name-label');
      if (botLabel) botLabel.innerText = opponentName;
      const botSelect = document.getElementById('bot-mode-select');
      if (botSelect) botSelect.style.display = 'none';
      const resetBtn = document.getElementById('btn-reset-training');
      if (resetBtn) resetBtn.style.display = 'none';
      const lineBtn = document.getElementById('btn-toggle-line');
      if (lineBtn) lineBtn.style.display = 'none';

      // 모달 닫고 인게임 화면 전환
      const titleScreen = document.getElementById('title-screen');
      const gameScreen = document.getElementById('game-screen');
      const modalModes = document.getElementById('modal-game-modes');
      const modalQuick = document.getElementById('modal-quick-match');
      const modalRoom = document.getElementById('modal-room-code');

      if (modalModes) modalModes.classList.add('hidden');
      if (modalQuick) modalQuick.classList.add('hidden');
      if (modalRoom) modalRoom.classList.add('hidden');
      if (titleScreen) titleScreen.classList.add('hidden');
      if (gameScreen) gameScreen.classList.remove('hidden');

      // 카운트다운 오버레이 표시
      const overlay = document.getElementById('match-countdown-overlay');
      const countNum = document.getElementById('countdown-number');
      const countTitle = document.getElementById('countdown-title');
      if (countTitle) {
        if (isRematch) {
          countTitle.innerText = `🔥 ROUND ${round || 2} 재대결 시작! (나 ${myWins || 0} : ${oppWins || 0} ${opponentName})`;
        } else {
          countTitle.innerText = `1:1 눈싸움 매칭 완료! (${myCustomNick} vs ${opponentName})`;
        }
      }
      if (countNum) countNum.innerText = String(this.matchCountdown);
      if (overlay) overlay.classList.remove('hidden');

      if (typeof window.requestGameFullscreen === 'function') {
        window.requestGameFullscreen();
      }

      this.resize();
      if (!this.isRunning) {
        this.start();
      }
      if (this.sound) this.sound.playChargeFull();
    };

    this.network.onOpponentState = (msg) => {
      if (this.opponent) {
        this.opponent.applyNetworkState(msg);
      }
    };

    this.network.onOpponentRoll = (msg) => {
      if (this.opponent) {
        this.opponent.startNetworkRoll(msg);
        if (this.sound) this.sound.playRoll();
      }
    };

    this.network.onOpponentThrow = (msg) => {
      // 투사체 지연 시간 선행 보정 (Projectile Lag Forward Compensation)
      const ping = (this.network && typeof this.network.ping === 'number') ? this.network.ping : 0;
      const latencySec = Math.max(0, Math.min(0.20, (ping / 2) / 1000));
      const speed = msg.speed || (380 + (msg.chargeRatio || 0) * 440);
      const advanceDist = speed * latencySec;

      const sb = new Snowball({
        id: msg.id,
        x: msg.x + (msg.dirX || 0) * advanceDist,
        y: msg.y + (msg.dirY || 0) * advanceDist,
        dirX: msg.dirX,
        dirY: msg.dirY,
        chargeRatio: msg.chargeRatio,
        owner: 'opponent',
        damage: msg.damage || 1
      });
      sb.traveled += advanceDist;
      this.snowballs.push(sb);
      if (this.sound) this.sound.playThrow(msg.chargeRatio);
    };

    this.network.onOpponentSkill = (msg) => {
      if (!this.opponent) return;

      const ping = (this.network && typeof this.network.ping === 'number') ? this.network.ping : 0;
      const latencySec = Math.max(0, Math.min(0.20, (ping / 2) / 1000));

      // 서버에서 미러링된 발사 원점 및 조준 타겟 좌표 사용
      const startX = typeof msg.x === 'number' ? msg.x : this.opponent.x;
      const startY = typeof msg.y === 'number' ? msg.y : (this.opponent.y - 20);
      const targetX = typeof msg.targetX === 'number' ? msg.targetX : this.player.x;
      const targetY = typeof msg.targetY === 'number' ? msg.targetY : (this.player.y - 20);

      if (msg.skillType === 'q') {
        const baseAngle = Math.atan2(targetY - startY, targetX - startX);
        // X축 좌우 미러링 시 (baseAngle' = PI - baseAngle) 원래 3갈래와 동일한 Y성분을 유지하도록 부호 반전
        const spreads = [-0.22, 0, 0.22];
        const ids = Array.isArray(msg.ids) ? msg.ids : [];
        spreads.forEach((angleOffset, idx) => {
          const a = baseAngle - angleOffset;
          const dx = Math.cos(a);
          const dy = Math.sin(a);
          const speed = 380 + 0.65 * 440;
          const advanceDist = speed * latencySec;
          const sb = new Snowball({
            id: ids[idx] || undefined,
            x: startX + dx * advanceDist,
            y: startY + dy * advanceDist,
            dirX: dx,
            dirY: dy,
            chargeRatio: 0.65,
            owner: 'opponent',
            damage: 1,
            isSkill: true,
            skillType: 'q'
          });
          sb.traveled += advanceDist;
          this.snowballs.push(sb);
        });
        if (this.sound) this.sound.playSkillCast();
        this.particles.addFloatingText(this.opponent.x, this.opponent.y - 70, '트리플 샷!', '#38bdf8');
      } else if (msg.skillType === 'e') {
        let bx = typeof msg.bx === 'number' ? msg.bx : null;
        let by = typeof msg.by === 'number' ? msg.by : null;
        if (bx === null || by === null) {
          const angle = Math.atan2(targetY - this.opponent.y, targetX - this.opponent.x);
          const dist = Math.min(130, Math.hypot(targetX - this.opponent.x, targetY - this.opponent.y));
          bx = this.opponent.x + Math.cos(angle) * dist;
          by = this.opponent.y + Math.sin(angle) * dist;
        }
        this.opponent.activeBarriers.push({
          id: msg.barrierId || `b_opp_${Date.now()}`,
          x: bx,
          y: by,
          w: 48,
          h: 56,
          hp: 3,
          maxHp: 3,
          duration: 6.0
        });
        if (this.sound) this.sound.playSkillCast();
        this.particles.addFloatingText(this.opponent.x, this.opponent.y - 70, '상대 빙벽!', '#f43f5e');
      } else if (msg.skillType === 'rmb') {
        const rawDx = targetX - startX;
        const rawDy = targetY - startY;
        const len = Math.hypot(rawDx, rawDy) || 1;
        const dx = rawDx / len;
        const dy = rawDy / len;
        const speed = 380 + 1.0 * 440;
        const advanceDist = speed * latencySec;

        const sb = new Snowball({
          id: msg.sbId || undefined,
          x: startX + dx * advanceDist,
          y: startY + dy * advanceDist,
          dirX: dx,
          dirY: dy,
          chargeRatio: 1.0,
          owner: 'opponent',
          damage: 2,
          isSkill: true,
          skillType: 'rmb'
        });
        sb.traveled += advanceDist;
        this.snowballs.push(sb);
        if (this.sound) this.sound.playChargeFull();
        this.particles.addFloatingText(this.opponent.x, this.opponent.y - 70, '메가 눈폭탄!', '#f43f5e', 24);
      }
    };

    // 상대방이 내 피격을 확인하여 확정 데미지를 보냈을 때 (또는 내 화면에서 아직 판정 안 된 투사체 처리)
    this.network.onOpponentDamage = (msg) => {
      if (this.matchResult) return;
      if (msg.sbId && this.processedHitIds.has(msg.sbId)) return;
      if (msg.sbId) this.processedHitIds.add(msg.sbId);

      // 만약 내가 구르기 무적 상태라면 데미지 무시 및 회피 통보
      if (this.player.isRollInvulnerable()) {
        this.particles.addFloatingText(this.player.x, this.player.y - 60, '회피!', '#bae6fd');
        this.network.sendDodge(this.player.hp, msg.sbId);
        return;
      }

      // 해당 눈덩이가 아직 내 화면에 남아있다면 폭발 처리
      if (msg.sbId) {
        const idx = this.snowballs.findIndex(s => s.id === msg.sbId);
        if (idx !== -1) {
          this.snowballs[idx].explode(this.particles, this.sound, true);
          this.snowballs.splice(idx, 1);
        }
      }

      this.player.takeDamage(msg.damage, msg.fromX, this.particles, this.sound);
      this.triggerCameraShake(8, 0.2);
    };

    // 공격자가 내게 맞았다고 판정 요청 (SYNC_HIT_CHECK)
    this.network.onOpponentHitCheck = (msg) => {
      if (this.matchResult || this.player.isDead) return;
      if (msg.sbId && this.processedHitIds.has(msg.sbId)) return;

      if (this.player.isRollInvulnerable()) {
        if (msg.sbId) this.processedHitIds.add(msg.sbId);
        this.particles.addFloatingText(this.player.x, this.player.y - 60, '회피!', '#bae6fd');
        this.network.sendDodge(this.player.hp, msg.sbId);
        return;
      }

      if (msg.sbId) {
        this.processedHitIds.add(msg.sbId);
        const idx = this.snowballs.findIndex(s => s.id === msg.sbId);
        if (idx !== -1) {
          this.snowballs[idx].explode(this.particles, this.sound, true);
          this.snowballs.splice(idx, 1);
        }
      }

      const applied = this.player.takeDamage(msg.damage, msg.fromX, this.particles, this.sound);
      if (applied) {
        this.triggerCameraShake(8, 0.2);
      } else {
        this.network.sendDodge(this.player.hp, msg.sbId);
      }
    };

    // 상대방이 내 눈덩이를 구르기로 회피했을 때
    this.network.onOpponentDodge = (msg) => {
      if (this.opponent) {
        this.opponent.onDodge(msg, this.particles);
      }
    };

    // 상대방 눈덩이가 내 빙벽을 타격하거나 내 눈덩이가 상대 빙벽을 타격했을 때 동기화
    this.network.onOpponentBarrierHit = (msg) => {
      if (!msg.barrierId) return;
      for (const b of this.player.skillManager.activeBarriers) {
        if (b.id === msg.barrierId) {
          b.hp -= (msg.damage || 1);
          break;
        }
      }
    };

    // 서버로부터 경기 종료 후 확정 전적 & 세트 스코어 수신
    this.network.onMatchOverStats = (msg) => {
      const setScoreEl = document.getElementById('result-set-score');
      if (setScoreEl && typeof msg.myWins === 'number' && typeof msg.oppWins === 'number') {
        const oppName = this.opponent ? this.opponent.name : '상대';
        setScoreEl.innerText = `나 ${msg.myWins} : ${msg.oppWins} ${oppName} (R${msg.round || 1})`;
      }
      if (msg.myRecord) {
        const r = msg.myRecord;
        const totalEl = document.getElementById('result-total-record');
        if (totalEl) {
          totalEl.innerText = `${r.wins}승 ${r.losses}패 (승률 ${r.winRate}%)`;
        }
        if (typeof window.refreshMyRecordUI === 'function') {
          window.refreshMyRecordUI(r);
        }
      }
    };

    // 상대방 또는 나의 재대결 신청 상태 수신 (1/2 또는 2/2)
    this.network.onRematchStatus = (msg) => {
      const statusEl = document.getElementById('rematch-status-text');
      const btnRematch = document.getElementById('btn-rematch');
      const count = msg.acceptedCount || 0;
      const total = msg.totalNeeded || 2;

      if (btnRematch) {
        if (msg.iAccepted) {
          btnRematch.disabled = true;
          btnRematch.classList.add('accepted');
          btnRematch.innerText = `✓ 수락 완료 (${count}/${total})`;
        } else {
          btnRematch.disabled = false;
          btnRematch.classList.remove('accepted');
          btnRematch.innerText = `🔄 재대결 수락하기 (${count}/${total})`;
        }
      }
      if (statusEl) {
        if (msg.iAccepted && !msg.oppAccepted) {
          statusEl.innerText = '⏳ 상대방의 재대결 수락을 기다리는 중입니다...';
        } else if (!msg.iAccepted && msg.oppAccepted) {
          statusEl.innerText = `🔔 ${msg.requesterName || '상대방'}님이 재대결을 요청했습니다! 수락하면 즉시 시작됩니다.`;
        } else if (count >= total) {
          statusEl.innerText = '🔥 양측 모두 수락! 곧 다음 라운드가 시작됩니다!';
        }
      }
      if (this.sound) this.sound.playClick();
    };

    this.network.onOpponentLeft = (message) => {
      if (!this.matchResult) {
        this.particles.addFloatingText(this.centerLineX, 400, '상대방이 나갔습니다. 기권승!', '#facc15', 30);
        this.triggerMatchEnd('VICTORY', message || '상대방이 경기 도중 퇴장하여 기권승을 거두었습니다!');
      }
      const statusEl = document.getElementById('rematch-status-text');
      if (statusEl) {
        statusEl.innerText = '⚠️ 상대방이 방을 나가 재대결을 진행할 수 없습니다.';
      }
      const btnRematch = document.getElementById('btn-rematch');
      if (btnRematch) {
        btnRematch.disabled = true;
        btnRematch.classList.remove('accepted');
        btnRematch.innerText = '상대방 퇴장 (재대결 불가)';
      }
    };
  }

  // 멀티플레이 라운드 승패 확정 및 결과/재대결 UI 표시
  triggerMatchEnd(result, customDesc = null) {
    if (this.matchResult) return;
    this.matchResult = result;

    // 차징 및 이동 키 초기화
    this.player.keys = { w: false, a: false, s: false, d: false };
    this.player.isCharging = false;
    this.player.chargeRatio = 0;
    this.isMouseDown = false;

    // 서버에 라운드 결과 보고 (서버에서 중복 방지 후 전적 저장 및 MATCH_OVER_STATS 브로드캐스트)
    if (this.mode === 'MULTIPLAYER' && this.network) {
      this.network.reportMatchResult(result);
    }

    const overlay = document.getElementById('match-result-overlay');
    const card = overlay ? overlay.querySelector('.match-result-card') : null;
    const titleEl = document.getElementById('result-banner-title');
    const descEl = document.getElementById('result-banner-desc');
    const btnRematch = document.getElementById('btn-rematch');
    const statusEl = document.getElementById('rematch-status-text');

    if (card) {
      card.classList.remove('victory', 'defeat');
      card.classList.add(result === 'VICTORY' ? 'victory' : 'defeat');
    }
    if (titleEl) {
      titleEl.innerText = result === 'VICTORY' ? '🏆 VICTORY 🏆' : '💀 DEFEAT 💀';
    }
    if (descEl) {
      descEl.innerText = customDesc || (
        result === 'VICTORY'
          ? '상대를 쓰러뜨리고 눈싸움에서 승리했습니다!'
          : '눈덩이에 맞아 쓰러졌습니다... 재대결로 설욕해보세요!'
      );
    }
    if (btnRematch) {
      btnRematch.disabled = false;
      btnRematch.classList.remove('accepted');
      btnRematch.innerText = '🔄 재대결 신청 (0/2)';
    }
    if (statusEl) {
      statusEl.innerText = '상대방과 재대결하려면 아래 버튼을 누르세요! (양측 수락 시 즉시 시작)';
    }
    if (overlay) {
      overlay.classList.remove('hidden');
    }
  }

  resize() {
    // 전체화면일 때는 여백 없이 꽉 채우고, 창모드일 때는 안전 여백 적용
    const isFullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;
    const paddingX = isFullscreen ? 0 : 16;
    const paddingY = isFullscreen ? 0 : 16;
    const availW = Math.max(320, window.innerWidth - paddingX);
    const availH = Math.max(240, window.innerHeight - paddingY);

    // 화면 비율 유지 스케일링 (1672 x 940)
    const scaleX = availW / this.virtualWidth;
    const scaleY = availH / this.virtualHeight;
    this.scale = Math.min(scaleX, scaleY);

    this.canvas.width = this.virtualWidth;
    this.canvas.height = this.virtualHeight;

    const displayW = Math.floor(this.virtualWidth * this.scale);
    const displayH = Math.floor(this.virtualHeight * this.scale);

    const stage = document.getElementById('game-stage');
    if (stage) {
      stage.style.width = `${displayW}px`;
      stage.style.height = `${displayH}px`;
    }

    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';

    const rect = this.canvas.getBoundingClientRect();
    this.offsetX = rect.left;
    this.offsetY = rect.top;
  }

  // 화면 마우스 좌표 -> 가상 캔버스 좌표 (1672x940)
  screenToVirtual(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const vx = ((screenX - rect.left) / rect.width) * this.virtualWidth;
    const vy = ((screenY - rect.top) / rect.height) * this.virtualHeight;
    return {
      x: Math.max(0, Math.min(this.virtualWidth, vx)),
      y: Math.max(0, Math.min(this.virtualHeight, vy))
    };
  }

  bindEvents() {
    // 창 포커스 해제 시 키 끼임 및 차징 고착 해제
    window.addEventListener('blur', () => {
      if (this.player) {
        this.player.keys = { w: false, a: false, s: false, d: false };
        this.player.isCharging = false;
        this.player.chargeRatio = 0;
        this.isMouseDown = false;
      }
    });

    // 키보드 입력
    window.addEventListener('keydown', (e) => {
      if (!this.canPlayerAct()) return;
      this.sound.unlock();

      // 단일 선택 스킬 (Q 키 전용)
      if (e.key === 'q' || e.key === 'Q') {
        const res = this.player.skillManager.castEquippedSkill(
          this.mouseVirtualX,
          this.mouseVirtualY,
          this.snowballs,
          this.particles,
          this.sound
        );
        if (res && this.mode === 'MULTIPLAYER') {
          this.network.sendSkill(res.skillType, res.payload);
        }
        return;
      }

      this.player.handleKeyDown(e.key);
    });

    window.addEventListener('keyup', (e) => {
      if (!this.isRunning) return;
      this.player.handleKeyUp(e.key);
    });

    // 마우스 이동
    this.canvas.addEventListener('mousemove', (e) => {
      const v = this.screenToVirtual(e.clientX, e.clientY);
      this.mouseVirtualX = v.x;
      this.mouseVirtualY = v.y;
      this.player.setAim(v.x, v.y);
    });

    // 마우스 좌클릭 차징 (브롤스타즈 탄창 확인)
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.canPlayerAct()) return;
      this.sound.unlock();

      if (e.button === 0) {
        // 좌클릭: 탄창이 1칸 이상일 때 차징 시작
        if (this.player.startCharging(this.particles, this.sound)) {
          this.isMouseDown = true;
        }
      }
    });

    // 우클릭 컨텍스트 메뉴 방지
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 마우스 뗌: 투척 발사
    window.addEventListener('mouseup', (e) => {
      if (!this.isRunning) return;
      if (e.button === 0 && this.isMouseDown) {
        this.isMouseDown = false;
        if (!this.canPlayerAct()) {
          this.player.isCharging = false;
          this.player.chargeRatio = 0;
          return;
        }
        const sb = this.player.releaseCharge(this.snowballs, this.particles, this.sound);
        if (sb && this.mode === 'MULTIPLAYER') {
          this.network.sendThrow(sb);
        }
      }
    });
  }

  startTraining() {
    this.mode = 'TRAINING';
    this.opponent = null;
    this.bot.respawn(null, null);
    this.player.respawn(null, null);
    const myCustomNick = (typeof window.getPlayerNickname === 'function' ? window.getPlayerNickname() : (localStorage.getItem('snow_player_name') || '눈싸움고수'));
    this.player.name = myCustomNick;
    const playerLabel = document.getElementById('player-name-label');
    if (playerLabel) playerLabel.innerText = `${myCustomNick} (1P)`;
    const pingBadge = document.getElementById('hud-ping-badge');
    if (pingBadge) pingBadge.classList.add('hidden');
    this.snowballs = [];
    this.processedHitIds.clear();
    this.player.skillManager.activeBarriers = [];
    this.matchResult = null;
    this.matchCountdown = 0;

    const overlay = document.getElementById('match-countdown-overlay');
    if (overlay) overlay.classList.add('hidden');
    const resultOverlay = document.getElementById('match-result-overlay');
    if (resultOverlay) resultOverlay.classList.add('hidden');

    const botLabel = document.getElementById('bot-name-label');
    if (botLabel) botLabel.innerText = this.bot.name;
    const botSelect = document.getElementById('bot-mode-select');
    if (botSelect) botSelect.style.display = '';
    const resetBtn = document.getElementById('btn-reset-training');
    if (resetBtn) resetBtn.style.display = '';
    const lineBtn = document.getElementById('btn-toggle-line');
    if (lineBtn) lineBtn.style.display = '';

    this.start();
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.isRunning = false;
    if (this.mode === 'MULTIPLAYER') {
      this.network.leaveMatch();
    }
    const pingBadge = document.getElementById('hud-ping-badge');
    if (pingBadge) pingBadge.classList.add('hidden');
    const resultOverlay = document.getElementById('match-result-overlay');
    if (resultOverlay) resultOverlay.classList.add('hidden');
  }

  reset() {
    this.player.respawn(null, null);
    if (this.mode === 'TRAINING') {
      this.bot.respawn(null, null);
    }
    this.snowballs = [];
    this.processedHitIds.clear();
    this.player.skillManager.activeBarriers = [];
    this.matchResult = null;

    if (!this.showCenterLine) {
      this.player.bounds.maxX = 1540;
      this.bot.bounds.minX = 130;
    } else {
      this.player.bounds.maxX = 800;
      this.bot.bounds.minX = 870;
    }
  }

  toggleCenterLine() {
    this.setCenterLineEnabled(!this.showCenterLine);
    return this.showCenterLine;
  }

  setCenterLineEnabled(enabled) {
    this.showCenterLine = enabled;
    if (this.showCenterLine) {
      this.player.bounds.maxX = 800;
      this.bot.bounds.minX = 870;
      if (this.player.x > 800) this.player.x = 780;
      if (this.bot.x < 870) this.bot.x = 900;
      this.particles.addFloatingText(this.centerLineX, 420, '🚧 중앙 라인 생성 (영역 제한)', '#38bdf8', 22);
    } else {
      this.player.bounds.maxX = 1540;
      this.bot.bounds.minX = 130;
      this.particles.addFloatingText(this.centerLineX, 420, '⚡ 중앙 라인 해제 (자유 이동)', '#facc15', 22);
    }
  }

  triggerCameraShake(intensity = 6, duration = 0.15) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  loop(currentTime) {
    if (!this.isRunning) return;

    if (!this.lastTime || this.lastTime > currentTime) {
      this.lastTime = currentTime;
    }
    const dt = Math.max(0.001, Math.min(0.05, (currentTime - this.lastTime) / 1000));
    this.lastTime = currentTime;

    try {
      this.update(dt);
      this.render();
    } catch (err) {
      console.error('[Game Loop Error]', err);
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // 0. 매칭 시작 카운트다운 (3, 2, 1, FIGHT)
    if (this.matchCountdown > 0) {
      this.matchCountdown -= dt;
      const countNum = document.getElementById('countdown-number');
      if (this.matchCountdown <= 0) {
        if (countNum) countNum.innerText = 'FIGHT!';
        setTimeout(() => {
          const overlay = document.getElementById('match-countdown-overlay');
          if (overlay) overlay.classList.add('hidden');
        }, 650);
      } else {
        if (countNum) countNum.innerText = String(Math.ceil(this.matchCountdown));
      }
      return;
    }

    // 카메라 셰이크
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
    }

    // 1. 플레이어 업데이트 (멀티플레이에서는 사망 후 자동 리스폰 비활성화!)
    const allowRespawn = (this.mode === 'TRAINING');
    this.player.update(dt, this.particles, this.sound, allowRespawn);

    // 모바일 조이스틱 & 액션 패드 쿨다운 동기화
    if (this.mobileControls) {
      this.mobileControls.update(dt);
    }

    // 2. 상대방(멀티) vs 더미 봇(훈련) 업데이트
    if (this.mode === 'MULTIPLAYER') {
      this.network.sendPlayerState(this.player);
      if (this.opponent) {
        this.opponent.update(dt, this.particles, this.sound, this.network ? this.network.ping : 0);

        // 승패 체크
        if (this.opponent.isDead && !this.matchResult) {
          this.particles.addFloatingText(this.centerLineX, 360, 'VICTORY! 승리!', '#22c55e', 42);
          this.triggerMatchEnd('VICTORY');
        } else if (this.player.isDead && !this.matchResult) {
          this.particles.addFloatingText(this.centerLineX, 360, 'DEFEAT... 패배', '#ef4444', 42);
          this.triggerMatchEnd('DEFEAT');
        }
      }
    } else {
      this.bot.update(dt, this.player, this.snowballs, this.particles, this.sound);
    }

    // 3. 눈덩이 투사체 업데이트 및 충돌 판정
    for (let i = this.snowballs.length - 1; i >= 0; i--) {
      const sb = this.snowballs[i];
      sb.update(dt, this.particles, this.sound);

      if (sb.isDead) {
        this.snowballs.splice(i, 1);
        continue;
      }

      // 1P 방벽(빙벽) 충돌: 상대/더미가 쏜 눈덩이만 차단 (내 눈덩이는 통과!)
      if (sb.owner !== 'player') {
        for (const barrier of this.player.skillManager.activeBarriers) {
          const dist = Math.hypot(sb.x - barrier.x, sb.y - barrier.y);
          if (dist < sb.radius + barrier.w / 2) {
            barrier.hp -= sb.damage;
            sb.explode(this.particles, this.sound, true);
            this.triggerCameraShake(4, 0.1);
            break;
          }
        }
        if (sb.isDead) {
          this.snowballs.splice(i, 1);
          continue;
        }
      }

      // 상대방 방벽 충돌 (멀티플레이): 내가 쏜 눈덩이만 상대 방벽에 충돌
      if (this.mode === 'MULTIPLAYER' && this.opponent && sb.owner === 'player') {
        for (const barrier of this.opponent.activeBarriers) {
          const dist = Math.hypot(sb.x - barrier.x, sb.y - barrier.y);
          if (dist < sb.radius + barrier.w / 2) {
            barrier.hp -= sb.damage;
            this.network.sendBarrierHit(barrier.id, sb.damage);
            sb.explode(this.particles, this.sound, true);
            this.triggerCameraShake(4, 0.1);
            break;
          }
        }
        if (sb.isDead) {
          this.snowballs.splice(i, 1);
          continue;
        }
      }

      // 플레이어 대상 피격 판정 (상대/더미가 쏜 눈덩이)
      if (sb.owner !== 'player' && !this.player.isDead && !this.matchResult) {
        const pDist = Math.hypot(sb.x - this.player.x, sb.y - (this.player.y - 40));
        if (pDist < sb.radius + 30) {
          // 구르기 무적 상태면 눈덩이가 폭발하지 않고 통과하며 회피 표시!
          if (this.player.isRollInvulnerable()) {
            if (!sb.dodged) {
              sb.dodged = true;
              if (sb.id) this.processedHitIds.add(sb.id);
              this.particles.addFloatingText(this.player.x, this.player.y - 60, '회피!', '#bae6fd');
              if (this.mode === 'MULTIPLAYER') {
                this.network.sendDodge(this.player.hp, sb.id);
              }
            }
            continue;
          }

          // 이미 네트워크 이벤트로 처리된 투사체면 중복 데미지 방지
          if (sb.id && this.processedHitIds.has(sb.id)) {
            sb.explode(this.particles, this.sound, true);
            this.snowballs.splice(i, 1);
            continue;
          }
          if (sb.id) this.processedHitIds.add(sb.id);

          const applied = this.player.takeDamage(sb.damage, sb.x, this.particles, this.sound);
          if (applied) {
            sb.explode(this.particles, this.sound, true);
            this.triggerCameraShake(8, 0.2);
            this.snowballs.splice(i, 1);
            continue;
          }
        }
      }

      // 적 피격 판정 (플레이어가 쏜 눈덩이)
      if (sb.owner === 'player' && !this.matchResult) {
        if (this.mode === 'MULTIPLAYER' && this.opponent && !this.opponent.isDead) {
          const oDist = Math.hypot(sb.x - this.opponent.x, sb.y - (this.opponent.y - 40));
          if (oDist < sb.radius + 30) {
            // 상대방이 구르기 중이면 내 화면에서도 눈덩이가 폭발하지 않고 통과하며 '회피!' 표시!
            if (this.opponent.isRollInvulnerable()) {
              if (!sb.dodged) {
                sb.dodged = true;
                this.particles.addFloatingText(this.opponent.x, this.opponent.y - 60, '회피!', '#bae6fd');
              }
              continue;
            }

            const applied = this.opponent.takeDamage(sb.damage, sb.x, this.particles, this.sound);
            if (applied) {
              // 상대방에게 피격 판정 확인 전송 (상대방이 구르기 중이었다면 SYNC_DODGE로 롤백됨)
              this.network.sendHitCheck(sb.damage, sb.x, sb.id);
              sb.explode(this.particles, this.sound, true);
              this.triggerCameraShake(6, 0.15);
              this.snowballs.splice(i, 1);
              continue;
            }
          }
        } else if (this.mode === 'TRAINING' && !this.bot.isDead) {
          const bDist = Math.hypot(sb.x - this.bot.x, sb.y - (this.bot.y - 40));
          if (bDist < sb.radius + 30) {
            this.bot.takeDamage(sb.damage, sb.x, this.particles, this.sound);
            sb.explode(this.particles, this.sound, true);
            this.triggerCameraShake(6, 0.15);
            this.snowballs.splice(i, 1);
            continue;
          }
        }
      }
    }

    // 4. 파티클 시스템 업데이트
    this.particles.update(dt);
  }

  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    ctx.save();

    // 카메라 셰이크 적용
    if (this.shakeDuration > 0) {
      const sx = (Math.random() - 0.5) * this.shakeIntensity * 2;
      const sy = (Math.random() - 0.5) * this.shakeIntensity * 2;
      ctx.translate(sx, sy);
    }

    // 1. 경기장 배경 렌더링
    if (this.sprites.bgImg) {
      ctx.drawImage(this.sprites.bgImg, 0, 0, this.virtualWidth, this.virtualHeight);
    } else {
      ctx.fillStyle = '#b0cbe8';
      ctx.fillRect(0, 0, this.virtualWidth, this.virtualHeight);
    }

    // 2. 경기장 중앙 라인 & 영역 시각화
    if (this.showCenterLine) {
      this.drawArenaBoundaries(ctx);
    }

    // 3. 브롤스타즈 스타일 조준선 (Aim Trajectory Guide)
    if (!this.player.isDead) {
      this.drawBrawlStarsAim(ctx);
    }

    // 4. Y-Sorting 렌더링 (플레이어, 봇/상대방, 투사체 정렬)
    const opponentEntity = (this.mode === 'MULTIPLAYER' && this.opponent)
      ? { type: 'opponent', y: this.opponent.y, draw: () => this.opponent.draw(ctx, this.sprites) }
      : { type: 'bot', y: this.bot.y, draw: () => this.bot.draw(ctx, this.sprites) };

    const entities = [
      { type: 'player', y: this.player.y, draw: () => this.player.draw(ctx, this.sprites) },
      opponentEntity
    ];

    for (const sb of this.snowballs) {
      entities.push({
        type: 'snowball',
        y: sb.y,
        draw: () => sb.draw(ctx, this.sprites)
      });
    }

    entities.sort((a, b) => a.y - b.y);
    for (const ent of entities) {
      ent.draw();
    }

    // 5. 파티클 & 플로팅 텍스트
    this.particles.draw(ctx);

    // 6. 멀티 대전 승패 결과 배너 (DOM 오버레이가 없을 때만 폴백으로 캔버스 렌더링)
    if (this.mode === 'MULTIPLAYER' && this.matchResult && !document.getElementById('match-result-overlay')) {
      this.drawMatchResultBanner(ctx);
    }

    ctx.restore();
  }

  // 승리/패배 결과 안내 배너 (픽셀 아케이드 스타일)
  drawMatchResultBanner(ctx) {
    ctx.save();
    const cx = this.virtualWidth / 2;
    const cy = this.virtualHeight / 2 - 40;

    // 반투명 어두운 배경 박스
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = this.matchResult === 'VICTORY' ? '#facc15' : '#ef4444';
    ctx.lineWidth = 4;

    const bw = 540;
    const bh = 170;
    ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);

    // 상단 타이틀
    ctx.font = 'bold 38px "PixelFont", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.matchResult === 'VICTORY') {
      ctx.fillStyle = '#facc15';
      ctx.fillText('🏆 VICTORY 🏆', cx, cy - 28);
      ctx.font = 'bold 18px "PixelFont", monospace, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText('상대를 쓰러뜨리고 눈싸움에서 승리했습니다!', cx, cy + 20);
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.fillText('💀 DEFEAT 💀', cx, cy - 28);
      ctx.font = 'bold 18px "PixelFont", monospace, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText('눈덩이에 맞아 쓰러졌습니다... 다시 도전해보세요!', cx, cy + 20);
    }

    ctx.font = '13px "PixelFont", monospace, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('상단 [나가기] 버튼으로 로비로 돌아갈 수 있습니다', cx, cy + 54);

    ctx.restore();
  }

  // 경기장 분할 라인 및 영역 안내 렌더링
  drawArenaBoundaries(ctx) {
    ctx.save();

    const cx = this.centerLineX; // 836

    // 중앙 분할선 빛 효과 (반투명 네온 블루)
    const grad = ctx.createLinearGradient(cx - 15, 0, cx + 15, 0);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.45)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - 15, 140, 30, 595);

    // 중앙 분할선 점선 가이드
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(cx, 140);
    ctx.lineTo(cx, 735);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  // 브롤스타즈 스타일의 역동적 에임 인디케이터
  drawBrawlStarsAim(ctx) {
    ctx.save();

    const startX = this.player.x;
    const startY = this.player.y - 20;

    const dx = this.mouseVirtualX - startX;
    const dy = this.mouseVirtualY - startY;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // 차징에 따른 사정거리 계산
    const minRange = 400;
    const maxRange = 1100;
    const currentMaxRange = minRange + (maxRange - minRange) * this.player.chargeRatio;
    const aimLength = Math.min(dist, currentMaxRange);

    const targetX = startX + dirX * aimLength;
    const targetY = startY + dirY * aimLength;

    const isFull = this.player.chargeRatio >= 1.0;
    const baseColor = isFull ? 'rgba(250, 204, 21, 0.85)' : 'rgba(56, 189, 248, 0.75)';
    const fillColor = isFull ? 'rgba(254, 240, 138, 0.25)' : 'rgba(186, 230, 253, 0.18)';

    // 조준 궤적 점선
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = isFull ? 4 : 3;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 조준 끝점 타겟 레티클
    ctx.strokeStyle = baseColor;
    ctx.fillStyle = fillColor;
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.arc(targetX, targetY, isFull ? 15 : 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 십자선
    const crossSize = isFull ? 8 : 6;
    ctx.beginPath();
    ctx.moveTo(targetX - crossSize, targetY);
    ctx.lineTo(targetX + crossSize, targetY);
    ctx.moveTo(targetX, targetY - crossSize);
    ctx.lineTo(targetX, targetY + crossSize);
    ctx.stroke();

    ctx.restore();
  }
}
