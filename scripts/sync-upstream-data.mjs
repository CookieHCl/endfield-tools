import { cp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const upstreamData = process.argv[2];
if (!upstreamData) {
  throw new Error("Usage: node scripts/sync-upstream-data.mjs <upstream-data>");
}

/// helpers
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localData = path.join(root, "data");
const upstream = path.resolve(upstreamData);

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = (file, data) =>
  writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");

/// 이미지 복사
async function mirrorImages(directory) {
  const source = path.join(upstream, directory);
  const destination = path.join(root, "public", directory);

  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true });
}

/// 던전 복사
const [currentDungeons, upstreamDungeons] = await Promise.all([
  readJson(path.join(localData, "dungeon_data.json")),
  readJson(path.join(upstream, "dungeon_data.json")),
]);

const regions = new Map(
  currentDungeons.map((dungeon) => [dungeon.id, dungeon.region]),
);
const dungeons = upstreamDungeons.map((dungeon) => {
  if (dungeon.id === 0) return dungeon;

  const { id, name, ...details } = dungeon;
  // Keep the region of known dungeons and use "무릉" for new ones.
  return { id, name, region: regions.get(id) ?? "무릉", ...details };
});

/// 무기 복사
const [weapons, fourStarWeapons] = await Promise.all([
  readJson(path.join(upstream, "weapons.json")),
  readJson(path.join(upstream, "weapons_4star.json")),
]);

const allWeapons = [...weapons, ...fourStarWeapons].map((weapon) => {
  const {
    name,
    // weapons_4star.json currently omits star, so treat it as 4 by default.
    star = 4,
    image_name,
    signature_weapon,
    options,
    ...rest
  } = weapon;
  const option = Array.isArray(options) ? options[0] : options;
  const basic = ["민첩", "힘", "의지", "지능"].includes(option.basic)
    ? `${option.basic} 증가`
    : option.basic;

  return {
    name,
    star,
    image_name,
    ...(signature_weapon ? { signature_weapon } : {}),
    ...rest,
    options: { ...option, basic },
  };
});

const invalidWeapon = allWeapons.find(
  (weapon) => ![4, 5, 6].includes(weapon.star),
);
if (invalidWeapon) {
  throw new Error(`Invalid star for weapon: ${invalidWeapon.name}`);
}

await Promise.all([
  ...["characters", "dungeon_images", "weapon_images"].map(mirrorImages),
  writeJson(path.join(localData, "dungeon_data.json"), dungeons),
  ...[4, 5, 6].map((star) =>
    writeJson(
      path.join(localData, `weapons_${star}star.json`),
      allWeapons.filter((weapon) => weapon.star === star),
    ),
  ),
]);

console.log(`Sync completed.`);
