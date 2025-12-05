import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ChessGame } from './chess.js';
import { BattleArena } from './battle.js';

// WebSocket connection
let ws;
let playerColor = null;
let isConnected = false;
let currentRoomCode = null;

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

function connectToServer() {
  ws = new WebSocket(WS_URL);
  
  ws.onopen = () => {
    console.log('Connected to server');
    isConnected = true;
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleServerMessage(message);
  };
  
  ws.onclose = () => {
    console.log('Disconnected from server');
    isConnected = false;
    setTimeout(connectToServer, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function handleServerMessage(message) {
  switch (message.type) {
    case 'roomCreated':
      currentRoomCode = message.roomCode;
      roomCodeDisplay.textContent = `Room Code: ${message.roomCode}`;
      roomSetupDiv.style.display = 'none';
      showNotification(`Room created! Share code: ${message.roomCode}`);
      break;
      
    case 'roomJoined':
      currentRoomCode = message.roomCode;
      roomCodeDisplay.textContent = `Room Code: ${message.roomCode}`;
      roomSetupDiv.style.display = 'none';
      if (message.gameState.board) {
        game.board = message.gameState.board;
        game.currentTurn = message.gameState.currentTurn;
        updateBoard();
      }
      updatePlayerStatus(message.gameState.players);
      showNotification(`Joined room: ${message.roomCode}`);
      ws.send(JSON.stringify({
        type: 'init',
        board: game.board,
        currentTurn: game.currentTurn
      }));
      break;
      
    case 'gameState':
      if (message.state.board) {
        game.board = message.state.board;
        game.currentTurn = message.state.currentTurn;
        updateBoard();
      }
      updatePlayerStatus(message.state.players);
      break;
    
    case 'startBattle': {
      const isAttacker = playerColor === message.attackingPiece.color;
      battleFromRow = message.fromRow;
      battleFromCol = message.fromCol;
      battleToRow = message.toRow;
      battleToCol = message.toCol;
      
      boardGroup.visible = false;
      
      showNotification(isAttacker ? 'You are attacking! Win the battle!' : 'Defend yourself!');
      
      // CRITICAL FIX: For the defender, swap the pieces so they see their own piece correctly
      // Attacker sees: their piece (attacking) vs opponent piece (defending)
      // Defender sees: their piece (defending) vs opponent piece (attacking)
      const myPiece = isAttacker ? message.attackingPiece : message.defendingPiece;
      const enemyPiece = isAttacker ? message.defendingPiece : message.attackingPiece;
      
      battleArena.startBattle(
        myPiece,
        enemyPiece,
        isAttacker,
        (playerWon) => {
          handleBattleEnd(playerWon, isAttacker);
        }
      );
      break;
    }
    
    case 'opponentUpdate':
      if (battleArena.isActive()) {
        battleArena.updateOpponentPosition(message.position, message.rotation);
        
        if (message.shot) {
          battleArena.handleOpponentShot(message.shot);
        }
        
        if (message.health !== undefined) {
          battleArena.updateOpponentHealth(message.health);
        }
      }
      break;
    
    case 'battleEnded':
      if (battleArena.isActive()) {
        battleArena.cleanup();
        battleArena.battleActive = false;
      }
      
      game.board = message.board;
      game.currentTurn = message.currentTurn;
      
      if (message.gameOver) {
        game.gameOver = message.gameOver;
        game.winner = message.winner;
      }
      
      boardGroup.visible = true;
      
      camera.position.set(0, 2, 5);
      camera.rotation.set(0, 0, 0);
      
      updateBoard();
      
      const resultMsg = message.attackerWon ? 'Attacker won the battle!' : 'Defender won the battle!';
      showNotification(resultMsg);
      
      if (game.gameOver) {
        const winnerText = game.winner === playerColor ? 'YOU WIN!' : 'YOU LOSE!';
        setTimeout(() => {
          showNotification(`GAME OVER! ${game.winner.toUpperCase()} WINS! ${winnerText}`);
          setTimeout(() => {
            if (confirm(`${game.winner.toUpperCase()} wins! Play again?`)) {
              location.reload();
            }
          }, 2000);
        }, 1500);
      }
      break;
      
    case 'playerJoined':
      updatePlayerStatus(message.players);
      showNotification(`${message.color} player joined!`);
      break;
      
    case 'playerLeft':
      showNotification(`${message.color} player left`);
      break;
      
    case 'error':
      showNotification(message.message);
      break;
  }
}

function updatePlayerStatus(players) {
  const hasWhite = players && players.white;
  const hasBlack = players && players.black;
  
  playerStatusDiv.innerHTML = `
    <div>White: ${hasWhite ? '✓ Connected' : '⨯ Waiting...'}</div>
    <div>Black: ${hasBlack ? '✓ Connected' : '⨯ Waiting...'}</div>
  `;
}

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 10, 50);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
scene.add(dirLight);

// Chess game
const game = new ChessGame();

// Battle arena
const battleArena = new BattleArena(scene, camera);
let battleFromRow = null;
let battleFromCol = null;
let battleToRow = null;
let battleToCol = null;

// Board
const boardSize = 8;
const squareSize = 1;
const boardGroup = new THREE.Group();
scene.add(boardGroup);

// Create board squares
const lightMaterial = new THREE.MeshStandardMaterial({ color: 0xf0d9b5 });
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0xb58863 });
const selectedMaterial = new THREE.MeshStandardMaterial({
  color: 0xffff00,
  emissive: 0xaaaa00
});
const validMoveMaterial = new THREE.MeshStandardMaterial({
  color: 0x00ff00,
  emissive: 0x00aa00,
  transparent: true,
  opacity: 0.5
});

