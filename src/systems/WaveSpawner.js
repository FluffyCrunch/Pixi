import { WAVES, ENEMY_TYPES } from '../constants.js';
import { Enemy } from '../entities/Enemy.js';

export class WaveSpawner {
  constructor(entityLayer, waypoints, mapX, mapY) {
    this.layer     = entityLayer;
    this.waypoints = waypoints.map(wp => ({
      x: mapX + wp.x,
      y: mapY + wp.y,
    }));

    this.enemies   = [];
    this.waveIndex = 0;
    this._queue    = [];
    this._timer    = 0;
    this._spawning = false;
    this._done     = false;

    this.onWaveComplete  = null;
    this.onAllComplete   = null;
    this.onEnemyReached  = null;
    this.onBomberExplode = null; // callback(x, y, radius)
  }

  startWave() {
    if (this.waveIndex >= WAVES.length) return;
    const wave     = WAVES[this.waveIndex];
    this._queue    = this._buildQueue(wave);
    this._timer    = 0;
    this._spawning = true;
    this.waveIndex++;
  }

  _buildQueue(wave) {
    const queue = [];
    for (const group of wave.enemies) {
      let delay = 0;
      for (let i = 0; i < group.count; i++) {
        queue.push({ type: group.type, delay });
        delay += group.interval;
      }
    }
    return queue.sort((a, b) => a.delay - b.delay);
  }

  update(ticker) {
    if (!this._spawning) return;

    this._timer += ticker.deltaMS;

    while (this._queue.length > 0 &&
           this._timer >= this._queue[0].delay) {
      this._spawnEnemy(this._queue.shift().type);
    }

    for (const enemy of this.enemies) {
      enemy.update(ticker);

      if (enemy.hasArrived() && !enemy._counted) {
        enemy._counted = true;
        enemy.visible  = false;
        if (this.onEnemyReached) this.onEnemyReached(enemy);
      }
    }

    // remove dead/arrived
    this.enemies = this.enemies.filter(e => {
      if ((e.isDead() || e.hasArrived()) && !e._removed) {
        e._removed = true;
        this.layer.removeChild(e);
        return false;
      }
      return true;
    });

    // wave complete check
    if (this._spawning &&
        this._queue.length === 0 &&
        this.enemies.length === 0) {
      this._spawning = false;
      if (this.waveIndex >= WAVES.length) {
        this._done = true;
        if (this.onAllComplete) this.onAllComplete();
      } else {
        if (this.onWaveComplete) this.onWaveComplete(this.waveIndex);
      }
    }
  }

  _spawnEnemy(type) {
    const enemy = new Enemy(type, [...this.waypoints]);

    // wire bomber death
    enemy.onDeathSplash = (x, y, radius) => {
      if (this.onBomberExplode) this.onBomberExplode(x, y, radius);
    };

    this.enemies.push(enemy);
    this.layer.addChild(enemy);
  }

  getEnemies()  { return this.enemies; }
  isSpawning()  { return this._spawning; }
  isDone()      { return this._done; }
  get totalWaves() { return WAVES.length; }
}