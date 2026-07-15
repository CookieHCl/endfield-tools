"use client";

import { useEffect, useMemo, useState } from "react";

// 명일방주 원작 데이터 (arkntools.app이 쓰는 데이터 소스, GitHub Pages라 CORS 허용됨)
const DATA_BASE = "https://data.arkntools.app";

// 공개모집 태그 그룹 (id는 locales/kr/tag.json 기준)
const TAG_GROUPS = [
  { label: "자격", tagIds: [11, 14, 17, 28] },
  { label: "직업", tagIds: [1, 2, 3, 4, 5, 6, 7, 8] },
  { label: "배치", tagIds: [9, 10] },
  {
    label: "특성",
    tagIds: [12, 13, 15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29],
  },
];

// 게임에서 한 번에 고를 수 있는 태그 수
const MAX_SELECTED_TAGS = 5;

// 성급 파생 태그: 5성 → 특별 채용, 6성 → 고급 특별 채용
const SENIOR_TAG = 14;
const TOP_TAG = 11;

// 성급별 색상 (원본 arkntools와 동일한 material 팔레트)
const STAR_COLORS: Record<number, string> = {
  6: "#d32f2f",
  5: "#e65100",
  4: "#0097a7",
  3: "#388e3c",
  2: "#5d4037",
  1: "#616161",
};

interface CheckInfo {
  mapMd5: string;
  timestamp: number;
  version: string;
}

interface CharacterInfo {
  appellation: string;
  star: number;
  recruitment: Record<string, number>;
  position: number;
  profession: number;
  tags: number[];
}

interface RecruitmentData {
  check: CheckInfo;
  characters: Record<string, CharacterInfo>;
  charNamesKr: Record<string, string>;
  tagNamesKr: Record<string, string>;
}

interface RecruitChar {
  id: string;
  name: string;
  star: number;
  // 공개모집으로만 얻을 수 있는 오퍼 (recruitment.kr === 2)
  pubOnly: boolean;
  tagSet: Set<number>;
  ownTagCount: number;
}

interface Combo {
  tags: number[];
  chars: RecruitChar[];
  min: number;
  score: number;
  // 2성 없이 선택된 1성이 포함된 조합 → 같은 보장 성급 내에서 우선 표시
  boosted: boolean;
}

// 개인 설정 (localStorage 저장 + JSON 내보내기/불러오기)
const SETTINGS_STORAGE_KEY = "recruitmentSettings";

interface RecruitSettings {
  deselected1Star: string[];
  ignoreLowRarity: boolean;
}

// "data/character.json" + "23071f1f" → "data/character.23071f1f.json"
function hashedPath(path: string, hash: string): string {
  const dotIndex = path.lastIndexOf(".");
  return `${path.slice(0, dotIndex)}.${hash}${path.slice(dotIndex)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} 요청 실패 (HTTP ${res.status})`);
  }
  return res.json();
}

async function fetchRecruitmentData(): Promise<RecruitmentData> {
  const check = await fetchJson<CheckInfo>(`${DATA_BASE}/check.json`);
  const map = await fetchJson<Record<string, string>>(
    `${DATA_BASE}/map.${check.mapMd5}.json`,
  );

  const fetchMapped = <T,>(path: string): Promise<T> => {
    const hash = map[path];
    if (!hash) {
      throw new Error(`파일 맵에 ${path} 항목이 없습니다.`);
    }
    return fetchJson<T>(`${DATA_BASE}/${hashedPath(path, hash)}`);
  };

  const [characters, charNamesKr, tagNamesKr] = await Promise.all([
    fetchMapped<Record<string, CharacterInfo>>("data/character.json"),
    fetchMapped<Record<string, string>>("locales/kr/character.json"),
    fetchMapped<Record<string, string>>("locales/kr/tag.json"),
  ]);

  return { check, characters, charNamesKr, tagNamesKr };
}