const squares = [];
for (let row = 0; row < 8; row++) {
  squares[row] = [];
  for (let col = 0; col < 8; col++) {
    const geometry = new THREE.BoxGeometry(squareSize, 0.1, squareSize);
    const material = (row + col) % 2 === 0 ? lightMaterial : darkMaterial;
    const square = new THREE.Mesh(geometry, material);
    square.position.set(col * squareSize - 3.5, 0, row * squareSize - 3.5);
    square.receiveShadow = true;
    square.userData = { row, col, originalMaterial: material };
    boardGroup.add(square);
    squares[row][col] = square;
  }
}

// Piece meshes + materials
const pieceMeshes = {};
const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

const gltfLoader = new GLTFLoader();

const pieceModelPaths = {
  pawn:  '/assets/Pawn/Pawn.glb',
  rook:  '/assets/Rook/Rook.glb',
  knight:'/assets/Knight/Knight.glb',
  bishop:'/assets/Bishop/Bishop.glb',
  queen: '/assets/Queen/Queen.glb',
  king:  '/assets/King/King.glb'
};

const pieceModelCache = {};

function getPieceTemplate(type, onLoad) {
  const key = type.toLowerCase();
  if (pieceModelCache[key]) {
    onLoad(pieceModelCache[key]);
    return;
  }

  const path = pieceModelPaths[key];
  if (!path) {
    console.error('No model path for piece type:', type);
    return;
  }

  gltfLoader.load(
    path,
    (gltf) => {
      const template = gltf.scene;
      pieceModelCache[key] = template;
      onLoad(template);
    },
    undefined,
    (err) => {
      console.error('Error loading model', path, err);
    }
  );
}

function createPieceMesh(type, color) {
  const root = new THREE.Group();
  root.castShadow = true;
  root.userData = { type, color };

  const mat = color === 'white' ? whiteMaterial : blackMaterial;

  getPieceTemplate(type, (template) => {
    const model = template.clone(true);

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = mat;
      }
    });

    const scale = 18;
    model.scale.set(scale, scale, scale);
    model.position.y = 0;

    root.add(model);
  });

  return root;
}

