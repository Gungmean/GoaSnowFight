const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const VIRTUAL_WIDTH = 1672;

// =========================================================================
// 0. 웹 서버 전적 저장소 (data/records.json 영구 보존 + 메모리 캐시)
// =========================================================================
const DATA_DIR = path.join(__dirname, 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');

let recordsDB = {
  players: {},       // { [nickname]: { name, wins, losses, streak, bestStreak, updatedAt } }
  recentMatches: []  // [ { winner, loser, mode, timestamp } ]
};

function loadRecordsDB() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(RECORDS_FILE)) {
      const raw = fs.readFileSync(RECORDS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        recordsDB.players = parsed.players || {};
        recordsDB.recentMatches = Array.isArray(parsed.recentMatches) ? parsed.recentMatches : [];
      }
    }
  } catch (err) {
    console.error('[RECORDS] Failed to load records.json:', err.message);
  }
}

function saveRecordsDB() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFile(RECORDS_FILE, JSON.stringify(recordsDB, null, 2), 'utf8', (err) => {
      if (err) console.error('[RECORDS] Failed to write records.json:', err.message);
    });
  } catch (err) {
    console.error('[RECORDS] Save error:', err.message);
  }
}

function getOrCreatePlayerRecord(token, name) {
  const cleanName = (name || '눈싸움고수').trim().slice(0, 10) || '눈싸움고수';
  const cleanToken = (token && typeof token === 'string' && token.trim()) ? token.trim().slice(0, 40) : null;
  const key = cleanToken || `guest_${cleanName}`;

  if (!recordsDB.players[key]) {
    recordsDB.players[key] = {
      token: key,
      name: cleanName,
      wins: 0,
      losses: 0,
      streak: 0,
      bestStreak: 0,
      updatedAt: Date.now()
    };
    saveRecordsDB();
  } else if (cleanName && recordsDB.players[key].name !== cleanName) {
    // 닉네임을 변경했더라도 고유 계정 코드를 통해 전적이 유지되고 표시 이름만 갱신!
    recordsDB.players[key].name = cleanName;
    recordsDB.players[key].updatedAt = Date.now();
    saveRecordsDB();
  }

  return formatPlayerRecord(recordsDB.players[key]);
}

function formatPlayerRecord(rec) {
  const wins = rec.wins || 0;
  const losses = rec.losses || 0;
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  return {
    token: rec.token,
    name: rec.name,
    wins,
    losses,
    total,
    winRate,
    streak: rec.streak || 0,
    bestStreak: rec.bestStreak || 0,
    updatedAt: rec.updatedAt || 0
  };
}

function getLeaderboard(limit = 20) {
  const list = Object.values(recordsDB.players)
    .map(formatPlayerRecord)
    .filter(r => r.total > 0);

  list.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.total - a.total;
  });

  return list.slice(0, limit);
}

