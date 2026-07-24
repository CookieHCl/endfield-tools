import type { Weapon } from "../lib/types";
import weapons4 from "./weapons_4star.json";
import weapons5 from "./weapons_5star.json";
import weapons6 from "./weapons_6star.json";

export const ALL_WEAPONS: Weapon[] = [
  ...(weapons4 as Weapon[]),
  ...(weapons5 as Weapon[]),
  ...(weapons6 as Weapon[]),
];
