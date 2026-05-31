import { raelOvercharge, raelAirstrike, raelEmp } from './heroAbilities.js';

export const HERO_ORDER = ['rael'];   // T13–T15 will extend

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
};
