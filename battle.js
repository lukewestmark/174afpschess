import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class BattleArena {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.battleActive = false;
    this.arenaGroup = new THREE.Group();
    this.player1Health = 100;
    this.player2Health = 100;
    this.bullets = [];
    this.enemyBullets = [];
    this.opponent = null;
    this.playerPiece = null;
    this.opponentPiece = null;
    this.onBattleEnd = null;
    this.isAttacker = false;
    
    // Arena boundaries
    this.arenaSize = 20;
    this.arenaWalls = [];

    // GLTF loader - NO CACHE
    this.gltfLoader = new GLTFLoader();

    // Paths for your models
    this.pieceModelPaths = {
      pawn:  '/assets/Pawn/Pawn.glb',
      rook:  '/assets/Rook/Rook.glb',
      knight:'/assets/Knight/Knight.glb',
      bishop:'/assets/Bishop/Bishop.glb',
      queen: '/assets/Queen/Queen.glb',
      king:  '/assets/King/King.glb'
    };
  }

  createBattlePiece(type, color, callback) {
    const root = new THREE.Group();
    const isWhite = color === 'white';
    const targetColor = isWhite ? 0xffffff : 0x333333;

    const path = this.pieceModelPaths[type.toLowerCase()];
    if (!path) {
      console.error('No model path for piece type in battle:', type);
      return root;
    }

    // Load fresh each time, NO CACHING
    this.gltfLoader.load(
      path,
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Create a completely new material for EACH mesh
            // This ensures no material sharing between pieces
            child.material = new THREE.MeshStandardMaterial({
              color: targetColor,
              metalness: 0.3,
              roughness: 0.7
            });
          }
        });

        // Make pieces bigger for the arena
        const scale = 48;
        model.scale.set(scale, scale, scale);

        // Move it down
        model.position.y = -1.5;

        root.add(model);
        
        if (callback) callback(root);
      },
      undefined,
      (err) => {
        console.error('Error loading battle model', path, err);
      }
    );

    return root;
  }

  startBattle(playerPiece, opponentPiece, isAttacker, onBattleEnd) {
    this.battleActive = true;
    this.playerPiece = playerPiece;
    this.opponentPiece = opponentPiece;
    this.isAttacker = isAttacker;
    this.player1Health = 100;
    this.player2Health = 100;
    this.bullets = [];
    this.enemyBullets = [];
    this.onBattleEnd = onBattleEnd;
    
    this.createArena();
    
    // Position players with raised camera height
    if (isAttacker) {
      this.camera.position.set(-8, 1.6, 0);
      this.camera.rotation.set(0, Math.PI / 2, 0);
      this.createOpponent(8, 0, 0);
    } else {
      this.camera.position.set(8, 1.6, 0);
      this.camera.rotation.set(0, -Math.PI / 2, 0);
      this.createOpponent(-8, 0, 0);
    }
    
    return {
      playerHealth: this.player1Health,
      opponentHealth: this.player2Health
    };
  }

  createArena() {
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(this.arenaSize, this.arenaSize);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x444444,
      roughness: 0.8
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);
    
    // Grid lines
    const gridHelper = new THREE.GridHelper(this.arenaSize, 20, 0x666666, 0x333333);
    gridHelper.position.y = 0.01;
    this.arenaGroup.add(gridHelper);
    
    // Walls
    const wallHeight = 5;
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x222222,
      transparent: true,
      opacity: 0.3
    });
    
    // North wall
    const northWall = new THREE.Mesh(
      new THREE.BoxGeometry(this.arenaSize, wallHeight, 0.5),
      wallMaterial
    );
    northWall.position.set(0, wallHeight / 2, -this.arenaSize / 2);
    this.arenaGroup.add(northWall);
    this.arenaWalls.push(northWall);
    
    // South wall
    const southWall = new THREE.Mesh(
      new THREE.BoxGeometry(this.arenaSize, wallHeight, 0.5),
      wallMaterial
    );
    southWall.position.set(0, wallHeight / 2, this.arenaSize / 2);
    this.arenaGroup.add(southWall);
    this.arenaWalls.push(southWall);
    
    // East wall
    const eastWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, wallHeight, this.arenaSize),
      wallMaterial
    );
    eastWall.position.set(this.arenaSize / 2, wallHeight / 2, 0);
    this.arenaGroup.add(eastWall);
    this.arenaWalls.push(eastWall);
    
    // West wall
    const westWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, wallHeight, this.arenaSize),
      wallMaterial
    );
    westWall.position.set(-this.arenaSize / 2, wallHeight / 2, 0);
    this.arenaGroup.add(westWall);
    this.arenaWalls.push(westWall);
    
    this.addCover();
    
    this.scene.add(this.arenaGroup);
  }

  addCover() {
    const coverMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    
    const positions = [
      [-4, 0.5, -4],
      [4, 0.5, 4],
      [-4, 0.5, 4],
      [4, 0.5, -4],
      [0, 0.5, 0]
    ];
    
    positions.forEach(pos => {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 1.5),
        coverMaterial
      );
      box.position.set(pos[0], pos[1], pos[2]);
      box.castShadow = true;
      box.receiveShadow = true;
      this.arenaGroup.add(box);
      this.arenaWalls.push(box);
    });
  }

  createOpponent(x, y, z) {
    const { type, color } = this.opponentPiece;

    const root = this.createBattlePiece(type, color, (readyRoot) => {
      readyRoot.position.set(x, y, z);
      readyRoot.castShadow = true;
      this.arenaGroup.add(readyRoot);
    });

    this.opponent = root;
  }

  shoot() {
    if (!this.battleActive) return null;
    
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xffff00,
      emissive: 0xffff00
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    bullet.position.copy(this.camera.position);
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    bullet.userData.velocity = direction.multiplyScalar(0.5);
    
    this.arenaGroup.add(bullet);
    this.bullets.push(bullet);
    
    return {
      position: bullet.position.clone(),
      velocity: bullet.userData.velocity.clone()
    };
  }

  updateBattle(deltaTime) {
    if (!this.battleActive) return;
    
    // Update player bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.position.add(bullet.userData.velocity);
      
      if (this.opponent && bullet.position.distanceTo(this.opponent.position) < 0.5) {
        this.arenaGroup.remove(bullet);
        this.bullets.splice(i, 1);
        continue;
      }
      
      let hitWall = false;
      for (const wall of this.arenaWalls) {
        const box = new THREE.Box3().setFromObject(wall);
        if (box.containsPoint(bullet.position)) {
          hitWall = true;
          break;
        }
      }
      
      if (hitWall || bullet.position.length() > 30) {
        this.arenaGroup.remove(bullet);
        this.bullets.splice(i, 1);
      }
    }
    
    // Update opponent bullets
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const bullet = this.enemyBullets[i];
      bullet.position.add(bullet.userData.velocity);
      
      if (bullet.position.distanceTo(this.camera.position) < 0.5) {
        this.player1Health -= 20;
        this.arenaGroup.remove(bullet);
        this.enemyBullets.splice(i, 1);
        
        if (this.player1Health <= 0) {
          this.player1Health = 0;
          if (this.onBattleEnd) {
            this.onBattleEnd(false);
          }
        }
        continue;
      }
      
      let hitWall = false;
      for (const wall of this.arenaWalls) {
        const box = new THREE.Box3().setFromObject(wall);
        if (box.containsPoint(bullet.position)) {
          hitWall = true;
          break;
        }
      }
      
      if (hitWall || bullet.position.length() > 30) {
        this.arenaGroup.remove(bullet);
        this.enemyBullets.splice(i, 1);
      }
    }
    
    return {
      playerHealth: this.player1Health,
      opponentHealth: this.player2Health
    };
  }

  endBattle(playerWon) {
    this.battleActive = false;
    
    this.scene.remove(this.arenaGroup);
    this.arenaGroup.clear();
    this.arenaWalls = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.opponent = null;
    
    if (this.onBattleEnd) {
      this.onBattleEnd(playerWon);
    }
  }

  constrainPlayerMovement(position) {
    if (!this.battleActive) return position;
    
    const halfSize = this.arenaSize / 2 - 0.5;
    position.x = Math.max(-halfSize, Math.min(halfSize, position.x));
    position.z = Math.max(-halfSize, Math.min(halfSize, position.z));
    position.y = Math.max(0.5, Math.min(4, position.y));
    
    return position;
  }

  isActive() {
    return this.battleActive;
  }

  cleanup() {
    if (this.arenaGroup) {
      this.scene.remove(this.arenaGroup);
      this.arenaGroup.clear();
    }
  }

  getPlayerState() {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      },
      rotation: {
        x: this.camera.rotation.x,
        y: this.camera.rotation.y,
        z: this.camera.rotation.z
      },
      health: this.player1Health
    };
  }

  updateOpponentPosition(position, rotation) {
    if (!this.opponent || !this.battleActive) return;
    
    if (position) {
      this.opponent.position.set(position.x, position.y, position.z);
    }
    
    if (rotation) {
      this.opponent.rotation.set(rotation.x, rotation.y, rotation.z);
    }
  }

  updateOpponentHealth(health) {
    if (!this.battleActive) return;
    this.player2Health = health;
  }

  handleOpponentShot(shotData) {
    if (!shotData || !this.battleActive) return;
    
    const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      emissive: 0xff0000
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    bullet.position.set(shotData.position.x, shotData.position.y, shotData.position.z);
    bullet.userData.velocity = new THREE.Vector3(
      shotData.velocity.x,
      shotData.velocity.y,
      shotData.velocity.z
    );
    
    this.arenaGroup.add(bullet);
    this.enemyBullets.push(bullet);
  }
}