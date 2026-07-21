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

export const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));
export const RECIPE_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
export const ICON_BY_ID = new Map(ICONS.map((icon) => [icon.id, icon]));

/** 아이템 id에 대응하는 영어 이름 (없으면 id 그대로) */
export function itemName(id: string): string {
  return ITEM_BY_ID.get(id)?.name ?? id;
}