function recordMatchOutcome(room, winnerRole) {
  if (!room || room.roundFinished) return null;
  room.roundFinished = true;

  const isP1Winner = winnerRole === 'p1';
  const winnerObj = isP1Winner ? room.p1 : room.p2;
  const loserObj = isP1Winner ? room.p2 : room.p1;

  if (isP1Winner) {
    room.p1Wins = (room.p1Wins || 0) + 1;
  } else {
    room.p2Wins = (room.p2Wins || 0) + 1;
  }

  const wToken = winnerObj.token || `guest_${winnerObj.name}`;
  const lToken = loserObj.token || `guest_${loserObj.name}`;
  const wName = (winnerObj.name || '1P').trim().slice(0, 10);
  const lName = (loserObj.name || '2P').trim().slice(0, 10);

  getOrCreatePlayerRecord(wToken, wName);
  getOrCreatePlayerRecord(lToken, lName);

  const wRec = recordsDB.players[wToken];
  const lRec = recordsDB.players[lToken];

  wRec.wins += 1;
  wRec.streak = (wRec.streak || 0) + 1;
  if (wRec.streak > (wRec.bestStreak || 0)) {
    wRec.bestStreak = wRec.streak;
  }
  wRec.updatedAt = Date.now();

  lRec.losses += 1;
  lRec.streak = 0;
  lRec.updatedAt = Date.now();

  recordsDB.recentMatches.unshift({
    winnerToken: wToken,
    winner: wName,
    loserToken: lToken,
    loser: lName,
    mode: room.mode || 'quick',
    round: room.round || 1,
    timestamp: Date.now()
  });
  if (recordsDB.recentMatches.length > 30) {
    recordsDB.recentMatches.length = 30;
  }

  saveRecordsDB();

  const p1Key = room.p1.token || `guest_${room.p1.name}`;
  const p2Key = room.p2.token || `guest_${room.p2.name}`;
  const p1Record = formatPlayerRecord(recordsDB.players[p1Key]);
  const p2Record = formatPlayerRecord(recordsDB.players[p2Key]);

  // 양쪽 플레이어에게 확정된 전적 및 세트 스코어 전송
  sendJson(room.p1.ws, {
    type: 'MATCH_OVER_STATS',
    winnerRole,
    round: room.round,
    myWins: room.p1Wins,
    oppWins: room.p2Wins,
    myRecord: p1Record,
    oppRecord: p2Record
  });

  sendJson(room.p2.ws, {
    type: 'MATCH_OVER_STATS',
    winnerRole,
    round: room.round,
    myWins: room.p2Wins,
    oppWins: room.p1Wins,
    myRecord: p2Record,
    oppRecord: p1Record
  });

  console.log(`[RECORD SAVED] ${wName} (${wToken}) defeated ${lName} (${lToken}) (Round ${room.round}, Score ${room.p1Wins}:${room.p2Wins})`);
  return { p1Record, p2Record };
}

loadRecordsDB();

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