export default function RecruitmentPage() {
  const [data, setData] = useState<RecruitmentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  // 새로 추가되는 1성 오퍼가 기본 선택되도록 "선택 해제된 목록"을 저장
  const [deselected1Star, setDeselected1Star] = useState<string[]>([]);
  const [ignoreLowRarity, setIgnoreLowRarity] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<RecruitSettings>;
        if (Array.isArray(parsed.deselected1Star)) {
          setDeselected1Star(
            parsed.deselected1Star.filter((v) => typeof v === "string"),
          );
        }
        if (typeof parsed.ignoreLowRarity === "boolean") {
          setIgnoreLowRarity(parsed.ignoreLowRarity);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const settings: RecruitSettings = { deselected1Star, ignoreLowRarity };
      window.localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(settings),
      );
    } catch {
      // ignore storage errors
    }
  }, [deselected1Star, ignoreLowRarity]);

  useEffect(() => {
    let cancelled = false;
    fetchRecruitmentData()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 한국 서버에서 공개모집으로 등장하는 오퍼 목록 (유효 태그 = tags + 직업 + 배치 + 성급 파생 태그)
  const recruitChars = useMemo<RecruitChar[]>(() => {
    if (!data) return [];
    return Object.entries(data.characters)
      .filter(([, char]) => "kr" in char.recruitment)
      .map(([id, char]) => {
        const tagSet = new Set([...char.tags, char.profession, char.position]);
        if (char.star === 5) tagSet.add(SENIOR_TAG);
        if (char.star === 6) tagSet.add(TOP_TAG);
        return {
          id,
          name: data.charNamesKr[id] ?? char.appellation,
          star: char.star,
          pubOnly: char.recruitment.kr === 2,
          tagSet,
          ownTagCount: char.tags.length,
        };
      })
      .sort((a, b) => b.star - a.star || a.name.localeCompare(b.name, "ko-KR"));
  }, [data]);

  // 선택한 태그의 1~3개 조합별 등장 가능 오퍼 (원본 arkntools Hr.vue 로직 포팅)
  const combos = useMemo<Combo[]>(() => {
    if (!data || selectedTags.length === 0) return [];

    const avgCharTag =
      recruitChars.reduce((sum, char) => sum + char.ownTagCount + 2, 0) /
      Object.keys(data.tagNamesKr).length;

    const result: Combo[] = [];
    for (let mask = 1; mask < 1 << selectedTags.length; mask++) {
      const comb = selectedTags.filter((_, i) => mask & (1 << i));
      if (comb.length > 3) continue;

      let chars = recruitChars.filter((char) =>
        comb.every((tag) => char.tagSet.has(tag)),
      );
      // 고급 특별 채용 태그 없이는 6성이 등장하지 않음
      if (!comb.includes(TOP_TAG)) {
        chars = chars.filter((char) => char.star !== 6);
      }
      if (chars.length === 0) continue;

      // 보장 성급/점수는 3성 이상 기준 (1~2성은 모집 시간 조건이라 보장에서 제외)
      let scoreChars = chars.filter((char) => char.star >= 3);
      if (scoreChars.length === 0) scoreChars = chars;

      const score =
        scoreChars.reduce((sum, char) => sum + char.star, 0) /
          scoreChars.length -
        comb.length / 10 -
        scoreChars.length / avgCharTag;
      const min = Math.min(...scoreChars.map((char) => char.star));

      const boosted =
        !chars.some((char) => char.star === 2) &&
        chars.some(
          (char) => char.star === 1 && !deselected1Star.includes(char.id),
        );

      // 3성 이하 무시: 보장 성급이 3성 이하인 조합을 숨김 (1성 우선 조합은 유지)
      if (ignoreLowRarity && min <= 3 && !boosted) continue;

      result.push({ tags: comb, chars, min, score, boosted });
    }

    result.sort(
      (a, b) =>
        b.min - a.min ||
        Number(b.boosted) - Number(a.boosted) ||
        b.score - a.score,
    );
    return result;
  }, [data, recruitChars, selectedTags, deselected1Star, ignoreLowRarity]);

  const toggleTag = (tagId: number) => {
    setSelectedTags((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }
      if (prev.length >= MAX_SELECTED_TAGS) {
        return prev;
      }
      return [...prev, tagId];
    });
  };

  const oneStarChars = useMemo(
    () => recruitChars.filter((char) => char.star === 1),
    [recruitChars],
  );

  const toggleOneStar = (id: string) => {
    setDeselected1Star((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const handleExportSettings = () => {
    try {
      const settings: RecruitSettings = { deselected1Star, ignoreLowRarity };
      const json = JSON.stringify(settings, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "endfield-recruitment-settings.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const handleImportSettings = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(
          String(reader.result),
        ) as Partial<RecruitSettings>;
        if (Array.isArray(parsed.deselected1Star)) {
          setDeselected1Star(
            parsed.deselected1Star.filter((v) => typeof v === "string"),
          );
        }
        if (typeof parsed.ignoreLowRarity === "boolean") {
          setIgnoreLowRarity(parsed.ignoreLowRarity);
        }
      } catch {
        // ignore parse errors
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">공개모집 계산기</h1>
          <p className="text-sm text-zinc-600">
            명일방주 원작의 공개모집 계산기입니다. 데이터는{" "}
            <a
              href="https://github.com/arkntools/arknights-toolbox-data"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-zinc-900"
            >
              arkntools/arknights-toolbox-data
            </a>
            에서 가져옵니다.
          </p>
          {data && (
            <p className="text-xs text-zinc-500">
              데이터 버전: {data.check.version} (
              {new Date(data.check.timestamp).toLocaleString("ko-KR")} 기준) ·
              오퍼레이터 {Object.keys(data.characters).length}명 (공개모집{" "}
              {recruitChars.length}명)
            </p>
          )}
        </header>

        {error && (
          <section className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            데이터를 불러오지 못했습니다: {error}
          </section>
        )}

        {!data && !error && (
          <section className="rounded-lg border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 shadow-sm">
            데이터 불러오는 중...
          </section>
        )}

        {data && (
          <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 text-xs">
              <span className="font-semibold text-zinc-600">
                태그 선택 ({selectedTags.length}/{MAX_SELECTED_TAGS})
              </span>
              <button
                type="button"
                onClick={() => setSelectedTags([])}
                disabled={selectedTags.length === 0}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                선택 초기화
              </button>
            </div>
            <div className="flex flex-col divide-y divide-zinc-100">
              {TAG_GROUPS.map((group) => (
                <div
                  key={group.label}
                  className="flex items-start gap-4 px-4 py-3"
                >
                  <span className="w-14 shrink-0 rounded-md bg-teal-600 py-2 text-center text-sm font-semibold text-white">
                    {group.label}
                  </span>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {group.tagIds.map((tagId) => {
                      const selected = selectedTags.includes(tagId);
                      return (
                        <button
                          key={tagId}
                          type="button"
                          onClick={() => toggleTag(tagId)}
                          className={
                            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                            (selected
                              ? "bg-teal-600 text-white"
                              : "bg-[#d8cfc7] text-zinc-800 hover:bg-[#c9beb4]")
                          }
                        >
                          {data.tagNamesKr[String(tagId)] ?? `#${tagId}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 태그와 구분되는 개인 설정 영역 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-y border-zinc-200 bg-zinc-50 px-4 py-3 text-xs">
              <span className="font-semibold text-zinc-600">
                개인 설정 (브라우저에 자동 저장)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportSettings}
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  JSON 내보내기
                </button>
                <label className="inline-flex cursor-pointer items-center rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
                  JSON 불러오기
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) =>
                      handleImportSettings(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-col divide-y divide-zinc-100">
              <div className="flex items-start gap-4 px-4 py-3">
                <span
                  className="w-14 shrink-0 rounded-md bg-indigo-600 py-2 text-center text-sm font-semibold text-white"
                  title="2성 없이 선택된 1성이 포함된 조합은 같은 보장 성급 내에서 우선 표시됩니다."
                >
                  1성
                </span>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {oneStarChars.map((char) => {
                    const selected = !deselected1Star.includes(char.id);
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => toggleOneStar(char.id)}
                        className={
                          "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                          (selected
                            ? "bg-indigo-600 text-white"
                            : "bg-[#d8cfc7] text-zinc-800 hover:bg-[#c9beb4]")
                        }
                      >
                        {char.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-start gap-4 px-4 py-3">
                <span className="w-14 shrink-0 rounded-md bg-indigo-600 py-2 text-center text-sm font-semibold text-white">
                  설정
                </span>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setIgnoreLowRarity((prev) => !prev)}
                    title="보장 성급이 3성 이하인 조합을 숨깁니다. (1성 우선 조합은 계속 표시)"
                    className={
                      "rounded-md px-4 py-1.5 text-sm font-medium transition-colors " +
                      (ignoreLowRarity
                        ? "bg-indigo-600 text-white"
                        : "bg-[#d8cfc7] text-zinc-800 hover:bg-[#c9beb4]")
                    }
                  >
                    3성 이하 무시
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {data && (
          <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-4 py-3 text-xs font-semibold text-zinc-600">
              조합별 결과 ({combos.length}개 조합)
            </div>
            {selectedTags.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                태그를 선택하면 조합별 등장 가능 오퍼레이터가 표시됩니다.
              </div>
            ) : combos.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                선택한 태그로 등장 가능한 오퍼레이터가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                    <tr>
                      <th className="w-10 border-b border-zinc-200 px-3 py-2 text-left">
                        #
                      </th>
                      <th className="w-64 border-b border-zinc-200 px-3 py-2 text-left">
                        태그
                      </th>
                      <th className="w-16 border-b border-zinc-200 px-3 py-2 text-left">
                        보장
                      </th>
                      <th className="border-b border-zinc-200 px-3 py-2 text-left">
                        오퍼레이터
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {combos.map((combo, i) => (
                      <tr
                        key={combo.tags.join("-")}
                        className="border-b border-zinc-100 last:border-b-0"
                      >
                        <td className="px-3 py-2 align-top text-xs text-zinc-400">
                          {i + 1}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {combo.tags.map((tagId) => (
                              <span
                                key={tagId}
                                className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-medium text-white"
                              >
                                {data.tagNamesKr[String(tagId)] ?? `#${tagId}`}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className="rounded-md px-2 py-1 text-xs font-semibold text-white"
                            style={{ backgroundColor: STAR_COLORS[combo.min] }}
                          >
                            {combo.min}★
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap gap-1.5">
                            {combo.chars.map((char) => (
                              <span
                                key={char.id}
                                title={
                                  `${char.star}성` +
                                  (char.pubOnly ? " · 공개모집 한정" : "")
                                }
                                className="relative overflow-hidden rounded-md px-2.5 py-1 text-xs font-medium text-white"
                                style={{ backgroundColor: STAR_COLORS[char.star] }}
                              >
                                {char.pubOnly && (
                                  <span className="absolute bottom-0 right-0 h-0 w-0 border-b-8 border-l-8 border-b-white/70 border-l-transparent" />
                                )}
                                {char.name}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
