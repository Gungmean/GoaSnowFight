// js/remotePlayer.js - 실시간 멀티플레이어 2P 상대방 엔티티
class RemotePlayer {
  constructor({ x = 1250, y = 450, name = '2P 상대방' }) {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.vx = 0;
    this.vy = 0;
    this.name = name;

    // 경기장 우측 영역
    this.bounds = {
      minX: 870,
      maxX: 1540,
      minY: 190,
      maxY: 710
    };

    this.facing = -1; // 기본적으로 왼쪽(1P 나)을 바라봄
    this.maxHp = 5;
    this.hp = 5;
    this.isDead = false;

    // 차징 상태
    this.isCharging = false;
    this.chargeRatio = 0;

    // 구르기 상태
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollDuration = 0.42;
    this.rollDirX = -1;
    this.rollDirY = 0;
    this.rollSpeed = 640;
    this.rollGraceTimer = 0;
    this.ghosts = [];

    // 피격 상태
    this.hitFlashTimer = 0;
    this.knockbackX = 0;
    this.knockbackY = 0;

    // 애니메이션
    this.animName = 'idle';
    this.animTimer = 0;

    // 빙벽 목록 (E 스킬)
    this.activeBarriers = [];
  }

  // 즉시 구르기 패킷(SYNC_ROLL) 수신 또는 상태 변화 시 발동
  startNetworkRoll(msg = {}) {
    if (this.isDead) return;
    if (typeof msg.x === 'number') {
      this.targetX = msg.x;
      this.x = msg.x;
    }
    if (typeof msg.y === 'number') {
      this.targetY = msg.y;
      this.y = msg.y;
    }
    if (typeof msg.rollDirX === 'number') this.rollDirX = msg.rollDirX;
    if (typeof msg.rollDirY === 'number') this.rollDirY = msg.rollDirY;
    if (typeof msg.facing === 'number') this.facing = msg.facing;

    if (!this.isRolling) {
      if (window.sounds) window.sounds.playRoll();
    }
    this.isRolling = true;
    this.rollTimer = 0;
    this.rollGraceTimer = 0.15;
    this.animName = 'roll';
    this.animTimer = 0;
    this.isCharging = false;
    this.chargeRatio = 0;
  }

  isRollInvulnerable() {
    return this.isRolling || this.rollGraceTimer > 0;
  }

  // 상대방이 구르기로 회피 성공 시 상태 동기화 (SYNC_DODGE)
  onDodge(msg = {}, particles) {
    if (typeof msg.hp === 'number' && !this.isDead) {
      this.hp = msg.hp;
    }
    this.hitFlashTimer = 0;
    this.knockbackX = 0;
    this.knockbackY = 0;
    if (particles) {
      particles.addFloatingText(this.x, this.y - 60, '회피!', '#38bdf8', 18);
    }
  }

  // 재대결 또는 라운드 시작 시 원격 플레이어 상태 리셋
  respawn({ x = 1250, y = 450, hp = 5, name = null, round = 1 } = {}) {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.vx = 0;
    this.vy = 0;
    this.facing = -1;
    if (name) this.name = name;
    this.round = round;
    this.hp = hp;
    this.isDead = false;
    this.animName = 'idle';
    this.animTimer = 0;
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollGraceTimer = 0;
    this.isCharging = false;
    this.chargeRatio = 0;
    this.hitFlashTimer = 0;
    this.knockbackX = 0;
    this.knockbackY = 0;
    this.activeBarriers = [];
  }

