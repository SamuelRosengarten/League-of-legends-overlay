// Beginner guides, bundled offline. Update `patch` and the data when the meta shifts.
// Sources checked: Blitz.gg, Mobalytics, Rankedboost (Gwen top, patch 26.20).
// Names must match Riot's Data Dragon names so icons and tooltips can be found.
window.GUIDES = {
  Gwen: {
    role: "Top",
    patch: "26.20",
    summary: "Fighter who wins by auto-attacking. Fight when healthy, use W to survive.",
    runes: {
      primaryTree: "Precision",
      keystone: "Conqueror",
      primary: ["Presence of Mind", "Legend: Alacrity", "Last Stand"],
      secondaryTree: "Resolve",
      secondary: ["Bone Plating", "Unflinching"],
      shards: ["Attack Speed", "Adaptive Force", "Health (scaling)"],
    },
    summoners: ["Flash", "Ignite"],
    items: {
      start: ["Doran's Blade", "Health Potion"],
      // Buy order from the sources: Dusk and Dawn, then boots, then Shadowflame.
      core: ["Dusk and Dawn", "Sorcerer's Shoes", "Shadowflame"],
      boots: "Sorcerer's Shoes",
      // Finish the build in this order.
      later: ["Rabadon's Deathcap", "Zhonya's Hourglass", "Void Staff"],
    },
    skillOrder: {
      max: ["Q", "E", "W"],
      ultAt: [6, 11, 16],
      note: "Level R at 6, 11 and 16.",
    },
    abilities: [
      { key: "Passive", name: "A Thousand Cuts", text: "bonus damage + heal",
        detail: "Your auto-attacks deal extra damage based on the enemy's health, and heal you a little." },
      { key: "Q", name: "Snip Snip!", text: "main damage",
        detail: "Cuts enemies in front of you. Hit the same target again to cut more times." },
      { key: "W", name: "Hallowed Mist", text: "blocks attacks, stay inside",
        detail: "Enemies outside the mist can't target you (turrets still can). Stay inside it to survive." },
      { key: "E", name: "Skip 'n Slash", text: "dash + strong hit",
        detail: "Dash forward. Your next attacks are stronger and faster. Use it to start or finish a fight." },
      { key: "R", name: "Needlework", text: "slow, press up to 3x",
        detail: "Fires needles that slow enemies and apply your on-hit damage. Recast up to 3 times." },
    ],
    // `priority` tips are the reminders shown in compact mode.
    tips: [
      { category: "Laning", priority: true, text: "Last-hit minions (CS): gold makes you stronger.",
        detail: "Only the final hit on a minion gives gold. Missed last hits are the biggest gold loss for new players." },
      { category: "Survival", priority: true, text: "Low health? Back off. Use W to stay alive.",
        detail: "Walk back toward your tower when a fight turns. W keeps enemies outside the mist from targeting you." },
      { category: "Recall timing", priority: true, text: "Recall at about 1300 gold.",
        detail: "That is enough to buy a real item part. Recall after pushing your wave so you lose fewer minions." },
      { category: "Vision", text: "Buy a Control Ward (pink) every trip to base.",
        detail: "It reveals and disables enemy wards near it. Place it in a bush near your lane." },
    ],
  },
};
