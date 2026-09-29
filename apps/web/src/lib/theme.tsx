import { createContext, useContext, useEffect, type ReactNode } from "react";

type Theme = "dark" | "light";
const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <Ctx.Provider value={{ theme: "dark", toggle: () => undefined }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
