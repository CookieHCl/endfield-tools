import raw from "./factory_data.json";

export interface FactoryItem {
  id: string;
  name: string;
  stack?: number;
  category: string;
  row: number;
  icon: string;
}

export interface FactoryRecipe {
  id: string;
  name: string;
  time: number;
  in?: Record<string, number>;
  out?: Record<string, number>;
  producers?: string[];
  category: string;
  row: number;
  icon: string;
}

export interface FactoryIconData {
  id: string;
  position: string;
  color: string;
}

interface FactoryData {
  version: Record<string, string>;
  icons: FactoryIconData[];
  categories: { id: string; name: string; icon: string }[];
  items: FactoryItem[];
  recipes: FactoryRecipe[];
  locations: { id: string; name: string; icon: string }[];
}

const data = raw as unknown as FactoryData;

export const ITEMS = data.items;
export const RECIPES = data.recipes;
export const ICONS = data.icons;

/// 실제 자원 = 레시피 입력/출력에 한 번이라도 등장하는 아이템.
/// 설비·벨트(category machine/belt-and-pipe)는 레시피의 producers로만 쓰여 수지
/// 계산에 등장할 수 없으므로 자원 선택 목록에서 뺀다.
/// (아이콘으로만 쓰고 싶을 때는 ITEMS 전체를 쓴다 — 공정 아이콘 선택기.)
const RESOURCE_IDS = new Set(
  RECIPES.flatMap((recipe) => [
    ...Object.keys(recipe.in ?? {}),
    ...Object.keys(recipe.out ?? {}),
  ]),
);
export const RESOURCE_ITEMS = ITEMS.filter((item) => RESOURCE_IDS.has(item.id));

export const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));
export const RECIPE_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
export const ICON_BY_ID = new Map(ICONS.map((icon) => [icon.id, icon]));

/** 아이템 id에 대응하는 영어 이름 (없으면 id 그대로) */
export function itemName(id: string): string {
  return ITEM_BY_ID.get(id)?.name ?? id;
}
