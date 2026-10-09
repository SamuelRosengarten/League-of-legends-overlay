// Beginner guides, bundled offline. Update `patch` and the data when the meta shifts.
// Sources checked: Blitz.gg, Mobalytics, Rankedboost (Gwen top, patch 26.20).
window.GUIDES = {
  Gwen: {
    role: "Top",
    patch: "26.20",
    summary: "Fighter who wins by auto-attacking. Fight when healthy, use W to survive.",
    runes: {
      keystone: "Conqueror",
      primary: ["Presence of Mind", "Legend: Alacrity", "Last Stand"],
      secondary: ["Bone Plating", "Unflinching"],
      shards: ["Attack Speed", "Adaptive Force", "Health (scaling)"],
    },
    summoners: ["Flash", "Ignite"],
    items: {
      start: ["Doran's Blade", "Health Potion"],
      boots: "Sorcerer's Shoes",
      core: ["Dusk and Dawn", "Shadowflame"],
      later: ["Rabadon's Deathcap", "Zhonya's Hourglass", "Void Staff"],
    },
    skillOrder: {
      max: ["Q", "E", "W"],
      ultAt: [6, 11, 16],
      note: "Level R at 6, 11 and 16.",
    },
    abilities: [
      { key: "Passive", name: "A Thousand Cuts", text: "bonus damage + heal" },
      { key: "Q", name: "Snip Snip!", text: "main damage" },
      { key: "W", name: "Hallowed Mist", text: "blocks attacks, stay inside" },
      { key: "E", name: "Skip 'n Slash", text: "dash + strong hit" },
      { key: "R", name: "Needlework", text: "slow, press up to 3x" },
    ],
    tips: [
      "Last-hit minions (CS): gold makes you stronger.",
      "Buy a Control Ward (pink) every trip to base.",
      "Recall at about 1300 gold.",
      "Low health? Back off. Use W to stay alive.",
    ],
  },
};
