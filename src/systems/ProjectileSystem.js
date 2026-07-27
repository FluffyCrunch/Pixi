import { Projectile } from '../entities/Projectile.js';
import { TOWER_TYPES } from '../constants.js';

export class ProjectileSystem {
  constructor(projectileLayer, effectLayer) {
    this.projLayer   = projectileLayer;
    this.effectLayer = effectLayer;
    this.projectiles = [];

    this.onEnemyKilled = null; // callback(enemy) for gold reward
    this.onSplash      = null; // callback for AoE damage
  }

  // fire from a tower at a target
  fire(tower, target, allEnemies) {
    const type = tower.towerType;
    const def  = tower.def;

    if (type === 'tesla') {
      // tesla chains to multiple enemies
      this._fireTesla(tower, target, allEnemies);
    } else {
      // all other towers fire a single projectile
      const proj = new Projectile(type, tower.x, tower.y, target, def);
      this.projectiles.push(proj);
      this.projLayer.addChild(proj);
    }
  }

  _fireTesla(tower, primaryTarget, allEnemies) {
    // collect up to def.chain nearest enemies
    const chainCount = tower.def.chain || 4;
    const targets    = this._getNearestEnemies(
      tower.x, tower.y, allEnemies, chainCount
    );

    for (const t of targets) {
      const proj = new Projectile(
        'tesla', tower.x, tower.y, t, tower.def
      );
      this.projectiles.push(proj);
      this.projLayer.addChild(proj);
    }
  }

  _getNearestEnemies(x, y, enemies, count) {
    return enemies
      .filter(e => !e.isDead() && !e.hasArrived())
      .map(e => ({
        e,
        d: Math.hypot(e.x - x, e.y - y),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map(o => o.e);
  }

  update(ticker, allEnemies) {
    for (const proj of this.projectiles) {
      proj.update(ticker);

      // handle AoE on cannon hit
      if (proj.isDead() && proj.projType === 'cannon') {
        this._applySplash(proj, allEnemies);
      }

      // handle frost slow on hit
      if (proj.isDead() && proj.projType === 'frost') {
        if (proj.target && !proj.target.isDead()) {
          proj.target.applySlow(proj.def.slow, 2500);
        }
      }
    }

    // check kills and give gold
    for (const proj of this.projectiles) {
      if (!proj.isDead()) continue;
      const t = proj.target;
      if (t && t.isDead() && !t._rewarded) {
        t._rewarded = true;
        if (this.onEnemyKilled) this.onEnemyKilled(t);
      }
    }

    // remove dead projectiles
    this.projectiles = this.projectiles.filter(p => {
      if (p.isDead()) {
        this.projLayer.removeChild(p);
        return false;
      }
      return true;
    });
  }

  _applySplash(cannonProj, allEnemies) {
    const splashR = cannonProj.def.splash || 50;
    const cx      = cannonProj.x;
    const cy      = cannonProj.y;

    for (const enemy of allEnemies) {
      if (enemy.isDead() || enemy.hasArrived()) continue;
      const d = Math.hypot(enemy.x - cx, enemy.y - cy);
      if (d <= splashR) {
        enemy.takeDamage(cannonProj.def.damage * 0.5);
      }
    }
  }

  destroy() {
    for (const p of this.projectiles) {
      this.projLayer.removeChild(p);
    }
    this.projectiles = [];
  }
}