// 1. Static HTTP Server + REST API (/api/records)
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let reqUrl = decodeURI(parsedUrl.pathname);

  // 전적 및 랭킹 조회 API
  if (reqUrl === '/api/records' && req.method === 'GET') {
    const token = (parsedUrl.searchParams.get('token') || '').trim().slice(0, 40);
    const playerName = (parsedUrl.searchParams.get('player') || '').trim().slice(0, 10);
    const myRecord = token
      ? getOrCreatePlayerRecord(token, playerName)
      : (playerName ? getOrCreatePlayerRecord(null, playerName) : null);
    const payload = {
      myRecord,
      leaderboard: getLeaderboard(20),
      recentMatches: recordsDB.recentMatches.slice(0, 15)
    };
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    res.end(JSON.stringify(payload));
    return;
  }

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

    // 오디오 파일(MP3 등) 브라우저 부분 콘텐츠 스트리밍 및 Range 요청 지원
    const range = req.headers.range;
    if (range && (ext === '.mp3' || ext === '.wav' || ext === '.ogg')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': stats.size,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// 2. WebSocket Multiplayer Server (지연 시간 최소화: perMessageDeflate 비활성화)
const wss = new WebSocket.Server({ server, perMessageDeflate: false });

let matchQueue = []; // Quick match waiting queue: [ { ws, playerName, token, id } ]
const privateRooms = new Map(); // roomCode (string) -> { host: { ws, playerName, token }, guest: null, id }
const activeRooms = new Map(); // roomId (string) -> { p1, p2, round, roundFinished, p1Wins, p2Wins, rematchVotes }

let nextPlayerId = 1;

function mirrorPacketForOpponent(data) {
  const mirrored = { ...data };

  // X 좌표계 반전 (0 ~ 1672 거울 대칭)
  if (typeof mirrored.x === 'number') {
    mirrored.x = VIRTUAL_WIDTH - mirrored.x;
  }
  if (typeof mirrored.targetX === 'number') {
    mirrored.targetX = VIRTUAL_WIDTH - mirrored.targetX;
  }
  if (typeof mirrored.fromX === 'number') {
    mirrored.fromX = VIRTUAL_WIDTH - mirrored.fromX;
  }
  if (typeof mirrored.bx === 'number') {
    mirrored.bx = VIRTUAL_WIDTH - mirrored.bx;
  }
  if (typeof mirrored.aimX === 'number') {
    mirrored.aimX = VIRTUAL_WIDTH - mirrored.aimX;
  }

  // X 방향 벡터 및 속도 반전
  if (typeof mirrored.vx === 'number') {
    mirrored.vx = -mirrored.vx;
  }
  if (typeof mirrored.facing === 'number') {
    mirrored.facing = -mirrored.facing;
  }
  if (typeof mirrored.dirX === 'number') {
    mirrored.dirX = -mirrored.dirX;
  }
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
  const p1Name = (p1.playerName || p1.name || '1P').trim().slice(0, 10) || '1P';
  const p2Name = (p2.playerName || p2.name || '2P').trim().slice(0, 10) || '2P';
  const p1Token = p1.token || null;
  const p2Token = p2.token || null;

  const p1Record = getOrCreatePlayerRecord(p1Token, p1Name);
  const p2Record = getOrCreatePlayerRecord(p2Token, p2Name);

  const room = {
    id: roomId,
    mode,
    round: 1,
    roundStartedAt: Date.now(),
    roundFinished: false,
    p1Wins: 0,
    p2Wins: 0,
    rematchVotes: new Set(),
    p1: { ws: p1.ws, token: p1Record.token, name: p1Name, hp: 5 },
    p2: { ws: p2.ws, token: p2Record.token, name: p2Name, hp: 5 }
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
    round: 1,
    isRematch: false,
    myWins: 0,
    oppWins: 0,
    myRecord: p1Record,
    oppRecord: p2Record,
    opponentName: p2Name,
    myHp: 5,
    opponentHp: 5,
    countdownSec: 3
  });

  // Player 2에게 매칭 시작 전송
  sendJson(p2.ws, {
    type: 'MATCH_START',
    roomId,
    role: 'p2',
    round: 1,
    isRematch: false,
    myWins: 0,
    oppWins: 0,
    myRecord: p2Record,
    oppRecord: p1Record,
    opponentName: p1Name,
    myHp: 5,
    opponentHp: 5,
    countdownSec: 3
  });

  console.log(`[MATCH STARTED] Room ${roomId}: ${p1Name} (${p1Record.token}) vs ${p2Name} (${p2Record.token})`);
}

function startRematch(room) {
  room.round += 1;
  room.roundStartedAt = Date.now();
  room.roundFinished = false;
  room.rematchVotes.clear();
  room.p1.hp = 5;
  room.p2.hp = 5;

  const p1Record = getOrCreatePlayerRecord(room.p1.token, room.p1.name);
  const p2Record = getOrCreatePlayerRecord(room.p2.token, room.p2.name);

  sendJson(room.p1.ws, {
    type: 'MATCH_START',
    roomId: room.id,
    role: 'p1',
    round: room.round,
    isRematch: true,
    myWins: room.p1Wins,
    oppWins: room.p2Wins,
    myRecord: p1Record,
    oppRecord: p2Record,
    opponentName: room.p2.name,
    myHp: 5,
    opponentHp: 5,
    countdownSec: 3
  });

  sendJson(room.p2.ws, {
    type: 'MATCH_START',
    roomId: room.id,
    role: 'p2',
    round: room.round,
    isRematch: true,
    myWins: room.p2Wins,
    oppWins: room.p1Wins,
    myRecord: p2Record,
    oppRecord: p1Record,
    opponentName: room.p1.name,
    myHp: 5,
    opponentHp: 5,
    countdownSec: 3
  });

  console.log(`[REMATCH STARTED] Room ${room.id} (Round ${room.round}): ${room.p1.name} vs ${room.p2.name}`);
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
    const opponentRole = ws.playerRole === 'p1' ? 'p2' : 'p1';
    const opponent = ws.playerRole === 'p1' ? room.p2 : room.p1;

    // 카운트다운(3초) 이후 실제 교전 중에 중도 퇴장했다면 남은 사람 승리 기록!
    if (!room.roundFinished && (Date.now() - (room.roundStartedAt || 0) > 3500)) {
      recordMatchOutcome(room, opponentRole);
    }

    if (opponent && opponent.ws) {
      sendJson(opponent.ws, {
        type: 'OPPONENT_LEFT',
        message: '상대방이 방을 나갔습니다.'
      });
      opponent.ws.currentRoomId = null;
    }
    activeRooms.delete(ws.currentRoomId);
    console.log(`[ROOM ENDED] Room ${ws.currentRoomId} (player exited/disconnected)`);
    ws.currentRoomId = null;
  }
}

