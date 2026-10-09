// player.js - 플레이어 캐릭터 클래스
class Player {
  constructor({ x = 400, y = 450, isPlayer = true, name = '플레이어' }) {
    this.x = x;
    this.y = y;
    this.isPlayer = isPlayer;
    this.name = name;

    // 이동 경계 (배경 경기장의 좌측 영역)
    this.bounds = {
      minX: 130,
      maxX: 800,
      minY: 190,
      maxY: 710
    };

    // 속도
    this.baseSpeed = 290;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1; // 1: right, -1: left

    // HP 시스템
    this.maxHp = 5;
    this.hp = 5;
    this.isDead = false;
    this.respawnTimer = 0;

    // 코스트 시스템 (최대 10)
    this.maxCost = 10;
    this.cost = 5; // 시작 코스트 5
    this.costRechargeRate = 0.75; // 초당 0.75 충전

    // 구르기 (Shift)
    this.rollCooldown = 2.0;
    this.currentRollCooldown = 0;
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollDuration = 0.42;
    this.rollDirX = 1;
    this.rollDirY = 0;
    this.rollSpeed = 640;
    this.isInvulnerable = false; // 구르기 무적

    // 차징 시스템
    this.isCharging = false;
    this.chargeRatio = 0;
    this.maxChargeTime = 1.1; // 완충까지 1.1초
    this.chargeTimer = 0;
    this.playedFullChargeSound = false;

    // 투척 모션
    this.isThrowing = false;
    this.throwTimer = 0;
    this.throwDuration = 0.3;

    // 피격 상태
    this.hitFlashTimer = 0;
    this.knockbackX = 0;
    this.knockbackY = 0;

    // 애니메이션
    this.animName = 'idle';
    this.animTimer = 0;
    this.ghosts = [];

    // 입력 상태
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      shift: false
    };
    this.aimX = 900;
    this.aimY = 450;
    this.isMouseDown = false;

    // 모바일 가상 조이스틱 입력 상태
    this.joystickX = 0;
    this.joystickY = 0;
    this.hasJoystickInput = false;

