import * as THREE from 'three';
import { ChessGame } from './chess.js';
import { BattleArena } from './battle.js';
import { NetworkManager } from './network-manager.js';

// Network connection
let networkManager = null;
let playerColor = null;
let isConnected = false;
let isHost = false;

function handleGameMessage(message) {
  switch (message.type) {
    case 'connected':
      showNotification(isHost ? 'Guest connected!' : 'Connected to host!');
      updatePlayerStatus({ white: true, black: true });
      break;

    case 'moveRequest':
      // Host only - validate guest's move
      if (isHost) {
        handleGuestMoveRequest(message);
      }
      break;

    case 'gameState':
      // Guest only - update from host
      if (!isHost) {
        game.board = message.board;
        game.currentTurn = message.currentTurn;
        updateBoard();
      }
      break;

    case 'startBattle':
      // Determine if this player is the attacker or defender
      const isAttacker = playerColor === message.attackingPiece.color;
      battleFromRow = message.fromRow;
      battleFromCol = message.fromCol;
      battleToRow = message.toRow;
      battleToCol = message.toCol;

      // Hide chess board
      boardGroup.visible = false;

      showNotification(isAttacker ? 'You are attacking! Win the battle!' : 'Defend yourself!');

      battleArena.startBattle(
        message.attackingPiece,
        message.defendingPiece,
        isAttacker,
        (playerWon) => {
          handleBattleEnd(playerWon, isAttacker);
        }
      );
      break;

    case 'battleUpdate':
      // Update opponent's position and handle their shots
      if (battleArena.isActive()) {
        battleArena.updateOpponentPosition(message.position, message.rotation);

        if (message.shot) {
          battleArena.handleOpponentShot(message.shot);
        }

        // Update opponent health from their perspective
        if (message.health !== undefined) {
          battleArena.updateOpponentHealth(message.health);
        }
      }
      break;

    case 'battleEnded':
      // Clean up battle arena first
      if (battleArena.isActive()) {
        battleArena.cleanup();
        battleArena.battleActive = false;
      }

      // Update board after battle
      game.board = message.board;
      game.currentTurn = message.currentTurn;

      // Show chess board again
      boardGroup.visible = true;

      // Reset camera to chess view
      camera.position.set(0, 2, 5);
      camera.rotation.set(0, 0, 0);

      updateBoard();

      const resultMsg = message.attackerWon ? 'Attacker won the battle!' : 'Defender won the battle!';
      showNotification(resultMsg);
      break;

    case 'pieceSelected':
      // Visual feedback for opponent's selection
      showNotification(`Opponent selected piece at (${message.row}, ${message.col})`);
      break;

    case 'error':
      showNotification(message.message);
      break;
  }
}

function handleGuestMoveRequest(message) {
  const { fromRow, fromCol, toRow, toCol } = message;

  // Validate it's guest's turn
  if (game.currentTurn !== 'black') {
    networkManager.send('error', { message: 'Not your turn' }, 'game-state');
    return;
  }

  // Validate move is legal
  const piece = game.getPiece(fromRow, fromCol);
  if (!piece || piece.color !== 'black') {
    networkManager.send('error', { message: 'Invalid piece' }, 'game-state');
    return;
  }

  game.selectedPiece = { row: fromRow, col: fromCol, piece };
  game.validMoves = game.getValidMoves(fromRow, fromCol);
  const isValid = game.validMoves.some(m => m.row === toRow && m.col === toCol);

  if (!isValid) {
    networkManager.send('error', { message: 'Invalid move' }, 'game-state');
    game.selectedPiece = null;
    game.validMoves = [];
    return;
  }

  // Check for capture
  const targetPiece = game.getPiece(toRow, toCol);
  const isCapture = targetPiece && targetPiece.color !== 'black';

  // Execute move
  game.movePiece(fromRow, fromCol, toRow, toCol);
  updateBoard();

  if (isCapture) {
    // Start battle
    battleFromRow = fromRow;
    battleFromCol = fromCol;
    battleToRow = toRow;
    battleToCol = toCol;

    networkManager.send('startBattle', {
      attackingPiece: piece,
      defendingPiece: targetPiece,
      fromRow, fromCol, toRow, toCol
    }, 'game-state');

    // Also start battle for host
    handleGameMessage({
      type: 'startBattle',
      attackingPiece: piece,
      defendingPiece: targetPiece,
      fromRow, fromCol, toRow, toCol
    });
  } else {
    // Normal move - broadcast state
    networkManager.send('gameState', {
      board: game.board,
      currentTurn: game.currentTurn
    }, 'game-state');
  }
}

