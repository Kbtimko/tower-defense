import { raelOvercharge, raelAirstrike, raelEmp, engRepair, engDeployTurret, engPowerSurge } from './heroAbilities.js';

export const HERO_ORDER = ['rael', 'engineer'];

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
};
