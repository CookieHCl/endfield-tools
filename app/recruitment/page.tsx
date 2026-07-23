"use client";

import { useEffect, useMemo, useState } from "react";
import { ImportExportButtons } from "@/components/import-export-buttons";

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

// 앞글자 검색에 사용할 전체 태그 id 목록
const ALL_TAG_IDS = TAG_GROUPS.flatMap((group) => group.tagIds);

// 성급 파생 태그: 5성 → 특별 채용, 6성 → 고급 특별 채용
const SENIOR_TAG = 14;
const TOP_TAG = 11;

// "가치 있는 조합" 정리에 쓸 태그: 특별채용/고급특별채용은 성급 파생 태그라 제외
const COMBO_TAG_IDS = ALL_TAG_IDS.filter(
  (id) => id !== TOP_TAG && id !== SENIOR_TAG,
);

// 성급별 색상 (6~4성은 weapons 페이지와 동일한 팔레트)
// base: 대표색 / text: 연한 배경 위에 얹는 진한 글자색 / badgeText: base 배경 위 글자색
const STAR_STYLES: Record<
  number,
  { base: string; text: string; badgeText: string }
> = {
  6: { base: "#ff7f00", text: "#9c4d00", badgeText: "#ffffff" },
  5: { base: "#ffba03", text: "#8a6500", badgeText: "#4a3600" },
  4: { base: "#9451f8", text: "#6d2fd6", badgeText: "#ffffff" },
  3: { base: "#5ac4fa", text: "#0c7bb3", badgeText: "#093f5c" },
  2: { base: "#9ccc65", text: "#55832a", badgeText: "#2f4a13" },
  1: { base: "#616161", text: "#474747", badgeText: "#ffffff" },
};

// 좁은 화면에서도 쓰기 편하도록 기본은 촘촘하게, sm 이상에서 넉넉하게.
const CHIP_BASE =
  "whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-all sm:px-3.5 sm:py-1.5 sm:text-sm";
// 그룹 한 줄: 라벨을 항상 왼쪽에 두고 태그가 오른쪽에서 줄바꿈 (세로 공간 절약)
const GROUP_ROW =
  "flex items-start gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3.5";
const GROUP_TAGS = "flex flex-wrap gap-1.5 pt-px sm:gap-2";
const GROUP_LABEL_BASE =
  "w-11 shrink-0 rounded-lg border py-1 text-center text-xs font-bold sm:w-14 sm:py-1.5 sm:text-sm";

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

// 같은 가치(보장 성급 + 1성 저격 여부)를 지니는 태그 조합 묶음
interface ValueGroup {
  key: string;
  label: string;
  min: number;
  boosted: boolean;
  combos: number[][];
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

function StarBadge({ star }: { star: number }) {
  const style = STAR_STYLES[star];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold"
      style={{ backgroundColor: style.base, color: style.badgeText }}
    >
      {star}★
    </span>
  );
}

function CharChip({ char }: { char: RecruitChar }) {
  const style = STAR_STYLES[char.star];
  return (
    <span
      title={`${char.star}성` + (char.pubOnly ? " · 공개모집 한정" : "")}
      className="relative inline-flex items-center overflow-hidden whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-semibold"
      style={{
        backgroundColor: `${style.base}1f`,
        borderColor: `${style.base}80`,
        color: style.text,
      }}
    >
      {char.pubOnly && (
        <span
          className="absolute bottom-0 right-0 h-0 w-0 border-b-[7px] border-l-[7px] border-l-transparent opacity-70"
          style={{ borderBottomColor: style.text }}
        />
      )}
      {char.name}
    </span>
  );
}

