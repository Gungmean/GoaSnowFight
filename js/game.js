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

  async init() {
    await this.sprites.loadAll();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.network.connect();
  }

  bindNetworkEvents() {
    this.network.onMatchStart = ({ role, opponentName, countdownSec }) => {
      console.log(`[GAME] 1:1 대전 시작! 내 역할: ${role}, 상대: ${opponentName}`);
      this.mode = 'MULTIPLAYER';
      this.opponent = new RemotePlayer({ x: 1250, y: 460, name: opponentName });
      this.player.respawn(null, null);
      this.player.name = role === 'p1' ? '1P (나)' : '나 (Player 2)';
      this.snowballs = [];
      this.player.skillManager.activeBarriers = [];
      this.matchResult = null;
      this.matchCountdown = countdownSec || 3;

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
      if (countTitle) countTitle.innerText = `1:1 눈싸움 매칭 완료! (${opponentName} vs 나)`;
      if (countNum) countNum.innerText = String(this.matchCountdown);
      if (overlay) overlay.classList.remove('hidden');

      if (typeof window.requestGameFullscreen === 'function') {
        window.requestGameFullscreen();
      }

      this.resize();
      this.start();
      if (this.sound) this.sound.playChargeFull();
    };

    this.network.onOpponentState = (msg) => {
      if (this.opponent) {
        this.opponent.applyNetworkState(msg);
      }
    };

    this.network.onOpponentThrow = (msg) => {
      const sb = new Snowball({
        x: msg.x,
        y: msg.y,
        dirX: msg.dirX,
        dirY: msg.dirY,
        chargeRatio: msg.chargeRatio,
        owner: 'opponent',
        damage: msg.damage || 1
      });
      this.snowballs.push(sb);
      if (this.sound) this.sound.playThrow(msg.chargeRatio);
    };

    this.network.onOpponentSkill = (msg) => {
      if (!this.opponent) return;

      if (msg.skillType === 'q') {
        const baseAngle = Math.atan2(msg.targetY - this.opponent.y, msg.targetX - this.opponent.x);
        const spreads = [-0.22, 0, 0.22];
        spreads.forEach(angleOffset => {
          const a = baseAngle + angleOffset;
          const sb = new Snowball({
            x: this.opponent.x,
            y: this.opponent.y - 20,
            dirX: Math.cos(a),
            dirY: Math.sin(a),
            chargeRatio: 0.65,
            owner: 'opponent',
            damage: 1,
            isSkill: true,
            skillType: 'q'
          });
          this.snowballs.push(sb);
        });
        if (this.sound) this.sound.playSkillCast();
      } else if (msg.skillType === 'e') {
        const angle = Math.atan2(msg.targetY - this.opponent.y, msg.targetX - this.opponent.x);
        const dist = Math.min(130, Math.hypot(msg.targetX - this.opponent.x, msg.targetY - this.opponent.y));
        const bx = this.opponent.x + Math.cos(angle) * dist;
        const by = this.opponent.y + Math.sin(angle) * dist;
        this.opponent.activeBarriers.push({
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
        const sb = new Snowball({
          x: this.opponent.x,
          y: this.opponent.y - 20,
          dirX: msg.targetX - this.opponent.x,
          dirY: msg.targetY - this.opponent.y,
          chargeRatio: 1.0,
          owner: 'opponent',
          damage: 2,
          isSkill: true,
          skillType: 'rmb'
        });
        this.snowballs.push(sb);
        if (this.sound) this.sound.playChargeFull();
      }
    };

    this.network.onOpponentDamage = (msg) => {
      this.player.takeDamage(msg.damage, msg.fromX, this.particles, this.sound);
    };

    this.network.onOpponentLeft = (message) => {
      this.particles.addFloatingText(this.centerLineX, 400, '상대방이 나갔습니다. 승리!', '#facc15', 30);
      this.matchResult = 'VICTORY';
    };
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
    // 키보드 입력
    window.addEventListener('keydown', (e) => {
      if (!this.isRunning) return;
      this.sound.unlock();

      // Q 스킬
      if (e.key === 'q' || e.key === 'Q') {
        const ok = this.player.skillManager.castQ(
          this.mouseVirtualX,
          this.mouseVirtualY,
          this.snowballs,
          this.particles,
          this.sound
        );
        if (ok && this.mode === 'MULTIPLAYER') {
          this.network.sendSkill('q', { targetX: this.mouseVirtualX, targetY: this.mouseVirtualY });
        }
        return;
      }

      // E 스킬
      if (e.key === 'e' || e.key === 'E') {
        const ok = this.player.skillManager.castE(
          this.mouseVirtualX,
          this.mouseVirtualY,
          this.particles,
          this.sound
        );
        if (ok && this.mode === 'MULTIPLAYER') {
          this.network.sendSkill('e', { targetX: this.mouseVirtualX, targetY: this.mouseVirtualY });
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

    // 마우스 좌클릭 차징
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.isRunning) return;
      this.sound.unlock();

      if (e.button === 0) {
        // 좌클릭: 차징 시작
        this.isMouseDown = true;
        this.player.startCharging();
      } else if (e.button === 2) {
        // 우클릭: 메가 눈폭탄 스킬
        e.preventDefault();
        const ok = this.player.skillManager.castRMB(
          this.mouseVirtualX,
          this.mouseVirtualY,
          this.snowballs,
          this.particles,
          this.sound
        );
        if (ok && this.mode === 'MULTIPLAYER') {
          this.network.sendSkill('rmb', { targetX: this.mouseVirtualX, targetY: this.mouseVirtualY });
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
    this.player.name = '1P (나)';
    this.snowballs = [];
    this.player.skillManager.activeBarriers = [];
    this.matchResult = null;
    this.matchCountdown = 0;

    const overlay = document.getElementById('match-countdown-overlay');
    if (overlay) overlay.classList.add('hidden');

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
  }

  reset() {
    this.player.respawn(null, null);
    if (this.mode === 'TRAINING') {
      this.bot.respawn(null, null);
    }
    this.snowballs = [];
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

    this.update(dt);
    this.render();

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

    // 1. 플레이어 업데이트
    this.player.update(dt, this.particles, this.sound);

    // 모바일 조이스틱 & 액션 패드 쿨다운 동기화
    if (this.mobileControls) {
      this.mobileControls.update(dt);
    }

    // 2. 상대방(멀티) vs 더미 봇(훈련) 업데이트
    if (this.mode === 'MULTIPLAYER') {
      this.network.sendPlayerState(this.player);
      if (this.opponent) {
        this.opponent.update(dt, this.particles, this.sound);

        // 승패 체크
        if (this.opponent.isDead && !this.matchResult) {
          this.matchResult = 'VICTORY';
          this.particles.addFloatingText(this.centerLineX, 360, 'VICTORY! 승리!', '#22c55e', 42);
        } else if (this.player.isDead && !this.matchResult) {
          this.matchResult = 'DEFEAT';
          this.particles.addFloatingText(this.centerLineX, 360, 'DEFEAT... 패배', '#ef4444', 42);
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

      // 1P 방벽(빙벽) 충돌
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

      // 상대방 방벽 충돌 (멀티플레이)
      if (this.mode === 'MULTIPLAYER' && this.opponent) {
        for (const barrier of this.opponent.activeBarriers) {
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

      // 플레이어 대상 피격 판정 (상대/더미가 쏜 눈덩이)
      if (sb.owner !== 'player' && !this.player.isDead) {
        const pDist = Math.hypot(sb.x - this.player.x, sb.y - (this.player.y - 40));
        if (pDist < sb.radius + 32) {
          this.player.takeDamage(sb.damage, sb.x, this.particles, this.sound);
          sb.explode(this.particles, this.sound, true);
          this.triggerCameraShake(8, 0.2);
          this.snowballs.splice(i, 1);
          continue;
        }
      }

      // 적 피격 판정 (플레이어가 쏜 눈덩이)
      if (sb.owner === 'player') {
        if (this.mode === 'MULTIPLAYER' && this.opponent && !this.opponent.isDead) {
          const oDist = Math.hypot(sb.x - this.opponent.x, sb.y - (this.opponent.y - 40));
          if (oDist < sb.radius + 32) {
            this.opponent.takeDamage(sb.damage, sb.x, this.particles, this.sound);
            this.network.sendDamage(sb.damage, sb.x);
            sb.explode(this.particles, this.sound, true);
            this.triggerCameraShake(6, 0.15);
            this.snowballs.splice(i, 1);
            continue;
          }
        } else if (this.mode === 'TRAINING' && !this.bot.isDead) {
          const bDist = Math.hypot(sb.x - this.bot.x, sb.y - (this.bot.y - 40));
          if (bDist < sb.radius + 32) {
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

    // 6. 멀티 대전 승패 결과 배너
    if (this.mode === 'MULTIPLAYER' && this.matchResult) {
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
