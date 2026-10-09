// game.js - 메인 게임 엔진, 렌더링 루프 및 입력/충돌 처리
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

    // 게임 엔티티
    this.player = new Player({ x: 420, y: 460, isPlayer: true, name: '1P (나)' });
    this.bot = new TrainingBot({ x: 1250, y: 460, mode: 'DUMMY' });
    this.snowballs = [];

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

    this.bindEvents();
  }

  async init() {
    await this.sprites.loadAll();
    this.resize();
    window.addEventListener('resize', () => this.resize());
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
      stage.style.setProperty('--ui-scale', this.scale);
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
        this.player.skillManager.castQ(
          this.mouseVirtualX,
          this.mouseVirtualY,
          this.snowballs,
          this.particles,
          this.sound
        );
        return;
      }

      // E 스킬
      if (e.key === 'e' || e.key === 'E') {
        this.player.skillManager.castE(
          this.mouseVirtualX,
          this.mouseVirtualY,
          this.particles,
          this.sound
        );
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
        this.player.skillManager.castRMB(
          this.mouseVirtualX,
          this.mouseVirtualY,
          this.snowballs,
          this.particles,
          this.sound
        );
      }
    });

    // 우클릭 컨텍스트 메뉴 방지
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // 마우스 뗌: 투척 발사
    window.addEventListener('mouseup', (e) => {
      if (!this.isRunning) return;
      if (e.button === 0 && this.isMouseDown) {
        this.isMouseDown = false;
        this.player.releaseCharge(this.snowballs, this.particles, this.sound);
      }
    });
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.isRunning = false;
  }

  reset() {
    this.player.respawn(null, null);
    this.bot.respawn(null, null);
    this.snowballs = [];
    this.player.skillManager.activeBarriers = [];
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
      // 중앙 라인 활성화: 1P 좌측(800), 2P 우측(870) 구역 제한
      this.player.bounds.maxX = 800;
      this.bot.bounds.minX = 870;
      if (this.player.x > 800) {
        this.player.x = 780;
      }
      if (this.bot.x < 870) {
        this.bot.x = 900;
      }
      this.particles.addFloatingText(this.centerLineX, 420, '🚧 중앙 라인 생성 (영역 제한)', '#38bdf8', 22);
    } else {
      // 중앙 라인 해제: 전체 경기장 자유 이동 (130 ~ 1540)
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
    // 카메라 셰이크
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
    }

    // 1. 플레이어 업데이트
    this.player.update(dt, this.particles, this.sound);

    // 2. 훈련용 봇 업데이트
    this.bot.update(dt, this.player, this.snowballs, this.particles, this.sound);

    // 3. 눈덩이 투사체 업데이트 및 충돌 판정
    for (let i = this.snowballs.length - 1; i >= 0; i--) {
      const sb = this.snowballs[i];
      sb.update(dt, this.particles, this.sound);

      if (sb.isDead) {
        this.snowballs.splice(i, 1);
        continue;
      }

      // 방벽(빙벽) 충돌 검사
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

      // 플레이어 대상 충돌 (적이 쏜 눈덩이)
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

      // 봇 대상 충돌 (플레이어가 쏜 눈덩이)
      if (sb.owner === 'player' && !this.bot.isDead) {
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

    // 2. 경기장 중앙 라인 & 영역 시각화 (토글 가능)
    if (this.showCenterLine) {
      this.drawArenaBoundaries(ctx);
    }

    // 3. 브롤스타즈 스타일 조준선 (Aim Trajectory Guide)
    if (!this.player.isDead) {
      this.drawBrawlStarsAim(ctx);
    }

    // 4. Y-Sorting 렌더링 (플레이어, 봇, 투사체 깊이 순서 정렬)
    const entities = [
      { type: 'player', y: this.player.y, draw: () => this.player.draw(ctx, this.sprites) },
      { type: 'bot', y: this.bot.y, draw: () => this.bot.draw(ctx, this.sprites) }
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

  // 브롤스타즈 스타일의 역동적 에임 인디케이터 (Aim Trajectory Guide)
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
    // 차징 중이면 현재 차징에 따른 사정거리, 비차징이면 기본 사정거리 표시
    const currentMaxRange = minRange + (maxRange - minRange) * this.player.chargeRatio;
    const aimLength = Math.min(dist, currentMaxRange);

    const targetX = startX + dirX * aimLength;
    const targetY = startY + dirY * aimLength;

    // 조준선 스타일 색상 (차징 비율에 따라 색상 변화)
    const isFull = this.player.chargeRatio >= 1.0;
    const baseColor = isFull ? 'rgba(250, 204, 21, 0.85)' : 'rgba(56, 189, 248, 0.75)';
    const fillColor = isFull ? 'rgba(254, 240, 138, 0.25)' : 'rgba(186, 230, 253, 0.18)';

    // 1. 부채꼴/직사각형 궤적 영역 (브롤스타즈 투사체 가이드 폭)
    const width = 22 + this.player.chargeRatio * 10;
    const perpX = -dirY * (width / 2);
    const perpY = dirX * (width / 2);

    ctx.beginPath();
    ctx.moveTo(startX + perpX, startY + perpY);
    ctx.lineTo(targetX + perpX, targetY + perpY);
    ctx.lineTo(targetX - perpX, targetY - perpY);
    ctx.lineTo(startX - perpX, startY - perpY);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. 중심 점선 궤적
    const dotCount = Math.floor(aimLength / 35);
    for (let i = 1; i <= dotCount; i++) {
      const step = (i / dotCount) * aimLength;
      const dotX = startX + dirX * step;
      const dotY = startY + dirY * step;

      ctx.fillStyle = isFull ? '#fef08a' : '#ffffff';
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. 착지 타겟 서클 (Landing Circle)
    ctx.beginPath();
    ctx.arc(targetX, targetY, 18 + this.player.chargeRatio * 8, 0, Math.PI * 2);
    ctx.fillStyle = isFull ? 'rgba(250, 204, 21, 0.35)' : 'rgba(56, 189, 248, 0.3)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = baseColor;
    ctx.stroke();

    // 타겟 서클 내부 십자선 (크로스헤어)
    ctx.strokeStyle = isFull ? '#fef08a' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetX - 7, targetY);
    ctx.lineTo(targetX + 7, targetY);
    ctx.moveTo(targetX, targetY - 7);
    ctx.lineTo(targetX, targetY + 7);
    ctx.stroke();

    ctx.restore();
  }
}

window.Game = Game;
