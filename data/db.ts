import type { Dungeon, Weapon } from "../lib/types";
import dungeonData from "./dungeon_data.json";
import weapons4 from "./weapons_4star.json";
import weapons5 from "./weapons_5star.json";
import weapons6 from "./weapons_6star.json";

export const GLOBAL_BASICS: string[] =
  (dungeonData as any).find((d: any) => d.id === 0)?.basic ?? [];

export const DUNGEONS: Dungeon[] = (dungeonData as any).filter(
  (d: any) => d.id !== 0,
) as Dungeon[];

export const ALL_WEAPONS: Weapon[] = [
  ...(weapons4 as Weapon[]),
  ...(weapons5 as Weapon[]),
  ...(weapons6 as Weapon[]),
];

