import { ENEMY_DEFS } from './enemies.js';

export const MAP_WAVES = {
  // Level 1 is the gentlest map in the campaign by construction: the lowest
  // HP-per-wave of any map, and the brute debuts ALONE on wave 5 (360 HP)
  // before wave 6 doubles up (780 HP). That ordering is the point -- an archer
  // opening does 5 DPS to a brute, so the mismatch has to be shown on a wave
  // the player can survive learning from. Pinned by waves.test.js.
  0: [
    [{ type: 'drone',   count: 6,  interval: 1200 }],
    [{ type: 'drone',   count: 8,  interval: 1100 }, { type: 'skitter', count: 3, interval: 950  }],
    [{ type: 'skitter', count: 8,  interval: 850  }],
    [{ type: 'drone',   count: 10, interval: 1000 }],
    [{ type: 'brute',   count: 3,  interval: 1400 }],
    [{ type: 'drone',   count: 6,  interval: 1000 }, { type: 'brute',   count: 3, interval: 1400 }],
    [{ type: 'drone',   count: 8,  interval: 950  }, { type: 'skitter', count: 5, interval: 750  }],
    [{ type: 'brute',   count: 5,  interval: 1150 }, { type: 'skitter', count: 5, interval: 700  }],
    [{ type: 'drone',   count: 8,  interval: 900  }, { type: 'brute',   count: 4, interval: 1050 }, { type: 'skitter', count: 6, interval: 750 }],
    [{ type: 'drone',   count: 16, interval: 750  }],
  ],

  1: [
    [{ type: 'drone',   count: 8,  interval: 1150 }],
    [{ type: 'skitter', count: 5,  interval: 950  }],
    [{ type: 'drone',   count: 10, interval: 1050 }, { type: 'skitter', count: 4, interval: 900 }],
    [{ type: 'brute',   count: 4,  interval: 1350 }],
    [{ type: 'drone',   count: 10, interval: 1000 }, { type: 'brute',   count: 3, interval: 1350 }],
    [{ type: 'skitter', count: 7,  interval: 830  }, { type: 'brute',   count: 3, interval: 1250 }],
    [{ type: 'drone',   count: 10, interval: 950  }, { type: 'skitter', count: 5, interval: 800  }],
    [{ type: 'brute',   count: 6,  interval: 1150 }],
    [{ type: 'drone',   count: 12, interval: 880  }, { type: 'brute',   count: 5, interval: 1150 }],
    [{ type: 'drone',   count: 18, interval: 720  }],
  ],

  // Trimmed 12330 -> 11000 to smooth the on-ramp: HP per wave now runs
  // 722 -> 812 -> 917 across maps 0-2 instead of 880 -> 812 -> 1028.
  2: [
    [{ type: 'drone',   count: 8,  interval: 1100 }],
    [{ type: 'skitter', count: 6,  interval: 900  }],
    [{ type: 'drone',   count: 10, interval: 1000 }, { type: 'skitter', count: 4, interval: 850 }],
    [{ type: 'brute',   count: 4,  interval: 1300 }],
    [{ type: 'drone',   count: 10, interval: 950  }, { type: 'brute',   count: 3, interval: 1300 }],
    [{ type: 'skitter', count: 8,  interval: 800  }, { type: 'brute',   count: 3, interval: 1200 }],
    [{ type: 'drone',   count: 10, interval: 900  }, { type: 'skitter', count: 6, interval: 780  }],
    [{ type: 'brute',   count: 6,  interval: 1100 }],
    [{ type: 'drone',   count: 10, interval: 850  }, { type: 'brute',   count: 4, interval: 1100 }],
    [{ type: 'skitter', count: 10, interval: 750  }, { type: 'brute',   count: 5, interval: 1000 }],
    [{ type: 'drone',   count: 14, interval: 800  }, { type: 'skitter', count: 8, interval: 700  }],
    [{ type: 'drone',   count: 18, interval: 650  }, { type: 'brute',   count: 6, interval: 900  }],
  ],

  3: [
    [{ type: 'drone',   count: 8,  interval: 1050 }],
    [{ type: 'skitter', count: 7,  interval: 850  }],
    [{ type: 'brute',   count: 5,  interval: 1250 }],
    [{ type: 'phantom', count: 4,  interval: 1000 }],
    [{ type: 'drone',   count: 10, interval: 950  }, { type: 'phantom', count: 3, interval: 900  }],
    [{ type: 'skitter', count: 8,  interval: 800  }, { type: 'phantom', count: 4, interval: 850  }],
    [{ type: 'brute',   count: 6,  interval: 1100 }, { type: 'drone',   count: 8, interval: 950  }],
    [{ type: 'phantom', count: 6,  interval: 800  }, { type: 'skitter', count: 5, interval: 780  }],
    [{ type: 'drone',   count: 12, interval: 850  }, { type: 'brute',   count: 5, interval: 1100 }],
    [{ type: 'phantom', count: 8,  interval: 750  }, { type: 'drone',   count: 8, interval: 850  }],
    [{ type: 'brute',   count: 7,  interval: 1000 }, { type: 'phantom', count: 6, interval: 750  }],
    [{ type: 'drone',   count: 15, interval: 750  }, { type: 'phantom', count: 8, interval: 700  }, { type: 'brute', count: 5, interval: 1000 }],
  ],

  4: [
    [{ type: 'drone',   count: 10, interval: 1000 }],
    [{ type: 'phantom', count: 5,  interval: 950  }],
    [{ type: 'skitter', count: 8,  interval: 800  }, { type: 'phantom', count: 4, interval: 850  }],
    [{ type: 'brute',   count: 6,  interval: 1200 }],
    [{ type: 'drone',   count: 12, interval: 900  }, { type: 'phantom', count: 5, interval: 850  }],
    [{ type: 'skitter', count: 9,  interval: 750  }, { type: 'brute',   count: 5, interval: 1100 }],
    [{ type: 'phantom', count: 8,  interval: 800  }, { type: 'drone',   count: 10, interval: 900 }],
    [{ type: 'brute',   count: 8,  interval: 1050 }, { type: 'skitter', count: 6, interval: 750  }],
    [{ type: 'colossus', count: 1, interval: 3000 }, { type: 'phantom', count: 10, interval: 750  }, { type: 'skitter', count: 6, interval: 720  }],
    [{ type: 'drone',   count: 14, interval: 850  }, { type: 'brute',   count: 6, interval: 1000 }],
    [{ type: 'phantom', count: 8,  interval: 700  }, { type: 'brute',   count: 7, interval: 950  }],
    [{ type: 'colossus', count: 2, interval: 3500 }, { type: 'skitter', count: 12, interval: 700  }, { type: 'phantom', count: 6, interval: 750  }],
    [{ type: 'drone',   count: 16, interval: 800  }, { type: 'phantom', count: 8, interval: 750  }, { type: 'brute', count: 5, interval: 1000 }],
    [{ type: 'colossus', count: 2, interval: 3500 }, { type: 'drone',   count: 20, interval: 650  }, { type: 'brute',   count: 8, interval: 900  }, { type: 'phantom', count: 8, interval: 700 }],
  ],

  5: [
    [{ type: 'drone',   count: 10, interval: 950  }],
    [{ type: 'phantom', count: 6,  interval: 900  }],
    [{ type: 'skitter', count: 10, interval: 780  }],
    [{ type: 'brute',   count: 7,  interval: 1150 }],
    [{ type: 'phantom', count: 8,  interval: 820  }, { type: 'drone',   count: 8, interval: 900  }],
    [{ type: 'skitter', count: 10, interval: 750  }, { type: 'brute',   count: 5, interval: 1100 }],
    [{ type: 'phantom', count: 10, interval: 750  }, { type: 'skitter', count: 6, interval: 720  }],
    [{ type: 'drone',   count: 15, interval: 850  }, { type: 'brute',   count: 6, interval: 1050 }],
    [{ type: 'phantom', count: 10, interval: 700  }, { type: 'brute',   count: 7, interval: 1000 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'drone',   count: 12, interval: 800 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'skitter', count: 10, interval: 700 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'phantom', count: 8,  interval: 750 }],
    [{ type: 'titan',   count: 1,  interval: 4000 }, { type: 'colossus', count: 2, interval: 3500 }, { type: 'drone',   count: 15, interval: 750 }],
    [{ type: 'titan',   count: 2,  interval: 4000 }, { type: 'brute',   count: 8,  interval: 900 }, { type: 'phantom', count: 6, interval: 750 }],
  ],

  6: [
    [{ type: 'drone',   count: 12, interval: 900  }],
    [{ type: 'phantom', count: 8,  interval: 850  }],
    [{ type: 'skitter', count: 10, interval: 750  }, { type: 'phantom', count: 5, interval: 800  }],
    [{ type: 'brute',   count: 8,  interval: 1100 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'drone',   count: 10, interval: 850 }],
    [{ type: 'phantom', count: 10, interval: 750  }, { type: 'skitter', count: 8,  interval: 730 }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'brute',   count: 6,  interval: 1050 }],
    [{ type: 'drone',   count: 16, interval: 800  }, { type: 'phantom', count: 8,  interval: 780 }],
    [{ type: 'titan',   count: 1,  interval: 3500 }, { type: 'colossus', count: 2, interval: 3500 }, { type: 'skitter', count: 8,  interval: 720 }],
    [{ type: 'brute',   count: 8,  interval: 1000 }, { type: 'phantom', count: 10, interval: 750 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'drone',   count: 12, interval: 800 }],
    [{ type: 'phantom', count: 12, interval: 700  }, { type: 'brute',   count: 8,  interval: 950 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'phantom', count: 8, interval: 750 }, { type: 'drone', count: 10, interval: 800 }],
    [{ type: 'drone',   count: 18, interval: 750  }, { type: 'brute',   count: 8,  interval: 900 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'phantom', count: 10, interval: 700 }, { type: 'skitter', count: 8, interval: 700 }],
  ],

  7: [
    [{ type: 'phantom', count: 10, interval: 800  }],
    [{ type: 'drone',   count: 14, interval: 850  }],
    [{ type: 'phantom', count: 12, interval: 750  }, { type: 'skitter', count: 6, interval: 730  }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'drone',   count: 10, interval: 850 }],
    [{ type: 'phantom', count: 14, interval: 700  }, { type: 'brute',   count: 5,  interval: 1050 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'phantom', count: 8,  interval: 750 }],
    [{ type: 'skitter', count: 12, interval: 700  }, { type: 'phantom', count: 10, interval: 720 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'brute',   count: 8,  interval: 1000 }],
    [{ type: 'phantom', count: 16, interval: 680  }, { type: 'drone',   count: 12, interval: 800 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'skitter', count: 10, interval: 700 }, { type: 'phantom', count: 8, interval: 730 }],
    [{ type: 'drone',   count: 20, interval: 750  }, { type: 'phantom', count: 12, interval: 700 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'brute',   count: 8,  interval: 950 }],
    [{ type: 'phantom', count: 18, interval: 650  }, { type: 'skitter', count: 10, interval: 680 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'drone',   count: 15, interval: 750 }, { type: 'phantom', count: 8, interval: 700 }],
    [{ type: 'titan',   count: 4,  interval: 4500 }, { type: 'phantom', count: 15, interval: 650 }, { type: 'brute',   count: 8, interval: 900 }],
  ],

  8: [
    [{ type: 'drone',   count: 15, interval: 850  }],
    [{ type: 'phantom', count: 12, interval: 750  }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'skitter', count: 10, interval: 730 }],
    [{ type: 'phantom', count: 14, interval: 720  }, { type: 'brute',   count: 6,  interval: 1050 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'drone',   count: 12, interval: 800 }],
    [{ type: 'skitter', count: 12, interval: 700  }, { type: 'phantom', count: 10, interval: 720 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'brute',   count: 8,  interval: 1000 }, { type: 'phantom', count: 8, interval: 750 }],
    [{ type: 'drone',   count: 18, interval: 780  }, { type: 'phantom', count: 12, interval: 700 }],
    [{ type: 'titan',   count: 2,  interval: 4000 }, { type: 'colossus', count: 2, interval: 3500 }, { type: 'skitter', count: 10, interval: 700 }],
    [{ type: 'phantom', count: 18, interval: 660  }, { type: 'brute',   count: 8,  interval: 950 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'drone',   count: 16, interval: 780 }, { type: 'phantom', count: 8, interval: 720 }],
    [{ type: 'skitter', count: 14, interval: 680  }, { type: 'phantom', count: 12, interval: 700 }, { type: 'brute', count: 8, interval: 950 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'phantom', count: 14, interval: 680 }],
    [{ type: 'drone',   count: 22, interval: 720  }, { type: 'titan',   count: 2,  interval: 4000 }],
    [{ type: 'titan',   count: 4,  interval: 4500 }, { type: 'phantom', count: 12, interval: 670 }, { type: 'brute', count: 8, interval: 900 }],
    [{ type: 'titan',   count: 5,  interval: 5000 }, { type: 'phantom', count: 18, interval: 640 }, { type: 'skitter', count: 12, interval: 680 }],
  ],

  9: [
    [{ type: 'phantom', count: 12, interval: 750  }],
    [{ type: 'drone',   count: 18, interval: 800  }],
    [{ type: 'titan',   count: 1,  interval: 3000 }, { type: 'phantom', count: 10, interval: 720 }],
    [{ type: 'skitter', count: 14, interval: 700  }, { type: 'brute',   count: 8,  interval: 1000 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'drone',   count: 14, interval: 780 }],
    [{ type: 'phantom', count: 16, interval: 680  }, { type: 'skitter', count: 10, interval: 700 }],
    [{ type: 'titan',   count: 2,  interval: 3500 }, { type: 'brute',   count: 10, interval: 950 }, { type: 'phantom', count: 8, interval: 730 }],
    [{ type: 'drone',   count: 20, interval: 750  }, { type: 'phantom', count: 14, interval: 700 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'skitter', count: 12, interval: 690 }],
    [{ type: 'phantom', count: 20, interval: 650  }, { type: 'brute',   count: 10, interval: 920 }],
    [{ type: 'titan',   count: 3,  interval: 4000 }, { type: 'drone',   count: 18, interval: 760 }, { type: 'phantom', count: 10, interval: 710 }],
    [{ type: 'skitter', count: 16, interval: 670  }, { type: 'phantom', count: 14, interval: 680 }, { type: 'brute', count: 8, interval: 950 }],
    [{ type: 'titan',   count: 4,  interval: 4500 }, { type: 'phantom', count: 12, interval: 670 }, { type: 'drone', count: 14, interval: 780 }],
    [{ type: 'drone',   count: 24, interval: 700  }, { type: 'titan',   count: 3,  interval: 4500 }],
    [{ type: 'phantom', count: 20, interval: 640  }, { type: 'titan',   count: 3,  interval: 4500 }, { type: 'brute', count: 10, interval: 900 }],
    [{ type: 'titan',   count: 4,  interval: 5000 }, { type: 'colossus', count: 2, interval: 4000 }, { type: 'skitter', count: 16, interval: 660 }, { type: 'phantom', count: 14, interval: 660 }],
    [{ type: 'titan',   count: 5,  interval: 5000 }, { type: 'drone',   count: 22, interval: 720 }, { type: 'phantom', count: 16, interval: 650 }],
    [{ type: 'titan',   count: 6,  interval: 5500 }, { type: 'phantom', count: 24, interval: 620 }, { type: 'brute', count: 12, interval: 880 }],
  ],
};

// Total enemy HP a wave table ships, at BASE stats — WaveManager's per-wave
// `1 + waveIndex * 0.13` ramp is deliberately excluded, so this is a fixed
// property of the table rather than a number that moves with how far in the run
// you are. Hero levelling paces its thresholds against it, which is why it
// lives here with the wave data instead of inside Hero.
//
// Two entry points because the two callers hold different things: GameScene
// knows only a map id, while the balance simulator is handed a wave table
// directly (its fixtures are synthetic and not in MAP_WAVES at all).
export function totalEnemyHp(waves) {
  if (!waves) return 0;
  return waves.reduce(
    (total, wave) => total + wave.reduce(
      (sum, g) => sum + (ENEMY_DEFS[g.type]?.hp ?? 0) * g.count, 0), 0);
}

export function totalEnemyHpForMap(mapId) {
  return totalEnemyHp(MAP_WAVES[mapId]);
}
