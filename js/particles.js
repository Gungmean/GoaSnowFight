// particles.js - 눈 파티클, 타격 이펙트, 잔상 및 데미지 플로팅 텍스트
class ParticleSystem {
  constructor() {
    this.particles = [];
    this.ambientFlakes = [];
    this.floatingTexts = [];
    this.initAmbientSnow();
  }

  initAmbientSnow() {
    this.ambientFlakes = [];
    for (let i = 0; i < 70; i++) {
      this.ambientFlakes.push({
        x: Math.random() * 1672,
        y: Math.random() * 940,
        size: Math.random() * 3 + 1.5,
        speedY: Math.random() * 40 + 20,
        speedX: Math.random() * 20 - 10,
        opacity: Math.random() * 0.6 + 0.3,
        wobble: Math.random() * Math.PI * 2
      });
    }
  }

  // 눈덩이 폭발 / 착지 파티클
  createSnowExplosion(x, y, count = 16, power = 1) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 180 + 60) * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (Math.random() * 50 + 20),
        size: Math.random() * 4 + 2,
        life: 0.5 + Math.random() * 0.3,
        maxLife: 0.8,
        color: Math.random() > 0.3 ? '#ffffff' : '#d8ecf8',
        gravity: 400
      });
    }
  }

  // 눈덩이 비행 꼬리 잔상
  createSnowTrail(x, y, radius = 4) {
    this.particles.push({
      x: x + (Math.random() * 6 - 3),
      y: y + (Math.random() * 6 - 3),
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      size: radius * (Math.random() * 0.5 + 0.4),
      life: 0.25,
      maxLife: 0.25,
      color: 'rgba(255, 255, 255, 0.7)',
      gravity: 30
    });
  }

  // 구르기 눈 먼지
  createRollPuff(x, y, dirX) {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: x + (Math.random() * 20 - 10),
        y: y + 20 + (Math.random() * 8 - 4),
        vx: -dirX * (Math.random() * 120 + 40) + (Math.random() * 40 - 20),
        vy: -(Math.random() * 50 + 10),
        size: Math.random() * 5 + 3,
        life: 0.35,
        maxLife: 0.35,
        color: '#e4f2fb',
        gravity: 120
      });
    }
  }

  // 차징 중 주변에서 캐릭터로 모여드는 눈의 기운
  createChargeGather(charX, charY, radius = 70) {
    const angle = Math.random() * Math.PI * 2;
    const startX = charX + Math.cos(angle) * radius;
    const startY = charY + Math.sin(angle) * radius;
    this.particles.push({
      x: startX,
      y: startY,
      targetX: charX,
      targetY: charY - 20,
      size: Math.random() * 3 + 2,
      life: 0.25,
      maxLife: 0.25,
      color: '#a5f3fc',
      gravity: 0,
      isGather: true
    });
  }

  // 플로팅 텍스트 (-1 HP, 회피!, 스킬명 등)
  addFloatingText(x, y, text, color = '#ff4d4d', size = 20) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      size,
      life: 0.9,
      maxLife: 0.9,
      vy: -55
    });
  }

  update(dt) {
    // 배경 눈송이
    for (const flake of this.ambientFlakes) {
      flake.wobble += dt * 2;
      flake.y += flake.speedY * dt;
      flake.x += (flake.speedX + Math.sin(flake.wobble) * 15) * dt;
      if (flake.y > 940) {
        flake.y = -10;
        flake.x = Math.random() * 1672;
      }
      if (flake.x < 0) flake.x = 1672;
      if (flake.x > 1672) flake.x = 0;
    }

    // 일반 파티클
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      if (p.isGather) {
        const progress = 1 - (p.life / p.maxLife);
        p.x = p.x + (p.targetX - p.x) * (progress * 0.3);
        p.y = p.y + (p.targetY - p.y) * (progress * 0.3);
      } else {
        p.vy += (p.gravity || 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    // 플로팅 텍스트
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
    }
  }

  draw(ctx) {
    ctx.save();

    // 1. 배경 눈송이
    for (const flake of this.ambientFlakes) {
      ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
      ctx.fillRect(Math.floor(flake.x), Math.floor(flake.y), flake.size, flake.size);
    }

    // 2. 파티클
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x - p.size / 2), Math.floor(p.y - p.size / 2), p.size, p.size);
    }

    // 3. 플로팅 텍스트 (픽셀 폰트)
    for (const t of this.floatingTexts) {
      const alpha = Math.min(1, (t.life / t.maxLife) * 1.5);
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${t.size}px 'PixelFont', monospace`;
      ctx.textAlign = 'center';
      // 텍스트 외곽선 (픽셀 두께)
      ctx.fillStyle = '#000000';
      ctx.fillText(t.text, Math.floor(t.x + 2), Math.floor(t.y + 2));
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, Math.floor(t.x), Math.floor(t.y));
    }

    ctx.restore();
  }
}

window.ParticleSystem = ParticleSystem;
