"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ALL_WEAPONS } from "../../data/db";

const STORAGE_KEY = "ownedWeapons";

export default function WeaponsPage() {
  const [ownedNames, setOwnedNames] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setOwnedNames(parsed.filter((v) => typeof v === "string"));
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ownedNames));
    } catch {
      // ignore storage errors
    }
  }, [ownedNames]);

  const toggleOwned = (name: string) => {
    setOwnedNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4 text-zinc-900">
      <main className="mx-auto flex max-w-4xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">보유 무기 관리</h1>
          <p className="text-sm text-zinc-600">
            보유한 무기를 체크하면 브라우저에 로컬로 저장됩니다.
          </p>
          <p className="text-xs text-zinc-500">
            현재 보유: {ownedNames.length} / {ALL_WEAPONS.length}
          </p>
        </header>

        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="w-16 border-b border-zinc-200 px-3 py-2 text-left">
                    보유
                  </th>
                  <th className="w-64 border-b border-zinc-200 px-3 py-2 text-left">
                    무기
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
                {ALL_WEAPONS.map((weapon) => {
                  const owned = ownedNames.includes(weapon.name);

                  return (
                    <tr
                      key={weapon.name}
                      className={
                        "border-b border-zinc-100 last:border-b-0" +
                        (owned ? " bg-emerald-50" : "")
                      }
                    >
                      <td className="px-3 py-2 align-top">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-600"
                            checked={owned}
                            onChange={() => toggleOwned(weapon.name)}
                          />
                        </label>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-12 overflow-hidden rounded-md bg-zinc-100">
                            <Image
                              src={`/weapon_images/${weapon.image_name}`}
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
                                src={`/characters/${weapon.signature_weapon}`}
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

