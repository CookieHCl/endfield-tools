import type { Dungeon } from "../lib/types";
import dungeonData from "./dungeon_data.json";

export const GLOBAL_BASICS: string[] =
  (dungeonData as any).find((d: any) => d.id === 0)?.basic ?? [];

export const DUNGEONS: Dungeon[] = (dungeonData as any).filter(
  (d: any) => d.id !== 0,
) as Dungeon[];
