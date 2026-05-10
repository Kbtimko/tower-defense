export function makeWaves(mapId) {
  const hardMult = mapId === 1 ? 1.5 : 1;
  const raw = [
    [{ type: 'drone',    count: 7,  interval: 1200 }],
    [{ type: 'drone',    count: 9,  interval: 1000 }, { type: 'skitter',  count: 4,  interval: 950  }],
    [{ type: 'skitter',  count: 9,  interval: 850  }],
    [{ type: 'brute',    count: 4,  interval: 1400 }, { type: 'drone',    count: 5,  interval: 1000 }],
    [{ type: 'drone',    count: 12, interval: 900  }, { type: 'skitter',  count: 8,  interval: 800  }],
    [{ type: 'brute',    count: 8,  interval: 1100 }, { type: 'skitter',  count: 6,  interval: 700  }],
    [{ type: 'colossus', count: 1,  interval: 2000 }, { type: 'drone',    count: 10, interval: 800  }],
    [{ type: 'brute',    count: 10, interval: 1000 }, { type: 'skitter',  count: 10, interval: 600  }],
    [{ type: 'colossus', count: 2,  interval: 2500 }, { type: 'brute',    count: 8,  interval: 900  }],
    [{ type: 'colossus', count: 3,  interval: 2000 }, { type: 'brute',    count: 10, interval: 800  }, { type: 'skitter', count: 12, interval: 600 }],
  ];
  return raw.map(groups =>
    groups.map(g => ({ ...g, count: Math.ceil(g.count * hardMult) }))
  );
}
