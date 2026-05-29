import { useEffect, useState } from "react";
import type { Theme } from "../types";

const THEME_STORAGE_KEY = "image-gen-theme";

export const useTheme = (): { theme: Theme; toggleTheme: () => void } => {
  const [theme, setTheme] = useState<Theme>(
    () => (window.localStorage.getItem(THEME_STORAGE_KEY) as Theme) || "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  return { theme, toggleTheme };
};