function updateBoard() {
  Object.values(pieceMeshes).forEach(mesh => {
    boardGroup.remove(mesh);
  });

  for (const key in pieceMeshes) {
    delete pieceMeshes[key];
  }
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      squares[row][col].material = squares[row][col].userData.originalMaterial;
    }
  }
  
  if (game.selectedPiece && playerColor === game.currentTurn) {
    const { row, col } = game.selectedPiece;
    squares[row][col].material = selectedMaterial;
    
    game.validMoves.forEach(move => {
      squares[move.row][move.col].material = validMoveMaterial;
    });
  }
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.getPiece(row, col);
      if (piece) {
        const key = `${row}-${col}`;
        const mesh = createPieceMesh(piece.type, piece.color);

        mesh.position.set(col * squareSize - 3.5, 0.05, row * squareSize - 3.5);
        mesh.userData.row = row;
        mesh.userData.col = col;

        boardGroup.add(mesh);
        pieceMeshes[key] = mesh;
      }
    }
  }
}

// FPS controls
const moveSpeed = 0.1;
const lookSpeed = 0.002;

camera.position.set(0, 2, 5);
camera.rotation.order = 'YXZ';

const keys = {};
const mouse = { x: 0, y: 0 };
let isPointerLocked = false;

document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);

document.addEventListener('click', () => {
  if (!isPointerLocked) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  isPointerLocked = document.pointerLockElement === renderer.domElement;
});

document.addEventListener('mousemove', (e) => {
  if (!isPointerLocked) return;
  
  mouse.x = e.movementX;
  mouse.y = e.movementY;
  
  camera.rotation.y -= mouse.x * lookSpeed;
  camera.rotation.x -= mouse.y * lookSpeed;
  camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
});

// Raycaster for piece selection
const raycaster = new THREE.Raycaster();
const crosshair = document.createElement('div');
crosshair.style.position = 'fixed';
crosshair.style.top = '50%';
crosshair.style.left = '50%';
crosshair.style.transform = 'translate(-50%, -50%)';
crosshair.style.width = '4px';
crosshair.style.height = '4px';
crosshair.style.backgroundColor = 'white';
crosshair.style.border = '2px solid black';
crosshair.style.borderRadius = '50%';
crosshair.style.pointerEvents = 'none';
crosshair.style.zIndex = '1000';
document.body.appendChild(crosshair);

// UI
const ui = document.createElement('div');
ui.style.position = 'fixed';
ui.style.top = '10px';
ui.style.left = '10px';
ui.style.color = 'white';
ui.style.fontFamily = 'Arial, sans-serif';
ui.style.fontSize = '18px';
ui.style.textShadow = '2px 2px 4px black';
ui.style.pointerEvents = 'none';
ui.style.zIndex = '1000';
document.body.appendChild(ui);

// Room code display
const roomCodeDisplay = document.createElement('div');
roomCodeDisplay.style.position = 'fixed';
roomCodeDisplay.style.top = '10px';
roomCodeDisplay.style.left = '50%';
roomCodeDisplay.style.transform = 'translateX(-50%)';
roomCodeDisplay.style.color = 'white';
roomCodeDisplay.style.fontFamily = 'Arial, sans-serif';
roomCodeDisplay.style.fontSize = '24px';
roomCodeDisplay.style.fontWeight = 'bold';
roomCodeDisplay.style.textShadow = '2px 2px 4px black';
roomCodeDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
roomCodeDisplay.style.padding = '10px 20px';
roomCodeDisplay.style.borderRadius = '5px';
roomCodeDisplay.style.pointerEvents = 'none';
roomCodeDisplay.style.zIndex = '1000';
document.body.appendChild(roomCodeDisplay);

