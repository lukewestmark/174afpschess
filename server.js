import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

let gameState = {
  board: null,
  currentTurn: 'white',
  players: {
    white: null,
    black: null
  }
};

const clients = new Set();

wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'join':
          handleJoin(ws, message);
          break;
        case 'move':
          handleMove(message);
          break;
        case 'select':
          handleSelect(message);
          break;
        case 'init':
          handleInit(message);
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
    
    // Remove player from game
    if (gameState.players.white === ws) {
      gameState.players.white = null;
      broadcast({ type: 'playerLeft', color: 'white' });
    } else if (gameState.players.black === ws) {
      gameState.players.black = null;
      broadcast({ type: 'playerLeft', color: 'black' });
    }
  });

  // Send current game state to new client
  ws.send(JSON.stringify({
    type: 'gameState',
    state: gameState
  }));
});

function handleJoin(ws, message) {
  const { color } = message;
  
  if (gameState.players[color] === null) {
    gameState.players[color] = ws;
    ws.playerColor = color;
    
    broadcast({
      type: 'playerJoined',
      color: color,
      players: {
        white: gameState.players.white !== null,
        black: gameState.players.black !== null
      }
    });
    
    console.log(`Player joined as ${color}`);
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: `${color} is already taken`
    }));
  }
}

function handleMove(message) {
  const { fromRow, fromCol, toRow, toCol, board, currentTurn } = message;
  
  gameState.board = board;
  gameState.currentTurn = currentTurn;
  
  broadcast({
    type: 'gameState',
    state: gameState
  });
}

function handleSelect(message) {
  broadcast({
    type: 'pieceSelected',
    row: message.row,
    col: message.col,
    validMoves: message.validMoves,
    playerColor: message.playerColor
  });
}

function handleInit(message) {
  gameState.board = message.board;
  gameState.currentTurn = message.currentTurn;
}

function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(data);
    }
  });
}

console.log('WebSocket server running on ws://localhost:8080');