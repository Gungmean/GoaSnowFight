// bot.js - 훈련장 연습용 타겟 봇 / 더미 클래스
class TrainingBot {
  constructor({ x = 1250, y = 450, mode = 'DUMMY' }) {
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.mode = mode; // 'DUMMY', 'MOVING', 'BATTLE'
    this.name = '훈련용 더미';

    // 경기장 우측 구역 (중앙선 x=836 기준 오른쪽)
    this.bounds = {
      minX: 870,
      maxX: 1540,
      minY: 190,
      maxY: 710
    };

    this.baseSpeed = 230;
    this.facing = -1; // 플레이어(왼쪽)를 기본으로 바라봄

    // HP
    this.maxHp = 5;
    this.hp = 5;
    this.isDead = false;
    this.respawnTimer = 0;

    // AI 행동 타이머
    this.aiTimer = 0;
    this.moveDirX = 0;
    this.moveDirY = 0;

    // 차징 & 공격
    this.isCharging = false;
    this.chargeRatio = 0;
    this.chargeTimer = 0;
    this.attackCooldown = 2.5;

    // 구르기
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollDuration = 0.4;
    this.rollCooldown = 5.0;
    this.currentRollCooldown = 0;
    this.ghosts = [];

    // 피격
    this.hitFlashTimer = 0;
    this.knockbackX = 0;
    this.knockbackY = 0;

    // 투척
    this.isThrowing = false;
    this.throwTimer = 0;

    // 애니메이션
    this.animName = 'idle';
    this.animTimer = 0;
  }

  setMode(newMode) {
    this.mode = newMode;
    this.isCharging = false;
    this.chargeRatio = 0;
    this.moveDirX = 0;
    this.moveDirY = 0;
    if (newMode === 'DUMMY') {
      this.name = '연습 표적 (정지)';
    } else if (newMode === 'MOVING') {
      this.name = '연습 표적 (이동)';
    } else {
      this.name = 'AI 대전 봇';
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
      this.respawnTimer = 2.5;
      this.isCharging = false;
      this.isRolling = false;
      if (sound) sound.playDefeat();
      if (particles) particles.addFloatingText(this.x, this.y - 90, '더미 파괴!', '#f59e0b', 26);
    }
  }

  respawn(particles, sound) {
    this.hp = this.maxHp;
    this.isDead = false;
    this.x = this.startX;
    this.y = this.startY;
    this.isCharging = false;
    this.isRolling = false;
    this.facing = -1;
    if (particles) {
      particles.addFloatingText(this.x, this.y - 70, '더미 리스폰', '#38bdf8', 20);
      particles.createSnowExplosion(this.x, this.y, 20, 1.2);
    }
  }

