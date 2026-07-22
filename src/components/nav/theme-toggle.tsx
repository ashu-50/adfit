"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  /**
   * Everything derived from the theme has to wait for mount — the icon and the
   * label both.
   *
   * next-themes reads the stored theme from localStorage during its first
   * client render, so `resolvedTheme` is already "dark" there while the server,
   * which cannot see localStorage, rendered it as undefined. Any attribute
   * computed from it therefore differs between the two trees and React reports
   * a hydration mismatch. Gating only the icon leaves the aria-label to give
   * the game away.
   */
  const label = mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Toggle theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      // Not disabled before mount: the button stays in the accessibility tree
      // and keyboard order, it just cannot name its destination yet.
      title={label}
    >
      {mounted ? isDark ? <Sun /> : <Moon /> : <span className="size-4" aria-hidden />}
    </Button>
  );
}
