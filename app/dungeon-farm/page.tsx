"use client";

import Image from "next/image";
import { useMemo } from "react";
import { ALL_WEAPONS, DUNGEONS, GLOBAL_BASICS } from "../../data/db";
import type { Dungeon, Weapon, WeaponOption } from "../../lib/types";

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
  const combos = useMemo<FarmCombo[]>(() => {
    if (!GLOBAL_BASICS || GLOBAL_BASICS.length < 3) return [];

    const basicsCombos = combinations(GLOBAL_BASICS, 3);
    const result: FarmCombo[] = [];

    for (const dungeon of DUNGEONS) {
      // additional 고정 조합
      for (const basics of basicsCombos) {
        for (const addAttr of dungeon.additional_attributes) {
          const weapons = ALL_WEAPONS.filter((weapon) =>
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
          const weapons = ALL_WEAPONS.filter((weapon) =>
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

    // 무기 많이 나오는 순으로 정렬
    result.sort((a, b) => b.weapons.length - a.weapons.length);
    return result;
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">기질 파밍 장소</h1>
          <p className="text-sm text-zinc-600">
            각 던전에서 선택 가능한 기본 기질 3개와 추가/스킬 조합을 모두
            계산해서, 어떤 무기들의 기질을 파밍할 수 있는지 정리한 페이지입니다.
          </p>
          <p className="text-xs text-zinc-500">
            위에서부터{" "}
            <span className="font-semibold">더 많은 무기를 얻을 수 있는 조합</span>
            순으로 정렬되어 있습니다.
          </p>
        </header>

        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="max-h-[75vh] overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="w-60 border-b border-zinc-200 px-3 py-2 text-left">
                    던전
                  </th>
                  <th className="w-56 border-b border-zinc-200 px-3 py-2 text-left">
                    선택 basic 3개
                  </th>
                  <th className="w-40 border-b border-zinc-200 px-3 py-2 text-left">
                    고정 옵션
                  </th>
                  <th className="w-32 border-b border-zinc-200 px-3 py-2 text-left">
                    무기 개수
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
                          <span className="text-[11px] text-zinc-500">
                            {combo.type === "additional"
                              ? "추가 고정"
                              : "스킬 고정"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-700">
                      {combo.basics.join(" / ")}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-700">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        <span>{combo.fixedLabel}</span>
                        <span className="text-zinc-700">
                          {combo.fixedAttribute}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-zinc-800">
                      {combo.weapons.length}
                    </td>
                    <td className="px-3 py-3 text-xs text-zinc-700">
                      <div className="flex flex-wrap gap-1">
                        {combo.weapons.map((w) => (
                          <span
                            key={w.name}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px]"
                          >
                            {w.name}
                          </span>
                        ))}
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

