import { raelOvercharge, raelAirstrike, raelEmp, engRepair, engDeployTurret, engPowerSurge, scoutMark, scoutVolley, scoutPhase, pyroFlameWave, pyroImmolate, pyroFirefield, pyroBurnOnHit } from './heroAbilities.js';

export const HERO_ORDER = ['rael', 'engineer', 'scout', 'pyro'];

export const HEROES = {
  rael: {
    id:              'rael',
    displayName:     'Commander Rael',
    shortName:       'Rael',
    portraitChar:    'R',
    bodyColor:       0x1a2a4a,
    strokeColor:     0x4fc3f7,
    unlockMapAfter:  null,
    upgradeBranchId: 'rael',
    stats: {
      maxHp: 150, moveSpeed: 130, attackRange: 40,
      attackRate: 1.5, attackDamage: 18, respawnTime: 20,
      maxLevel: 3, abilityUnlockLevels: { q: 1, w: 2, e: 3 },
    },
    abilities: {
      q: { id:'overcharge', label:'Overcharge', icon:'⚡', cooldown:30, aim:false, run: raelOvercharge,
           tooltip:'+50% tower fire rate for 6s' },
      w: { id:'airstrike',  label:'Airstrike',  icon:'🎯', cooldown:25, aim:true,  run: raelAirstrike,
           tooltip:'Click ground — 70px AoE, 80 damage' },
      e: { id:'emp_pulse',  label:'EMP Pulse',  icon:'💥', cooldown:45, aim:false, run: raelEmp,
           tooltip:'Stun all enemies for 3s' },
    },
    onHit:    null,
    matchups: { phantom: 1.5 },
    draw(g) {
      g.clear();
      g.fillStyle(0x1a2a4a, 1); g.fillCircle(0, -10, 6); g.fillRect(-4, -4, 8, 10);
      g.lineStyle(2, 0x4fc3f7, 1); g.strokeCircle(0, -10, 6); g.strokeRect(-4, -4, 8, 10);
    },
  },
  engineer: {
    id:              'engineer',
    displayName:     'Engineer Dax',
    shortName:       'Dax',
    portraitChar:    'E',
    bodyColor:       0x4a2e1a,
    strokeColor:     0xff9933,
    unlockMapAfter:  2,
    upgradeBranchId: 'engineer',
    stats: {
      maxHp: 95, moveSpeed: 110, attackRange: 60,
      attackRate: 1.2, attackDamage: 12, respawnTime: 20,
      maxLevel: 3, abilityUnlockLevels: { q: 1, w: 2, e: 3 },
    },
    abilities: {
      q: { id:'repair',        label:'Repair',        icon:'🔧', cooldown:20, aim:false, run: engRepair,
           tooltip:'Heal self +60 HP and all soldiers within 100px to full' },
      w: { id:'deploy_turret', label:'Deploy Turret', icon:'🛡️', cooldown:35, aim:false, run: engDeployTurret,
           tooltip:'Place a sentry turret (12s, 100px range, 15 dmg)' },
      e: { id:'power_surge',   label:'Power Surge',   icon:'⚡', cooldown:50, aim:false, run: engPowerSurge,
           tooltip:'All towers within 200px get +100% fire rate for 8s' },
    },
    onHit:    null,
    matchups: { brute: 1.25, colossus: 1.5, titan: 1.5 },
    draw(g) {
      g.clear();
      // Hexagonal hardhat head
      g.fillStyle(0x4a2e1a, 1);
      g.beginPath();
      const r = 7;
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = Math.cos(a) * r;
        const py = -10 + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
      g.fillPath();
      // Torso with backpack rect
      g.fillRect(-4, -4, 8, 10);
      g.fillStyle(0x6a3e2a, 1);
      g.fillRect(-3, -1, 6, 4);
      // Copper outline
      g.lineStyle(2, 0xff9933, 1);
      g.strokePath();
      g.strokeRect(-4, -4, 8, 10);
    },
  },
  scout: {
    id:              'scout',
    displayName:     'Scout Vex',
    shortName:       'Vex',
    portraitChar:    'S',
    bodyColor:       0x1e3a1e,
    strokeColor:     0x3fb950,
    unlockMapAfter:  4,
    upgradeBranchId: 'scout',
    stats: {
      maxHp: 80, moveSpeed: 150, attackRange: 140,
      attackRate: 2.0, attackDamage: 14, respawnTime: 18,
      maxLevel: 3, abilityUnlockLevels: { q: 1, w: 2, e: 3 },
    },
    abilities: {
      q: { id:'mark',         label:'Mark Target',  icon:'🎯', cooldown:20, aim:true,  run: scoutMark,
           tooltip:'Click an enemy → takes 2× damage for 6s' },
      w: { id:'volley',       label:'Volley',       icon:'🏹', cooldown:30, aim:false, run: scoutVolley,
           tooltip:'Strike up to 8 enemies in 180px, 25 damage each' },
      e: { id:'phase_sprint', label:'Phase Sprint', icon:'💨', cooldown:45, aim:false, run: scoutPhase,
           tooltip:'Untargetable + 2× move speed for 4s (self-only)' },
    },
    onHit:    null,
    matchups: { drone: 1.5, phantom: 1.75, titan: 0.75 },
    draw(g) {
      g.clear();
      g.fillStyle(0x1e3a1e, 1);
      g.fillCircle(0, -10, 5);
      g.beginPath();
      g.moveTo(0, -4); g.lineTo(-3, 6); g.lineTo(3, 6); g.closePath();
      g.fillPath();
      g.lineStyle(2, 0x3fb950, 1);
      g.strokeCircle(0, -10, 5);
      g.strokePath();
    },
  },
  pyro: {
    id:              'pyro',
    displayName:     'Pyromancer Mira',
    shortName:       'Mira',
    portraitChar:    'P',
    bodyColor:       0x4a1e1a,
    strokeColor:     0xe74c3c,
    unlockMapAfter:  6,
    upgradeBranchId: 'pyro',
    stats: {
      maxHp: 130, moveSpeed: 115, attackRange: 45,
      attackRate: 1.0, attackDamage: 14, respawnTime: 22,
      maxLevel: 3, abilityUnlockLevels: { q: 1, w: 2, e: 3 },
    },
    abilities: {
      q: { id:'flame_wave', label:'Flame Wave', icon:'🔥', cooldown:20, aim:false, run: pyroFlameWave,
           tooltip:'90° cone, 100px reach: 30 damage + burn' },
      w: { id:'immolate',   label:'Immolate',   icon:'♨️', cooldown:30, aim:false, run: pyroImmolate,
           tooltip:'8s aura: 10 dmg/s in 60px + 1.5× auto-attack damage' },
      e: { id:'firefield',  label:'Firefield',  icon:'🌋', cooldown:50, aim:true,  run: pyroFirefield,
           tooltip:'Click ground — 100px fire pool for 6s, 15 dmg/s + slow' },
    },
    onHit:    pyroBurnOnHit,
    matchups: { drone: 1.5, skitter: 2.0, brute: 1.25, titan: 0.5 },
    draw(g) {
      g.clear();
      g.fillStyle(0x4a1e1a, 1);
      g.fillCircle(0, -10, 6);
      g.fillStyle(0xff6600, 1);
      g.beginPath();
      g.moveTo(0, -18); g.lineTo(-2, -15); g.lineTo(2, -15); g.closePath();
      g.fillPath();
      g.fillStyle(0x4a1e1a, 1);
      g.fillRect(-5, -4, 10, 10);
      g.lineStyle(2, 0xe74c3c, 1);
      g.strokeCircle(0, -10, 6);
      g.strokeRect(-5, -4, 10, 10);
    },
  },
};
