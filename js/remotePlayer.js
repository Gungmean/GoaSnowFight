// js/remotePlayer.js - 실시간 멀티플레이어 2P 상대방 엔티티
class RemotePlayer {
  constructor({ x = 1250, y = 450, name = '2P 상대방' }) {
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
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

  // 네트워크 패킷 수신 시 상태 갱신
  applyNetworkState(state) {
    if (typeof state.x === 'number') this.targetX = state.x;
    if (typeof state.y === 'number') this.targetY = state.y;
    if (typeof state.facing === 'number') this.facing = state.facing;
    if (state.animName) this.animName = state.animName;
    if (typeof state.animTimer === 'number') this.animTimer = state.animTimer;
    if (typeof state.isCharging === 'boolean') this.isCharging = state.isCharging;
    if (typeof state.chargeRatio === 'number') this.chargeRatio = state.chargeRatio;
    if (typeof state.isRolling === 'boolean') {
      const wasRolling = this.isRolling;
      this.isRolling = state.isRolling;
      if (!wasRolling && this.isRolling) {
        if (window.sounds) window.sounds.playRoll();
      }
    }
    if (typeof state.hp === 'number') {
      this.hp = state.hp;
      if (this.hp <= 0 && !this.isDead) {
        this.isDead = true;
      }
    }
  }

  takeDamage(amount, fromX, particles, sound) {
    if (this.isDead) return;
    if (this.isRolling) {
      if (particles) particles.addFloatingText(this.x, this.y - 60, '회피!', '#38bdf8', 18);
      return;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.2;

    const kDir = this.x >= fromX ? 1 : -1;
    this.knockbackX = kDir * 160;

    if (particles) {
      particles.addFloatingText(this.x, this.y - 60, `-${amount} HP`, '#f87171', 22);
      particles.createSnowExplosion(this.x, this.y - 20, 16, 1.2);
    }

    if (this.hp <= 0) {
      this.isDead = true;
      this.animName = 'lose';
      if (sound) sound.playDefeat();
      if (particles) particles.addFloatingText(this.x, this.y - 90, 'K.O!', '#dc2626', 28);
    }
  }

  update(dt, particles, sound) {
    // 1. 위치 보간 (LERP) - 네트워크 지연 완화
    const lerpSpeed = 16;
    this.x += (this.targetX - this.x) * Math.min(1, lerpSpeed * dt);
    this.y += (this.targetY - this.y) * Math.min(1, lerpSpeed * dt);

    // 2. 피격 플래시 & 넉백 감쇄
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
    this.knockbackX *= Math.pow(0.01, dt);
    this.knockbackY *= Math.pow(0.01, dt);
    this.x += this.knockbackX * dt;
    this.y += this.knockbackY * dt;

    // 3. 구르기 시 잔상 효과
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

    // 4. 잔상 감쇄
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].alpha -= dt * 3.5;
      if (this.ghosts[i].alpha <= 0) this.ghosts.splice(i, 1);
    }

    // 5. 방벽(E 스킬) 지속시간 감쇄
    for (let i = this.activeBarriers.length - 1; i >= 0; i--) {
      const b = this.activeBarriers[i];
      b.duration -= dt;
      if (b.duration <= 0 || b.hp <= 0) {
        if (particles) particles.createSnowExplosion(b.x, b.y, 22, 1.2);
        this.activeBarriers.splice(i, 1);
      }
    }

    // 애니메이션 타이머
    this.animTimer += dt;
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