  // 네트워크 패킷 수신 시 상태 갱신
  applyNetworkState(state) {
    if (!state) return;

    // 이전 라운드의 지연된 패킷이면 무시
    if (typeof state.round === 'number' && typeof this.round === 'number' && state.round < this.round) {
      return;
    }

    if (typeof state.hp === 'number') {
      if (state.hp > 0) {
        this.hp = state.hp;
        if (this.isDead) {
          // 재대결 등으로 부활한 경우 상태 정상 복원
          this.isDead = false;
          this.animName = state.animName || 'idle';
        }
      } else {
        this.hp = 0;
        this.isDead = true;
        this.animName = 'lose';
        this.isCharging = false;
        this.isRolling = false;
      }
    }

    // 이미 사망한 경우 위치/행동을 갱신하지 않고 패배 모션 고정
    if (this.isDead) {
      this.animName = 'lose';
      this.isCharging = false;
      this.isRolling = false;
      return;
    }

    if (typeof state.x === 'number') this.targetX = state.x;
    if (typeof state.y === 'number') this.targetY = state.y;
    if (typeof state.vx === 'number') this.vx = state.vx;
    if (typeof state.vy === 'number') this.vy = state.vy;
    if (typeof state.facing === 'number') this.facing = state.facing;
    if (typeof state.rollDirX === 'number') this.rollDirX = state.rollDirX;
    if (typeof state.rollDirY === 'number') this.rollDirY = state.rollDirY;

    if (typeof state.isRolling === 'boolean') {
      if (state.isRolling && !this.isRolling) {
        this.startNetworkRoll(state);
      } else if (!state.isRolling && this.isRolling && this.rollTimer >= this.rollDuration * 0.85) {
        this.isRolling = false;
        this.rollGraceTimer = 0.12;
      }
    }

    if (!this.isRolling) {
      if (state.animName) this.animName = state.animName;
      if (typeof state.animTimer === 'number') this.animTimer = state.animTimer;
    }

    if (typeof state.isCharging === 'boolean') this.isCharging = this.isRolling ? false : state.isCharging;
    if (typeof state.chargeRatio === 'number') this.chargeRatio = state.chargeRatio;
  }

  takeDamage(amount, fromX, particles, sound, confirmedHp = null) {
    if (this.isDead) return false;
    if (this.isRollInvulnerable() && confirmedHp === null) {
      if (particles) particles.addFloatingText(this.x, this.y - 60, '회피!', '#38bdf8', 18);
      return false;
    }

    if (typeof confirmedHp === 'number') {
      this.hp = Math.max(0, confirmedHp);
    } else {
      this.hp = Math.max(0, this.hp - amount);
    }
    this.hitFlashTimer = 0.2;

    const kDir = this.x >= fromX ? 1 : -1;
    this.knockbackX = kDir * 160;

    if (particles) {
      particles.addFloatingText(this.x, this.y - 60, `-${amount} HP`, '#f87171', 22);
      particles.createSnowExplosion(this.x, this.y - 20, 16, 1.2);
    }

    if (this.hp <= 0) {
      this.isDead = true;
      this.isRolling = false;
      this.isCharging = false;
      this.animName = 'lose';
      if (sound) sound.playDefeat();
      if (particles) particles.addFloatingText(this.x, this.y - 90, 'K.O!', '#dc2626', 28);
    }
    return true;
  }

