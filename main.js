import * as THREE from 'three';
import { ChessGame } from './chess.js';

// WebSocket connection
let ws;
let playerColor = null;
let isConnected = false;

function connectToServer() {
  ws = new WebSocket('ws://localhost:8080');
  
  ws.onopen = () => {
    console.log('Connected to server');
    isConnected = true;
    
    // Send initial board state
    ws.send(JSON.stringify({
      type: 'init',
      board: game.board,
      currentTurn: game.currentTurn
    }));
  };
  
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleServerMessage(message);
  };
  
  ws.onclose = () => {
    console.log('Disconnected from server');
    isConnected = false;
    setTimeout(connectToServer, 3000); // Reconnect after 3 seconds
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function handleServerMessage(message) {
  switch (message.type) {
    case 'gameState':
      if (message.state.board) {
        game.board = message.state.board;
        game.currentTurn = message.state.currentTurn;
        updateBoard();
      }
      updatePlayerStatus(message.state.players);
      break;
      
    case 'playerJoined':
      updatePlayerStatus(message.players);
      showNotification(`${message.color} player joined!`);
      break;
      
    case 'playerLeft':
      showNotification(`${message.color} player left`);
      break;
      
    case 'pieceSelected':
      // Show other player's selection (optional visual feedback)
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

document.getElementById('whiteBtn').addEventListener('click', () => {
  selectColor('white');
});

document.getElementById('blackBtn').addEventListener('click', () => {
  selectColor('black');
});

function selectColor(color) {
  if (isConnected) {
    ws.send(JSON.stringify({
      type: 'join',
      color: color
    }));
    playerColor = color;
    colorSelectionDiv.style.display = 'none';
    showNotification(`You are playing as ${color}`);
  } else {
    showNotification('Not connected to server. Please wait...');
  }
}

document.addEventListener('click', (e) => {
  if (!isPointerLocked || !playerColor) return;
  
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
    const moved = game.selectPiece(row, col);
    
    if (moved && isConnected) {
      // Send move to server
      ws.send(JSON.stringify({
        type: 'move',
        fromRow: prevSelected.row,
        fromCol: prevSelected.col,
        toRow: row,
        toCol: col,
        board: game.board,
        currentTurn: game.currentTurn
      }));
    }
    
    updateBoard();
  }
});

// Movement
function updateMovement() {
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

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  updateMovement();
  
  const turnIndicator = playerColor === game.currentTurn ? '🟢 YOUR TURN' : '🔴 OPPONENT\'S TURN';
  const colorDisplay = playerColor ? `You: ${playerColor.toUpperCase()}` : 'Selecting color...';
  
  ui.innerHTML = `
    <div>${colorDisplay}</div>
    <div>Current Turn: ${game.currentTurn}</div>
    <div style="margin-top: 5px; font-weight: bold;">${turnIndicator}</div>
    <div style="margin-top: 10px; font-size: 14px;">
      WASD: Move | Mouse: Look | Space/Shift: Up/Down<br>
      Click to lock cursor | Click pieces to play
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
connectToServer();
updateBoard();
animate();