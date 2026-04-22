class GameStateManager {
  constructor() {
    this.states = {
      START: 'START',
      MENU: 'MENU',
      SHOP: 'SHOP',
      PLAYING: 'PLAYING',
      GAMEOVER: 'GAMEOVER',
      LEVEL_UP: 'LEVEL_UP'
    };
    this.current = this.states.MENU;
  }

  set(state) {
    if (Object.values(this.states).includes(state)) {
      this.current = state;
    }
  }
}

class Projectile {
  constructor(x, y, velocity, options = {}) {
    this.x = x;
    this.y = y;
    this.velocity = velocity;
    this.health = options.health ?? 1;
    this.bounceCount = options.bounceCount ?? 0;
    this.radius = options.radius ?? 10;
    this.speed = Math.hypot(velocity.x, velocity.y);
    this.color = '#ff5f1a';
    this.isDestroyed = false;
  }

  update(deltaTime) {
    this.x += this.velocity.x * deltaTime;
    this.y += this.velocity.y * deltaTime;
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  distanceTo(point) {
    return Math.hypot(this.x - point.x, this.y - point.y);
  }

  destroy() {
    this.isDestroyed = true;
  }

  timeToImpact(core) {
    const direction = { x: core.x - this.x, y: core.y - this.y };
    const dist = Math.hypot(direction.x, direction.y);
    return dist / this.speed;
  }
}

class Player {
  constructor(center, orbitalRadius, options = {}) {
    this.center = center;
    this.orbitalRadius = orbitalRadius;
    this.angle = options.angle ?? 0;
    this.rotationDirection = 1;
    this.baseAngularSpeed = options.angularSpeed ?? 1.2;
    this.angularSpeed = this.baseAngularSpeed;
    this.boostMultiplier = options.boostMultiplier ?? 2.0;
    this.size = options.size ?? 12;
    this.color = '#47ff6d';
    this.trailDuration = options.trailDuration ?? 1.0;
    this.trail = [];
    this.isBoosting = false;
    this.isDestroyed = false;
  }

  get position() {
    return {
      x: this.center.x + Math.cos(this.angle) * this.orbitalRadius,
      y: this.center.y + Math.sin(this.angle) * this.orbitalRadius
    };
  }

  update(deltaTime, currentTime) {
    this.angle += this.rotationDirection * this.angularSpeed * deltaTime;
    const pos = this.position;
    this.trail.push({ x: pos.x, y: pos.y, time: currentTime });
    this.trail = this.trail.filter(entry => currentTime - entry.time <= this.trailDuration);
  }

  setBoosting(enabled) {
    this.isBoosting = enabled;
    this.angularSpeed = enabled ? this.baseAngularSpeed * this.boostMultiplier : this.baseAngularSpeed;
  }

