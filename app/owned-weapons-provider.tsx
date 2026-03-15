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

export function OwnedWeaponsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
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

