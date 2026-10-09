// skills.js - 스킬 시스템 및 방벽 객체
class SkillManager {
  constructor(player) {
    this.player = player;

    // 3가지 스킬 정의
    this.skills = {
      q: {
        id: 'q',
        name: '눈보라 트리플',
        desc: '전방 3방향으로 눈덩이를 연속 확산 발사합니다.',
        cost: 2,
        cooldown: 4.0,
        currentCooldown: 0,
        icon: '❄️x3',
        keyLabel: 'Q'
      },
      e: {
        id: 'e',
        name: '눈사람 빙벽',
        desc: '전방에 상대 눈덩이를 막아주는 단단한 얼음 벽을 세웁니다.',
        cost: 3,
        cooldown: 7.0,
        currentCooldown: 0,
        icon: '⛄벽',
        keyLabel: 'E'
      },
      rmb: {
        id: 'rmb',
        name: '메가 눈폭탄',
        desc: '거대한 눈폭탄을 투척하여 명중 시 큰 폭발을 일으킵니다.',
        cost: 4,
        cooldown: 8.0,
        currentCooldown: 0,
        icon: '💣눈',
        keyLabel: '우클릭'
      }
    };

    this.activeBarriers = [];
  }

  update(dt, particles, sound) {
    // 쿨다운 감소
    for (const key in this.skills) {
      const sk = this.skills[key];
      if (sk.currentCooldown > 0) {
        sk.currentCooldown = Math.max(0, sk.currentCooldown - dt);
      }
    }

    // 방벽 업데이트
    for (let i = this.activeBarriers.length - 1; i >= 0; i--) {
      const b = this.activeBarriers[i];
      b.life -= dt;
      if (b.life <= 0 || b.hp <= 0) {
        if (particles) {
          particles.createSnowExplosion(b.x, b.y, 14, 1.2);
        }
        if (sound) sound.playSplat();
        this.activeBarriers.splice(i, 1);
      }
    }
  }

  // Q 스킬 발동 (트리플 눈덩이)
  castQ(targetX, targetY, snowballs, particles, sound) {
    const sk = this.skills.q;
    if (sk.currentCooldown > 0 || this.player.cost < sk.cost || this.player.isDead) {
      if (sound && (sk.currentCooldown > 0 || this.player.cost < sk.cost)) sound.playDeny();
      return false;
    }

    this.player.cost -= sk.cost;
    sk.currentCooldown = sk.cooldown;
    if (sound) sound.playSkillCast();
    if (particles) particles.addFloatingText(this.player.x, this.player.y - 70, 'Q 스킬!', '#67e8f9');

    // 각도 계산 및 3갈래 발사 (-15도, 0도, +15도)
    const baseAngle = Math.atan2(targetY - this.player.y, targetX - this.player.x);
    const spreads = [-0.22, 0, 0.22];

    spreads.forEach(angleOffset => {
      const a = baseAngle + angleOffset;
      const sb = new Snowball({
        x: this.player.x,
        y: this.player.y - 20,
        dirX: Math.cos(a),
        dirY: Math.sin(a),
        chargeRatio: 0.65,
        owner: 'player',
        damage: 1,
        isSkill: true,
        skillType: 'q'
      });
      snowballs.push(sb);
    });

    this.player.triggerThrowMotion();
    return true;
  }

  // E 스킬 발동 (눈사람 방벽 설치)
  castE(targetX, targetY, particles, sound) {
    const sk = this.skills.e;
    if (sk.currentCooldown > 0 || this.player.cost < sk.cost || this.player.isDead) {
      if (sound && (sk.currentCooldown > 0 || this.player.cost < sk.cost)) sound.playDeny();
      return false;
    }

    this.player.cost -= sk.cost;
    sk.currentCooldown = sk.cooldown;
    if (sound) sound.playSkillCast();
    if (particles) particles.addFloatingText(this.player.x, this.player.y - 70, '빙벽 소환!', '#38bdf8');

    // 플레이어 앞쪽 (라인 안쪽)에 방벽 생성
    const angle = Math.atan2(targetY - this.player.y, targetX - this.player.x);
    const dist = Math.min(130, Math.hypot(targetX - this.player.x, targetY - this.player.y));
    let bx = this.player.x + Math.cos(angle) * dist;
    let by = this.player.y + Math.sin(angle) * dist;

    // 플레이어 구역 내부로 클램핑 (x: 150 ~ 780, y: 220 ~ 680)
    bx = Math.max(150, Math.min(780, bx));
    by = Math.max(220, Math.min(680, by));

    this.activeBarriers.push({
      x: bx,
      y: by,
      w: 48,
      h: 60,
      hp: 3,
      maxHp: 3,
      life: 5.5,
      maxLife: 5.5
    });

    if (particles) {
      particles.createSnowExplosion(bx, by, 18, 1);
    }
    return true;
  }

  // 우클릭 스킬 발동 (메가 눈폭탄)
  castRMB(targetX, targetY, snowballs, particles, sound) {
    const sk = this.skills.rmb;
    if (sk.currentCooldown > 0 || this.player.cost < sk.cost || this.player.isDead) {
      if (sound && (sk.currentCooldown > 0 || this.player.cost < sk.cost)) sound.playDeny();
      return false;
    }

    this.player.cost -= sk.cost;
    sk.currentCooldown = sk.cooldown;
    if (sound) sound.playSkillCast();
    if (particles) particles.addFloatingText(this.player.x, this.player.y - 70, '메가 눈폭탄!', '#f59e0b');

    const dirX = targetX - this.player.x;
    const dirY = targetY - this.player.y;

    const sb = new Snowball({
      x: this.player.x,
      y: this.player.y - 20,
      dirX,
      dirY,
      chargeRatio: 1.0,
      owner: 'player',
      damage: 2, // 메가 폭탄은 데미지 2!
      isSkill: true,
      skillType: 'rmb'
    });
    // 추가 크기 및 폭발력
    sb.radius = 24;
    sb.scale = 1.9;
    snowballs.push(sb);

    this.player.triggerThrowMotion();
    return true;
  }

  drawBarriers(ctx) {
    for (const b of this.activeBarriers) {
      ctx.save();
      // 바닥 그림자
      ctx.fillStyle = 'rgba(20, 30, 60, 0.3)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 10, b.w / 2, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // 얼음/눈 벽 도트 그래픽
      ctx.translate(Math.floor(b.x), Math.floor(b.y));

      // 벽 본체
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);

      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(-b.w / 2 + 4, -b.h / 2 + 4, b.w - 8, b.h - 8);

      // 눈사람 데코
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -b.h / 2, 16, 0, Math.PI * 2);
      ctx.fill();

      // 눈사람 눈코
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-6, -b.h / 2 - 2, 3, 3);
      ctx.fillRect(3, -b.h / 2 - 2, 3, 3);
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(-2, -b.h / 2 + 2, 4, 3);

      // 테두리
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0284c7';
      ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);

      // HP 게이지
      const hpWidth = (b.hp / b.maxHp) * (b.w - 6);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-b.w / 2 + 2, -b.h / 2 - 12, b.w - 4, 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-b.w / 2 + 3, -b.h / 2 - 11, hpWidth, 4);

      ctx.restore();
    }
  }
}

window.SkillManager = SkillManager;
