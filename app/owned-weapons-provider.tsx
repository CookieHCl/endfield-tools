 "use client";

import { createContext, useContext, useEffect, useState } from "react";

type OwnedWeaponsContextValue = {
  ownedNames: string[];
  setOwnedNames: (names: string[]) => void;
  toggleOwned: (name: string) => void;
  clearOwned: () => void;
};

const OwnedWeaponsContext = createContext<OwnedWeaponsContextValue | null>(
  null,
);

const STORAGE_KEY = "ownedWeapons";

function saveOwned(names: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    // ignore storage errors
  }
}

export function OwnedWeaponsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ownedNames, setOwnedNamesState] = useState<string[]>([]);

  // 불러오기 (localStorage → 상태). 저장은 setOwnedNames가 변경 지점에서 동기로 한다.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setOwnedNamesState(parsed.filter((v) => typeof v === "string"));
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // 상태 변경과 저장을 함께 한다.
  // effect로 저장하면 초기 로드 전에 빈 배열로 덮어써 데이터가 날아가므로 쓰지 않는다.
  const setOwnedNames = (names: string[]) => {
    setOwnedNamesState(names);
    saveOwned(names);
  };

  const toggleOwned = (name: string) => {
    setOwnedNames(
      ownedNames.includes(name)
        ? ownedNames.filter((n) => n !== name)
        : [...ownedNames, name],
    );
  };

  const clearOwned = () => {
    setOwnedNames([]);
  };

  return (
    <OwnedWeaponsContext.Provider
      value={{ ownedNames, setOwnedNames, toggleOwned, clearOwned }}
    >
      {children}
    </OwnedWeaponsContext.Provider>
  );
}

export function useOwnedWeapons() {
  const ctx = useContext(OwnedWeaponsContext);
  if (!ctx) {
    throw new Error("useOwnedWeapons must be used within OwnedWeaponsProvider");
  }
  return ctx;
}