  update(dt, particles, sound, pingMs = 0) {
    // 구르기 유예 타이머 감쇄
    if (!this.isRolling && this.rollGraceTimer > 0) {
      this.rollGraceTimer = Math.max(0, this.rollGraceTimer - dt);
    }

    // 1. 구르기 진행 중이면 구르기 물리 궤적 시뮬레이션 + 목표점 보간
    if (this.isRolling && !this.isDead) {
      this.rollTimer += dt;
      this.animName = 'roll';
      this.animTimer += dt;

      const progress = Math.min(1, this.rollTimer / this.rollDuration);
      const speedCurve = Math.sin((1 - progress) * Math.PI * 0.5) * 1.35 + 0.5;
      this.targetX += this.rollDirX * this.rollSpeed * speedCurve * dt * 0.35;
      this.targetY += this.rollDirY * this.rollSpeed * speedCurve * dt * 0.35;
      this.targetX = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.targetX));
      this.targetY = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.targetY));

      if (this.rollTimer >= this.rollDuration) {
        this.isRolling = false;
        this.rollGraceTimer = 0.12;
        this.animName = 'idle';
      }
    }

    // 2. 데드 레코닝 (Dead Reckoning) 위치 외삽 예측 + LERP 보간
    const latencySec = Math.max(0, Math.min(0.25, (pingMs / 2) / 1000));
    const predictedX = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.targetX + this.vx * latencySec));
    const predictedY = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.targetY + this.vy * latencySec));

    const lerpSpeed = 22;
    this.x += (predictedX - this.x) * Math.min(1, lerpSpeed * dt);
    this.y += (predictedY - this.y) * Math.min(1, lerpSpeed * dt);

    // 3. 피격 플래시 & 넉백 감쇄
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
    this.knockbackX *= Math.pow(0.01, dt);
    this.knockbackY *= Math.pow(0.01, dt);
    this.x += this.knockbackX * dt;
    this.y += this.knockbackY * dt;

    this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
    this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));

    // 사망 시 패배 모션 고정
    if (this.isDead) {
      this.animName = 'lose';
    }

    // 4. 구르기 시 잔상 효과
    if (this.isRolling) {
      if (Math.random() < 0.65) {
        this.ghosts.push({
          x: this.x,
          y: this.y,
          facing: this.facing,
          alpha: 0.8,
          animTimer: this.animTimer
        });
      }
      if (particles && Math.random() < 0.4) {
        particles.createRollPuff(this.x, this.y, this.facing);
      }
    }

    // 5. 잔상 감쇄
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].alpha -= dt * 3.5;
      if (this.ghosts[i].alpha <= 0) this.ghosts.splice(i, 1);
    }

    // 6. 방벽(E 스킬) 지속시간 감쇄
    for (let i = this.activeBarriers.length - 1; i >= 0; i--) {
      const b = this.activeBarriers[i];
      b.duration -= dt;
      if (b.duration <= 0 || b.hp <= 0) {
        if (particles) particles.createSnowExplosion(b.x, b.y, 22, 1.2);
        this.activeBarriers.splice(i, 1);
      }
    }

    // 애니메이션 타이머
    if (!this.isRolling) {
      this.animTimer += dt;
    }
  }

  draw(ctx, spriteManager) {
    // 방벽 렌더링
    for (const b of this.activeBarriers) {
      this.drawSingleBarrier(ctx, b);
    }

    // 캐릭터 렌더링
    spriteManager.drawCharacter(ctx, {
      x: this.x,
      y: this.y,
      animName: this.isDead ? 'lose' : this.animName,
      animTimer: this.animTimer,
      facing: this.facing,
      scale: 0.42,
      isFlash: this.hitFlashTimer > 0,
      ghosts: this.ghosts
    });

    this.drawOverheadUI(ctx);
  }

  drawSingleBarrier(ctx, b) {
    ctx.save();
    // 눈사람 방벽
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 20, 24, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(b.x, b.y - 12, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 눈사람 눈코
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(b.x - 5, b.y - 15, 2.5, 0, Math.PI * 2);
    ctx.arc(b.x + 5, b.y - 15, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(b.x, b.y - 10, 3, 0, Math.PI * 2);
    ctx.fill();

    // HP 게이지
    const barW = 46;
    const barH = 5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(b.x - barW / 2, b.y - 38, barW, barH);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(b.x - barW / 2, b.y - 38, (b.hp / b.maxHp) * barW, barH);

    ctx.restore();
  }

  drawOverheadUI(ctx) {
    if (this.isDead) return;

    ctx.save();
    const uiY = this.y - 120;

    // 닉네임 (2P 빨강 계열)
    ctx.font = 'bold 13px "PixelFont", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(this.name, this.x + 1, uiY - 9);
    ctx.fillStyle = '#fda4af';
    ctx.fillText(this.name, this.x, uiY - 10);

    // HP 하트 5개 표시
    const heartSpacing = 16;
    const startX = this.x - ((this.maxHp - 1) * heartSpacing) / 2;
    for (let i = 0; i < this.maxHp; i++) {
      const hx = startX + i * heartSpacing;
      const isFilled = i < this.hp;

      ctx.font = '14px "PixelFont", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      if (isFilled) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('❤️', hx, uiY + 12);
      } else {
        ctx.fillStyle = '#475569';
        ctx.fillText('🖤', hx, uiY + 12);
      }
    }

    // 차징 중이면 차징 게이지 표시
    if (this.isCharging && this.chargeRatio > 0.1) {
      const barW = 48;
      const barH = 6;
      const barX = this.x - barW / 2;
      const barY = uiY + 22;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(barX, barY, barW, barH);

      const fillW = Math.max(0, Math.min(barW, barW * this.chargeRatio));
      ctx.fillStyle = this.chargeRatio >= 1 ? '#f59e0b' : '#38bdf8';
      ctx.fillRect(barX, barY, fillW, barH);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barW, barH);
    }

    ctx.restore();
  }
}
