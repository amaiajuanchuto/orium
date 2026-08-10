import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type StreakResult } from "./api";

interface StreakContextValue {
  streak: StreakResult | null;
  refreshStreak: () => void;
}

const StreakContext = createContext<StreakContextValue | null>(null);

export function StreakProvider({ children }: { children: ReactNode }) {
  const [streak, setStreak] = useState<StreakResult | null>(null);

  function refreshStreak(): void {
    api.getStreak().then(setStreak).catch(() => undefined);
  }

  useEffect(refreshStreak, []);

  return (
    <StreakContext.Provider value={{ streak, refreshStreak }}>
      {children}
    </StreakContext.Provider>
  );
}

export function useStreak(): StreakContextValue {
  const ctx = useContext(StreakContext);
  if (!ctx) throw new Error("useStreak must be used within StreakProvider");
  return ctx;
}