export default function RecruitmentPage() {
  const [data, setData] = useState<RecruitmentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  // 앞글자 검색용 텍스트 (한글 5글자까지)
  const [tagFilter, setTagFilter] = useState("");
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

  // 태그 선택과 무관하게, "3성 이하 무시"에 걸리지 않는(= 3성 + 1성 저격 이상)
  // 모든 태그 조합을 가치별로 묶어 정리 (누가 등장하는지는 무시하고 조합만)
  const valueGroups = useMemo<ValueGroup[]>(() => {
    if (!data || recruitChars.length === 0) return [];

    // 특별채용/고급특별채용을 뺀 태그로 만들 수 있는 1~3개 조합 전체
    const tagCombos: number[][] = [];
    const n = COMBO_TAG_IDS.length;
    for (let a = 0; a < n; a++) {
      tagCombos.push([COMBO_TAG_IDS[a]]);
      for (let b = a + 1; b < n; b++) {
        tagCombos.push([COMBO_TAG_IDS[a], COMBO_TAG_IDS[b]]);
        for (let c = b + 1; c < n; c++) {
          tagCombos.push([COMBO_TAG_IDS[a], COMBO_TAG_IDS[b], COMBO_TAG_IDS[c]]);
        }
      }
    }

    // 가치 순위: 보장 성급이 높을수록, 같은 성급이면 1성 저격이 붙을수록 높음
    const rankOf = (min: number, boosted: boolean) =>
      min * 2 + (boosted ? 1 : 0);
    // 태그 순서와 무관하게 조합을 식별하는 키
    const comboKey = (tags: number[]) =>
      [...tags].sort((a, b) => a - b).join(",");

    // 조합별 보장 성급/1성 저격 여부 평가 (combos useMemo와 동일 규칙)
    const rankByKey = new Map<string, number>();
    const evaluated: {
      tags: number[];
      min: number;
      boosted: boolean;
      rank: number;
    }[] = [];
    for (const comb of tagCombos) {
      let chars = recruitChars.filter((char) =>
        comb.every((tag) => char.tagSet.has(tag)),
      );
      // 고급 특별 채용 태그 없이는 6성이 등장하지 않음
      chars = chars.filter((char) => char.star !== 6);
      if (chars.length === 0) continue;

      let scoreChars = chars.filter((char) => char.star >= 3);
      if (scoreChars.length === 0) scoreChars = chars;
      const min = Math.min(...scoreChars.map((char) => char.star));
      const boosted =
        !chars.some((char) => char.star === 2) &&
        chars.some(
          (char) => char.star === 1 && !deselected1Star.includes(char.id),
        );

      const rank = rankOf(min, boosted);
      rankByKey.set(comboKey(comb), rank);
      evaluated.push({ tags: comb, min, boosted, rank });
    }

    // 조합에서 태그를 뺀(= 부분집합) 조합들을 모두 열거
    const properSubsets = (tags: number[]) => {
      const subs: number[][] = [];
      for (let mask = 1; mask < (1 << tags.length) - 1; mask++) {
        subs.push(tags.filter((_, i) => mask & (1 << i)));
      }
      return subs;
    };

    const tagName = (id: number) => data.tagNamesKr[String(id)] ?? `#${id}`;

    const groupsMap = new Map<string, ValueGroup>();
    for (const combo of evaluated) {
      // "3성 이하 무시"에서 살아남는, 3성 + 1성 저격 이상의 가치만 유지
      if (!(combo.min >= 4 || (combo.min === 3 && combo.boosted))) continue;
      // 태그를 뺀 조합 중 가치가 같거나 높은 게 있으면 제외
      // (태그를 더해서 가치가 오르지 않으면 더 넓은 조합에 밀림)
      const dominated = properSubsets(combo.tags).some(
        (sub) => (rankByKey.get(comboKey(sub)) ?? -1) >= combo.rank,
      );
      if (dominated) continue;

      const key = `${combo.min}-${combo.boosted}`;
      let group = groupsMap.get(key);
      if (!group) {
        group = {
          key,
          label: combo.boosted
            ? `${combo.min}성 + 1성 저격`
            : `${combo.min}성`,
          min: combo.min,
          boosted: combo.boosted,
          combos: [],
        };
        groupsMap.set(key, group);
      }
      group.combos.push(combo.tags);
    }

    const groups = Array.from(groupsMap.values());
    for (const group of groups) {
      group.combos.sort(
        (a, b) =>
          a.length - b.length ||
          a.map(tagName).join().localeCompare(b.map(tagName).join(), "ko-KR"),
      );
    }

    // 가치 높은 순 (보장 성급 내림차순, 같은 성급이면 1성 저격 우선)
    groups.sort(
      (a, b) => b.min - a.min || Number(b.boosted) - Number(a.boosted),
    );
    return groups;
  }, [data, recruitChars, deselected1Star]);

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

  // 앞글자별 후보 태그 목록 (앞글자가 같은 태그가 여럿이면 직접 고르도록 하이라이트)
  const highlightedTags = useMemo(() => {
    const highlight = new Set<number>();
    if (!data || !tagFilter) return highlight;
    for (const ch of Array.from(tagFilter)) {
      const matches = ALL_TAG_IDS.filter(
        (id) => (data.tagNamesKr[String(id)] ?? "")[0] === ch,
      );
      if (matches.length > 1) matches.forEach((id) => highlight.add(id));
    }
    return highlight;
  }, [data, tagFilter]);

  // 텍스트 입력 시 기존 선택을 모두 취소하고 앞글자가 유일하게 일치하는 태그만 자동 선택
  const handleTagFilterChange = (value: string) => {
    const chars = Array.from(value).slice(0, MAX_SELECTED_TAGS);
    setTagFilter(chars.join(""));
    if (!data) {
      setSelectedTags([]);
      return;
    }
    const selected: number[] = [];
    for (const ch of chars) {
      const matches = ALL_TAG_IDS.filter(
        (id) => (data.tagNamesKr[String(id)] ?? "")[0] === ch,
      );
      // 앞글자가 유일한 경우에만 자동 선택 (여럿이면 하이라이트만 하고 직접 선택)
      if (matches.length === 1 && !selected.includes(matches[0])) {
        selected.push(matches[0]);
      }
    }
    setSelectedTags(selected);
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


  return (
    <div className="min-h-screen bg-zinc-50 py-6 px-3 text-zinc-900 sm:py-10 sm:px-4">
      <main className="mx-auto flex max-w-5xl flex-col gap-4 sm:gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-bold sm:text-2xl">공개모집 계산기</h1>
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
          <section className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            데이터를 불러오지 못했습니다: {error}
          </section>
        )}

        {!data && !error && (
          <section className="animate-pulse rounded-xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-400 shadow-sm">
            데이터 불러오는 중...
          </section>
        )}

        {data && (
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            {/* 개인 설정 (태그 선택보다 위) --------------------------------- */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/70 px-3 py-2.5 sm:px-5 sm:py-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                개인 설정
                <span className="ml-2 font-medium normal-case tracking-normal text-zinc-400">
                  브라우저에 자동 저장
                </span>
              </span>
              <ImportExportButtons />
            </div>

            <div className="flex flex-col divide-y divide-zinc-100">
              <div className={GROUP_ROW}>
                <span
                  className={
                    GROUP_LABEL_BASE +
                    " border-indigo-200 bg-indigo-50 text-indigo-700"
                  }
                  title="2성 없이 선택된 1성이 포함된 조합은 같은 보장 성급 내에서 우선 표시됩니다."
                >
                  1성
                </span>
                <div className={GROUP_TAGS}>
                  {oneStarChars.map((char) => {
                    const selected = !deselected1Star.includes(char.id);
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => toggleOneStar(char.id)}
                        className={
                          CHIP_BASE +
                          " " +
                          (selected
                            ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                            : "border-zinc-300 bg-white text-zinc-400 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700")
                        }
                      >
                        {char.name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className={GROUP_ROW}>
                <span
                  className={
                    GROUP_LABEL_BASE +
                    " border-indigo-200 bg-indigo-50 text-indigo-700"
                  }
                >
                  설정
                </span>
                <div className={GROUP_TAGS}>
                  <button
                    type="button"
                    onClick={() => setIgnoreLowRarity((prev) => !prev)}
                    title="보장 성급이 3성 이하인 조합을 숨깁니다. (1성 우선 조합은 계속 표시)"
                    className={
                      CHIP_BASE +
                      " " +
                      (ignoreLowRarity
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-zinc-300 bg-white text-zinc-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700")
                    }
                  >
                    3성 이하 무시
                  </button>
                </div>
              </div>
            </div>

            {/* 태그 선택 --------------------------------------------------- */}
            <div className="flex flex-wrap items-center gap-2 border-y border-zinc-200 bg-zinc-50/70 px-3 py-2.5 sm:px-5 sm:py-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold uppercase tracking-wider text-zinc-500">
                  태그 선택
                </span>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-bold " +
                    (selectedTags.length > 0
                      ? "bg-teal-600 text-white"
                      : "bg-zinc-200 text-zinc-500")
                  }
                >
                  {selectedTags.length}/{MAX_SELECTED_TAGS}
                </span>
              </div>
              <input
                type="text"
                value={tagFilter}
                onChange={(e) => handleTagFilterChange(e.target.value)}
                maxLength={MAX_SELECTED_TAGS}
                placeholder="앞글자 입력"
                className="min-w-0 flex-1 basis-32 rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-700 placeholder:text-zinc-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 sm:basis-40"
              />
              <button
                type="button"
                onClick={() => {
                  setSelectedTags([]);
                  setTagFilter("");
                }}
                disabled={selectedTags.length === 0 && tagFilter === ""}
                className="whitespace-nowrap rounded-full border border-zinc-300 bg-white px-3 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                선택 초기화
              </button>
            </div>

            <div className="flex flex-col divide-y divide-zinc-100">
              {TAG_GROUPS.map((group) => (
                <div key={group.label} className={GROUP_ROW}>
                  <span
                    className={
                      GROUP_LABEL_BASE +
                      " border-teal-200 bg-teal-50 text-teal-700"
                    }
                  >
                    {group.label}
                  </span>
                  <div className={GROUP_TAGS}>
                    {group.tagIds.map((tagId) => {
                      const selected = selectedTags.includes(tagId);
                      const highlighted =
                        !selected && highlightedTags.has(tagId);
                      return (
                        <button
                          key={tagId}
                          type="button"
                          onClick={() => toggleTag(tagId)}
                          className={
                            CHIP_BASE +
                            " " +
                            (selected
                              ? "border-teal-600 bg-teal-600 text-white shadow-sm"
                              : highlighted
                                ? "border-amber-500 bg-amber-50 text-amber-700 ring-2 ring-amber-300 hover:bg-amber-100"
                                : "border-zinc-300 bg-white text-zinc-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700")
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
          </section>
        )}

        {data && (
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/70 px-3 py-2.5 sm:px-5 sm:py-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                조합별 결과
                <span className="ml-2 font-medium normal-case tracking-normal text-zinc-400">
                  {combos.length}개 조합
                </span>
              </span>
              <div className="flex items-center gap-1">
                {[6, 5, 4, 3, 2, 1].map((star) => (
                  <StarBadge key={star} star={star} />
                ))}
              </div>
            </div>

            {selectedTags.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-zinc-400">
                태그를 선택하면 조합별 등장 가능 오퍼레이터가 표시됩니다.
              </div>
            ) : combos.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm font-medium text-red-600">
                선택한 태그로 등장 가능한 오퍼레이터가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="w-8 border-b border-zinc-200 px-2.5 py-2 text-left sm:w-10 sm:px-4 sm:py-2.5">
                        #
                      </th>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left sm:w-60 sm:px-3 sm:py-2.5">
                        태그
                      </th>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left sm:w-24 sm:px-3 sm:py-2.5">
                        보장
                      </th>
                      <th className="border-b border-zinc-200 px-2 py-2 text-left sm:px-3 sm:py-2.5">
                        오퍼레이터
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {combos.map((combo, i) => (
                      <tr
                        key={combo.tags.join("-")}
                        className="border-b border-zinc-100 transition-colors last:border-b-0 hover:bg-zinc-50/70"
                      >
                        <td className="px-2.5 py-2 align-top text-xs font-medium text-zinc-400 sm:px-4 sm:py-2.5">
                          {i + 1}
                        </td>
                        <td className="px-2 py-2 align-top sm:px-3 sm:py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {combo.tags.map((tagId) => (
                              <span
                                key={tagId}
                                className="whitespace-nowrap rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700"
                              >
                                {data.tagNamesKr[String(tagId)] ?? `#${tagId}`}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top sm:px-3 sm:py-2.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <StarBadge star={combo.min} />
                            {combo.boosted && (
                              <span
                                title="2성 없이 선택된 1성이 포함된 조합"
                                className="rounded-md border border-zinc-400 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600"
                              >
                                1★ 저격
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top sm:px-3 sm:py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {combo.chars.map((char) => (
                              <CharChip key={char.id} char={char} />
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

        {data && valueGroups.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/70 px-3 py-2.5 sm:px-5 sm:py-3">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                가치 있는 태그 조합 총정리
                <span className="ml-2 font-medium normal-case tracking-normal text-zinc-400">
                  3성 + 1성 저격 이상
                </span>
              </span>
              <span className="text-xs text-zinc-400">
                {valueGroups.reduce((sum, g) => sum + g.combos.length, 0)}개 조합
              </span>
            </div>

            <div className="flex flex-col divide-y divide-zinc-100">
              {valueGroups.map((group) => (
                <div key={group.key} className="flex flex-col gap-2.5 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
                  <div className="flex items-center gap-2">
                    <StarBadge star={group.min} />
                    {group.boosted && (
                      <span
                        title="2성 없이 선택된 1성이 포함된 조합"
                        className="rounded-md border border-zinc-400 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600"
                      >
                        1★ 저격
                      </span>
                    )}
                    <span className="text-sm font-bold text-zinc-800">
                      {group.label}
                    </span>
                    <span className="text-xs font-medium text-zinc-400">
                      {group.combos.length}개
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.combos.map((combo) => (
                      <div
                        key={combo.join("-")}
                        className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5"
                      >
                        {combo.map((tagId, idx) => (
                          <span key={tagId} className="flex items-center gap-1">
                            {idx > 0 && (
                              <span className="text-zinc-300">+</span>
                            )}
                            <span className="whitespace-nowrap rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                              {data.tagNamesKr[String(tagId)] ?? `#${tagId}`}
                            </span>
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
