// js/mobileControls.js - 모바일 터치 가상 조이스틱 및 액션 패드 매니저
class MobileControls {
  constructor(game) {
    this.game = game;
    this.enabled = false;

    // DOM 요소들
    this.container = document.getElementById('mobile-controls');
    this.joystickZone = document.getElementById('joystick-zone');
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickKnob = document.getElementById('joystick-knob');

    this.btnThrow = document.getElementById('mobile-btn-throw');
    this.btnRoll = document.getElementById('mobile-btn-roll');
    this.btnQ = document.getElementById('mobile-btn-q');
    this.btnE = document.getElementById('mobile-btn-e');
    this.btnRmb = document.getElementById('mobile-btn-rmb');
    this.rotatePrompt = document.getElementById('rotate-device-prompt');

    // 조이스틱 터치 상태 추적
    this.activeJoystickTouchId = null;
    this.joystickOriginX = 0;
    this.joystickOriginY = 0;
    this.maxJoystickRadius = 52; // 최대 이동 반경(px)

    // 투척 버튼 터치 조준 추적
    this.activeThrowTouchId = null;
    this.throwOriginX = 0;
    this.throwOriginY = 0;

    // 캔버스 직접 터치 추적
    this.activeCanvasTouchId = null;

    // 모바일/터치 기기 감지
    this.isTouchDevice = ('ontouchstart' in window) ||
                         (navigator.maxTouchPoints > 0) ||
                         window.matchMedia('(pointer: coarse)').matches;

    this.init();
  }

  init() {
    if (!this.container) return;

    // 기본 활성화 조건: 터치 지원 기기이거나 화면 너비 1024 이하
    const shouldEnable = this.isTouchDevice || window.innerWidth <= 1024;
    this.setEnabled(shouldEnable);

    this.bindJoystickEvents();
    this.bindActionEvents();
    this.bindCanvasTouchEvents();
    this.bindOrientationEvents();
  }

