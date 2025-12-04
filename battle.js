import * as THREE from 'three';

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
    
    // Create arena
    this.createArena();
    
    // Position players
    if (isAttacker) {
      this.camera.position.set(-8, 1.7, 0);
      this.camera.rotation.set(0, Math.PI / 2, 0);
      this.createOpponent(8, 1.7, 0);
    } else {
      this.camera.position.set(8, 1.7, 0);
      this.camera.rotation.set(0, -Math.PI / 2, 0);
      this.createOpponent(-8, 1.7, 0);
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
    
    // Add some cover objects
    this.addCover();
    
    this.scene.add(this.arenaGroup);
  }

  addCover() {
    const coverMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    
    // Add some boxes for cover
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
    // Simple opponent representation
    const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
    const material = new THREE.MeshStandardMaterial({ 
      color: this.opponentPiece.color === 'white' ? 0xffffff : 0x333333
    });
    this.opponent = new THREE.Mesh(geometry, material);
    this.opponent.position.set(x, y, z);
    this.opponent.castShadow = true;
    this.arenaGroup.add(this.opponent);
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
    
    // Return shot data for networking
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
      
      // Check collision with opponent - just remove bullet, don't calculate damage
      // Damage will be calculated by the opponent when they detect our bullet hitting them
      if (this.opponent && bullet.position.distanceTo(this.opponent.position) < 0.5) {
        this.arenaGroup.remove(bullet);
        this.bullets.splice(i, 1);
        continue;
      }
      
      // Check collision with walls
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
      
      // Check collision with player - WE calculate damage to ourselves
      if (bullet.position.distanceTo(this.camera.position) < 0.5) {
        this.player1Health -= 20;
        this.arenaGroup.remove(bullet);
        this.enemyBullets.splice(i, 1);
        
        // Check if player died - trigger battle end
        if (this.player1Health <= 0) {
          this.player1Health = 0; // Clamp to 0
          if (this.onBattleEnd) {
            this.onBattleEnd(false); // Player lost
          }
        }
        continue;
      }
      
      // Check collision with walls
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
    
    // Clean up
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