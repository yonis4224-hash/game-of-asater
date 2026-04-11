currentRound: 1,
teamAScore: 0,
teamBScore: 0,
gameMode: "2v2",
gameMode: "1v1",
gameStarted: false,
teams: {
  teamA: { name: "فريق الصقور", color: "#22c55e" },
  teamB: { name: "فريق الشهب", color: "#f97316" },
},
roundData: null,
settings: { ...defaultSettings, ...(settings ?? {}) },
};