  setEnabled(val) {
    this.enabled = val;
    if (this.container) {
      if (this.enabled) {
        this.container.classList.remove('hidden');
      } else {
        this.container.classList.add('hidden');
        if (this.game && this.game.player) {
          this.game.player.setJoystick(0, 0);
        }
      }
    }

    const toggleBtn = document.getElementById('btn-toggle-mobile');
    if (toggleBtn) {
      toggleBtn.classList.toggle('active', this.enabled);
      toggleBtn.innerText = this.enabled ? '🕹️ ON' : '🕹️ OFF';
    }
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  // ========================================================
  // 1. 좌측 가상 조이스틱 이벤트 (동적 플로팅 + 터치 추적)
  // ========================================================
  bindJoystickEvents() {
    if (!this.joystickZone || !this.joystickBase || !this.joystickKnob) return;

    const onStart = (clientX, clientY, touchId) => {
      if (!this.enabled || !this.game.isRunning) return;
      this.activeJoystickTouchId = touchId;

      // 터치한 위치로 조이스틱 베이스 중심 이동 (플로팅 조이스틱)
      const rect = this.joystickZone.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      this.joystickBase.style.left = `${localX}px`;
      this.joystickBase.style.top = `${localY}px`;
      this.joystickBase.classList.add('active');

      this.joystickOriginX = clientX;
      this.joystickOriginY = clientY;
      this.joystickKnob.style.transform = 'translate(0px, 0px)';
      this.game.player.setJoystick(0, 0);
    };

    const onMove = (clientX, clientY) => {
      if (this.activeJoystickTouchId === null) return;

      const dx = clientX - this.joystickOriginX;
      const dy = clientY - this.joystickOriginY;
      const dist = Math.hypot(dx, dy);

      const maxR = this.maxJoystickRadius;
      const clampedDist = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);

      const knobX = Math.cos(angle) * clampedDist;
      const knobY = Math.sin(angle) * clampedDist;

      this.joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

      // 정규화된 조이스틱 벡터 (-1 ~ 1)
      const normX = knobX / maxR;
      const normY = knobY / maxR;

      this.game.player.setJoystick(normX, normY);
    };

    const onEnd = () => {
      this.activeJoystickTouchId = null;
      this.joystickKnob.style.transform = 'translate(0px, 0px)';
      this.joystickBase.classList.remove('active');

      // 기본 휴식 위치로 복귀
      this.joystickBase.style.left = '';
      this.joystickBase.style.top = '';

      if (this.game && this.game.player) {
        this.game.player.setJoystick(0, 0);
      }
    };

    // 터치 이벤트
    this.joystickZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.activeJoystickTouchId !== null) return;
      const t = e.changedTouches[0];
      onStart(t.clientX, t.clientY, t.identifier);
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.activeJoystickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.activeJoystickTouchId) {
          onMove(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (this.activeJoystickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.activeJoystickTouchId) {
          onEnd();
          break;
        }
      }
    });

    window.addEventListener('touchcancel', (e) => {
      if (this.activeJoystickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.activeJoystickTouchId) {
          onEnd();
          break;
        }
      }
    });

    // 마우스 포인터 테스트 지원 (PC에서 조이스틱을 마우스로 클릭 및 드래그 테스트 가능)
    this.joystickZone.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY, 'mouse');

      const mouseMoveHandler = (me) => onMove(me.clientX, me.clientY);
      const mouseUpHandler = () => {
        onEnd();
        window.removeEventListener('mousemove', mouseMoveHandler);
        window.removeEventListener('mouseup', mouseUpHandler);
      };

      window.addEventListener('mousemove', mouseMoveHandler);
      window.addEventListener('mouseup', mouseUpHandler);
    });
  }

  // ========================================================
  // 2. 우측 액션 버튼 이벤트 (투척 차징/조준, 구르기, 스킬 3종)
  // ========================================================
  bindActionEvents() {
    const p = this.game.player;

    // 2-1. [눈덩이 던지기] 차징 & 드래그 조준 버튼
    if (this.btnThrow) {
      const startThrow = (clientX, clientY, touchId) => {
        if (!this.enabled || !this.game.isRunning) return;
        this.game.sound.unlock();
        this.activeThrowTouchId = touchId;
        this.throwOriginX = clientX;
        this.throwOriginY = clientY;

        this.game.isMouseDown = true;
        this.game.player.startCharging();
        this.btnThrow.classList.add('charging');

        // 기본 타겟을 향해 오토 에임 설정
        this.autoAimAtTarget();
      };

      const moveThrow = (clientX, clientY) => {
        if (this.activeThrowTouchId === null) return;

        const dx = clientX - this.throwOriginX;
        const dy = clientY - this.throwOriginY;
        const dist = Math.hypot(dx, dy);

        // 일정 거리 이상 드래그하면 수동 조준 모드 전환
        if (dist > 14) {
          const angle = Math.atan2(dy, dx);
          const aimDist = Math.min(950, Math.max(300, dist * 6.5));
          const targetX = this.game.player.x + Math.cos(angle) * aimDist;
          const targetY = this.game.player.y + Math.sin(angle) * aimDist;

          this.game.player.setAim(targetX, targetY);
          this.game.mouseVirtualX = targetX;
          this.game.mouseVirtualY = targetY;
        }
      };

      const endThrow = () => {
        if (this.activeThrowTouchId === null) return;
        this.activeThrowTouchId = null;
        this.game.isMouseDown = false;
        this.btnThrow.classList.remove('charging');

        const sb = this.game.player.releaseCharge(
          this.game.snowballs,
          this.game.particles,
          this.game.sound
        );
        if (sb && this.game.mode === 'MULTIPLAYER') {
          this.game.network.sendThrow(sb);
        }
      };

      this.btnThrow.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        startThrow(t.clientX, t.clientY, t.identifier);
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (this.activeThrowTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.activeThrowTouchId) {
            moveThrow(t.clientX, t.clientY);
            break;
          }
        }
      }, { passive: true });

      window.addEventListener('touchend', (e) => {
        if (this.activeThrowTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.activeThrowTouchId) {
            endThrow();
            break;
          }
        }
      });

      this.btnThrow.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        startThrow(e.clientX, e.clientY, 'mouse_throw');

        const mm = (me) => moveThrow(me.clientX, me.clientY);
        const mu = () => {
          endThrow();
          window.removeEventListener('mousemove', mm);
          window.removeEventListener('mouseup', mu);
        };
        window.addEventListener('mousemove', mm);
        window.addEventListener('mouseup', mu);
      });
    }

    // 2-2. [구르기 회피 (Shift)] 버튼
    if (this.btnRoll) {
      const doRoll = (e) => {
        e.preventDefault();
        if (!this.game.isRunning) return;
        this.game.sound.unlock();
        this.game.player.triggerRoll();
      };
      this.btnRoll.addEventListener('touchstart', doRoll, { passive: false });
      this.btnRoll.addEventListener('click', doRoll);
    }

    // 2-3. [스킬 Q (트리플 샷)] 버튼
    if (this.btnQ) {
      const doQ = (e) => {
        e.preventDefault();
        if (!this.game.isRunning) return;
        this.game.sound.unlock();
        const target = this.getAutoTargetCoords();
        const ok = this.game.player.skillManager.castQ(
          target.x,
          target.y,
          this.game.snowballs,
          this.game.particles,
          this.game.sound
        );
        if (ok && this.game.mode === 'MULTIPLAYER') {
          this.game.network.sendSkill('q', { targetX: target.x, targetY: target.y });
        }
      };
      this.btnQ.addEventListener('touchstart', doQ, { passive: false });
      this.btnQ.addEventListener('click', doQ);
    }

    // 2-4. [스킬 E (눈사람 빙벽)] 버튼
    if (this.btnE) {
      const doE = (e) => {
        e.preventDefault();
        if (!this.game.isRunning) return;
        this.game.sound.unlock();
        const target = this.getAutoTargetCoords(110);
        const ok = this.game.player.skillManager.castE(
          target.x,
          target.y,
          this.game.particles,
          this.game.sound
        );
        if (ok && this.game.mode === 'MULTIPLAYER') {
          this.game.network.sendSkill('e', { targetX: target.x, targetY: target.y });
        }
      };
      this.btnE.addEventListener('touchstart', doE, { passive: false });
      this.btnE.addEventListener('click', doE);
    }

    // 2-5. [스킬 우클릭 (메가 눈폭탄)] 버튼
    if (this.btnRmb) {
      const doRmb = (e) => {
        e.preventDefault();
        if (!this.game.isRunning) return;
        this.game.sound.unlock();
        const target = this.getAutoTargetCoords();
        const ok = this.game.player.skillManager.castRMB(
          target.x,
          target.y,
          this.game.snowballs,
          this.game.particles,
          this.game.sound
        );
        if (ok && this.game.mode === 'MULTIPLAYER') {
          this.game.network.sendSkill('rmb', { targetX: target.x, targetY: target.y });
        }
      };
      this.btnRmb.addEventListener('touchstart', doRmb, { passive: false });
      this.btnRmb.addEventListener('click', doRmb);
    }
  }

  // ========================================================
  // 3. 캔버스 직접 터치 지원 (화면 터치 즉시 조준 & 차징 발사)
  // ========================================================
  bindCanvasTouchEvents() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    canvas.addEventListener('touchstart', (e) => {
      if (!this.game.isRunning) return;
      // 우측 상단/중앙 등 조이스틱 영역 외 터치 시 캔버스 조준 & 투척 시작
      const t = e.changedTouches[0];
      const stageRect = canvas.getBoundingClientRect();
      const relativeX = t.clientX - stageRect.left;

      // 화면 우측 절반 터치 시 조준 투척 활성화
      if (relativeX > stageRect.width * 0.35 && this.activeCanvasTouchId === null) {
        e.preventDefault();
        this.activeCanvasTouchId = t.identifier;
        this.game.sound.unlock();
        this.game.isMouseDown = true;

        const v = this.game.screenToVirtual(t.clientX, t.clientY);
        this.game.mouseVirtualX = v.x;
        this.game.mouseVirtualY = v.y;
        this.game.player.setAim(v.x, v.y);
        this.game.player.startCharging();
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (this.activeCanvasTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.activeCanvasTouchId) {
          e.preventDefault();
          const v = this.game.screenToVirtual(t.clientX, t.clientY);
          this.game.mouseVirtualX = v.x;
          this.game.mouseVirtualY = v.y;
          this.game.player.setAim(v.x, v.y);
          break;
        }
      }
    }, { passive: false });

    const endCanvasTouch = (e) => {
      if (this.activeCanvasTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.activeCanvasTouchId) {
          this.activeCanvasTouchId = null;
          this.game.isMouseDown = false;
          const sb = this.game.player.releaseCharge(
            this.game.snowballs,
            this.game.particles,
            this.game.sound
          );
          if (sb && this.game.mode === 'MULTIPLAYER') {
            this.game.network.sendThrow(sb);
          }
          break;
        }
      }
    };

    canvas.addEventListener('touchend', endCanvasTouch);
    canvas.addEventListener('touchcancel', endCanvasTouch);
  }

  // ========================================================
  // 4. 모바일 화면 회전 알림 (세로 모드 감지 시 가로 회전 안내)
  // ========================================================
  bindOrientationEvents() {
    const checkOrientation = () => {
      if (!this.rotatePrompt) return;
      // 모바일 기기이고 세로 모드(높이가 너비보다 큼)인 경우
      const isPortrait = window.innerHeight > window.innerWidth;
      const isMobileScreen = window.innerWidth <= 840 || this.isTouchDevice;

      if (isPortrait && isMobileScreen) {
        this.rotatePrompt.classList.remove('hidden');
      } else {
        this.rotatePrompt.classList.add('hidden');
      }
    };

    this.rotatePrompt.addEventListener('click', () => {
      this.rotatePrompt.classList.add('hidden');
    });

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', () => {
      setTimeout(checkOrientation, 150);
    });
    checkOrientation();
  }

  // ========================================================
  // 5. 오토 타겟팅 좌표 도우미
  // ========================================================
  getAutoTargetCoords(maxDistance = 800) {
    const p = this.game.player;

    // 1순위: 멀티플레이 상대방
    if (this.game.mode === 'MULTIPLAYER' && this.game.opponent && !this.game.opponent.isDead) {
      return { x: this.game.opponent.x, y: this.game.opponent.y };
    }

    // 2순위: 훈련장 더미 봇
    if (this.game.mode === 'TRAINING' && this.game.bot && !this.game.bot.isDead) {
      return { x: this.game.bot.x, y: this.game.bot.y };
    }

    // 3순위: 현재 조준 방향 또는 전방
    const dist = Math.min(maxDistance, Math.hypot(p.aimX - p.x, p.aimY - p.y) || 400);
    return {
      x: p.x + p.facing * dist,
      y: p.y
    };
  }

  autoAimAtTarget() {
    const target = this.getAutoTargetCoords();
    this.game.player.setAim(target.x, target.y);
    this.game.mouseVirtualX = target.x;
    this.game.mouseVirtualY = target.y;
  }

  // ========================================================
  // 6. 매 프레임 UI 동기화 (쿨다운 오버레이, 차징 링)
  // ========================================================
  update(dt) {
    if (!this.enabled || !this.game.isRunning) return;

    const p = this.game.player;

    // 1. 구르기 버튼 쿨다운
    this.updateButtonCooldown(this.btnRoll, p.currentRollCooldown, p.rollCooldown, p.cost >= 1);

    // 2. 스킬 Q, E, RMB 쿨다운
    const skQ = p.skillManager.skills.q;
    const skE = p.skillManager.skills.e;
    const skRmb = p.skillManager.skills.rmb;

    this.updateButtonCooldown(this.btnQ, skQ.currentCooldown, skQ.cooldown, p.cost >= skQ.cost);
    this.updateButtonCooldown(this.btnE, skE.currentCooldown, skE.cooldown, p.cost >= skE.cost);
    this.updateButtonCooldown(this.btnRmb, skRmb.currentCooldown, skRmb.cooldown, p.cost >= skRmb.cost);

    // 3. 차징 중이면 투척 버튼에 차징 게이지 반영
    if (this.btnThrow) {
      if (p.isCharging) {
        this.btnThrow.classList.add('charging');
        const fillPct = Math.floor(p.chargeRatio * 100);
        this.btnThrow.style.setProperty('--charge-pct', `${fillPct}%`);
      } else {
        this.btnThrow.classList.remove('charging');
        this.btnThrow.style.removeProperty('--charge-pct');
      }
    }
  }

  updateButtonCooldown(btnElem, curCd, maxCd, hasCost) {
    if (!btnElem) return;
    const overlay = btnElem.querySelector('.m-cd-overlay');

    if (curCd > 0) {
      btnElem.classList.add('on-cooldown');
      btnElem.classList.remove('ready');
      if (overlay) {
        overlay.style.height = `${(curCd / maxCd) * 100}%`;
      }
    } else {
      btnElem.classList.remove('on-cooldown');
      if (overlay) overlay.style.height = '0%';

      if (hasCost) {
        btnElem.classList.add('ready');
        btnElem.classList.remove('no-cost');
      } else {
        btnElem.classList.remove('ready');
        btnElem.classList.add('no-cost');
      }
    }
  }
}