function updatePlayerStatus(players) {
  const hasWhite = players && players.white;
  const hasBlack = players && players.black;

  playerStatusDiv.innerHTML = `
    <div>White (Host): ${hasWhite ? '✓ Connected' : '⨯ Waiting...'}</div>
    <div>Black (Guest): ${hasBlack ? '✓ Connected' : '⨯ Waiting...'}</div>
  `;
}

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 10, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
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
let pendingBattle = null;
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
const selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xaaaa00 });
const validMoveMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00aa00, transparent: true, opacity: 0.5 });

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

// Piece meshes
const pieceMeshes = {};
const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });

function createPieceMesh(type, color) {
  let geometry;
  
  switch (type) {
    case 'pawn':
      geometry = new THREE.CylinderGeometry(0.15, 0.2, 0.6, 16);
      break;
    case 'rook':
      geometry = new THREE.BoxGeometry(0.4, 0.6, 0.4);
      break;
    case 'knight':
      geometry = new THREE.ConeGeometry(0.2, 0.7, 8);
      break;
    case 'bishop':
      geometry = new THREE.ConeGeometry(0.15, 0.8, 16);
      break;
    case 'queen':
      geometry = new THREE.CylinderGeometry(0.15, 0.25, 0.8, 16);
      break;
    case 'king':
      geometry = new THREE.CylinderGeometry(0.2, 0.25, 0.9, 16);
      break;
  }
  
  const material = color === 'white' ? whiteMaterial : blackMaterial;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.userData = { type, color };
  
  return mesh;
}