wss.on('connection', (ws) => {
  ws.id = 'usr_' + (nextPlayerId++);
  // 지연 시간 단축: TCP 버퍼링(Nagle 알고리즘) 즉시 비활성화
  if (ws._socket && typeof ws._socket.setNoDelay === 'function') {
    ws._socket.setNoDelay(true);
  }
  console.log(`[CONNECTED] Client ${ws.id}`);

  ws.on('message', (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      // 0. 실시간 핑/지연 시간(RTT) 측정 응답
      case 'PING': {
        sendJson(ws, {
          type: 'PONG',
          clientTime: msg.clientTime,
          serverTime: Date.now()
        });
        break;
      }

      // 1. 빠른 매칭 요청
      case 'JOIN_QUEUE': {
        const playerName = (msg.playerName || msg.name || '눈싸움고수').trim().slice(0, 10);
        const token = (msg.token && typeof msg.token === 'string') ? msg.token.trim().slice(0, 40) : null;
        matchQueue = matchQueue.filter(item => item.ws !== ws);

        if (matchQueue.length > 0) {
          const opponent = matchQueue.shift();
          const roomId = 'room_quick_' + Date.now();
          startMatch(opponent, { ws, playerName, token, id: ws.id }, roomId, 'quick');
        } else {
          matchQueue.push({ ws, playerName, token, id: ws.id });
          sendJson(ws, { type: 'QUEUE_WAITING' });
          console.log(`[QUEUE] ${playerName} (${token || ws.id}) waiting in queue (Total: ${matchQueue.length})`);
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
        const playerName = (msg.playerName || msg.name || '방장').trim().slice(0, 10);
        const token = (msg.token && typeof msg.token === 'string') ? msg.token.trim().slice(0, 40) : null;
        let roomCode = '';
        do {
          roomCode = String(Math.floor(100000 + Math.random() * 900000));
        } while (privateRooms.has(roomCode));

        privateRooms.set(roomCode, {
          code: roomCode,
          host: { ws, playerName, token, id: ws.id },
          guest: null
        });

        ws.createdRoomCode = roomCode;
        sendJson(ws, { type: 'ROOM_CREATED', roomCode });
        console.log(`[ROOM CREATED] Code: ${roomCode} by ${playerName} (${token || ws.id})`);
        break;
      }

      // 4. 방 코드로 방 참가
      case 'JOIN_ROOM': {
        const code = String(msg.roomCode || '').trim();
        const playerName = (msg.playerName || msg.name || '도전자').trim().slice(0, 10);
        const token = (msg.token && typeof msg.token === 'string') ? msg.token.trim().slice(0, 40) : null;

        if (!privateRooms.has(code)) {
          sendJson(ws, { type: 'JOIN_ROOM_ERROR', message: '존재하지 않는 방 코드입니다.' });
          return;
        }

        const roomData = privateRooms.get(code);
        if (roomData.host.ws === ws) {
          sendJson(ws, { type: 'JOIN_ROOM_ERROR', message: '자신이 생성한 방에는 참가할 수 없습니다.' });
          return;
        }

        privateRooms.delete(code);
        const roomId = 'room_code_' + code;
        startMatch(roomData.host, { ws, playerName, token, id: ws.id }, roomId, 'code');
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

      // 6. 인게임 상태 패킷 중계 (위치, 투사체, 스킬, 구르기, 피격/회피 등)
      case 'SYNC_STATE':
      case 'SYNC_ROLL':
      case 'SYNC_THROW':
      case 'SYNC_SKILL':
      case 'SYNC_DAMAGE':
      case 'SYNC_HIT_CHECK':
      case 'SYNC_DODGE':
      case 'SYNC_BARRIER_HIT':
      case 'SYNC_EMOTE': {
        if (!ws.currentRoomId || !activeRooms.has(ws.currentRoomId)) return;
        const room = activeRooms.get(ws.currentRoomId);
        const opponent = ws.playerRole === 'p1' ? room.p2 : room.p1;

        if (opponent && opponent.ws && opponent.ws.readyState === WebSocket.OPEN) {
          const mirrored = mirrorPacketForOpponent(msg);
          sendJson(opponent.ws, mirrored);
        }
        break;
      }

      // 7. 경기 승패 결과 보고 -> 서버 전적 기록 (라운드당 1회만 기록)
      case 'REPORT_MATCH_RESULT': {
        if (!ws.currentRoomId || !activeRooms.has(ws.currentRoomId)) return;
        const room = activeRooms.get(ws.currentRoomId);
        if (room.roundFinished) return;

        let winnerRole = null;
        if (msg.result === 'VICTORY') {
          winnerRole = ws.playerRole;
        } else if (msg.result === 'DEFEAT') {
          winnerRole = ws.playerRole === 'p1' ? 'p2' : 'p1';
        }
        if (winnerRole) {
          recordMatchOutcome(room, winnerRole);
        }
        break;
      }

      // 8. 상호 수락형 재대결 요청 (REMATCH_REQUEST)
      case 'REMATCH_REQUEST': {
        if (!ws.currentRoomId || !activeRooms.has(ws.currentRoomId)) return;
        const room = activeRooms.get(ws.currentRoomId);
        const myRole = ws.playerRole;
        if (!myRole) return;

        room.rematchVotes.add(myRole);

        // 양쪽 모두 수락했으면 즉시 재대결 시작!
        if (room.rematchVotes.has('p1') && room.rematchVotes.has('p2')) {
          startRematch(room);
        } else {
          // 아직 1명만 신청한 상태 -> 양쪽에 수락 현황 브로드캐스트
          const requesterName = room.rematchVotes.has('p1') ? room.p1.name : room.p2.name;
          sendJson(room.p1.ws, {
            type: 'REMATCH_STATUS',
            votes: room.rematchVotes.size,
            acceptedCount: room.rematchVotes.size,
            totalNeeded: 2,
            myVoted: room.rematchVotes.has('p1'),
            iAccepted: room.rematchVotes.has('p1'),
            oppVoted: room.rematchVotes.has('p2'),
            oppAccepted: room.rematchVotes.has('p2'),
            requesterName
          });
          sendJson(room.p2.ws, {
            type: 'REMATCH_STATUS',
            votes: room.rematchVotes.size,
            acceptedCount: room.rematchVotes.size,
            totalNeeded: 2,
            myVoted: room.rematchVotes.has('p2'),
            iAccepted: room.rematchVotes.has('p2'),
            oppVoted: room.rematchVotes.has('p1'),
            oppAccepted: room.rematchVotes.has('p1'),
            requesterName
          });
        }
        break;
      }

      // 9. 게임 종료 / 방 나가기
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
