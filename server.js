import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

// Store multiple game rooms
const gameRooms = new Map();

function generateRoomCode() {
  return 'CHESS-' + Math.random().toString(36).substr(2, 4).toUpperCase();
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'createRoom':
          handleCreateRoom(ws, message);
          break;
        case 'joinRoom':
          handleJoinRoom(ws, message);
          break;
        case 'join':
          handleJoin(ws, message);
          break;
        case 'move':
          handleMove(ws, message);
          break;
        case 'select':
          handleSelect(ws, message);
          break;
        case 'init':
          handleInit(ws, message);
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    handleDisconnect(ws);
  });
});

function handleCreateRoom(ws, message) {
  const roomCode = generateRoomCode();
  
  gameRooms.set(roomCode, {
    board: null,
    currentTurn: 'white',
    players: {
      white: null,
      black: null
    },
    clients: new Set()
  });
  
  ws.roomCode = roomCode;
  gameRooms.get(roomCode).clients.add(ws);
  
  ws.send(JSON.stringify({
    type: 'roomCreated',
    roomCode: roomCode
  }));
  
  console.log(`Room created: ${roomCode}`);
}

function handleJoinRoom(ws, message) {
  const { roomCode } = message;
  
  if (!gameRooms.has(roomCode)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Room not found'
    }));
    return;
  }
  
  const room = gameRooms.get(roomCode);
  ws.roomCode = roomCode;
  room.clients.add(ws);
  
  ws.send(JSON.stringify({
    type: 'roomJoined',
    roomCode: roomCode,
    gameState: {
      board: room.board,
      currentTurn: room.currentTurn,
      players: {
        white: room.players.white !== null,
        black: room.players.black !== null
      }
    }
  }));
  
  console.log(`Client joined room: ${roomCode}`);
}

function handleJoin(ws, message) {
  const { color } = message;
  const roomCode = ws.roomCode;
  
  if (!roomCode || !gameRooms.has(roomCode)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Not in a room'
    }));
    return;
  }
  
  const room = gameRooms.get(roomCode);
  
  if (room.players[color] === null) {
    room.players[color] = ws;
    ws.playerColor = color;
    
    broadcastToRoom(roomCode, {
      type: 'playerJoined',
      color: color,
      players: {
        white: room.players.white !== null,
        black: room.players.black !== null
      }
    });
    
    console.log(`Player joined as ${color} in room ${roomCode}`);
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: `${color} is already taken`
    }));
  }
}

function handleMove(ws, message) {
  const roomCode = ws.roomCode;
  
  if (!roomCode || !gameRooms.has(roomCode)) return;
  
  const room = gameRooms.get(roomCode);
  const { fromRow, fromCol, toRow, toCol, board, currentTurn } = message;
  
  room.board = board;
  room.currentTurn = currentTurn;
  
  broadcastToRoom(roomCode, {
    type: 'gameState',
    state: {
      board: room.board,
      currentTurn: room.currentTurn,
      players: {
        white: room.players.white !== null,
        black: room.players.black !== null
      }
    }
  });
}

function handleSelect(ws, message) {
  const roomCode = ws.roomCode;
  if (!roomCode) return;
  
  broadcastToRoom(roomCode, {
    type: 'pieceSelected',
    row: message.row,
    col: message.col,
    validMoves: message.validMoves,
    playerColor: message.playerColor
  });
}

function handleInit(ws, message) {
  const roomCode = ws.roomCode;
  
  if (!roomCode || !gameRooms.has(roomCode)) return;
  
  const room = gameRooms.get(roomCode);
  room.board = message.board;
  room.currentTurn = message.currentTurn;
}

function handleDisconnect(ws) {
  const roomCode = ws.roomCode;
  
  if (!roomCode || !gameRooms.has(roomCode)) return;
  
  const room = gameRooms.get(roomCode);
  room.clients.delete(ws);
  
  // Remove player from game
  if (room.players.white === ws) {
    room.players.white = null;
    broadcastToRoom(roomCode, { type: 'playerLeft', color: 'white' });
  } else if (room.players.black === ws) {
    room.players.black = null;
    broadcastToRoom(roomCode, { type: 'playerLeft', color: 'black' });
  }
  
  // Clean up empty rooms
  if (room.clients.size === 0) {
    gameRooms.delete(roomCode);
    console.log(`Room ${roomCode} deleted (empty)`);
  }
}

function broadcastToRoom(roomCode, message) {
  if (!gameRooms.has(roomCode)) return;
  
  const room = gameRooms.get(roomCode);
  const data = JSON.stringify(message);
  
  room.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(data);
    }
  });
}

console.log(`WebSocket server running on port ${PORT}`);