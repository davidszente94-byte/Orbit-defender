class GameStateManager {
  constructor() {
    this.states = {
      START: 'START',
      PLAYING: 'PLAYING',
      GAMEOVER: 'GAMEOVER'
    };
    this.current = this.states.START;
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
    this.color = options.color ?? '#ff5f1a';
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
    this.color = options.color ?? '#47ff6d';
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
    this.health = 5;
    this.updateText();
  }

  updateText() {
    this.statusElement.textContent = `Gold: ${this.gold} | Health: ${this.health}`;
  }

  addGold(amount = 1) {
    this.gold += amount;
    this.updateText();
  }

  takeDamage(amount = 1) {
    this.health = Math.max(0, this.health - amount);
    this.updateText();
  }
}

class Game {
  constructor() {
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
    this.spawnInterval = 1.05;
    this.core = { x: 0, y: 0, radius: 0 };
    this.inputDown = false;
    this.inputStartTime = 0;
    this.inputBoostActive = false;
    this.inputThreshold = 0.2;

    this.registerEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.registerServiceWorker();
  }

  start() {
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
    this.spawnTimer = 0;

    const player = new Player(center, orbitalRadius, { size: playerSize });
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

    this.startButton.addEventListener('click', () => this.start());
    this.startButton.addEventListener('touchend', event => {
      event.preventDefault();
      this.start();
    }, { passive: false });
  }

  onInputDown() {
    if (this.state.current === this.state.states.START) {
      this.start();
      return;
    }

    if (this.state.current !== this.state.states.PLAYING) {
      return;
    }

    if (this.inputDown) {
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

  spawnProjectile() {
    const edge = Math.floor(Math.random() * 4);
    const padding = 32;
    const x = edge === 0 ? -padding : edge === 1 ? this.canvas.width + padding : Math.random() * this.canvas.width;
    const y = edge === 2 ? -padding : edge === 3 ? this.canvas.height + padding : Math.random() * this.canvas.height;
    const target = { x: this.core.x, y: this.core.y };
    const direction = { x: target.x - x, y: target.y - y };
    const distance = Math.hypot(direction.x, direction.y);
    const speed = (90 + Math.random() * 70) * 0.5;
    const velocity = { x: (direction.x / distance) * speed, y: (direction.y / distance) * speed };

    const projectile = new Projectile(x, y, velocity, {
      health: 1,
      bounceCount: 0,
      radius: Math.max(8, Math.min(this.canvas.width, this.canvas.height) * 0.018),
      color: '#ff8142'
    });

    this.entityManager.addProjectile(projectile);
  }

  processCollisions() {
    const coreCenter = { x: this.core.x, y: this.core.y };

    this.entityManager.projectiles.forEach(projectile => {
      if (projectile.isDestroyed) {
        return;
      }

      if (projectile.distanceTo(coreCenter) <= this.core.radius + projectile.radius) {
        projectile.destroy();
        this.ui.takeDamage(1);
        return;
      }

      for (const player of this.entityManager.players) {
        if (player.isDestroyed || projectile.isDestroyed) continue;
        const playerPos = player.position;
        const dist = Math.hypot(projectile.x - playerPos.x, projectile.y - playerPos.y);

        if (dist <= player.size + projectile.radius) {
          projectile.destroy();
          this.ui.addGold(1);
          continue;
        }

        for (const trailPoint of player.trail) {
          if (projectile.isDestroyed) break;
          const trailDist = Math.hypot(projectile.x - trailPoint.x, projectile.y - trailPoint.y);
          if (trailDist <= player.size + projectile.radius) {
            projectile.destroy();
            this.ui.addGold(1);
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
      this.spawnTimer += deltaTime;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.spawnProjectile();
      }

      if (this.inputDown && !this.inputBoostActive && currentTime - this.inputStartTime >= this.inputThreshold) {
        this.inputBoostActive = true;
        this.entityManager.players.forEach(player => player.setBoosting(true));
      }

      this.entityManager.update(deltaTime, currentTime);
      this.processCollisions();
      if (this.ui.health <= 0) {
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

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.core.x, this.core.y, this.core.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.entityManager.draw(ctx);

    if (this.state.current === this.state.states.START) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
  }

  showGameOver() {
    this.overlay.querySelector('h1').textContent = 'Game Over';
    this.overlay.querySelector('p').textContent = 'Your core was breached. Refresh to try again.';
    this.startButton.textContent = 'Play Again';
    this.overlay.classList.remove('hide');
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
