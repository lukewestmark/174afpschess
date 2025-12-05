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
    this.playerGun = null;
    this.opponentGun = null;
    this.isMultiplayer = false;

    // Physics state for player movement
    this.playerVelocity = new THREE.Vector3(0, 0, 0);
    this.isGrounded = false;
    this.jumpPressed = false;
    this.groundLevel = 1.6; // Camera Y position when on ground

    // Physics constants (tuned for game feel)
    this.gravity = 15; // units/s² - faster than real gravity for responsive feel
    this.jumpVelocity = 6.5; // units/s - results in ~1.41 unit jump height
    this.maxSpeed = 6; // units/s - horizontal speed cap (prevents diagonal exploit)
    this.moveAcceleration = 40; // units/s² - high for responsive input
    this.friction = 25; // units/s² - deceleration when no input

    // Arena boundaries
    this.arenaSize = 30; // Expanded by 50% (20 → 30)
    this.arenaWalls = [];
    this.coverBoxes = []; // Separate array for cover boxes
    
    // Gun stats by piece type
    this.gunStats = {
      pawn: {
        damage: 15,
        fireRate: 0.5,
        bulletSpeed: 0.4,
        bulletSize: 0.08,
        color: 0xffff00,
        name: 'Pistol'
      },
      rook: {
        damage: 8,
        fireRate: 0.15,
        bulletSpeed: 0.6,
        bulletSize: 0.06,
        color: 0xff8800,
        name: 'Submachine Gun'
      },
      knight: {
        damage: 45,
        fireRate: 0.8,
        bulletSpeed: 0.30,
        bulletSize: 0.2,
        color: 0xff0000,
        name: 'Shotgun'
      },
      bishop: {
        damage: 25,
        fireRate: 0.6,
        bulletSpeed: 0.5,
        bulletSize: 0.1,
        color: 0xff00ff,
        name: 'Revolver'
      },
      queen: {
        damage: 20,
        fireRate: 0.2,
        bulletSpeed: 0.65,
        bulletSize: 0.07,
        color: 0x00ffff,
        name: 'Assault Rifle'
      },
      king: {
        damage: 100,
        fireRate: 1.2,
        bulletSpeed: 0.8,
        bulletSize: 0.05,
        color: 0x00ff00,
        name: 'Sniper Rifle'
      }
    };
    
    this.lastShotTime = 0;

    // GLTF loader - NO CACHE
    this.gltfLoader = new GLTFLoader();

    // TextureLoader initialization
    this.textureLoader = new THREE.TextureLoader();

    // Texture path configuration
    this.texturePaths = {
      grass: {
        diffuse: '/assets/textures/grass/grass_diffuse.jpg',
        normal: '/assets/textures/grass/grass_normal.png',
        roughness: '/assets/textures/grass/grass_roughness.png'
      },
      wall: {
        diffuse: '/assets/textures/wall/wall_diffuse.jpg',
        normal: '/assets/textures/wall/wall_normal.png',
        roughness: '/assets/textures/wall/wall_roughness.png'
      },
      metal: {
        diffuse: '/assets/textures/metal/metal_diffuse.jpg',
        normal: '/assets/textures/metal/metal_normal.png',
        roughness: '/assets/textures/metal/metal_roughness.png'
      }
    };

    // Texture cache
    this.loadedTextures = {};

    // Paths for your models
    this.pieceModelPaths = {
      pawn:  '/assets/Pawn/Pawn.glb',
      rook:  '/assets/Rook/Rook.glb',
      knight:'/assets/Knight/Knight.glb',
      bishop:'/assets/Bishop/Bishop.glb',
      queen: '/assets/Queen/Queen.glb',
      king:  '/assets/King/King.glb'
    };

    this.gunModelPaths = {
        pawn:  '/assets/Pawn/Pistol_1.glb',
        rook:  '/assets/Rook/SubmachineGun_1.glb',
        knight:'/assets/Knight/Shotgun_1.glb',
        bishop:'/assets/Bishop/Revolver_1.glb',
        queen: '/assets/Queen/AssaultRifle_2.glb',
        king:  '/assets/King/SniperRifle_1.glb'
    };

    // Reusable hitbox + temp sphere for collision
    this.opponentHitBox = new THREE.Box3();
    this.tempBulletSphere = new THREE.Sphere();

  }

  loadGunModel(type, callback) {
    const path = this.gunModelPaths[type.toLowerCase()];
    if (!path) {
      console.error('No gun model path for piece type:', type);
      if (callback) callback(null);
      return;
    }

    this.gltfLoader.load(
      path,
      (gltf) => {
        const gun = gltf.scene;
        
        gun.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Force a bright, visible material
            child.material = new THREE.MeshStandardMaterial({
              color: 0x444444, // Dark gray so it's visible
              metalness: 0.7,
              roughness: 0.3,
              side: THREE.DoubleSide // Render both sides
            });
          }
        });

        // Log the gun's bounding box to see its actual size
        const box = new THREE.Box3().setFromObject(gun);
        const size = new THREE.Vector3();
        box.getSize(size);
        console.log(`Gun ${type} original size:`, size);

        // Individual scaling for each gun type
        let scale;
        const pieceType = type.toLowerCase();
        
        switch(pieceType) {
          case 'pawn': // Pistol
            scale = 0.15;
            break;
          case 'rook': // Submachine Gun
            scale = 0.08;
            break;
          case 'knight': // Shotgun
            scale = 0.10;
            break;
          case 'bishop': // Revolver
            scale = 0.12;
            break;
          case 'queen': // Assault Rifle
            scale = 0.002;
            break;
          case 'king': // Sniper Rifle
            scale = 0.3;
            break;
          default:
            scale = 0.15;
        }
        
        gun.scale.set(scale, scale, scale);
        
        // Position for FPS view - will be updated to follow camera
        gun.position.set(0.25, -0.2, -0.6);
        
        // Rotate gun to point forward (adjust based on model's default orientation)
        gun.rotation.set(0, Math.PI / 2, 0);

        if (callback) callback(gun);
      },
      undefined,
      (err) => {
        console.error('Error loading gun model', path, err);
        if (callback) callback(null);
      }
    );
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

  startBattle(playerPiece, opponentPiece, isAttacker, onBattleEnd, isMultiplayer = false) {
    this.battleActive = true;
    this.playerPiece = playerPiece;
    this.opponentPiece = opponentPiece;
    this.isAttacker = isAttacker;
    this.isMultiplayer = isMultiplayer;
    this.player1Health = 100;
    this.player2Health = 100;
    this.bullets = [];
    this.enemyBullets = [];
    this.onBattleEnd = onBattleEnd;
    this.lastValidPosition = null; // Track last valid position
    this.lastShotTime = 0;

    // Reset physics state
    this.playerVelocity.set(0, 0, 0);
    this.isGrounded = true; // Start on ground
    this.jumpPressed = false;

    this.createArena();
    
    // Load player's gun - position as centered barrel view
    this.loadGunModel(playerPiece.type, (gun) => {
      if (gun) {
        this.playerGun = gun;
        
        // Add gun to arena group
        this.arenaGroup.add(gun);
        
        // Position gun very close to camera (barrel-only view)
        const gunWorldPos = this.camera.position.clone();
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this.camera.quaternion);
        
        // Very close to camera so only barrel is visible
        gunWorldPos.add(forward.multiplyScalar(0.3)); // Very close
        gunWorldPos.y -= 0.25; // Slightly down
        
        gun.position.copy(gunWorldPos);
        
        // Copy camera rotation and add offset to point forward
        gun.rotation.copy(this.camera.rotation);
        gun.rotation.y += Math.PI / 2; // Add 90 degrees to point forward
        
        console.log('Player gun loaded at centered position');
        console.log('Gun world position:', gun.position);
      } else {
        console.error('Failed to load player gun');
      }
    });
    
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
    
    // Store initial position
    this.lastValidPosition = this.camera.position.clone();
    
    return {
      playerHealth: this.player1Health,
      opponentHealth: this.player2Health,
      gunStats: this.gunStats[playerPiece.type.toLowerCase()]
    };
  }

  loadTexture(path, onLoad, onError) {
    if (this.loadedTextures[path]) {
      if (onLoad) onLoad(this.loadedTextures[path]);
      return this.loadedTextures[path];
    }

    const texture = this.textureLoader.load(
      path,
      (tex) => {
        this.loadedTextures[path] = tex;
        console.log('Texture loaded:', path);
        if (onLoad) onLoad(tex);
      },
      undefined,
      (error) => {
        console.error('Error loading texture:', path, error);
        if (onError) onError(error);
      }
    );

    return texture;
  }

  loadMaterialTextures(materialType, callback) {
    const paths = this.texturePaths[materialType];
    const textures = {};
    let loadedCount = 0;
    const totalTextures = Object.keys(paths).length;

    Object.keys(paths).forEach(mapType => {
      this.loadTexture(
        paths[mapType],
        (texture) => {
          textures[mapType] = texture;
          loadedCount++;
          if (loadedCount === totalTextures && callback) {
            callback(textures);
          }
        },
        (error) => {
          console.warn(`Failed to load ${mapType} for ${materialType}`);
          loadedCount++;
          if (loadedCount === totalTextures && callback) {
            callback(textures);
          }
        }
      );
    });
  }

  createArena() {
    // Floor - Load textures first, create with placeholder material
    const floorGeometry = new THREE.PlaneGeometry(this.arenaSize, this.arenaSize);

    // Create placeholder material (will be replaced when textures load)
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.8
    });

    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Load grass textures asynchronously
    this.loadMaterialTextures('grass', (textures) => {
      // Configure texture wrapping and repeat for tiling
      Object.values(textures).forEach(texture => {
        if (texture) {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          // Repeat 4x4 times across the 20x20 unit floor (5 units per repeat)
          texture.repeat.set(4, 4);
        }
      });

      // Update material with loaded textures
      floor.material.map = textures.diffuse || null;
      floor.material.normalMap = textures.normal || null;
      floor.material.roughnessMap = textures.roughness || null;

      // Normal map configuration
      if (textures.normal) {
        floor.material.normalScale = new THREE.Vector2(0.5, 0.5); // Adjust strength
      }

      // Remove solid color tint when texture is applied
      if (textures.diffuse) {
        floor.material.color.setHex(0xffffff);
      }

      // Important: Tell Three.js to update the material
      floor.material.needsUpdate = true;

      console.log('Grass floor textures applied');
    });
    
    // Grid lines
    const gridHelper = new THREE.GridHelper(this.arenaSize, 20, 0x666666, 0x333333);
    gridHelper.position.y = 0.01;
    this.arenaGroup.add(gridHelper);
    
    // Walls
    const wallHeight = 7.5; // Increased by 50% (5 → 7.5)
    const wallThickness = 0.5;
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.3
    });

    // North wall
    const northWall = new THREE.Mesh(
      new THREE.BoxGeometry(this.arenaSize, wallHeight, wallThickness),
      wallMaterial.clone()
    );
    northWall.position.set(0, wallHeight / 2, -this.arenaSize / 2);
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    this.arenaGroup.add(northWall);
    this.arenaWalls.push(northWall);

    // South wall
    const southWall = new THREE.Mesh(
      new THREE.BoxGeometry(this.arenaSize, wallHeight, wallThickness),
      wallMaterial.clone()
    );
    southWall.position.set(0, wallHeight / 2, this.arenaSize / 2);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    this.arenaGroup.add(southWall);
    this.arenaWalls.push(southWall);

    // East wall
    const eastWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, this.arenaSize),
      wallMaterial.clone()
    );
    eastWall.position.set(this.arenaSize / 2, wallHeight / 2, 0);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    this.arenaGroup.add(eastWall);
    this.arenaWalls.push(eastWall);

    // West wall
    const westWall = new THREE.Mesh(
      new THREE.BoxGeometry(wallThickness, wallHeight, this.arenaSize),
      wallMaterial.clone()
    );
    westWall.position.set(-this.arenaSize / 2, wallHeight / 2, 0);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    this.arenaGroup.add(westWall);
    this.arenaWalls.push(westWall);

    // Load wall textures and apply to all walls
    this.loadMaterialTextures('wall', (textures) => {
      const walls = [northWall, southWall, eastWall, westWall];

      walls.forEach(wall => {
        // Configure texture wrapping and repeat
        Object.values(textures).forEach(texture => {
          if (texture) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
          }
        });

        // Different repeat for horizontal vs vertical walls
        const isHorizontalWall = wall === northWall || wall === southWall;
        if (isHorizontalWall) {
          // North/South walls: 20 units wide x 5 units tall
          Object.values(textures).forEach(texture => {
            if (texture) texture.repeat.set(10, 2.5); // 2 units per repeat
          });
        } else {
          // East/West walls: 20 units deep x 5 units tall
          Object.values(textures).forEach(texture => {
            if (texture) texture.repeat.set(10, 2.5);
          });
        }

        // Update material
        wall.material.map = textures.diffuse || null;
        wall.material.normalMap = textures.normal || null;
        wall.material.roughnessMap = textures.roughness || null;

        // Normal map strength for gritty industrial look
        if (textures.normal) {
          wall.material.normalScale = new THREE.Vector2(1.0, 1.0); // Full strength
        }

        // REMOVE transparency - make walls fully opaque
        wall.material.transparent = false;
        wall.material.opacity = 1.0;

        // Set to grey if diffuse texture loaded
        if (textures.diffuse) {
          wall.material.color.setHex(0xffffff);
        } else {
          wall.material.color.setHex(0x888888); // Fallback grey
        }

        wall.material.needsUpdate = true;
      });

      console.log('Wall textures applied to all 4 walls');
    });
    
    this.addCover();
    
    this.scene.add(this.arenaGroup);
  }

  addCover() {
    const coverMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });

    const positions = [
      [-6, 1.25, -6],  // Southwest (Y = 1.25 for 2.5 height box)
      [6, 1.25, 6],    // Northeast
      [-6, 1.25, 6],   // Northwest
      [6, 1.25, -6],   // Southeast
      [0, 0.5, 0]      // CENTER (Y = 0.5 for 1.0 height box, unchanged)
    ];

    const boxes = [];

    positions.forEach(pos => {
      // Determine if this is the center box
      const isCenter = (pos[0] === 0 && pos[2] === 0);

      // Center box stays small, corner boxes become tall and wide
      const width = isCenter ? 1.5 : 3.0;   // Double wide for corners
      const height = isCenter ? 1.0 : 2.5;  // Taller than player (1.6) for corners
      const depth = isCenter ? 1.5 : 3.0;   // Double depth for corners

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        coverMaterial.clone()
      );
      box.position.set(pos[0], pos[1], pos[2]);
      box.castShadow = true;
      box.receiveShadow = true;
      this.arenaGroup.add(box);
      this.arenaWalls.push(box); // For bullet collision
      this.coverBoxes.push(box);  // For player collision
      boxes.push(box);
    });

    // Load metal textures for industrial look
    this.loadMaterialTextures('metal', (textures) => {
      boxes.forEach(box => {
        // Configure texture wrapping
        Object.values(textures).forEach(texture => {
          if (texture) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 1); // Single repeat for 1.5x1x1.5 boxes
          }
        });

        // Update material
        box.material.map = textures.diffuse || null;
        box.material.normalMap = textures.normal || null;
        box.material.roughnessMap = textures.roughness || null;

        if (textures.normal) {
          box.material.normalScale = new THREE.Vector2(0.8, 0.8);
        }

        // Set metallic properties for industrial look
        box.material.metalness = 0.3;
        box.material.roughness = 0.7;

        if (textures.diffuse) {
          box.material.color.setHex(0xffffff);
        } else {
          box.material.color.setHex(0x666666); // Darker grey fallback
        }

        box.material.needsUpdate = true;
      });

      console.log('Metal textures applied to cover boxes');
    });

    console.log('Created', this.coverBoxes.length, 'cover boxes');
  }

  createOpponent(x, y, z) {
    const { type, color } = this.opponentPiece;

    const root = this.createBattlePiece(type, color, (readyRoot) => {
      readyRoot.position.set(x, y, z);
      readyRoot.castShadow = true;
      
      // Load opponent's gun and attach it
      this.loadGunModel(type, (gun) => {
        if (gun) {
          this.opponentGun = gun;
          // Position gun for third-person view on opponent
          gun.position.set(0.0, -0.4, -0.3); // More right, lower
          gun.rotation.set(0, Math.PI / 2, 0); // Point toward player
          const gunScale = type.toLowerCase() === 'queen' ? 0.006 : 0.7;
          gun.scale.set(gunScale, gunScale, gunScale);
          readyRoot.add(gun);
          
          console.log('Opponent gun loaded and attached');
        }
      });
      
      this.arenaGroup.add(readyRoot);
    });

    this.opponent = root;
  }

  shoot() {
    if (!this.battleActive || !this.playerPiece) return null;
    
    const currentTime = Date.now() / 1000;
    const stats = this.gunStats[this.playerPiece.type.toLowerCase()];
    
    // Check fire rate cooldown
    if (currentTime - this.lastShotTime < stats.fireRate) {
      return null;
    }
    
    this.lastShotTime = currentTime;
    
    // Create bullet with gun-specific properties
    const bulletGeometry = new THREE.SphereGeometry(stats.bulletSize, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ 
      color: stats.color,
      emissive: stats.color
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    // Start bullet from camera center (where cursor is)
    bullet.position.copy(this.camera.position);
    
    // Shoot straight at cursor direction
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    
    // Bullet velocity
    bullet.userData.velocity = direction.multiplyScalar(stats.bulletSpeed * 6);
    bullet.userData.damage = stats.damage;
    bullet.userData.radius = stats.bulletSize;
    
    this.arenaGroup.add(bullet);
    this.bullets.push(bullet);
    
    // Add muzzle flash effect
    this.createMuzzleFlash();
    
    return {
      position: bullet.position.clone(),
      velocity: bullet.userData.velocity.clone(),
      damage: stats.damage
    };
  }

  createMuzzleFlash() {
    if (!this.playerGun) return;
    
    const flash = new THREE.PointLight(0xffaa00, 2, 5);
    const flashPos = new THREE.Vector3(0, 0, -0.8);
    flash.position.copy(flashPos);
    
    this.playerGun.add(flash);
    
    setTimeout(() => {
      this.playerGun.remove(flash);
    }, 50);
  }

  updateBattle(deltaTime) {
    if (!this.battleActive) return;
    
    // Update gun position to follow camera (centered barrel view)
    if (this.playerGun) {
      const gunWorldPos = this.camera.position.clone();
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(this.camera.quaternion);
      
      // Very close to camera so only barrel is visible
      gunWorldPos.add(forward.multiplyScalar(0.3));
      gunWorldPos.y -= 0.25;
      
      this.playerGun.position.copy(gunWorldPos);
      this.playerGun.rotation.copy(this.camera.rotation);
      this.playerGun.rotation.y += Math.PI / 2; // Add 90 degrees to point forward
    }
    
    // Update player bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      bullet.position.add(bullet.userData.velocity);
      
      // Check hit on opponent with hitbox
      // In multiplayer mode, skip local damage - opponent's client is authoritative for their health
      if (this.opponent && !this.isMultiplayer) {
        // Update opponent's AABB in world space
        this.opponentHitBox.setFromObject(this.opponent);

        // Expand hitbox for more forgiving hit detection
        this.opponentHitBox.expandByScalar(1.5);

        // Build a sphere for this bullet (center + radius)
        const bulletRadius =
          bullet.userData.radius ??
          (bullet.geometry?.parameters?.radius ?? 0.05);

        this.tempBulletSphere.center.copy(bullet.position);
        this.tempBulletSphere.radius = bulletRadius;

        if (this.opponentHitBox.intersectsSphere(this.tempBulletSphere)) {
          this.player2Health -= bullet.userData.damage || 20;
          this.arenaGroup.remove(bullet);
          this.bullets.splice(i, 1);

          if (this.player2Health <= 0) {
            this.player2Health = 0;
            if (this.onBattleEnd) {
              this.onBattleEnd(true);
            }
          }
          continue;
        }
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
      
      // Check hit on player with hitbox
      {
        const bulletRadius =
          bullet.userData.radius ??
          (bullet.geometry?.parameters?.radius ?? 0.05);

        const playerBaseRadius = 0.75; // your "body" radius around camera
        if (bullet.position.distanceTo(this.camera.position) < playerBaseRadius + bulletRadius) {
          const damage = bullet.userData.damage || 20;
          this.player1Health -= damage;
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

  updateBattlePhysics(keys, deltaTime, camera) {
    // 1. Calculate input direction (world space, horizontal only)
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

    camera.getWorldDirection(forward);
    forward.y = 0; // Project to horizontal plane
    forward.normalize();

    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    const inputDir = new THREE.Vector3(0, 0, 0);
    if (keys['KeyW']) inputDir.add(forward);
    if (keys['KeyS']) inputDir.sub(forward);
    if (keys['KeyA']) inputDir.sub(right);
    if (keys['KeyD']) inputDir.add(right);

    // 2. Apply horizontal acceleration or friction
    if (inputDir.lengthSq() > 0) {
      // Player pressing movement keys - apply acceleration
      inputDir.normalize(); // Ensure diagonal input doesn't accelerate faster
      this.playerVelocity.x += inputDir.x * this.moveAcceleration * deltaTime;
      this.playerVelocity.z += inputDir.z * this.moveAcceleration * deltaTime;
    } else {
      // No input - apply friction to slow down
      const horizontalSpeed = Math.sqrt(
        this.playerVelocity.x * this.playerVelocity.x +
        this.playerVelocity.z * this.playerVelocity.z
      );

      if (horizontalSpeed > 0) {
        const frictionMag = Math.min(this.friction * deltaTime, horizontalSpeed);
        const frictionDir = new THREE.Vector3(
          this.playerVelocity.x / horizontalSpeed,
          0,
          this.playerVelocity.z / horizontalSpeed
        );
        this.playerVelocity.x -= frictionDir.x * frictionMag;
        this.playerVelocity.z -= frictionDir.z * frictionMag;
      }
    }

    // 3. Cap horizontal speed (prevents diagonal movement exploit)
    const horizontalSpeed = Math.sqrt(
      this.playerVelocity.x * this.playerVelocity.x +
      this.playerVelocity.z * this.playerVelocity.z
    );

    if (horizontalSpeed > this.maxSpeed) {
      const scale = this.maxSpeed / horizontalSpeed;
      this.playerVelocity.x *= scale;
      this.playerVelocity.z *= scale;
    }

    // 4. Handle jumping
    if (keys['Space'] && !this.jumpPressed && this.isGrounded) {
      this.playerVelocity.y = this.jumpVelocity;
      this.isGrounded = false;
      this.jumpPressed = true;
    }

    // Reset jump flag when space released (enables next jump)
    if (!keys['Space']) {
      this.jumpPressed = false;
    }

    // 5. Apply gravity (always, even when grounded)
    this.playerVelocity.y -= this.gravity * deltaTime;

    // 6. Calculate new position from velocity
    const newPosition = camera.position.clone();
    newPosition.x += this.playerVelocity.x * deltaTime;
    newPosition.y += this.playerVelocity.y * deltaTime;
    newPosition.z += this.playerVelocity.z * deltaTime;

    // 7. Ground collision detection
    if (newPosition.y <= this.groundLevel) {
      newPosition.y = this.groundLevel;
      this.playerVelocity.y = 0; // Stop falling
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // 8. Ceiling collision detection
    if (newPosition.y >= 6) { // Increased to match taller walls
      newPosition.y = 6;
      if (this.playerVelocity.y > 0) {
        this.playerVelocity.y = 0; // Stop upward movement
      }
    }

    // 9. Apply arena constraints (walls, boxes, boundaries)
    this.constrainPlayerMovement(newPosition);

    // 10. Update camera position
    camera.position.copy(newPosition);

    // Note: Horizontal velocity is NOT zeroed on collision
    // This allows "wall sliding" for smooth movement
  }

  endBattle(playerWon) {
    this.battleActive = false;
    
    // Remove player gun from arena
    if (this.playerGun && this.arenaGroup) {
      this.arenaGroup.remove(this.playerGun);
      this.playerGun = null;
    }
    
    this.scene.remove(this.arenaGroup);
    this.arenaGroup.clear();
    this.arenaWalls = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.opponent = null;
    this.opponentGun = null;
    
    if (this.onBattleEnd) {
      this.onBattleEnd(playerWon);
    }
  }

  constrainPlayerMovement(position) {
    if (!this.battleActive) return position;
    
    const halfSize = this.arenaSize / 2 - 0.5;
    const playerRadius = 0.5;
    
    // Clamp to arena boundaries
    position.x = Math.max(-halfSize, Math.min(halfSize, position.x));
    position.z = Math.max(-halfSize, Math.min(halfSize, position.z));
    position.y = Math.max(0.5, Math.min(6, position.y)); // Increased to 6 for taller walls
    
    // Check collision with cover boxes (only X and Z, ignore Y)
    for (const box of this.coverBoxes) {
      const boxBounds = new THREE.Box3().setFromObject(box);
      
      // Check if player X,Z position overlaps with box X,Z bounds (with radius)
      if (position.x + playerRadius > boxBounds.min.x && position.x - playerRadius < boxBounds.max.x &&
          position.z + playerRadius > boxBounds.min.z && position.z - playerRadius < boxBounds.max.z) {
        
        console.log('COLLISION DETECTED!', {
          playerPos: position,
          boxMin: boxBounds.min,
          boxMax: boxBounds.max
        });
        
        // Collision! Revert to last valid position
        if (this.lastValidPosition) {
          position.copy(this.lastValidPosition);
        }
        return position;
      }
    }
    
    // No collision - store this as last valid position
    if (!this.lastValidPosition) {
      this.lastValidPosition = new THREE.Vector3();
    }
    this.lastValidPosition.copy(position);
    
    return position;
  }

  isActive() {
    return this.battleActive;
  }

  cleanup() {
    if (this.playerGun && this.arenaGroup) {
      this.arenaGroup.remove(this.playerGun);
      this.playerGun = null;
    }
    
    if (this.arenaGroup) {
      this.scene.remove(this.arenaGroup);
      this.arenaGroup.clear();
    }

    // Reset physics state
    this.playerVelocity.set(0, 0, 0);
    this.isGrounded = false;
    this.jumpPressed = false;
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
    if (!shotData || !this.battleActive || !this.opponentPiece) return;
    
    const stats = this.gunStats[this.opponentPiece.type.toLowerCase()];
    
    const bulletGeometry = new THREE.SphereGeometry(stats.bulletSize, 8, 8);
    const bulletMaterial = new THREE.MeshBasicMaterial({ 
      color: stats.color,
      emissive: stats.color
    });
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
    
    bullet.position.set(shotData.position.x, shotData.position.y, shotData.position.z);
    bullet.userData.velocity = new THREE.Vector3(
      shotData.velocity.x,
      shotData.velocity.y,
      shotData.velocity.z
    );
    bullet.userData.damage = shotData.damage || stats.damage;
    bullet.userData.radius = stats.bulletSize;
    
    this.arenaGroup.add(bullet);
    this.enemyBullets.push(bullet);
  }

  getGunStats(pieceType) {
    return this.gunStats[pieceType.toLowerCase()] || this.gunStats.pawn;
  }
}