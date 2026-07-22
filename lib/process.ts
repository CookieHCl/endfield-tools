// 공정(Process): 기존 레시피 여러 개를 묶어 만든 사용자 정의 "레시피".
// - 기존(기본) 레시피만 사용할 수 있다. 공정 안에 공정은 넣을 수 없다.
// - 공장 페이지에서는 processToRecipe로 변환해 일반 레시피처럼 쓴다.
import { RECIPE_BY_ID, type FactoryRecipe } from "@/data/factory-db";
import { cleanNumber } from "@/lib/factory";

// 공정에 담긴 레시피 한 줄. recipeId는 반드시 기본 레시피여야 한다.
export interface ProcessLine {
  id: string;
  recipeId: string;
  count: number;
}

export interface Process {
  id: string;
  name: string;
  icon: string; // 자원(아이템) id — 그 아이템 아이콘을 공정 아이콘으로 쓴다
  lines: ProcessLine[];
}

export const PROCESS_STORAGE_KEY = "factoryProcesses";
const PROCESS_ID_PREFIX = "process:";

/** 공정 id → 공장 페이지에서 쓰는 레시피 id */
export function processRecipeId(processId: string): string {
  return PROCESS_ID_PREFIX + processId;
}

/** 이 레시피 id가 공정(사용자 정의)인가 */
export function isProcessRecipeId(id: string): boolean {
  return id.startsWith(PROCESS_ID_PREFIX);
}

/**
 * 공정을 1개 돌렸을 때의 자원별 순생산(분당).
 * 양수 = 순산출(아웃풋), 음수 = 순소비(인풋).
 * 공정 안에 다른 공정이 들어와도(잘못된 데이터) 무시한다.
 */
export function processNet(process: Process): Map<string, number> {
  const net = new Map<string, number>();
  const add = (item: string, v: number) =>
    net.set(item, (net.get(item) ?? 0) + v);
  for (const line of process.lines) {
    if (isProcessRecipeId(line.recipeId)) continue; // 공정 중첩 금지
    const recipe = RECIPE_BY_ID.get(line.recipeId);
    if (!recipe) continue;
    const per = (60 / recipe.time) * line.count;
    for (const [item, qty] of Object.entries(recipe.out ?? {}))
      add(item, qty * per);
    for (const [item, qty] of Object.entries(recipe.in ?? {}))
      add(item, -qty * per);
  }
  return net;
}

/**
 * 공정을 공장 페이지에서 쓸 수 있는 레시피로 변환.
 * time=60으로 두어 in/out(분당 순량)이 수량 배수에 그대로 곱해지게 한다.
 * 순생산이 0인 자원은 in/out 어디에도 넣지 않는다(표시/계산 모두 제외).
 */
export function processToRecipe(process: Process): FactoryRecipe {
  const net = processNet(process);
  const inRec: Record<string, number> = {};
  const outRec: Record<string, number> = {};
  for (const [item, raw] of net) {
    const v = cleanNumber(raw);
    if (v > 0) outRec[item] = v;
    else if (v < 0) inRec[item] = -v;
    // v === 0 → 제외
  }
  return {
    id: processRecipeId(process.id),
    name: process.name,
    time: 60,
    in: inRec,
    out: outRec,
    icon: process.icon,
    category: "process",
    row: 0,
  };
}

function isValidProcess(p: unknown): p is Process {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.icon === "string" &&
    Array.isArray(o.lines)
  );
}

/** localStorage에서 공정 목록 로드 (형식이 안 맞으면 빈 배열) */
export function loadProcesses(): Process[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROCESS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidProcess);
  } catch {
    return [];
  }
}

/** 공정 목록을 localStorage에 저장 */
export function saveProcesses(processes: Process[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PROCESS_STORAGE_KEY,
      JSON.stringify(processes),
    );
  } catch {
    // ignore storage errors
  }
}
