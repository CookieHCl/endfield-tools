import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aefDir = process.argv[2];
if (!aefDir) {
  throw new Error(
    "Usage: node scripts/sync-endfield-factory-data.mjs <upstream-aef-dir>",
  );
}

/// helpers
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aef = path.resolve(aefDir);

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = (file, data) =>
  writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");

/// 원본은 이름이 중국어라 en 번역을 구워넣는다.
const [data, en] = await Promise.all([
  readJson(path.join(aef, "data.json")),
  readJson(path.join(aef, "i18n", "en.json")),
]);

/// 번역이 하나라도 빠지면 조용히 중국어가 배포되는 대신 여기서 터트려 CI에서 잡히게 한다.
const localize = (section, entries) =>
  entries.map((entry) => {
    const name = en[section]?.[entry.id];
    if (name == null) {
      throw new Error(`Missing en translation for ${section}: ${entry.id}`);
    }
    // Spread keeps the original key order; only the value of `name` changes.
    return { ...entry, name };
  });

/// 의미 없는 레시피는 버린다:
///  - 입력이 아예 없고 출력이 단 하나 (원자재 채취) — 공장 입력으로 넣으면 된다.
///  - 출력이 아예 없고 입력이 단 하나 (발전·폐수 처리) — 실제 가공이 아니다.
const isMeaninglessRecipe = (recipe) => {
  const ins = Object.keys(recipe.in ?? {}).length;
  const outs = Object.keys(recipe.out ?? {}).length;
  return (ins === 0 && outs === 1) || (outs === 0 && ins === 1);
};
const usefulRecipes = data.recipes.filter(
  (recipe) => !isMeaninglessRecipe(recipe),
);

/// data.json의 top-level 구조를 그대로 유지하되 이름만 영어로 바꾼다.
/// hash.json / ja,ru,zh 번역은 이 프로젝트에서 안 쓰므로 버린다.
const localized = {
  version: data.version,
  icons: data.icons, // 아이콘은 이름 필드가 없다.
  categories: localize("categories", data.categories),
  items: localize("items", data.items),
  recipes: localize("recipes", usefulRecipes),
  locations: localize("locations", data.locations),
  ...(data.limitations ? { limitations: data.limitations } : {}),
  ...(data.defaults ? { defaults: data.defaults } : {}),
};

/// icons.webp는 data.json의 icons[].position이 가리키는 스프라이트 시트라
/// 함께 가져와야 한다.
const iconsDestination = path.join(root, "public", "factory");
await mkdir(iconsDestination, { recursive: true });

await Promise.all([
  writeJson(path.join(root, "data", "factory_data.json"), localized),
  cp(
    path.join(aef, "icons.webp"),
    path.join(iconsDestination, "icons.webp"),
  ),
]);

console.log(
  `Sync completed: ${localized.items.length} items, ${localized.recipes.length} recipes.`,
);
