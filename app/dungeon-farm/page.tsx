"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ALL_WEAPONS, DUNGEONS, GLOBAL_BASICS } from "../../data/db";
import type { Dungeon, Weapon, WeaponOption } from "../../lib/types";
import { useOwnedWeapons } from "../owned-weapons-provider";

type FarmType = "additional" | "skill";

type FarmCombo = {
  id: string;
  dungeon: Dungeon;
  type: FarmType;
  basics: string[];
  fixedAttribute: string;
  fixedLabel: string;
  weapons: Weapon[];
};

type UnfarmableWeapon = {
  weapon: Weapon;
  basicFarmable: boolean;
  additionalFarmable: boolean;
  skillFarmable: boolean;
};

const STAR_COLORS: Record<number, string> = {
  4: "#9451f8",
  5: "#ffba03",
  6: "#ff7f00",
};

function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const n = arr.length;
  if (k > n) return result;

  const idx = Array.from({ length: k }, (_, i) => i);

  while (true) {
    result.push(idx.map((i) => arr[i]));

    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) {
      idx[j] = idx[j - 1] + 1;
    }
  }

  return result;
}

function optionMatchesAdditionalFarm(
  option: WeaponOption,
  basics: string[],
  fixedAdditional: string,
  dungeon: Dungeon,
): boolean {
  if (option.additional !== fixedAdditional) return false;
  if (!basics.includes(option.basic)) return false;
  if (!dungeon.skill_attributes.includes(option.skill)) return false;
  return true;
}

function optionMatchesSkillFarm(
  option: WeaponOption,
  basics: string[],
  fixedSkill: string,
  dungeon: Dungeon,
): boolean {
  if (option.skill !== fixedSkill) return false;
  if (!basics.includes(option.basic)) return false;
  if (!dungeon.additional_attributes.includes(option.additional)) return false;
  return true;
}

