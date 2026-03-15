"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ALL_WEAPONS } from "../../data/db";
import { useOwnedWeapons } from "../owned-weapons-provider";

const STAR_COLORS: Record<number, string> = {
  4: "#9451f8",
  5: "#ffba03",
  6: "#ff7f00",
};

export default function WeaponsPage() {
  const { ownedNames, setOwnedNames, toggleOwned } = useOwnedWeapons();
  const [starFilter, setStarFilter] = useState<{ 4: boolean; 5: boolean; 6: boolean }>({
    4: false,
    5: true,
    6: true,
  });
  const [prioritizeOwned, setPrioritizeOwned] = useState(false);

  const handleExportJson = () => {
    try {
      const data = JSON.stringify(ownedNames, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "endfield-weapons-owned.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const handleImportJson = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed)) {
          const names = parsed.filter((v) => typeof v === "string");
          setOwnedNames(names);
        }
      } catch {
        // ignore parse errors
      }
    };
    reader.readAsText(file);
  };

  const toggleStarFilter = (star: 4 | 5 | 6) => {
    setStarFilter((prev) => ({
      ...prev,
      [star]: !prev[star],
    }));
  };

  const filteredAndSortedWeapons = useMemo(() => {
    const activeStars = (Object.entries(starFilter) as [string, boolean][])
      .filter(([, active]) => active)
      .map(([star]) => Number(star));

    const base = activeStars.length
      ? ALL_WEAPONS.filter((w) => activeStars.includes(w.star))
      : ALL_WEAPONS;

    return [...base].sort((a, b) => {
      const aOwned = ownedNames.includes(a.name);
      const bOwned = ownedNames.includes(b.name);

      // 1. 보유 여부 정렬 (옵션)
      if (prioritizeOwned && aOwned !== bOwned) {
        // 보유하지 않은 무기를 아래로 밀기
        return aOwned ? 1 : -1;
      }

      // 2. 등급 (6성, 5성, 4성 순)
      if (a.star !== b.star) {
        return b.star - a.star;
      }

      // 3. 무기 이름 (오름차순)
      return a.name.localeCompare(b.name, "ko-KR");
    });
  }, [ownedNames, starFilter, prioritizeOwned]);

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-bold">보유 무기 관리</h1>
              <p className="text-sm text-zinc-600">
                보유한 무기는 브라우저 로컬 스토리지 또는 JSON 파일로 저장/복원할 수 있습니다.
              </p>
              <p className="text-xs text-zinc-500">
                현재 보유: {ownedNames.length} / {ALL_WEAPONS.length}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-[11px]">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  JSON 내보내기
                </button>
                <label className="inline-flex cursor-pointer items-center rounded-full border border-zinc-300 bg-white px-3 py-1 font-medium text-zinc-700 transition-colors hover:bg-zinc-50">
                  JSON 불러오기
                  <input
                    type="file"
                    accept="application/json"
                    className="hidden"
                    onChange={(e) => handleImportJson(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
          </div>
        </header>

        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="mr-2 text-[11px] font-semibold text-zinc-600">
                등급 표시
              </span>
              {[4, 5, 6].map((star) => {
                const active = starFilter[star as 4 | 5 | 6];
                const color = STAR_COLORS[star] ?? "#e5e5e5";
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => toggleStarFilter(star as 4 | 5 | 6)}
                    className={
                      "rounded-full px-3 py-1 text-[11px] font-medium transition-colors " +
                      (active
                        ? "text-zinc-900"
                        : "bg-white text-zinc-500 hover:bg-zinc-50")
                    }
                    style={
                      active
                        ? { backgroundColor: color, borderColor: color }
                        : { borderColor: color }
                    }
                  >
                    {star}성 표시
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setPrioritizeOwned((prev) => !prev)}
              className={
                "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors " +
                (prioritizeOwned
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50")
              }
            >
              미보유 우선
            </button>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="w-64 border-b border-zinc-200 px-3 py-2 text-left">
                    무기
                  </th>
                  <th className="w-24 border-b border-zinc-200 px-3 py-2 text-left">
                    등급
                  </th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left">
                    기질
                  </th>
                  <th className="w-40 border-b border-zinc-200 px-3 py-2 text-left">
                    전무
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedWeapons.map((weapon) => {
                  const owned = ownedNames.includes(weapon.name);
                  const color = STAR_COLORS[weapon.star] ?? "#e5e5e5";

                  return (
                    <tr
                      key={weapon.name}
                      className={
                        "cursor-pointer border-b last:border-b-0 transition-colors " +
                        (owned ? "text-white" : "bg-white text-zinc-900")
                      }
                      style={
                        owned
                          ? { backgroundColor: color, borderColor: color }
                          : { borderColor: color }
                      }
                      onClick={() => toggleOwned(weapon.name)}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-12 overflow-hidden rounded-md bg-zinc-100">
                            <Image
                              src={`${process.env.PAGES_BASE_PATH || ''}/weapon_images/${weapon.image_name}`}
                              alt={weapon.name}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium">{weapon.name}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        <span
                          className="inline-flex items-center rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold"
                          style={{ color }}
                        >
                          {weapon.star}성
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-zinc-700">
                        {weapon.options.basic ? (
                          <span>
                            {weapon.options.basic} / {weapon.options.additional} /{" "}
                            {weapon.options.skill}
                          </span>
                        ) : (
                          <span className="text-zinc-400">옵션 정보 없음</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-zinc-700">
                        {weapon.signature_weapon ? (
                          <div className="flex items-center gap-2">
                            <div className="relative h-10 w-10 overflow-hidden rounded-md bg-zinc-100">
                              <Image
                                src={`${process.env.PAGES_BASE_PATH || ''}/characters/${weapon.signature_weapon}`}
                                alt={`${weapon.name} 전무`}
                                fill
                                sizes="40px"
                                className="object-cover"
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-zinc-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

