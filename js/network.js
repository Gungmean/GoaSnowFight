// js/network.js - 웹소켓 실시간 멀티플레이 네트워크 매니저
class NetworkManager {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.currentRoomId = null;
    this.myRole = null; // 'p1' | 'p2'
    this.opponentName = '상대방';

    // 이벤트 리스너 콜백
    this.onMatchStart = null;
    this.onOpponentState = null;
    this.onOpponentThrow = null;
    this.onOpponentSkill = null;
    this.onOpponentDamage = null;
    this.onOpponentLeft = null;
    this.onRoomCreated = null;
    this.onQueueWaiting = null;
    this.onError = null;

    // 패킷 송신 레이트 제어 (초당 30회)
    this.lastStateSendTime = 0;
    this.stateSendInterval = 1000 / 30;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('[NETWORK] WebSocket connected to', wsUrl);
      };

      this.ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        this.handleMessage(msg);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.log('[NETWORK] WebSocket closed.');
      };

      this.ws.onerror = (err) => {
        console.error('[NETWORK] WebSocket error:', err);
      };
    } catch (e) {
      console.error('[NETWORK] Connection failed:', e);
    }
  }

  ensureConnected() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'QUEUE_WAITING':
        if (this.onQueueWaiting) this.onQueueWaiting();
        break;

      case 'ROOM_CREATED':
        if (this.onRoomCreated) this.onRoomCreated(msg.roomCode);
        break;

      case 'JOIN_ROOM_ERROR':
        if (this.onError) this.onError(msg.message);
        break;

      case 'MATCH_START':
        this.currentRoomId = msg.roomId;
        this.myRole = msg.role;
        this.opponentName = msg.opponentName || '2P 상대방';
        if (this.onMatchStart) {
          this.onMatchStart({
            roomId: msg.roomId,
            role: msg.role,
            opponentName: this.opponentName,
            countdownSec: msg.countdownSec || 3
          });
        }
        break;

      case 'SYNC_STATE':
        if (this.onOpponentState) this.onOpponentState(msg);
        break;

      case 'SYNC_THROW':
        if (this.onOpponentThrow) this.onOpponentThrow(msg);
        break;

      case 'SYNC_SKILL':
        if (this.onOpponentSkill) this.onOpponentSkill(msg);
        break;

      case 'SYNC_DAMAGE':
        if (this.onOpponentDamage) this.onOpponentDamage(msg);
        break;

      case 'OPPONENT_LEFT':
        if (this.onOpponentLeft) this.onOpponentLeft(msg.message);
        break;
    }
  }

  // --- 플레이어 요청 메서드들 ---

  joinQueue(playerName) {
    this.ensureConnected();
    this.send({ type: 'JOIN_QUEUE', playerName });
  }

  leaveQueue() {
    this.send({ type: 'LEAVE_QUEUE' });
  }

  createRoom(playerName) {
    this.ensureConnected();
    this.send({ type: 'CREATE_ROOM', playerName });
  }

  joinRoom(roomCode, playerName) {
    this.ensureConnected();
    this.send({ type: 'JOIN_ROOM', roomCode, playerName });
  }

  cancelRoom() {
    this.send({ type: 'CANCEL_ROOM' });
  }

  leaveMatch() {
    this.send({ type: 'MATCH_EXIT' });
    this.currentRoomId = null;
    this.myRole = null;
  }

  // 실시간 내 상태 전송 (서버에서 X축 미러링되어 상대에게 전달됨)
  sendPlayerState(player) {
    if (!this.currentRoomId) return;
    const now = performance.now();
    if (now - this.lastStateSendTime < this.stateSendInterval) return;
    this.lastStateSendTime = now;

    this.send({
      type: 'SYNC_STATE',
      x: Math.round(player.x),
      y: Math.round(player.y),
      vx: Math.round(player.vx),
      vy: Math.round(player.vy),
      facing: player.facing,
      animName: player.animName,
      animTimer: Number(player.animTimer.toFixed(3)),
      isRolling: player.isRolling,
      rollDirX: Number(player.rollDirX.toFixed(2)),
      rollDirY: Number(player.rollDirY.toFixed(2)),
      isCharging: player.isCharging,
      chargeRatio: Number(player.chargeRatio.toFixed(2)),
      hp: player.hp
    });
  }

  // 눈덩이 투척 이벤트 전송
  sendThrow(snowball) {
    if (!this.currentRoomId) return;
    this.send({
      type: 'SYNC_THROW',
      x: Math.round(snowball.x),
      y: Math.round(snowball.y),
      dirX: Number(snowball.dirX.toFixed(3)),
      dirY: Number(snowball.dirY.toFixed(3)),
      chargeRatio: Number(snowball.chargeRatio.toFixed(2)),
      speed: Math.round(snowball.speed),
      maxDistance: Math.round(snowball.maxDistance),
      damage: snowball.damage
    });
  }

  // 스킬 발동 전송 (Q 트리플, E 빙벽, 우클릭 메가폭탄)
  sendSkill(skillType, data = {}) {
    if (!this.currentRoomId) return;
    this.send({
      type: 'SYNC_SKILL',
      skillType,
      ...data
    });
  }

  // 피격 전달
  sendDamage(damage, fromX) {
    if (!this.currentRoomId) return;
    this.send({
      type: 'SYNC_DAMAGE',
      damage,
      fromX: Math.round(fromX)
    });
  }
}