// Player status UI
const playerStatusDiv = document.createElement('div');
playerStatusDiv.style.position = 'fixed';
playerStatusDiv.style.top = '10px';
playerStatusDiv.style.right = '10px';
playerStatusDiv.style.color = 'white';
playerStatusDiv.style.fontFamily = 'Arial, sans-serif';
playerStatusDiv.style.fontSize = '16px';
playerStatusDiv.style.textShadow = '2px 2px 4px black';
playerStatusDiv.style.pointerEvents = 'none';
playerStatusDiv.style.zIndex = '1000';
playerStatusDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
playerStatusDiv.style.padding = '10px';
playerStatusDiv.style.borderRadius = '5px';
document.body.appendChild(playerStatusDiv);

// Room setup UI
const roomSetupDiv = document.createElement('div');
roomSetupDiv.style.position = 'fixed';
roomSetupDiv.style.top = '50%';
roomSetupDiv.style.left = '50%';
roomSetupDiv.style.transform = 'translate(-50%, -50%)';
roomSetupDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
roomSetupDiv.style.padding = '30px';
roomSetupDiv.style.borderRadius = '10px';
roomSetupDiv.style.color = 'white';
roomSetupDiv.style.fontFamily = 'Arial, sans-serif';
roomSetupDiv.style.textAlign = 'center';
roomSetupDiv.style.zIndex = '2000';
roomSetupDiv.innerHTML = `
  <h2 style="margin-bottom: 20px;">FPS Chess - Multiplayer</h2>
  <button id="createRoomBtn" style="padding: 15px 30px; margin: 10px; font-size: 18px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 5px;">Create New Room</button>
  <div style="margin: 20px 0;">- OR -</div>
  <input id="roomCodeInput" type="text" placeholder="Enter Room Code" style="padding: 10px; font-size: 16px; margin: 10px; border-radius: 5px; border: none; text-align: center;">
  <br>
  <button id="joinRoomBtn" style="padding: 15px 30px; margin: 10px; font-size: 18px; cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 5px;">Join Room</button>
`;
document.body.appendChild(roomSetupDiv);

// Color selection UI
const colorSelectionDiv = document.createElement('div');
colorSelectionDiv.style.position = 'fixed';
colorSelectionDiv.style.top = '50%';
colorSelectionDiv.style.left = '50%';
colorSelectionDiv.style.transform = 'translate(-50%, -50%)';
colorSelectionDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
colorSelectionDiv.style.padding = '30px';
colorSelectionDiv.style.borderRadius = '10px';
colorSelectionDiv.style.color = 'white';
colorSelectionDiv.style.fontFamily = 'Arial, sans-serif';
colorSelectionDiv.style.textAlign = 'center';
colorSelectionDiv.style.zIndex = '2000';
colorSelectionDiv.style.display = 'none';
colorSelectionDiv.innerHTML = `
  <h2 style="margin-bottom: 20px;">Choose Your Color</h2>
  <button id="whiteBtn" style="padding: 15px 30px; margin: 10px; font-size: 18px; cursor: pointer; background: white; border: none; border-radius: 5px;">Play as White</button>
  <button id="blackBtn" style="padding: 15px 30px; margin: 10px; font-size: 18px; cursor: pointer; background: #333; color: white; border: none; border-radius: 5px;">Play as Black</button>
`;
document.body.appendChild(colorSelectionDiv);

// Notification system
const notificationDiv = document.createElement('div');
notificationDiv.style.position = 'fixed';
notificationDiv.style.bottom = '20px';
notificationDiv.style.left = '50%';
notificationDiv.style.transform = 'translateX(-50%)';
notificationDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
notificationDiv.style.color = 'white';
notificationDiv.style.padding = '15px 30px';
notificationDiv.style.borderRadius = '5px';
notificationDiv.style.fontFamily = 'Arial, sans-serif';
notificationDiv.style.fontSize = '16px';
notificationDiv.style.display = 'none';
notificationDiv.style.zIndex = '2000';
document.body.appendChild(notificationDiv);

function showNotification(message) {
  notificationDiv.textContent = message;
  notificationDiv.style.display = 'block';
  setTimeout(() => {
    notificationDiv.style.display = 'none';
  }, 3000);
}