  update(dt, player, snowballs, particles, sound) {
    // 피격 플래시 & 넉백
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
    this.knockbackX *= Math.pow(0.01, dt);
    this.knockbackY *= Math.pow(0.01, dt);

    if (this.currentRollCooldown > 0) {
      this.currentRollCooldown = Math.max(0, this.currentRollCooldown - dt);
    }

    // 사망 상태
    if (this.isDead) {
      this.animName = 'lose';
      this.animTimer += dt;
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.respawn(particles, sound);
        }
      }
      return;
    }

    // 플레이어를 향해 시선 유지
    if (player && !this.isRolling) {
      this.facing = player.x > this.x ? 1 : -1;
    }

    // 모드별 AI 행동
    if (this.mode === 'DUMMY') {
      this.animName = this.hitFlashTimer > 0 ? 'hit' : 'idle';
      this.animTimer += dt;
    } else if (this.mode === 'MOVING') {
      this.updateMovingAI(dt);
    } else if (this.mode === 'BATTLE') {
      this.updateBattleAI(dt, player, snowballs, particles, sound);
    }

    // 경기장 영역 제한
    this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
    this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));

    // 잔상 감쇄
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].alpha -= dt * 3.5;
      if (this.ghosts[i].alpha <= 0) this.ghosts.splice(i, 1);
    }
  }

  updateMovingAI(dt) {
    this.aiTimer += dt;
    if (this.aiTimer >= 1.6) {
      this.aiTimer = 0;
      this.moveDirX = (Math.random() - 0.5) * 2;
      this.moveDirY = (Math.random() - 0.5) * 2;
      const len = Math.hypot(this.moveDirX, this.moveDirY) || 1;
      this.moveDirX /= len;
      this.moveDirY /= len;
    }

    this.x += (this.moveDirX * this.baseSpeed * 0.75 + this.knockbackX) * dt;
    this.y += (this.moveDirY * this.baseSpeed * 0.75 + this.knockbackY) * dt;

    this.animName = this.hitFlashTimer > 0 ? 'hit' : 'move';
    this.animTimer += dt;
  }

  updateBattleAI(dt, player, snowballs, particles, sound) {
    this.aiTimer += dt;

    // 투척 모션
    if (this.isThrowing) {
      this.throwTimer += dt;
      if (this.throwTimer >= 0.3) this.isThrowing = false;
    }

    // 구르기 진행
    if (this.isRolling) {
      this.rollTimer += dt;
      this.animName = 'roll';
      this.animTimer += dt;
      this.x += this.moveDirX * 600 * dt;
      this.y += this.moveDirY * 600 * dt;

      if (Math.random() < 0.6) {
        this.ghosts.push({ x: this.x, y: this.y, facing: this.facing, alpha: 0.8, animTimer: this.animTimer });
      }

      if (this.rollTimer >= this.rollDuration) {
        this.isRolling = false;
        this.animTimer = 0;
      }
      return;
    }

    // 주기적 공격 및 이동
    if (this.isCharging) {
      this.chargeTimer += dt;
      this.chargeRatio = Math.min(1, this.chargeTimer / 0.9);

      // 차징 중 미세 이동
      this.x += (this.moveDirX * this.baseSpeed * 0.35 + this.knockbackX) * dt;
      this.y += (this.moveDirY * this.baseSpeed * 0.35 + this.knockbackY) * dt;

      if (this.chargeRatio >= 0.85) {
        // 던지기!
        this.isCharging = false;
        this.isThrowing = true;
        this.throwTimer = 0;

        if (player) {
          const dirX = player.x - this.x;
          const dirY = player.y - this.y;
          const sb = new Snowball({
            x: this.x,
            y: this.y - 20,
            dirX,
            dirY,
            chargeRatio: this.chargeRatio,
            owner: 'bot',
            damage: 1
          });
          snowballs.push(sb);
          if (sound) sound.playThrow(this.chargeRatio);
        }
        this.chargeRatio = 0;
      }
      this.animName = 'charge';
    } else {
      // 일반 이동
      if (this.aiTimer >= 1.8) {
        this.aiTimer = 0;
        this.moveDirX = (Math.random() - 0.5) * 2;
        this.moveDirY = (Math.random() - 0.5) * 2;
        const len = Math.hypot(this.moveDirX, this.moveDirY) || 1;
        this.moveDirX /= len;
        this.moveDirY /= len;

        // 50% 확률로 차징 공격 시작
        if (Math.random() < 0.65 && !player.isDead) {
          this.isCharging = true;
          this.chargeTimer = 0;
          this.chargeRatio = 0;
        }
      }

      this.x += (this.moveDirX * this.baseSpeed * 0.65 + this.knockbackX) * dt;
      this.y += (this.moveDirY * this.baseSpeed * 0.65 + this.knockbackY) * dt;

      if (this.hitFlashTimer > 0) {
        this.animName = 'hit';
      } else if (this.isThrowing) {
        this.animName = 'throw';
      } else {
        this.animName = 'move';
      }
    }

    this.animTimer += dt;
  }

  draw(ctx, spriteManager) {
    spriteManager.drawCharacter(ctx, {
      x: this.x,
      y: this.y,
      animName: this.animName,
      animTimer: this.animTimer,
      facing: this.facing,
      scale: 0.42,
      isFlash: this.hitFlashTimer > 0,
      ghosts: this.ghosts
    });

    this.drawOverheadUI(ctx);
  }

  drawOverheadUI(ctx) {
    if (this.isDead) return;

    ctx.save();
    const uiY = this.y - 120;

    // 더미 이름 & 모드
    ctx.font = 'bold 13px "PixelFont", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(this.name, this.x + 1, uiY - 9);
    ctx.fillStyle = '#fed7aa';
    ctx.fillText(this.name, this.x, uiY - 10);

    // HP 하트
    const heartSpacing = 16;
    const startX = this.x - ((this.maxHp - 1) * heartSpacing) / 2;
    for (let i = 0; i < this.maxHp; i++) {
      const hx = startX + i * heartSpacing;
      const isFilled = i < this.hp;
      ctx.font = '14px "PixelFont", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      if (isFilled) {
        ctx.fillText('❤️', hx, uiY + 6);
      } else {
        ctx.fillText('🖤', hx, uiY + 6);
      }
    }

    // 봇 차징 바
    if (this.isCharging) {
      const barW = 60;
      const barH = 6;
      const barX = this.x - barW / 2;
      const barY = uiY + 16;

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      ctx.fillStyle = '#f87171';
      ctx.fillRect(barX, barY, barW * this.chargeRatio, barH);
    }

    ctx.restore();
  }
}

window.TrainingBot = TrainingBot;