export default function DungeonFarmPage() {
  const { ownedNames } = useOwnedWeapons();
  const [starFilter, setStarFilter] = useState<{ 4: boolean; 5: boolean; 6: boolean }>({
    4: false,
    5: true,
    6: true,
  });

  const activeStars = useMemo(
    () =>
      (Object.entries(starFilter) as [string, boolean][])
        .filter(([, active]) => active)
        .map(([star]) => Number(star)),
    [starFilter],
  );

  const baseWeapons = useMemo<Weapon[]>(() => {
    const weapons = ALL_WEAPONS.filter((w) => activeStars.includes(w.star));

    return weapons.sort((a, b) => {
      if (b.star !== a.star) return b.star - a.star;
      return a.name.localeCompare(b.name);
    });
  }, [activeStars]);

  const combos = useMemo<FarmCombo[]>(() => {
    if (!GLOBAL_BASICS || GLOBAL_BASICS.length < 3) return [];

    const basicsCombos = combinations(GLOBAL_BASICS, 3);
    const result: FarmCombo[] = [];

    for (const dungeon of DUNGEONS) {
      // additional 고정 조합
      for (const basics of basicsCombos) {
        for (const addAttr of dungeon.additional_attributes) {
          const weapons = baseWeapons.filter((weapon) =>
            optionMatchesAdditionalFarm(
              weapon.options,
              basics,
              addAttr,
              dungeon,
            ),
          );

          if (weapons.length === 0) continue;

          result.push({
            id: `${dungeon.id}-add-${basics.join(",")}-${addAttr}`,
            dungeon,
            type: "additional",
            basics,
            fixedAttribute: addAttr,
            fixedLabel: "추가",
            weapons,
          });
        }
      }

      // skill 고정 조합
      for (const basics of basicsCombos) {
        for (const skillAttr of dungeon.skill_attributes) {
          const weapons = baseWeapons.filter((weapon) =>
            optionMatchesSkillFarm(
              weapon.options,
              basics,
              skillAttr,
              dungeon,
            ),
          );

          if (weapons.length === 0) continue;

          result.push({
            id: `${dungeon.id}-skill-${basics.join(",")}-${skillAttr}`,
            dungeon,
            type: "skill",
            basics,
            fixedAttribute: skillAttr,
            fixedLabel: "스킬",
            weapons,
          });
        }
      }
    }

    // 정렬: 미보유 무기 수 -> 보유 무기 수 -> 던전 id
    result.sort((a, b) => {
      const aUnowned = a.weapons.filter((w) => !ownedNames.includes(w.name))
        .length;
      const bUnowned = b.weapons.filter((w) => !ownedNames.includes(w.name))
        .length;

      if (aUnowned !== bUnowned) {
        return bUnowned - aUnowned;
      }

      const aOwned = a.weapons.length - aUnowned;
      const bOwned = b.weapons.length - bUnowned;

      if (aOwned !== bOwned) {
        return bOwned - aOwned;
      }

      return a.dungeon.id - b.dungeon.id;
    });

    return result;
  }, [baseWeapons, ownedNames]);

  const {
    farmableBasics,
    farmableAdditionals,
    farmableSkills,
    unfarmableWeapons,
  } = useMemo<{
    farmableBasics: string[];
    farmableAdditionals: string[];
    farmableSkills: string[];
    unfarmableWeapons: UnfarmableWeapon[];
  }>(() => {
    const basicsSet = new Set<string>();
    const additionalSet = new Set<string>();
    const skillSet = new Set<string>();

    for (const b of GLOBAL_BASICS) {
      basicsSet.add(b);
    }
    for (const dungeon of DUNGEONS) {
      for (const add of dungeon.additional_attributes) {
        additionalSet.add(add);
      }
      for (const sk of dungeon.skill_attributes) {
        skillSet.add(sk);
      }
    }

    const farmableBasics = Array.from(basicsSet).sort();
    const farmableAdditionals = Array.from(additionalSet).sort();
    const farmableSkills = Array.from(skillSet).sort();

    const unfarmableWeapons: UnfarmableWeapon[] = baseWeapons.map((weapon) => {
      const { basic, additional, skill } = weapon.options;
      const basicFarmable = basicsSet.has(basic);
      const additionalFarmable = additionalSet.has(additional);
      const skillFarmable = skillSet.has(skill);
      return {
        weapon,
        basicFarmable,
        additionalFarmable,
        skillFarmable,
      };
    }).filter(
      (w) =>
        !w.basicFarmable || !w.additionalFarmable || !w.skillFarmable,
    );

    return {
      farmableBasics,
      farmableAdditionals,
      farmableSkills,
      unfarmableWeapons,
    };
  }, [baseWeapons]);

  const toggleStarFilter = (star: 4 | 5 | 6) => {
    setStarFilter((prev) => ({
      ...prev,
      [star]: !prev[star],
    }));
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold">기질 파밍 장소</h1>
            <p className="text-sm text-zinc-600">
              각 던전에서 선택 가능한 기본 기질 3개와 추가/스킬 조합을 모두
              계산해서, 어떤 무기들의 기질을 파밍할 수 있는지 정리한 페이지입니다.
            </p>
            <p className="text-xs text-zinc-500">
              위에서부터{" "}
              <span className="font-semibold">
                보유하지 않은 무기를 가장 많이 파밍할 수 있는 조합
              </span>
              순으로 정렬되어 있습니다.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs">
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
          </div>
        </header>

        {unfarmableWeapons.length > 0 && (
          <section className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-semibold">
              경고! 아래 무기들은 파밍할 수 없습니다
            </p>
            <div className="mt-2 space-y-1 text-xs">
              <p>
                <span className="font-semibold">가능한 기초 속성:</span>{" "}
                {farmableBasics.join(" / ")}
              </p>
              <p>
                <span className="font-semibold">가능한 추가 속성:</span>{" "}
                {farmableAdditionals.join(" / ")}
              </p>
              <p>
                <span className="font-semibold">가능한 스킬 속성:</span>{" "}
                {farmableSkills.join(" / ")}
              </p>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              {unfarmableWeapons.map(
                ({
                  weapon,
                  basicFarmable,
                  additionalFarmable,
                  skillFarmable,
                }) => {
                  const { basic, additional, skill } = weapon.options;
                  return (
                    <p key={weapon.name}>
                      {weapon.name}
                      <span className="ml-1 text-[11px] text-red-800">
                        ({weapon.star}성)
                      </span>{" "}
                      /{" "}
                      {basicFarmable ? (
                        <span>{basic}</span>
                      ) : (
                        <span className="font-bold">{basic}</span>
                      )}{" "}
                      /{" "}
                      {additionalFarmable ? (
                        <span>{additional}</span>
                      ) : (
                        <span className="font-bold">{additional}</span>
                      )}{" "}
                      /{" "}
                      {skillFarmable ? (
                        <span>{skill}</span>
                      ) : (
                        <span className="font-bold">{skill}</span>
                      )}
                    </p>
                  );
                },
              )}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="w-60 border-b border-zinc-200 px-3 py-2 text-left">
                    던전
                  </th>
                  <th className="w-96 border-b border-zinc-200 px-3 py-2 text-left">
                    고정 옵션
                  </th>
                  <th className="border-b border-zinc-200 px-3 py-2 text-left">
                    무기 목록
                  </th>
                </tr>
              </thead>
              <tbody>
                {combos.map((combo) => (
                  <tr
                    key={combo.id}
                    className="border-b border-zinc-100 last:border-b-0 align-top"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-14 w-24 overflow-hidden rounded-md bg-zinc-100">
                          <Image
                            src={`/dungeon_images/${combo.dungeon.image_name}`}
                            alt={combo.dungeon.name}
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-semibold">
                            {combo.dungeon.name}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {combo.dungeon.region}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-700">
                      <span>{combo.basics.join(" / ") + " / "}</span>
                      <span className="font-bold">
                        {combo.fixedAttribute}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-700">
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const unowned = combo.weapons.filter(
                            (w) => !ownedNames.includes(w.name),
                          );
                          const owned = combo.weapons.filter((w) =>
                            ownedNames.includes(w.name),
                          );

                          return (
                            <>
                              {unowned.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {unowned.map((w) => {
                                    const color =
                                      STAR_COLORS[w.star] ?? "#e5e5e5";
                                    return (
                                      <span
                                        key={`unowned-${w.name}`}
                                        className="rounded-full border bg-white px-2 py-0.5 text-[11px]"
                                        style={{
                                          borderColor: color,
                                          color,
                                        }}
                                      >
                                        <span className="font-bold">
                                          {w.name}
                                        </span>
                                        : {w.options.basic} /{" "}
                                        {w.options.additional} /{" "}
                                        {w.options.skill}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {owned.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {owned.map((w) => {
                                    const color =
                                      STAR_COLORS[w.star] ?? "#e5e5e5";
                                    return (
                                      <span
                                        key={`owned-${w.name}`}
                                        className="rounded-full border px-2 py-0.5 text-[11px]"
                                        style={{
                                          backgroundColor: color,
                                          borderColor: color,
                                          color: "#ffffff",
                                        }}
                                      >
                                        <span className="font-bold">
                                          {w.name}
                                        </span>
                                        : {w.options.basic} /{" "}
                                        {w.options.additional} /{" "}
                                        {w.options.skill}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

