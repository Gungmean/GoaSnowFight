// sprites.js - 스프라이트 매니저 및 애니메이션 렌더러
class SpriteManager {
  constructor() {
    this.images = {};
    this.manifest = null;
    this.loaded = false;
    this.snowballImg = null;
    this.bgImg = null;
    this.startBgImg = null;
    this.logoImg = null;
  }

  async loadAll() {
    // 1. manifest 로드
    const resp = await fetch('sprites/manifest.json');
    this.manifest = await resp.json();

    // 2. 필요한 이미지 파일 목록
    const imgUrls = [
      'sprites/Defalut.png',
      'sprites/Move.png',
      'sprites/ChargeAndMove.png',
      'sprites/Throw.png',
      'sprites/Roll.png',
      'sprites/HitAndLose.png',
      'sprites/snowball.png',
      'background.png',
      'startbackground.png',
      'logo.png'
    ];

    const promises = imgUrls.map(url => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          this.images[url] = img;
          resolve(img);
        };
        img.onerror = () => {
          console.warn(`Failed to load ${url}, retrying with absolute path...`);
          resolve(null);
        };
      });
    });

    await Promise.all(promises);

    this.snowballImg = this.images['sprites/snowball.png'];
    this.bgImg = this.images['background.png'];
    this.startBgImg = this.images['startbackground.png'];
    this.logoImg = this.images['logo.png'];
    this.loaded = true;
    console.log('All sprites loaded successfully!');
  }

  // 애니메이션 프레임 데이터 반환
  getAnim(animName) {
    if (!this.manifest || !this.manifest[animName]) {
      return this.manifest ? this.manifest['idle'] : null;
    }
    return this.manifest[animName];
  }

  // 캐릭터 렌더링
  drawCharacter(ctx, {
    x,
    y,
    animName = 'idle',
    animTimer = 0,
    facing = 1, // 1: right, -1: left
    scale = 0.42, // 적절한 경기장 비율 크기
    isFlash = false,
    alpha = 1,
    ghosts = []
  }) {
    if (!this.loaded) return;

    const anim = this.getAnim(animName);
    if (!anim) return;

    const img = this.images[anim.file];
    if (!img) return;

    const frameCount = anim.frames.length;
    if (frameCount === 0) return;

    const rawFrame = Math.floor(Math.max(0, animTimer) * anim.fps);
    let frameIdx = 0;

    if (anim.loop) {
      frameIdx = rawFrame % frameCount;
    } else {
      frameIdx = Math.min(rawFrame, frameCount - 1);
    }

    const frame = anim.frames[frameIdx] || anim.frames[0];
    if (!frame) return;

    // 원본 렌더링 피봇: 발바닥 중심 (anchorX가 있으면 우선 적용)
    const anchorX = frame.anchorX !== undefined ? frame.anchorX : (frame.w / 2);
    const drawX = -anchorX;
    const drawY = -frame.h + 20; // 20px 바닥 정렬 여백

    // 잔상 렌더링 (구르기 중)
    if (ghosts && ghosts.length > 0) {
      for (const g of ghosts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, g.alpha * 0.45);
        ctx.translate(Math.floor(g.x), Math.floor(g.y));
        if (g.facing === -1) ctx.scale(-1, 1);
        ctx.scale(scale, scale);

        let gFrame = frame;
        let gDrawX = drawX;
        let gDrawY = drawY;
        if (g.animTimer !== undefined) {
          const gRawFrame = Math.floor(Math.max(0, g.animTimer) * anim.fps);
          const gIdx = anim.loop ? (gRawFrame % frameCount) : Math.min(gRawFrame, frameCount - 1);
          gFrame = anim.frames[gIdx] || frame;
          const gAnchorX = gFrame.anchorX !== undefined ? gFrame.anchorX : (gFrame.w / 2);
          gDrawX = -gAnchorX;
          gDrawY = -gFrame.h + 20;
        }

        ctx.drawImage(
          img,
          gFrame.x, gFrame.y, gFrame.w, gFrame.h,
          gDrawX, gDrawY, gFrame.w, gFrame.h
        );
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.floor(x), Math.floor(y));

    // 바닥 픽셀 그림자
    ctx.save();
    ctx.fillStyle = 'rgba(20, 30, 60, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 28 * (scale / 0.42), 9 * (scale / 0.42), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 방향에 따른 X축 반전
    if (facing === -1) {
      ctx.scale(-1, 1);
    }
    ctx.scale(scale, scale);

    if (isFlash) {
      // 피격 흰색 깜빡임 효과
      ctx.save();
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, drawX, drawY, frame.w, frame.h);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(drawX, drawY, frame.w, frame.h);
      ctx.restore();
    } else {
      ctx.drawImage(img, frame.x, frame.y, frame.w, frame.h, drawX, drawY, frame.w, frame.h);
    }

    ctx.restore();
  }

  // 눈덩이 렌더링
  drawSnowball(ctx, { x, y, radius = 12, rotation = 0, scale = 1, shadowHeight = 0 }) {
    ctx.save();

    // 바닥 그림자 (고도에 따라 작아짐)
    if (shadowHeight > 0) {
      const shadowY = y + shadowHeight;
      const shadowScale = Math.max(0.4, 1 - (shadowHeight / 120));
      ctx.fillStyle = 'rgba(20, 30, 60, 0.25)';
      ctx.beginPath();
      ctx.ellipse(x, shadowY, radius * shadowScale * 1.1, radius * shadowScale * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 눈덩이 이미지 또는 도트 드로잉
    ctx.translate(Math.floor(x), Math.floor(y));
    ctx.rotate(rotation);
    ctx.scale(scale, scale);

    if (this.snowballImg) {
      const w = 32;
      const h = 24;
      ctx.drawImage(this.snowballImg, -w / 2, -h / 2, w, h);
    } else {
      // 대체 도트 렌더링
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2b3a4a';
      ctx.stroke();
    }

    ctx.restore();
  }
}

window.SpriteManager = SpriteManager;