    // 스킬 매니저
    this.skillManager = new SkillManager(this);
  }

  setJoystick(x, y) {
    this.joystickX = x;
    this.joystickY = y;
    this.hasJoystickInput = Math.hypot(x, y) > 0.05;
    if (this.hasJoystickInput && !this.isRolling && !this.isDead) {
      if (!this.isCharging && Math.abs(x) > 0.15) {
        this.facing = x > 0 ? 1 : -1;
      }
    }
  }

  handleKeyDown(key) {
    if (this.isDead) return;
    const k = key.toLowerCase();
    if (k === 'w') this.keys.w = true;
    if (k === 'a') this.keys.a = true;
    if (k === 's') this.keys.s = true;
    if (k === 'd') this.keys.d = true;

    // 구르기
    if (key === 'Shift') {
      this.triggerRoll();
    }
  }

  handleKeyUp(key) {
    const k = key.toLowerCase();
    if (k === 'w') this.keys.w = false;
    if (k === 'a') this.keys.a = false;
    if (k === 's') this.keys.s = false;
    if (k === 'd') this.keys.d = false;
  }

  setAim(x, y) {
    this.aimX = x;
    this.aimY = y;
    if (!this.isRolling && !this.isDead) {
      this.facing = this.aimX >= this.x ? 1 : -1;
    }
  }

  startCharging() {
    if (this.isDead || this.isRolling) return;
    this.isCharging = true;
    this.chargeTimer = 0;
    this.chargeRatio = 0;
    this.playedFullChargeSound = false;
  }

  releaseCharge(snowballs, particles, sound) {
    if (!this.isCharging) return;
    this.isCharging = false;

    if (this.isDead || this.isRolling) return;

    // 눈덩이 발사
    const dirX = this.aimX - this.x;
    const dirY = this.aimY - this.y;

    const sb = new Snowball({
      x: this.x,
      y: this.y - 20,
      dirX,
      dirY,
      chargeRatio: this.chargeRatio,
      owner: 'player',
      damage: 1
    });

    snowballs.push(sb);
    if (sound) sound.playThrow(this.chargeRatio);

    this.triggerThrowMotion();
    this.chargeRatio = 0;
    return sb;
  }

  triggerThrowMotion() {
    this.isThrowing = true;
    this.throwTimer = 0;
  }

  triggerRoll() {
    if (this.isRolling || this.isDead) return;
    // 쿨타임 및 코스트 확인
    if (this.currentRollCooldown > 0 || this.cost < 1) {
      if (window.sounds) window.sounds.playDeny();
      return;
    }

    // 코스트 1 소모, 쿨다운 설정
    this.cost -= 1;
    this.currentRollCooldown = this.rollCooldown;

    // 구르는 방향 결정: 조이스틱 또는 WASD 입력 방향 (없으면 조준/바라보는 방향)
    let dx = 0;
    let dy = 0;
    if (this.hasJoystickInput && Math.hypot(this.joystickX, this.joystickY) > 0.1) {
      dx = this.joystickX;
      dy = this.joystickY;
    } else {
      if (this.keys.d) dx += 1;
      if (this.keys.a) dx -= 1;
      if (this.keys.s) dy += 1;
      if (this.keys.w) dy -= 1;
    }

    if (dx === 0 && dy === 0) {
      dx = this.facing;
    }

    const len = Math.hypot(dx, dy) || 1;
    this.rollDirX = dx / len;
    this.rollDirY = dy / len;

    this.isRolling = true;
    this.rollTimer = 0;
    this.animTimer = 0; // 반드시 0부터 4프레임 순차 재생!
    this.isInvulnerable = true;
    this.isCharging = false;
    this.chargeRatio = 0;

    // 구르는 방향을 바라보도록 facing 정렬
    if (Math.abs(this.rollDirX) > 0.05) {
      this.facing = this.rollDirX > 0 ? 1 : -1;
    }

    if (window.sounds) window.sounds.playRoll();
  }

  takeDamage(amount, fromX, particles, sound) {
    if (this.isDead) return;
    if (this.isInvulnerable || this.isRolling) {
      // 회피 성공
      if (particles) particles.addFloatingText(this.x, this.y - 60, '회피!', '#38bdf8', 18);
      return;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.2;

    // 넉백
    const kDir = this.x >= fromX ? 1 : -1;
    this.knockbackX = kDir * 180;

    if (particles) {
      particles.addFloatingText(this.x, this.y - 60, `-${amount} HP`, '#ef4444', 22);
      particles.createSnowExplosion(this.x, this.y - 20, 16, 1.2);
    }

    if (this.hp <= 0) {
      this.isDead = true;
      this.respawnTimer = 2.5;
      this.isCharging = false;
      this.isRolling = false;
      if (sound) sound.playDefeat();
      if (particles) particles.addFloatingText(this.x, this.y - 90, 'K.O!', '#dc2626', 28);
    }
  }

  respawn(particles, sound) {
    this.hp = this.maxHp;
    this.isDead = false;
    this.cost = 5;
    this.x = 350;
    this.y = 450;
    this.knockbackX = 0;
    this.knockbackY = 0;
    this.isRolling = false;
    this.isCharging = false;
    if (sound) sound.playRespawn();
    if (particles) {
      particles.addFloatingText(this.x, this.y - 70, '부활!', '#22c55e', 22);
      particles.createSnowExplosion(this.x, this.y, 25, 1.5);
    }
  }

  update(dt, particles, sound) {
    // 1. 코스트 회복
    if (!this.isDead) {
      this.cost = Math.min(this.maxCost, this.cost + this.costRechargeRate * dt);
    }

    // 2. 구르기 쿨다운
    if (this.currentRollCooldown > 0) {
      this.currentRollCooldown = Math.max(0, this.currentRollCooldown - dt);
    }

    // 3. 스킬 업데이트
    this.skillManager.update(dt, particles, sound);

    // 4. 피격 플래시 & 넉백 감쇄
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
    }
    this.knockbackX *= Math.pow(0.01, dt);
    this.knockbackY *= Math.pow(0.01, dt);

    // 5. 사망 및 리스폰
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

    // 6. 구르기 진행 중
    if (this.isRolling) {
      this.rollTimer += dt;
      this.animName = 'roll';
      this.animTimer += dt;

      // 부드러운 가감속 곡선 (다이빙 급가속 -> 착지 감속)
      const progress = Math.min(1, this.rollTimer / this.rollDuration);
      const speedCurve = Math.sin((1 - progress) * Math.PI * 0.5) * 1.35 + 0.5;

      // 구르기 이동
      this.x += this.rollDirX * this.rollSpeed * speedCurve * dt;
      this.y += this.rollDirY * this.rollSpeed * speedCurve * dt;

      // 잔상 생성
      if (Math.random() < 0.65) {
        this.ghosts.push({
          x: this.x,
          y: this.y,
          facing: this.facing,
          alpha: 0.8,
          animTimer: this.animTimer
        });
      }

      // 눈먼지 파티클
      if (particles && Math.random() < 0.5) {
        particles.createRollPuff(this.x, this.y, this.rollDirX);
      }

      if (this.rollTimer >= this.rollDuration) {
        this.isRolling = false;
        this.isInvulnerable = false;
        this.animTimer = 0;
        this.facing = this.aimX >= this.x ? 1 : -1;
      }
    } else {
      // 일반 이동 (WASD or 조이스틱)
      let mx = 0;
      let my = 0;
      let speedScale = 1;
      let isMoving = false;

      if (this.hasJoystickInput) {
        mx = this.joystickX;
        my = this.joystickY;
        const jLen = Math.hypot(mx, my);
        isMoving = jLen > 0.08;
        speedScale = Math.min(1, Math.max(0.2, jLen));
        if (jLen > 0) {
          mx /= jLen;
          my /= jLen;
        }
      } else {
        if (this.keys.d) mx += 1;
        if (this.keys.a) mx -= 1;
        if (this.keys.s) my += 1;
        if (this.keys.w) my -= 1;

        const kLen = Math.hypot(mx, my);
        isMoving = kLen > 0;
        if (kLen > 0) {
          mx /= kLen;
          my /= kLen;
        }
      }

      // 차징 중이면 이동 속도 45%로 감소
      let curSpeed = this.baseSpeed * speedScale;
      if (this.isCharging) {
        curSpeed *= 0.45;
      }

      this.vx = mx * curSpeed + this.knockbackX;
      this.vy = my * curSpeed + this.knockbackY;

      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // 차징 진행
      if (this.isCharging) {
        this.chargeTimer += dt;
        this.chargeRatio = Math.min(1, this.chargeTimer / this.maxChargeTime);

        // 차징 파티클
        if (particles && Math.random() < 0.5) {
          particles.createChargeGather(this.x, this.y);
        }

        // 완충 사운드
        if (this.chargeRatio >= 1 && !this.playedFullChargeSound) {
          this.playedFullChargeSound = true;
          if (sound) sound.playChargeFull();
          if (particles) particles.createSnowExplosion(this.x, this.y - 20, 10, 0.6);
        }
      }

      // 투척 모션 진행
      if (this.isThrowing) {
        this.throwTimer += dt;
        if (this.throwTimer >= this.throwDuration) {
          this.isThrowing = false;
        }
      }

      // 애니메이션 결정
      if (this.hitFlashTimer > 0) {
        this.animName = 'hit';
      } else if (this.isThrowing) {
        this.animName = 'throw';
      } else if (this.isCharging) {
        this.animName = 'charge';
      } else if (isMoving) {
        this.animName = 'move';
      } else {
        this.animName = 'idle';
      }

      this.animTimer += dt;
    }

    // 잔상 감쇄
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].alpha -= dt * 3.5;
      if (this.ghosts[i].alpha <= 0) {
        this.ghosts.splice(i, 1);
      }
    }

    // 경기장 영역 제한 (클램핑)
    this.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.x));
    this.y = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.y));
  }

  draw(ctx, spriteManager) {
    // 캐릭터 렌더링
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

    // 방벽 렌더링
    this.skillManager.drawBarriers(ctx);

    // 머리 위 UI (HP 하트, 차징 바)
    this.drawOverheadUI(ctx);
  }

  drawOverheadUI(ctx) {
    if (this.isDead) return;

    ctx.save();
    const uiY = this.y - 120;

    // 닉네임
    ctx.font = 'bold 13px "PixelFont", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(this.name, this.x + 1, uiY - 9);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.name, this.x, uiY - 10);

    // HP 하트 5개 표시
    const heartSpacing = 16;
    const startX = this.x - ((this.maxHp - 1) * heartSpacing) / 2;
    for (let i = 0; i < this.maxHp; i++) {
      const hx = startX + i * heartSpacing;
      const isFilled = i < this.hp;

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      if (isFilled) {
        ctx.fillText('❤️', hx, uiY + 6);
      } else {
        ctx.fillText('🖤', hx, uiY + 6);
      }
    }

    // 차징 중일 때 머리 위 게이지 바
    if (this.isCharging) {
      const barW = 64;
      const barH = 7;
      const barX = this.x - barW / 2;
      const barY = uiY + 16;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      // 게이지 색상 (차오를수록 청록 -> 황금빛)
      const grad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(1, this.chargeRatio >= 1 ? '#facc15' : '#818cf8');

      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW * this.chargeRatio, barH);

      // 완충 시 빛나는 테두리
      if (this.chargeRatio >= 1) {
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);
      }
    }

    ctx.restore();
  }
}

window.Player = Player;
