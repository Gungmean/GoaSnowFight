// skills.js - 단일 선택 스킬 시스템 (코스트 없음, Q 슬롯 전용 쿨타임제) 및 방벽 객체
class SkillManager {
  constructor(player) {
    this.player = player;

    // 선택 가능한 3가지 스킬 풀 (오직 1개만 선택하여 Q 키로 사용, 코스트 없음)
    this.skills = {
      q: {
        id: 'q',
        name: '눈보라 트리플',
        shortName: '트리플샷',
        desc: '전방 3방향 부채꼴로 눈덩이를 동시 발사합니다.',
        cooldown: 5.0,
        currentCooldown: 0,
        icon: '❄️x3',
        keyLabel: 'Q'
      },
      e: {
        id: 'e',
        name: '눈사람 빙벽',
        shortName: '눈사람벽',
        desc: '전방에 상대 눈덩이를 막아주는 단단한 얼음 눈사람 벽을 세웁니다.',
        cooldown: 8.0,
        currentCooldown: 0,
        icon: '⛄',
        keyLabel: 'Q'
      },
      rmb: {
        id: 'rmb',
        name: '메가 눈폭탄',
        shortName: '메가폭탄',
        desc: '거대한 눈폭탄을 투척하여 명중 시 큰 폭발과 함께 2 피해를 입힙니다.',
        cooldown: 9.0,
        currentCooldown: 0,
        icon: '💣',
        keyLabel: 'Q'
      }
    };

    // 현재 장착된 단일 스킬 ID ('q' | 'e' | 'rmb') - 로컬스토리지 연동
    const saved = (typeof localStorage !== 'undefined') ? localStorage.getItem('snow_equipped_skill') : null;
    this.equippedSkillId = (saved && this.skills[saved]) ? saved : 'q';

    this.activeBarriers = [];
  }

