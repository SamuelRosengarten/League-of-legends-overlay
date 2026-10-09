// Minimal Data Dragon fixtures with the same shape as the real files, for UI tests only.
import zlib from "node:zlib";

export const VERSION = "99.1.1";

const item = (id, name, extra = {}) => [id, {
  name, plaintext: `${name} plaintext`, description: `<mainText><stats>${name} <b>stats</b></stats><br>More</mainText>`,
  image: { full: `${id}.png` }, gold: { total: 1000, purchasable: true }, maps: { 11: true, 12: true }, ...extra,
}];

export const ITEMS = {
  data: Object.fromEntries([
    item("1055", "Doran's Blade"),
    item("2003", "Health Potion"),
    item("2055", "Control Ward"),
    item("3020", "Sorcerer's Shoes"),
    item("4000", "Dusk and Dawn"),
    item("4645", "Shadowflame"),
    item("3089", "Rabadon's Deathcap"),
    item("3157", "Zhonya's Hourglass"),
    item("3135", "Void Staff"),
    // Same name on another map / higher id: must not replace the Summoner's Rift entry.
    item("223089", "Rabadon's Deathcap", { maps: { 11: false, 30: true } }),
    item("999999", "Doran's Blade"),
  ]),
};

const rune = (id, name, icon) => ({ id, key: name.replace(/\W/g, ""), name, icon, shortDesc: `${name} <b>short</b> description.` });
export const RUNES = [
  { id: 8000, key: "Precision", name: "Precision", icon: "perk-images/Styles/7201_Precision.png", slots: [
    { runes: [rune(8010, "Conqueror", "perk-images/Styles/Precision/Conqueror/Conqueror.png")] },
    { runes: [rune(8009, "Presence of Mind", "perk-images/Styles/Precision/PresenceOfMind/PresenceOfMind.png")] },
    { runes: [rune(9104, "Legend: Alacrity", "perk-images/Styles/Precision/LegendAlacrity/LegendAlacrity.png")] },
    { runes: [rune(8299, "Last Stand", "perk-images/Styles/Sorcery/LastStand/LastStand.png")] },
  ] },
  { id: 8400, key: "Resolve", name: "Resolve", icon: "perk-images/Styles/7204_Resolve.png", slots: [
    { runes: [rune(8473, "Bone Plating", "perk-images/Styles/Resolve/BonePlating/BonePlating.png")] },
    { runes: [rune(8242, "Unflinching", "perk-images/Styles/Sorcery/Unflinching/Unflinching.png")] },
  ] },
];

export const SUMMONERS = { data: {
  SummonerFlash: { name: "Flash", description: "Teleports a short distance.", image: { full: "SummonerFlash.png" } },
  SummonerDot: { name: "Ignite", description: "Burns the target.", image: { full: "SummonerDot.png" } },
} };

const spell = (n, name) => ({ id: `Gwen${n}`, name, description: `${name} official <i>description</i>.`, image: { full: `Gwen${n}.png` } });
export const GWEN = { data: { Gwen: {
  id: "Gwen", name: "Gwen", title: "The Hallowed Seamstress", image: { full: "Gwen.png" },
  spells: [spell("Q", "Snip Snip!"), spell("W", "Hallowed Mist"), spell("E", "Skip 'n Slash"), spell("R", "Needlework")],
  passive: { name: "A Thousand Cuts", description: "Passive official description.", image: { full: "Gwen_Passive.png" } },
} } };

const ks = (n, name, cd) => ({ id: `Kaisa${n}`, name, description: `${name} does things. It also does more.`, cooldownBurn: cd, image: { full: `Kaisa${n}.png` } });
export const KAISA = { data: { Kaisa: {
  id: "Kaisa", name: "Kai'Sa", title: "Daughter of the Void", image: { full: "Kaisa.png" }, tags: ["Marksman", "Assassin"],
  info: { attack: 8, defense: 4, magic: 7, difficulty: 6 },
  spells: [ks("Q", "Icathian Rain", "9/8/7/6/5"), ks("W", "Void Seeker", "22"), ks("E", "Supercharge", "16"), ks("R", "Killer Instinct", "130")],
  passive: { name: "Second Skin", description: "Passive does things.", image: { full: "Kaisa_Passive.png" } },
} } };

export function ddJsonFor(path) {
  if (path === "api/versions.json") return [VERSION, "99.0.1"];
  const base = `cdn/${VERSION}/data/en_US/`;
  return {
    [`${base}item.json`]: ITEMS,
    [`${base}runesReforged.json`]: RUNES,
    [`${base}summoner.json`]: SUMMONERS,
    [`${base}champion/Gwen.json`]: GWEN,
    [`${base}champion/Kaisa.json`]: KAISA,
    [`${base}champion.json`]: { data: {
      Gwen: { id: "Gwen", name: "Gwen", image: { full: "Gwen.png" } },
      Kaisa: { id: "Kaisa", name: "Kai'Sa", image: { full: "Kaisa.png" } },
    } },
  }[path];
}

// A solid-colour PNG so icons render as visible squares in screenshots.
export function png(seed, size = 32) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rgb = [60 + (h & 127), 60 + ((h >> 8) & 127), 90 + ((h >> 16) & 127)];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) raw.set(rgb, y * (size * 3 + 1) + 1 + x * 3);
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
