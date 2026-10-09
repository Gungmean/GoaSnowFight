const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const VIRTUAL_WIDTH = 1672;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg'
};

// 1. Static HTTP Server
const server = http.createServer((req, res) => {
  let reqUrl = decodeURI(req.url.split('?')[0]);
  if (reqUrl === '/') reqUrl = '/index.html';

  const filePath = path.join(__dirname, reqUrl);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// 2. WebSocket Multiplayer Server
const wss = new WebSocket.Server({ server });

let matchQueue = []; // Quick match waiting queue: [ { ws, playerName, id } ]
const privateRooms = new Map(); // roomCode (string) -> { host: { ws, playerName }, guest: null, id }
const activeRooms = new Map(); // roomId (string) -> { p1: { ws, ... }, p2: { ws, ... } }

let nextPlayerId = 1;

function mirrorPacketForOpponent(data) {
  const mirrored = { ...data };

  // X 좌표 반전
  if (typeof mirrored.x === 'number') {
    mirrored.x = VIRTUAL_WIDTH - mirrored.x;
  }
  // X 속도 반전
  if (typeof mirrored.vx === 'number') {
    mirrored.vx = -mirrored.vx;
  }
  // 시선/바라보는 방향 반전 (1 <-> -1)
  if (typeof mirrored.facing === 'number') {
    mirrored.facing = -mirrored.facing;
  }
  // 투척/발사 X 방향 반전
  if (typeof mirrored.dirX === 'number') {
    mirrored.dirX = -mirrored.dirX;
  }
  // 에임 조준선 X 반전
  if (typeof mirrored.aimX === 'number') {
    mirrored.aimX = VIRTUAL_WIDTH - mirrored.aimX;
  }
  // 구르기 X 방향 반전
  if (typeof mirrored.rollDirX === 'number') {
    mirrored.rollDirX = -mirrored.rollDirX;
  }

  return mirrored;
}

function sendJson(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function startMatch(p1, p2, roomId, mode) {
  const room = {
    id: roomId,
    mode,
    p1: { ws: p1.ws, name: p1.playerName, hp: 5 },
    p2: { ws: p2.ws, name: p2.playerName, hp: 5 }
  };
  activeRooms.set(roomId, room);

  p1.ws.currentRoomId = roomId;
  p1.ws.playerRole = 'p1';
  p2.ws.currentRoomId = roomId;
  p2.ws.playerRole = 'p2';

  // Player 1에게 매칭 시작 전송
  sendJson(p1.ws, {
    type: 'MATCH_START',
    roomId,
    role: 'p1',
    opponentName: p2.playerName,
    myHp: 5,
    opponentHp: 5,
    countdownSec: 3
  });

  // Player 2에게 매칭 시작 전송 (철권식 미러링에 의해 p2 본인도 왼쪽 1P 관점으로 플레이)
  sendJson(p2.ws, {
    type: 'MATCH_START',
    roomId,
    role: 'p2',
    opponentName: p1.playerName,
    myHp: 5,
    opponentHp: 5,
    countdownSec: 3
  });

  console.log(`[MATCH STARTED] Room ${roomId}: ${p1.playerName} vs ${p2.playerName}`);
}

function handleDisconnect(ws) {
  // 1. 빠른 매칭 큐에서 제거
  matchQueue = matchQueue.filter(entry => entry.ws !== ws);

  // 2. 비공개 방 호스트 제거
  for (const [code, r] of privateRooms.entries()) {
    if (r.host.ws === ws) {
      if (r.guest && r.guest.ws && r.guest.ws.readyState === WebSocket.OPEN) {
        sendJson(r.guest.ws, { type: 'ROOM_CLOSED', message: '방장이 퇴장했습니다.' });
      }
      privateRooms.delete(code);
      console.log(`[ROOM DELETED] Code ${code}`);
    }
  }

  // 3. 진행 중인 방에서 상대에게 접속 종료 알림
  if (ws.currentRoomId && activeRooms.has(ws.currentRoomId)) {
    const room = activeRooms.get(ws.currentRoomId);
    const opponent = ws.playerRole === 'p1' ? room.p2 : room.p1;
    if (opponent && opponent.ws) {
      sendJson(opponent.ws, {
        type: 'OPPONENT_LEFT',
        message: '상대방이 게임을 나갔습니다. 승리!'
      });
      opponent.ws.currentRoomId = null;
    }
    activeRooms.delete(ws.currentRoomId);
    console.log(`[ROOM ENDED] Room ${ws.currentRoomId} (player disconnected)`);
  }
}

wss.on('connection', (ws) => {
  ws.id = 'usr_' + (nextPlayerId++);
  console.log(`[CONNECTED] Client ${ws.id}`);

  ws.on('message', (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      // 1. 빠른 매칭 요청
      case 'JOIN_QUEUE': {
        const playerName = (msg.playerName || '눈싸움고수').trim().slice(0, 10);
        // 이미 큐에 있으면 중복 제거
        matchQueue = matchQueue.filter(item => item.ws !== ws);

        if (matchQueue.length > 0) {
          // 대기자 존재 -> 즉시 매칭!
          const opponent = matchQueue.shift();
          const roomId = 'room_quick_' + Date.now();
          startMatch(opponent, { ws, playerName, id: ws.id }, roomId, 'quick');
        } else {
          // 큐에 대기 등록
          matchQueue.push({ ws, playerName, id: ws.id });
          sendJson(ws, { type: 'QUEUE_WAITING' });
          console.log(`[QUEUE] ${playerName} (${ws.id}) waiting in queue (Total: ${matchQueue.length})`);
        }
        break;
      }

      // 2. 빠른 매칭 취소
      case 'LEAVE_QUEUE': {
        matchQueue = matchQueue.filter(item => item.ws !== ws);
        sendJson(ws, { type: 'QUEUE_CANCELED' });
        break;
      }

      // 3. 방 코드로 방 만들기
      case 'CREATE_ROOM': {
        const playerName = (msg.playerName || '방장').trim().slice(0, 10);
        let roomCode = '';
        do {
          roomCode = String(Math.floor(100000 + Math.random() * 900000));
        } while (privateRooms.has(roomCode));

        privateRooms.set(roomCode, {
          code: roomCode,
          host: { ws, playerName, id: ws.id },
          guest: null
        });

        ws.createdRoomCode = roomCode;
        sendJson(ws, { type: 'ROOM_CREATED', roomCode });
        console.log(`[ROOM CREATED] Code: ${roomCode} by ${playerName}`);
        break;
      }

      // 4. 방 코드로 방 참가
      case 'JOIN_ROOM': {
        const code = String(msg.roomCode || '').trim();
        const playerName = (msg.playerName || '도전자').trim().slice(0, 10);

        if (!privateRooms.has(code)) {
          sendJson(ws, { type: 'JOIN_ROOM_ERROR', message: '존재하지 않는 방 코드입니다.' });
          return;
        }

        const roomData = privateRooms.get(code);
        if (roomData.host.ws === ws) {
          sendJson(ws, { type: 'JOIN_ROOM_ERROR', message: '자신이 생성한 방에는 참가할 수 없습니다.' });
          return;
        }

        // 방 성립!
        privateRooms.delete(code);
        const roomId = 'room_code_' + code;
        startMatch(roomData.host, { ws, playerName, id: ws.id }, roomId, 'code');
        break;
      }

      // 5. 방 생성 취소
      case 'CANCEL_ROOM': {
        if (ws.createdRoomCode && privateRooms.has(ws.createdRoomCode)) {
          privateRooms.delete(ws.createdRoomCode);
          ws.createdRoomCode = null;
        }
        break;
      }

      // 6. 인게임 상태 패킷 중계 (위치, 투사체, 스킬 등)
      //    핵심: 송신자가 보낸 좌표를 상대방에게는 철권식 시점 미러링(좌우 반전)하여 전달!
      case 'SYNC_STATE':
      case 'SYNC_THROW':
      case 'SYNC_SKILL':
      case 'SYNC_DAMAGE':
      case 'SYNC_EMOTE': {
        if (!ws.currentRoomId || !activeRooms.has(ws.currentRoomId)) return;
        const room = activeRooms.get(ws.currentRoomId);
        const opponent = ws.playerRole === 'p1' ? room.p2 : room.p1;

        if (opponent && opponent.ws && opponent.ws.readyState === WebSocket.OPEN) {
          // 상대방에게 보낼 패킷은 X축을 거울 대칭 반전
          const mirrored = mirrorPacketForOpponent(msg);
          sendJson(opponent.ws, mirrored);
        }
        break;
      }

      // 7. 게임 종료 / 항복 / 리스폰
      case 'MATCH_EXIT': {
        handleDisconnect(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
    console.log(`[DISCONNECTED] Client ${ws.id}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS ERROR] ${ws.id}:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`Snowball Fight Game server (HTTP + WebSocket) running at http://localhost:${PORT}`);
});