  // 장착 스킬 변경 (오직 1개만 장착)
  setEquippedSkill(skillId) {
    if (!this.skills[skillId]) return false;
    this.equippedSkillId = skillId;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('snow_equipped_skill', skillId);
    }
    return true;
  }

  // 현재 Q에 장착된 스킬 정보 반환
  getEquippedSkill() {
    return this.skills[this.equippedSkillId] || this.skills.q;
  }

  // 모든 쿨다운 초기화
  resetCooldowns() {
    for (const key in this.skills) {
      this.skills[key].currentCooldown = 0;
    }
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

  // 현재 장착된 단일 스킬(Q) 발동! (반환값: { skillType, payload } 또는 false)
  castEquippedSkill(targetX, targetY, snowballs, particles, sound) {
    const id = this.equippedSkillId;
    if (id === 'q') {
      const payload = this.castQ(targetX, targetY, snowballs, particles, sound);
      return payload ? { skillType: 'q', payload } : false;
    } else if (id === 'e') {
      const payload = this.castE(targetX, targetY, particles, sound);
      return payload ? { skillType: 'e', payload } : false;
    } else if (id === 'rmb') {
      const payload = this.castRMB(targetX, targetY, snowballs, particles, sound);
      return payload ? { skillType: 'rmb', payload } : false;
    }
    return false;
  }

  // 1. 눈보라 트리플 발동 (코스트 없음, 쿨타임만 체크)
  castQ(targetX, targetY, snowballs, particles, sound) {
    const sk = this.skills.q;
    if (sk.currentCooldown > 0 || this.player.isDead || this.player.isRolling) {
      if (sound && sk.currentCooldown > 0) sound.playDeny();
      return false;
    }

    sk.currentCooldown = sk.cooldown;
    this.player.isCharging = false;
    this.player.chargeRatio = 0;

    if (sound) sound.playSkillCast();
    if (particles) particles.addFloatingText(this.player.x, this.player.y - 70, '트리플 샷!', '#67e8f9');

    const spawnX = Math.round(this.player.x);
    const spawnY = Math.round(this.player.y - 20);

    // 각도 계산 및 3갈래 발사 (-15도, 0도, +15도)
    const baseAngle = Math.atan2(targetY - spawnY, targetX - spawnX);
    const spreads = [-0.22, 0, 0.22];
    const ids = [];

    spreads.forEach(angleOffset => {
      const a = baseAngle + angleOffset;
      const sb = new Snowball({
        x: spawnX,
        y: spawnY,
        dirX: Math.cos(a),
        dirY: Math.sin(a),
        chargeRatio: 0.65,
        owner: 'player',
        damage: 1,
        isSkill: true,
        skillType: 'q'
      });
      ids.push(sb.id);
      snowballs.push(sb);
    });

    this.player.facing = targetX >= spawnX ? 1 : -1;
    this.player.triggerThrowMotion();
    return {
      x: spawnX,
      y: spawnY,
      targetX: Math.round(targetX),
      targetY: Math.round(targetY),
      ids
    };
  }

  // 2. 눈사람 빙벽 발동 (코스트 없음, 쿨타임만 체크)
  castE(targetX, targetY, particles, sound) {
    const sk = this.skills.e;
    if (sk.currentCooldown > 0 || this.player.isDead || this.player.isRolling) {
      if (sound && sk.currentCooldown > 0) sound.playDeny();
      return false;
    }

    sk.currentCooldown = sk.cooldown;
    this.player.isCharging = false;
    this.player.chargeRatio = 0;

    if (sound) sound.playSkillCast();
    if (particles) particles.addFloatingText(this.player.x, this.player.y - 70, '빙벽 소환!', '#38bdf8');

    // 플레이어 앞쪽 (라인 안쪽)에 방벽 생성
    const angle = Math.atan2(targetY - this.player.y, targetX - this.player.x);
    const dist = Math.min(130, Math.hypot(targetX - this.player.x, targetY - this.player.y));
    let bx = this.player.x + Math.cos(angle) * dist;
    let by = this.player.y + Math.sin(angle) * dist;

    // 플레이어 구역 내부로 클램핑 (x: 150 ~ 780, y: 220 ~ 680)
    bx = Math.round(Math.max(150, Math.min(780, bx)));
    by = Math.round(Math.max(220, Math.min(680, by)));

    const barrierId = `bar_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.activeBarriers.push({
      id: barrierId,
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
    return {
      barrierId,
      bx,
      by,
      targetX: Math.round(targetX),
      targetY: Math.round(targetY)
    };
  }

  // 3. 메가 눈폭탄 발동 (코스트 없음, 쿨타임만 체크)
  castRMB(targetX, targetY, snowballs, particles, sound) {
    const sk = this.skills.rmb;
    if (sk.currentCooldown > 0 || this.player.isDead || this.player.isRolling) {
      if (sound && sk.currentCooldown > 0) sound.playDeny();
      return false;
    }

    sk.currentCooldown = sk.cooldown;
    this.player.isCharging = false;
    this.player.chargeRatio = 0;

    if (sound) sound.playSkillCast();
    if (particles) particles.addFloatingText(this.player.x, this.player.y - 70, '메가 눈폭탄!', '#f59e0b');

    const spawnX = Math.round(this.player.x);
    const spawnY = Math.round(this.player.y - 20);
    const dirX = targetX - spawnX;
    const dirY = targetY - spawnY;

    const sb = new Snowball({
      x: spawnX,
      y: spawnY,
      dirX,
      dirY,
      chargeRatio: 1.0,
      owner: 'player',
      damage: 2, // 메가 폭탄은 데미지 2!
      isSkill: true,
      skillType: 'rmb'
    });
    snowballs.push(sb);

    this.player.facing = targetX >= spawnX ? 1 : -1;
    this.player.triggerThrowMotion();
    return {
      sbId: sb.id,
      x: spawnX,
      y: spawnY,
      targetX: Math.round(targetX),
      targetY: Math.round(targetY)
    };
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