// Room setup handlers
document.getElementById('createRoomBtn').addEventListener('click', () => {
  if (isConnected) {
    ws.send(JSON.stringify({ type: 'createRoom' }));
    colorSelectionDiv.style.display = 'block';
  } else {
    showNotification('Not connected to server. Please wait...');
  }
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!roomCode) {
    showNotification('Please enter a room code');
    return;
  }
  
  if (isConnected) {
    ws.send(JSON.stringify({ 
      type: 'joinRoom',
      roomCode: roomCode
    }));
    colorSelectionDiv.style.display = 'block';
  } else {
    showNotification('Not connected to server. Please wait...');
  }
});

document.getElementById('whiteBtn').addEventListener('click', () => {
  selectColor('white');
});

document.getElementById('blackBtn').addEventListener('click', () => {
  selectColor('black');
});

function selectColor(color) {
  if (isConnected && currentRoomCode) {
    ws.send(JSON.stringify({
      type: 'join',
      color: color
    }));
    playerColor = color;
    colorSelectionDiv.style.display = 'none';
    showNotification(`You are playing as ${color}`);
  } else {
    showNotification('Not in a room. Please create or join a room first.');
  }
}

document.addEventListener('click', (e) => {
  if (!isPointerLocked) return;
  
  if (battleArena.isActive()) {
    const shotData = battleArena.shoot();
    
    if (shotData && isConnected) {
      const playerState = battleArena.getPlayerState();
      ws.send(JSON.stringify({
        type: 'battleUpdate',
        position: playerState.position,
        rotation: playerState.rotation,
        shot: shotData,
        health: playerState.health
      }));
    }
    return;
  }
  
  if (!playerColor) return;
  
  if (game.gameOver) {
    showNotification('Game is over!');
    return;
  }
  
  if (playerColor !== game.currentTurn) {
    showNotification("It's not your turn!");
    return;
  }
  
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  
  const squareIntersects = raycaster.intersectObjects(
    squares.flat().concat(Object.values(pieceMeshes))
  );
  
  if (squareIntersects.length > 0) {
    const intersect = squareIntersects[0];
    let row, col;
    
    if (intersect.object.userData.row !== undefined) {
      row = intersect.object.userData.row;
      col = intersect.object.userData.col;
    } else {
      const x = intersect.object.position.x + 3.5;
      const z = intersect.object.position.z + 3.5;
      col = Math.floor(x / squareSize);
      row = Math.floor(z / squareSize);
    }
    
    const prevSelected = game.selectedPiece;
    const targetPiece = game.getPiece(row, col);
    const isCapture = targetPiece && targetPiece.color !== playerColor && 
                     game.validMoves.some(m => m.row === row && m.col === col);
    
    // CRITICAL FIX: Get the attacking piece BEFORE making the move
    // because selectPiece() will move the piece and clear the original square
    const attackingPiece = prevSelected ? game.getPiece(prevSelected.row, prevSelected.col) : null;
    
    const moved = game.selectPiece(row, col);
    
    if (moved && isConnected) {
      ws.send(JSON.stringify({
        type: 'move',
        fromRow: prevSelected.row,
        fromCol: prevSelected.col,
        toRow: row,
        toCol: col,
        board: game.board,
        currentTurn: game.currentTurn,
        isCapture: isCapture,
        attackingPiece: attackingPiece,
        defendingPiece: targetPiece
      }));
    }
    
    updateBoard();
  }
});

function updateMovement() {
  if (battleArena.isActive()) {
    // Use physics-based movement during battles
    battleArena.updateBattlePhysics(keys, deltaTime, camera);
  } else {
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    
    if (keys['KeyW']) camera.position.addScaledVector(forward, moveSpeed);
    if (keys['KeyS']) camera.position.addScaledVector(forward, -moveSpeed);
    if (keys['KeyA']) camera.position.addScaledVector(right, -moveSpeed);
    if (keys['KeyD']) camera.position.addScaledVector(right, moveSpeed);
    if (keys['Space']) camera.position.y += moveSpeed;
    if (keys['ShiftLeft']) camera.position.y -= moveSpeed;
    
    camera.position.y = Math.max(0.5, camera.position.y);
  }
}