function updateBoard() {
  // Clear existing pieces
  Object.values(pieceMeshes).forEach(mesh => {
    boardGroup.remove(mesh);
  });
  
  // Reset square materials
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      squares[row][col].material = squares[row][col].userData.originalMaterial;
    }
  }
  
  // Highlight selected piece (only for current player)
  if (game.selectedPiece && playerColor === game.currentTurn) {
    const { row, col } = game.selectedPiece;
    squares[row][col].material = selectedMaterial;
    
    // Highlight valid moves
    game.validMoves.forEach(move => {
      squares[move.row][move.col].material = validMoveMaterial;
    });
  }
  
  // Add pieces
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.getPiece(row, col);
      if (piece) {
        const key = `${row}-${col}`;
        const mesh = createPieceMesh(piece.type, piece.color);
        mesh.position.set(col * squareSize - 3.5, 0.4, row * squareSize - 3.5);
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

// Connection status display
const connectionStatusDisplay = document.createElement('div');
connectionStatusDisplay.style.position = 'fixed';
connectionStatusDisplay.style.top = '10px';
connectionStatusDisplay.style.left = '50%';
connectionStatusDisplay.style.transform = 'translateX(-50%)';
connectionStatusDisplay.style.color = 'white';
connectionStatusDisplay.style.fontFamily = 'Arial, sans-serif';
connectionStatusDisplay.style.fontSize = '18px';
connectionStatusDisplay.style.fontWeight = 'bold';
connectionStatusDisplay.style.textShadow = '2px 2px 4px black';
connectionStatusDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
connectionStatusDisplay.style.padding = '10px 20px';
connectionStatusDisplay.style.borderRadius = '5px';
connectionStatusDisplay.style.pointerEvents = 'none';
connectionStatusDisplay.style.zIndex = '1000';
connectionStatusDisplay.style.display = 'none';
document.body.appendChild(connectionStatusDisplay);

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

// Connection setup UI
const connectionSetupDiv = document.createElement('div');
connectionSetupDiv.style.position = 'fixed';
connectionSetupDiv.style.top = '50%';
connectionSetupDiv.style.left = '50%';
connectionSetupDiv.style.transform = 'translate(-50%, -50%)';
connectionSetupDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
connectionSetupDiv.style.padding = '30px';
connectionSetupDiv.style.borderRadius = '10px';
connectionSetupDiv.style.color = 'white';
connectionSetupDiv.style.fontFamily = 'Arial, sans-serif';
connectionSetupDiv.style.textAlign = 'center';
connectionSetupDiv.style.zIndex = '2000';
connectionSetupDiv.innerHTML = `
  <h2 style="margin-bottom: 20px;">🎮 FPS Chess - LAN Multiplayer</h2>
  <button id="hostGameBtn" style="padding: 15px 30px; margin: 10px; font-size: 18px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 5px; font-weight: bold;">Host Game (White)</button>
  <div id="localIPsDisplay" style="margin: 15px 0; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 5px; display: none;">
    <div style="font-weight: bold; margin-bottom: 10px;">🌐 Your Local IPs:</div>
    <div id="ipList" style="font-family: monospace;"></div>
    <div style="margin-top: 10px; font-size: 14px; color: #aaa;">Share one of these IPs with the guest</div>
  </div>
  <div style="margin: 20px 0;">- OR -</div>
  <input id="hostIPInput" type="text" placeholder="Enter Host IP (e.g., 192.168.1.100)" style="padding: 10px; font-size: 16px; margin: 10px; border-radius: 5px; border: none; text-align: center; width: 300px;">
  <br>
  <button id="joinGameBtn" style="padding: 15px 30px; margin: 10px; font-size: 18px; cursor: pointer; background: #2196F3; color: white; border: none; border-radius: 5px; font-weight: bold;">Join Game (Black)</button>
  <div id="connectionProgress" style="margin-top: 20px; display: none; color: #4CAF50;"></div>
`;
document.body.appendChild(connectionSetupDiv);

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

// Connection setup handlers
document.getElementById('hostGameBtn').addEventListener('click', async () => {
  try {
    document.getElementById('connectionProgress').textContent = '⏳ Starting host...';
    document.getElementById('connectionProgress').style.display = 'block';

    isHost = true;
    playerColor = 'white';
    networkManager = new NetworkManager(true);

    const ips = await networkManager.startHost();

    // Display local IPs
    const ipListDiv = document.getElementById('ipList');
    ipListDiv.innerHTML = ips.map(ip => {
      const star = ip.isPrimary ? ' ⭐' : '';
      return `<div style="margin: 5px 0; font-size: 16px;">${ip.address}${star}</div>`;
    }).join('');

    document.getElementById('localIPsDisplay').style.display = 'block';
    document.getElementById('connectionProgress').textContent = '⏳ Waiting for guest to connect...';

    // Set up message handler
    networkManager.onMessage((message) => {
      handleGameMessage(message);
    });

    // Set up connection state handler
    networkManager.onConnectionStateChange((state) => {
      if (state === 'connected') {
        isConnected = true;
        connectionSetupDiv.style.display = 'none';
        connectionStatusDisplay.textContent = '🟢 Connected - P2P Mode';
        connectionStatusDisplay.style.display = 'block';
        updatePlayerStatus({ white: true, black: true });
        showNotification('Guest connected! Game started!');
      }
    });

    updatePlayerStatus({ white: true, black: false });

  } catch (error) {
    console.error('Error starting host:', error);
    showNotification('Failed to start host: ' + error.message);
    document.getElementById('connectionProgress').style.display = 'none';
  }
});

document.getElementById('joinGameBtn').addEventListener('click', async () => {
  const hostIP = document.getElementById('hostIPInput').value.trim();

  if (!hostIP) {
    showNotification('Please enter host IP address');
    return;
  }

  try {
    document.getElementById('connectionProgress').textContent = '⏳ Connecting to host...';
    document.getElementById('connectionProgress').style.display = 'block';

    isHost = false;
    playerColor = 'black';
    networkManager = new NetworkManager(false);

    await networkManager.connectToHost(hostIP);

    // Set up message handler
    networkManager.onMessage((message) => {
      handleGameMessage(message);
    });

    // Set up connection state handler
    networkManager.onConnectionStateChange((state) => {
      if (state === 'connected') {
        isConnected = true;
        connectionSetupDiv.style.display = 'none';
        connectionStatusDisplay.textContent = '🟢 Connected - P2P Mode';
        connectionStatusDisplay.style.display = 'block';
        updatePlayerStatus({ white: true, black: true });
        showNotification('Connected to host! Game started!');

        // Notify host that guest connected
        networkManager.send('connected', {}, 'game-state');
      }
    });

    updatePlayerStatus({ white: true, black: false });

  } catch (error) {
    console.error('Error connecting to host:', error);
    showNotification('Connection failed: ' + error.message);
    document.getElementById('connectionProgress').style.display = 'none';
  }
});

document.addEventListener('click', (e) => {
  if (!isPointerLocked) return;
  
  // Handle shooting in battle mode
  if (battleArena.isActive()) {
    const shotData = battleArena.shoot();

    // Send shot to opponent
    if (shotData && isConnected) {
      const playerState = battleArena.getPlayerState();
      networkManager.send('battleUpdate', {
        position: playerState.position,
        rotation: playerState.rotation,
        shot: shotData,
        health: playerState.health
      }, 'battle-updates'); // Use unreliable channel
    }
    return;
  }

  if (!playerColor) return;

  // Only allow moves on your turn
  if (playerColor !== game.currentTurn) {
    showNotification("It's not your turn!");
    return;
  }

  raycaster.setFromCamera({ x: 0, y: 0 }, camera);

  // Check for square clicks
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
      // Calculate from position
      const x = intersect.object.position.x + 3.5;
      const z = intersect.object.position.z + 3.5;
      col = Math.floor(x / squareSize);
      row = Math.floor(z / squareSize);
    }

    const prevSelected = game.selectedPiece;
    const targetPiece = game.getPiece(row, col);
    const isCapture = targetPiece && targetPiece.color !== playerColor &&
                     game.validMoves.some(m => m.row === row && m.col === col);

    const moved = game.selectPiece(row, col);

    if (moved && isConnected) {
      if (isHost) {
        // Host: execute move directly and broadcast state
        if (isCapture) {
          // Start battle
          battleFromRow = prevSelected.row;
          battleFromCol = prevSelected.col;
          battleToRow = row;
          battleToCol = col;

          const attackingPiece = prevSelected.piece;

          networkManager.send('startBattle', {
            attackingPiece: attackingPiece,
            defendingPiece: targetPiece,
            fromRow: prevSelected.row,
            fromCol: prevSelected.col,
            toRow: row,
            toCol: col
          }, 'game-state');

          // Also start battle for host
          handleGameMessage({
            type: 'startBattle',
            attackingPiece: attackingPiece,
            defendingPiece: targetPiece,
            fromRow: prevSelected.row,
            fromCol: prevSelected.col,
            toRow: row,
            toCol: col
          });
        } else {
          networkManager.send('gameState', {
            board: game.board,
            currentTurn: game.currentTurn
          }, 'game-state');
        }
      } else {
        // Guest: send move request to host
        networkManager.send('moveRequest', {
          fromRow: prevSelected.row,
          fromCol: prevSelected.col,
          toRow: row,
          toCol: col
        }, 'game-state');
      }
    }

    updateBoard();
  }
});