  drawTrail(ctx) {
    if (this.trail.length < 2) {
      return;
    }

    ctx.save();
    ctx.lineWidth = Math.max(4, this.size * 1.4);
    ctx.lineCap = 'round';

    for (let i = 1; i < this.trail.length; i += 1) {
      const from = this.trail[i - 1];
      const to = this.trail[i];
      const alpha = i / this.trail.length;
      ctx.strokeStyle = `rgba(71, 255, 109, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  draw(ctx) {
    this.drawTrail(ctx);
    const pos = this.position;
    const activeSize = this.isBoosting ? this.size * 1.3 : this.size;
    ctx.save();
    if (this.isBoosting) {
      ctx.shadowColor = 'rgba(71,255,109,0.55)';
      ctx.shadowBlur = 18;
    }
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, activeSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  toggleDirection() {
    this.rotationDirection *= -1;
  }
}

class EntityManager {
  constructor() {
    this.players = [];
    this.projectiles = [];
  }

  addPlayer(player) {
    this.players.push(player);
  }

  addProjectile(projectile) {
    this.projectiles.push(projectile);
  }

  update(deltaTime, currentTime) {
    this.players.forEach(player => player.update(deltaTime, currentTime));
    this.projectiles.forEach(projectile => projectile.update(deltaTime));
    this.projectiles = this.projectiles.filter(projectile => !projectile.isDestroyed);
  }

  draw(ctx) {
    this.players.forEach(player => player.draw(ctx));
    this.projectiles.forEach(projectile => projectile.draw(ctx));
  }
}

class UIController {
  constructor(statusElement) {
    this.statusElement = statusElement;
    this.gold = 0;
    this.totalGold = parseInt(localStorage.getItem('orbit_defender_totalGold')) || 0;
    this.health = 5;
    this.updateText();
  }

  updateText() {
    const shieldStatus = window.gameInstance?.getShieldStatus?.() || "";
    const levelInfo = window.gameInstance ? ` | LVL: ${window.gameInstance.playerLevel} XP: ${window.gameInstance.playerXP}/${window.gameInstance.getXPRequired()}` : "";
    this.statusElement.textContent = `Gold: ${this.gold} (Total: ${this.totalGold}) | Health: ${this.health} ${shieldStatus}${levelInfo}`;
  }

  addGold(amount = 1) {
    this.gold += amount;
    this.updateText();
  }

  finalizeGold() {
    this.totalGold += this.gold;
    localStorage.setItem('orbit_defender_totalGold', this.totalGold);
    this.gold = 0;
  }

  takeDamage(amount = 1) {
    this.health = Math.max(0, this.health - amount);
    this.updateText();
  }
}

class Game {
  constructor() {
    window.gameInstance = this;
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.overlay = document.getElementById('overlay');
    this.startButton = document.getElementById('startButton');
    this.statusElement = document.getElementById('status');
    this.ui = new UIController(this.statusElement);
    this.state = new GameStateManager();
    this.entityManager = new EntityManager();
    this.lastTimestamp = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 2.1;
    this.core = { x: 0, y: 0, radius: 0 };
    this.inputDown = false;
    this.inputThreshold = 0.2;
    this.gameStartTime = 0;
    this.inputStartTime = 0;
    this.inputBoostActive = false;
    this.coreLastHitTime = -1000;
    this.CORE_DAMAGE_COOLDOWN = 1000;

    // Shield System
    this.shieldUnlocked = localStorage.getItem('orbit_defender_shieldUnlocked') === 'true';
    this.shieldActive = false;
    this.lastShieldUseTime = -20000;
    this.shieldDuration = 3000;
    this.shieldCooldown = 20000;
    this.abilitiesUnlocked = {
      trail: localStorage.getItem('ability_trail') === 'true',
      pulse: localStorage.getItem('ability_pulse') === 'true',
      shield: localStorage.getItem('ability_shield') === 'true'
    };


    this.maxSpawnArc = 100 * Math.PI / 180; // 100 degrees in radians
    this.baseAngle = Math.random() * 2 * Math.PI; // Random angle between 0 and 360 degrees
    this.spawnBatchSize = 3;
    this.minSpawnDelay = 80;
    this.maxSpawnDelay = 250;
    this.numSectors = 8;
    this.maxActiveSectors = 2;
    this.activeSectors = new Array(this.numSectors).fill(0);
    this.baseSpeed = 30;
    this.speedVariation = 0;
    this.playerLevel = 1;
    this.playerXP = 0;
    this.abilityLevels = {
      trail: 0,
      pulse: 0,
      shield: 0
    };

    this.getSector = (angle) => {
      const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return Math.floor((normalized / (Math.PI * 2)) * this.numSectors);
    };

    // Create Shield Button UI
    this.shieldButton = document.createElement('div');
    this.shieldButton.id = 'shieldButton';
    this.shieldButton.innerHTML = '<div class="shield-icon">🛡️</div>';
    document.body.appendChild(this.shieldButton);

    this.registerEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.registerServiceWorker();
    this.showMenu();
  }

  start() {
    this.gameStartTime = performance.now();
    this.setupScene();
    this.state.set(this.state.states.PLAYING);
    this.overlay.classList.add('hide');
    window.requestAnimationFrame(timestamp => this.gameLoop(timestamp));
  }

  setupScene() {
    const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    const shortSide = Math.min(this.canvas.width, this.canvas.height);
    const orbitalRadius = shortSide * 0.17;
    const coreRadius = Math.max(24, shortSide * 0.08);
    const playerSize = Math.max(10, shortSide * 0.03);

    this.core = { ...center, radius: coreRadius };
    this.entityManager.players = [];
    this.entityManager.projectiles = [];
    this.ui.gold = 0;
    this.ui.health = 5;
    this.ui.updateText();
    this.activeSectors.fill(0);
    this.coreLastHitTime = -1000;
    this.shieldActive = false;
    this.spawnTimer = 0;
    this.playerLevel = 1;
    this.playerXP = 0;
    this.abilityLevels = { trail: 0, pulse: 0, shield: 0 };

    const player = new Player(center, orbitalRadius, { 
      size: playerSize,
      trailDuration: this.abilitiesUnlocked.trail ? 0.3 : 0
    });
    this.entityManager.addPlayer(player);
  }

  registerEvents() {
    document.addEventListener('keydown', event => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.onInputDown();
      }
    });

    document.addEventListener('keyup', event => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.onInputUp(performance.now() / 1000);
      }
    });

    document.addEventListener('mousedown', event => {
      if (event.button === 0) {
        event.preventDefault();
        this.onInputDown();
      }
    });

    document.addEventListener('mouseup', event => {
      if (event.button === 0) {
        event.preventDefault();
        this.onInputUp(performance.now() / 1000);
      }
    });

    document.addEventListener('touchstart', event => {
      if (event.touches.length > 0) {
        event.preventDefault();
        this.onInputDown();
      }
    }, { passive: false });

    document.addEventListener('touchend', event => {
      event.preventDefault();
      this.onInputUp(performance.now() / 1000);
    }, { passive: false });

    document.addEventListener('touchcancel', event => {
      event.preventDefault();
      this.onInputUp(performance.now() / 1000);
    }, { passive: false });

    this.shieldButton.addEventListener('mousedown', e => {
      e.stopPropagation();
      this.activateShield();
    });
    this.shieldButton.addEventListener('touchstart', e => {
      e.stopPropagation();
      this.activateShield();
    }, { passive: false });

    this.startButton.addEventListener('click', () => this.start());
    this.startButton.addEventListener('touchend', event => {
      event.preventDefault();
      this.start();
    }, { passive: false });
  }

  onInputDown() {
    // Only process input for player movement if the game is actively playing.
    // Navigation between menu/shop/gameover states is handled by explicit buttons.
    if (this.state.current !== this.state.states.PLAYING) {
      return;
    }

    this.inputDown = true;
    this.inputStartTime = performance.now() / 1000;
    this.inputBoostActive = false;
  }

  onInputUp(currentTime) {
    if (!this.inputDown) {
      return;
    }

    const duration = currentTime - this.inputStartTime;
    const wasBoosting = this.inputBoostActive;
    this.inputDown = false;
    this.inputBoostActive = false;
    this.entityManager.players.forEach(player => player.setBoosting(false));

    if (this.state.current !== this.state.states.PLAYING) {
      return;
    }

    if (!wasBoosting && duration < this.inputThreshold) {
      this.entityManager.players.forEach(player => player.toggleDirection());
    }
  }

  activateShield() {
    if (!this.shieldUnlocked || this.shieldActive || this.state.current !== this.state.states.PLAYING) return;
    
    const now = performance.now();
    if (now - this.lastShieldUseTime >= this.shieldCooldown) {
      this.shieldActive = true;
      this.lastShieldUseTime = now;
      this.ui.updateText();
    }
  }

  getShieldStatus() {
    if (this.shieldActive) return " | [SHIELD ACTIVE]";
    return "";
  }

  getXPRequired() {
    return this.playerLevel * 5;
  }

  checkLevelUp() {
    if (this.state.current !== this.state.states.PLAYING) return;
    if (this.playerXP >= this.getXPRequired()) {
      this.playerXP -= this.getXPRequired();
      this.playerLevel += 1;
      this.ui.updateText();
      this.state.set(this.state.states.LEVEL_UP);
      this.showLevelUpMenu();
    }
  }

  showLevelUpMenu() {
    this.overlay.classList.remove('hide');
    const available = Object.entries(this.abilitiesUnlocked)
      .filter(([key, unlocked]) => unlocked && this.abilityLevels[key] < 5)
      .map(([key]) => key);

    this.overlay.innerHTML = `<h1>Level Up!</h1><p>${available.length > 0 ? 'Choose an upgrade:' : 'Maxed out! Bonus reward:'}</p><div class="menu-buttons"></div>`;
    const container = this.overlay.querySelector('.menu-buttons');

    if (available.length > 0) {
      available.forEach(key => {
        const btn = document.createElement('button');
        const name = key === 'trail' ? 'Destroying Trail' : key === 'pulse' ? 'Pulsefire' : 'Shield';
        btn.textContent = `${name} (Lv.${this.abilityLevels[key] + 1})`;
        btn.onclick = () => {
          this.abilityLevels[key]++;
          if (key === 'trail') {
            const duration = 0.3 + this.abilityLevels.trail * 0.3;
            this.entityManager.players.forEach(p => p.trailDuration = duration);
          }
          this.resumeGame();
        };
        container.appendChild(btn);
      });
    } else {
      const isGold = Math.random() < 0.9;
      const btn = document.createElement('button');
      btn.textContent = isGold ? "+10 Gold" : "+1 Health";
      btn.onclick = () => {
        if (isGold) {
          this.ui.addGold(10);
        } else {
          this.ui.health++;
          this.ui.updateText();
        }
        this.resumeGame();
      };
      container.appendChild(btn);
    }
  }

  resumeGame() {
    this.state.set(this.state.states.PLAYING);
    this.overlay.classList.add('hide');
    // Check if another level was banked during the pause
    this.checkLevelUp();
  }

  spawnProjectile(batchAngle, delay = 0) {
    const angle = batchAngle + (Math.random() - 0.5) * this.maxSpawnArc;
    const sector = this.getSector(angle);

    let activeSectorCount = 0;
    for (let i = 0; i < this.numSectors; i++) {
      if (this.activeSectors[i] > 0) activeSectorCount++;
    }

    if (this.activeSectors[sector] === 0 && activeSectorCount >= this.maxActiveSectors) {
      return; // Skip this spawn to respect max concurrent threat vectors
    }

    const distance = Math.max(this.canvas.width, this.canvas.height) * 0.8;
    const x = this.core.x + Math.cos(angle) * distance;
    const y = this.core.y + Math.sin(angle) * distance;
    const target = { x: this.core.x, y: this.core.y };
    const direction = { x: target.x - x, y: target.y - y };
    const dist = Math.hypot(direction.x, direction.y);
    let speed = this.baseSpeed;
    const velocity = { x: (direction.x / dist) * speed, y: (direction.y / dist) * speed };

    const projectile = new Projectile(x, y, velocity, {
      health: 1,
      bounceCount: 0,
      radius: Math.max(8, Math.min(this.canvas.width, this.canvas.height) * 0.018),
      color: '#ff8142'
    });

    const timeToImpact = projectile.timeToImpact(this.core);
    const oppositeSector = (sector + this.numSectors / 2) % this.numSectors;

    // Fairness validation: Avoid simultaneous opposite-direction threats
    for (let i = 0; i < this.entityManager.projectiles.length; i++) {
      const otherProjectile = this.entityManager.projectiles[i];
      if (!otherProjectile || otherProjectile.isDestroyed) continue;

      const otherSector = this.getSector(Math.atan2(otherProjectile.y - this.core.y, otherProjectile.x - this.core.x));
      if (otherSector === oppositeSector) {
        const timeDifference = Math.abs(timeToImpact - otherProjectile.timeToImpact(this.core));
        if (timeDifference < 0.5) {
          return;
        }
      }
    }

    this.activeSectors[sector]++;
    setTimeout(() => {
      if (this.state.current !== this.state.states.PLAYING) return;
      this.entityManager.addProjectile(projectile);
      // Attach sector to projectile so we can decrement correctly on destruction
      projectile.sector = sector;
    }, delay);
  }

  processCollisions(timestamp) {
    const coreCenter = { x: this.core.x, y: this.core.y };

    this.entityManager.projectiles.forEach(projectile => {
      if (projectile.isDestroyed) {
        return;
      }

      if (projectile.distanceTo(coreCenter) <= this.core.radius + projectile.radius) {
        if (projectile.sector !== undefined) this.activeSectors[projectile.sector]--;
        projectile.destroy();
        if (timestamp - this.coreLastHitTime >= this.CORE_DAMAGE_COOLDOWN) {
          this.ui.takeDamage(1);
          this.coreLastHitTime = timestamp;
        }
        return;
      }

      // Shield Collision
      if (this.shieldActive) {
        const shieldRadius = (this.entityManager.players[0]?.orbitalRadius ?? 0) + 10;
        if (projectile.distanceTo(coreCenter) <= shieldRadius) {
          if (projectile.sector !== undefined) this.activeSectors[projectile.sector]--;
          projectile.destroy();
          return;
        }
      }

      for (const player of this.entityManager.players) {
        if (player.isDestroyed || projectile.isDestroyed) continue;
        const playerPos = player.position;
        const dist = Math.hypot(projectile.x - playerPos.x, projectile.y - playerPos.y);

        if (dist <= player.size + projectile.radius) {
          if (projectile.sector !== undefined) this.activeSectors[projectile.sector]--;
          projectile.destroy();
          this.ui.addGold(1);
          this.playerXP += 1;
          this.checkLevelUp();
          continue;
        }

        for (const trailPoint of player.trail) {
          if (projectile.isDestroyed) break;
          const trailDist = Math.hypot(projectile.x - trailPoint.x, projectile.y - trailPoint.y);
          if (trailDist <= player.size + projectile.radius) {
            if (projectile.sector !== undefined) this.activeSectors[projectile.sector]--;
            projectile.destroy();
            this.ui.addGold(1);
            this.playerXP += 1;
            this.checkLevelUp();
            break;
          }
        }
      }
    });
  }

  gameLoop(timestamp) {
    const deltaTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.033);
    this.lastTimestamp = timestamp;

    if (this.state.current === this.state.states.PLAYING) {
      const currentTime = timestamp / 1000;
      const elapsed = (timestamp - this.gameStartTime) / 1000;

      // Shield Timer
      if (this.shieldActive && timestamp - this.lastShieldUseTime >= this.shieldDuration) {
        this.shieldActive = false;
        this.ui.updateText();
      }

      // Update Shield UI
      if (this.shieldButton) {
        const isVisible = this.shieldUnlocked && this.state.current === this.state.states.PLAYING;
        this.shieldButton.style.display = isVisible ? 'flex' : 'none';
        if (isVisible) {
          const cdProgress = Math.min(1, (timestamp - this.lastShieldUseTime) / this.shieldCooldown);
          this.shieldButton.style.setProperty('--progress-val', cdProgress * 100);
          this.shieldButton.style.opacity = this.shieldActive ? '0.5' : '1';
          this.shieldButton.style.setProperty('--dot-display', cdProgress >= 1 ? 'none' : 'block');
        }
      }

      // Difficulty Scaling
      const targetTime = Math.max(4, 5 - elapsed * 0.02);
      this.baseSpeed = ((Math.max(this.canvas.width, this.canvas.height) * 0.8) / targetTime) * 0.5;
      this.maxSpawnArc = Math.min(Math.PI * 1.2, (100 + elapsed * 0.5) * Math.PI / 180);
      if (elapsed < 15) this.maxSpawnArc = 120 * Math.PI / 180;
      this.spawnInterval = Math.max(0.9, 2.2 - elapsed * 0.012);

      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        const batchAngle = Math.random() * Math.PI * 2;
        for (let i = 0; i < this.spawnBatchSize; i++) {
          const delay = this.minSpawnDelay + Math.random() * (this.maxSpawnDelay - this.minSpawnDelay);
          this.spawnProjectile(batchAngle, delay);
        }
      }

      if (this.inputDown && !this.inputBoostActive && currentTime - this.inputStartTime >= this.inputThreshold) {
        this.inputBoostActive = true;
        this.entityManager.players.forEach(player => player.setBoosting(true));
      }

      this.entityManager.update(deltaTime, currentTime);
      this.processCollisions(timestamp);
      if (this.ui.health <= 0) {
        this.ui.finalizeGold();
        this.state.set(this.state.states.GAMEOVER);
      }
    }

    this.render();

    if (this.state.current !== this.state.states.GAMEOVER) {
      window.requestAnimationFrame(timestamp => this.gameLoop(timestamp));
    } else {
      this.showGameOver();
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = '#050607';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.core.x, this.core.y, this.entityManager.players[0]?.orbitalRadius ?? 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (this.shieldActive) {
      ctx.save();
      ctx.strokeStyle = 'rgba(71, 255, 230, 0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.core.x, this.core.y, (this.entityManager.players[0]?.orbitalRadius ?? 0) + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    const isInvulnerable = (this.lastTimestamp - this.coreLastHitTime) < this.CORE_DAMAGE_COOLDOWN;
    ctx.fillStyle = isInvulnerable ? '#ff4747' : '#ffffff';
    ctx.beginPath();
    ctx.arc(this.core.x, this.core.y, this.core.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.entityManager.draw(ctx);
  }

  showMenu() {
    this.state.set(this.state.states.MENU);
    this.overlay.innerHTML = `
      <h1>Orbit Defender</h1>
      <p>Protect the core at all costs.</p>
      <div class="menu-buttons">
        <button id="playBtn">Play Game</button>
        <button id="shopBtn">Shop</button>
      </div>
    `;
    this.overlay.classList.remove('hide');
    document.getElementById('playBtn').onclick = () => this.start();
    document.getElementById('shopBtn').onclick = () => this.showShop();
  }

  showShop() {
    this.state.set(this.state.states.SHOP);

    const getAbilityButton = (abilityName, cost, key) => {
      const isUnlocked = this.abilitiesUnlocked[key];
      if (isUnlocked) {
        return `<button disabled style="background: #444;">Unlocked</button>`;
      } else {
        return `<button id="buy${key.charAt(0).toUpperCase() + key.slice(1)}">Buy ${abilityName} (${cost} Gold)</button>`;
      }
    };

    this.overlay.innerHTML = `
      <h1>Upgrades</h1>
      <p>Total Gold: ${this.ui.totalGold}</p>
      <div class="shop-item">
        <h3>Destroying Trail</h3>
        <p class="small">Your trail destroys asteroids.</p>
        ${getAbilityButton('Destroying Trail', 50, 'trail')}
      </div>
      <div class="shop-item">
        <h3>Pulsefire</h3>
        <p class="small">A powerful pulse that clears nearby asteroids.</p>
        ${getAbilityButton('Pulsefire', 50, 'pulse')}
      </div>
      <div class="shop-item">
        <h3>Shield Ability</h3>
        <p class="small">Full-circle shield for 3 seconds. Blocks all asteroids.</p>
        ${getAbilityButton('Shield', 50, 'shield')}
      </div>
      <div class="menu-buttons">
        <button id="backMenu">Back to Menu</button>
      </div>
    `;

    const buyAbility = (abilityKey, cost) => {
      if (this.ui.totalGold >= cost) {
        this.ui.totalGold -= cost;
        this.abilitiesUnlocked[abilityKey] = true;
        localStorage.setItem('orbit_defender_totalGold', this.ui.totalGold);
        localStorage.setItem(`ability_${abilityKey}`, 'true');
        this.ui.updateText();
        this.showShop();
      }
    };

    const buyTrailBtn = document.getElementById('buyTrail');
    if (buyTrailBtn) {
      buyTrailBtn.onclick = () => buyAbility('trail', 50);
    }

    const buyPulseBtn = document.getElementById('buyPulse');
    if (buyPulseBtn) {
      buyPulseBtn.onclick = () => buyAbility('pulse', 50);
    }

    const buyShieldBtn = document.getElementById('buyShield');
    if (buyShieldBtn) {
      buyShieldBtn.onclick = () => {
        if (this.ui.totalGold >= 50) {
          this.ui.totalGold -= 50;
          this.abilitiesUnlocked.shield = true; // Update the new structure
          this.shieldUnlocked = true; // Keep old flag for now as it's used in gameplay
          localStorage.setItem('orbit_defender_totalGold', this.ui.totalGold);
          localStorage.setItem('ability_shield', 'true'); // Use new key
          this.ui.updateText();
          this.showShop();
        }
      };
    }
    document.getElementById('backMenu').onclick = () => this.showMenu();
  }

  showGameOver() {
    this.overlay.innerHTML = `
      <h1>Game Over</h1>
      <p>Your core was breached.</p>
      <div class="menu-buttons">
        <button id="retryBtn">Play Again</button>
        <button id="menuBtn">Main Menu</button>
      </div>
    `;
    this.overlay.classList.remove('hide');
    document.getElementById('retryBtn').onclick = () => this.start();
    document.getElementById('menuBtn').onclick = () => this.showMenu();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.rescaleScene();
  }

  rescaleScene() {
    if (!this.core) {
      return;
    }

    const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    const shortSide = Math.min(this.canvas.width, this.canvas.height);
    const orbitalRadius = shortSide * 0.22;
    const coreRadius = Math.max(24, shortSide * 0.08);
    const playerSize = Math.max(10, shortSide * 0.03);

    this.core = { ...center, radius: coreRadius };
    this.entityManager.players.forEach(player => {
      player.center = center;
      player.orbitalRadius = orbitalRadius;
      player.size = playerSize;
    });
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          await navigator.serviceWorker.register('sw.js');
          console.log('Service worker registered.');
        } catch (error) {
          console.warn('Service worker registration failed:', error);
        }
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
