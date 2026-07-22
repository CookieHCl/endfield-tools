// 세 페이지의 localStorage 데이터를 하나로 묶어 내보내기/불러오기 한다.
// 저장 자체는 각 페이지가 기존 키에 그대로 하고, 여기서는 그 키들을 모아 다룬다.
const KEYS = {
  ownedWeapons: "ownedWeapons",
  recruitmentSettings: "recruitmentSettings",
  factoryCalculator: "factoryCalculator",
  factoryProcesses: "factoryProcesses",
} as const;

export interface AppData {
  version: number;
  ownedWeapons?: unknown;
  recruitmentSettings?: unknown;
  factoryCalculator?: unknown;
  factoryProcesses?: unknown;
}

function readKey(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** 세 데이터를 하나의 JSON 문자열로 (없는 항목은 생략) */
export function exportAllData(): string {
  const data: AppData = {
    version: 1,
    ownedWeapons: readKey(KEYS.ownedWeapons),
    recruitmentSettings: readKey(KEYS.recruitmentSettings),
    factoryCalculator: readKey(KEYS.factoryCalculator),
    factoryProcesses: readKey(KEYS.factoryProcesses),
  };
  return JSON.stringify(data, null, 2);
}

/** 통합 JSON을 파일로 저장 */
export function downloadAllData(): void {
  const blob = new Blob([exportAllData()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "endfield-tools-data.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 통합 JSON을 localStorage에 반영. 파일에 있는 항목만 덮어쓴다(없는 건 유지).
 * 예전 단일 포맷(보유무기 배열 / 공개모집 설정 / 공장 상태)도 인식한다.
 * 반영에 성공하면 true.
 */
export function importAllData(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (parsed == null) return false;

  const set = (key: string, val: unknown) => {
    if (val !== undefined) localStorage.setItem(key, JSON.stringify(val));
  };

  // 예전 보유무기 파일: 최상위가 배열
  if (Array.isArray(parsed)) {
    set(KEYS.ownedWeapons, parsed);
    return true;
  }
  if (typeof parsed !== "object") return false;
  const obj = parsed as Record<string, unknown>;

  // 통합 파일
  if (
    "ownedWeapons" in obj ||
    "recruitmentSettings" in obj ||
    "factoryCalculator" in obj ||
    "factoryProcesses" in obj
  ) {
    set(KEYS.ownedWeapons, obj.ownedWeapons);
    set(KEYS.recruitmentSettings, obj.recruitmentSettings);
    set(KEYS.factoryCalculator, obj.factoryCalculator);
    set(KEYS.factoryProcesses, obj.factoryProcesses);
    return true;
  }

  // 예전 공개모집 설정 파일
  if ("deselected1Star" in obj || "ignoreLowRarity" in obj) {
    set(KEYS.recruitmentSettings, obj);
    return true;
  }

  // 예전 공장 파일
  if ("inputs" in obj || "lines" in obj || "vouchers" in obj) {
    set(KEYS.factoryCalculator, obj);
    return true;
  }

  return false;
}