// Movement
function updateMovement() {
  if (battleArena.isActive()) {
    // Battle mode movement
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    
    const moveSpeed = 0.15;
    
    if (keys['KeyW']) camera.position.addScaledVector(forward, moveSpeed);
    if (keys['KeyS']) camera.position.addScaledVector(forward, -moveSpeed);
    if (keys['KeyA']) camera.position.addScaledVector(right, -moveSpeed);
    if (keys['KeyD']) camera.position.addScaledVector(right, moveSpeed);
    
    // Constrain to arena
    battleArena.constrainPlayerMovement(camera.position);
  } else {
    // Normal chess board movement
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
    
    // Keep camera above ground
    camera.position.y = Math.max(0.5, camera.position.y);
  }
}

function handleBattleEnd(playerWon, isAttacker) {
  // Determine actual winner based on attacker/defender
  const attackerWon = (isAttacker && playerWon) || (!isAttacker && !playerWon);

  // Update board based on battle result
  if (attackerWon) {
    // Attacker wins - piece moves to new square
    game.board[battleToRow][battleToCol] = game.board[battleFromRow][battleFromCol];
    game.board[battleFromRow][battleFromCol] = null;
  } else {
    // Defender wins - attacker is removed, defender stays
    game.board[battleFromRow][battleFromCol] = null;
  }

  game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';

  // Send battle result to opponent
  if (isConnected) {
    networkManager.send('battleEnded', {
      attackerWon: attackerWon,
      fromRow: battleFromRow,
      fromCol: battleFromCol,
      toRow: battleToRow,
      toCol: battleToCol,
      board: game.board,
      currentTurn: game.currentTurn
    }, 'game-state');
  }
}

// Animation loop
let lastTime = Date.now();
let lastNetworkUpdate = Date.now();

function animate() {
  requestAnimationFrame(animate);
  
  const currentTime = Date.now();
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  
  updateMovement();
  
  // Send position updates during battle (every 50ms)
  if (battleArena.isActive() && currentTime - lastNetworkUpdate > 50 && isConnected) {
    const playerState = battleArena.getPlayerState();
    networkManager.send('battleUpdate', {
      position: playerState.position,
      rotation: playerState.rotation,
      shot: null,
      health: playerState.health
    }, 'battle-updates'); // Use unreliable channel
    lastNetworkUpdate = currentTime;
  }
  
  // Update battle if active
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

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start
updateBoard();
animate();