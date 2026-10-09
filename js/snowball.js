// snowball.js - 눈덩이 투사체 클래스
class Snowball {
  constructor({
    x,
    y,
    dirX,
    dirY,
    chargeRatio = 0,
    owner = 'player',
    damage = 1,
    isSkill = false,
    skillType = null
  }) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.owner = owner;
    this.damage = damage;
    this.chargeRatio = Math.min(1, Math.max(0, chargeRatio));
    this.isSkill = isSkill;
    this.skillType = skillType;

    // 방향 정규화
    const len = Math.hypot(dirX, dirY) || 1;
    this.dirX = dirX / len;
    this.dirY = dirY / len;

    // 차징에 따른 속도 및 사정거리
    const minSpeed = 700;
    const maxSpeed = 1450;
    this.speed = minSpeed + (maxSpeed - minSpeed) * this.chargeRatio;

    const minRange = 400;
    const maxRange = 1100;
    this.maxRange = minRange + (maxRange - minRange) * this.chargeRatio;

    this.traveled = 0;
    this.rotation = Math.atan2(this.dirY, this.dirX);
    this.rotSpeed = 6 + this.chargeRatio * 10;
    this.radius = 12 + this.chargeRatio * 8; // 충돌 반경
    this.scale = 0.85 + this.chargeRatio * 0.55;

    // 포물선 점프 높이
    this.maxArcHeight = 25 + this.chargeRatio * 45;

    this.isDead = false;
  }

  update(dt, particles, sound) {
    if (this.isDead) return;

    const dist = this.speed * dt;
    this.traveled += dist;
    this.x += this.dirX * dist;
    this.y += this.dirY * dist;
    this.rotation += this.rotSpeed * dt;

    // 꼬리 파티클 생성
    if (particles && Math.random() < 0.65) {
      const arcRatio = this.traveled / this.maxRange;
      const arcH = Math.sin(arcRatio * Math.PI) * this.maxArcHeight;
      particles.createSnowTrail(this.x, this.y - arcH, this.radius);
    }

    // 최대 사정거리 도달 시 바닥 착지 폭발
    if (this.traveled >= this.maxRange) {
      this.explode(particles, sound, false);
    }
  }

  // 폭발 및 파티클 처리
  explode(particles, sound, hitTarget = false) {
    this.isDead = true;
    if (particles) {
      const pCount = hitTarget ? (16 + Math.floor(this.chargeRatio * 12)) : 10;
      const power = 1 + this.chargeRatio * 0.8;
      particles.createSnowExplosion(this.x, this.y, pCount, power);
    }
    if (sound) {
      if (hitTarget) {
        sound.playHit();
      } else {
        sound.playSplat();
      }
    }
  }

  draw(ctx, spriteManager) {
    if (this.isDead) return;

    // 포물선 높이 계산 (0 ~ 1 구간의 sin 곡선)
    const arcRatio = Math.min(1, this.traveled / this.maxRange);
    const arcH = Math.sin(arcRatio * Math.PI) * this.maxArcHeight;

    spriteManager.drawSnowball(ctx, {
      x: this.x,
      y: this.y - arcH,
      radius: this.radius,
      rotation: this.rotation,
      scale: this.scale,
      shadowHeight: arcH
    });
  }
}

window.Snowball = Snowball;