function handleBattleEnd(playerWon, isAttacker) {
  const attackerWon = (isAttacker && playerWon) || (!isAttacker && !playerWon);
  
  const defendingPiece = game.board[battleToRow][battleToCol];
  const attackingPiece = game.board[battleFromRow][battleFromCol];
  
  if (attackerWon) {
    game.board[battleToRow][battleToCol] = game.board[battleFromRow][battleFromCol];
    game.board[battleFromRow][battleFromCol] = null;
    
    if (defendingPiece && defendingPiece.type === 'king') {
      game.gameOver = true;
      game.winner = attackingPiece.color;
    }
  } else {
    game.board[battleFromRow][battleFromCol] = null;
    
    if (attackingPiece && attackingPiece.type === 'king') {
      game.gameOver = true;
      game.winner = defendingPiece.color;
    }
  }
  
  game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';
  
  if (isConnected) {
    ws.send(JSON.stringify({
      type: 'battleResult',
      attackerWon: attackerWon,
      fromRow: battleFromRow,
      fromCol: battleFromCol,
      toRow: battleToRow,
      toCol: battleToCol,
      board: game.board,
      currentTurn: game.currentTurn,
      gameOver: game.gameOver,
      winner: game.winner
    }));
  }
  
  if (game.gameOver) {
    const winnerText = game.winner === playerColor ? 'YOU WIN!' : 'YOU LOSE!';
    showNotification(`GAME OVER! ${game.winner.toUpperCase()} WINS! ${winnerText}`);
    
    setTimeout(() => {
      if (confirm(`${game.winner.toUpperCase()} wins! Play again?`)) {
        location.reload();
      }
    }, 2000);
  }
}

// Animation loop
let lastTime = Date.now();
let lastNetworkUpdate = Date.now();
let deltaTime = 0; // Make deltaTime accessible to updateMovement

function animate() {
  requestAnimationFrame(animate);

  const currentTime = Date.now();
  deltaTime = (currentTime - lastTime) / 1000; // Update global deltaTime
  lastTime = currentTime;

  updateMovement();
  
  if (battleArena.isActive() && currentTime - lastNetworkUpdate > 50 && isConnected) {
    const playerState = battleArena.getPlayerState();
    ws.send(JSON.stringify({
      type: 'battleUpdate',
      position: playerState.position,
      rotation: playerState.rotation,
      shot: null,
      health: playerState.health
    }));
    lastNetworkUpdate = currentTime;
  }
  
  let healthInfo = '';
  if (battleArena.isActive()) {
    const health = battleArena.updateBattle(deltaTime);
    
    healthInfo = `
      <div style="margin-top: 10px; font-size: 20px; font-weight: bold;">
        🎯 BATTLE MODE 🎯<br>
        Your Health: ${health.playerHealth}%<br>
        Enemy Health: ${health.opponentHealth}%
      </div>
    `;
  }
  
  const turnIndicator = playerColor === game.currentTurn ? '🟢 YOUR TURN' : '🔴 OPPONENT\'S TURN';
  const colorDisplay = playerColor ? `You: ${playerColor.toUpperCase()}` : 'Selecting color...';
  
  const controls = battleArena.isActive() 
    ? 'WASD: Move | Mouse: Look | CLICK: Shoot'
    : 'WASD: Move | Mouse: Look | Space/Shift: Up/Down<br>Click to lock cursor | Click pieces to play';
  
  ui.innerHTML = `
    <div>${colorDisplay}</div>
    <div>Current Turn: ${game.currentTurn}</div>
    <div style="margin-top: 5px; font-weight: bold;">${turnIndicator}</div>
    ${healthInfo}
    <div style="margin-top: 10px; font-size: 14px;">
      ${controls}
    </div>
  `;
  
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

connectToServer();
updateBoard();
animate();