'use client';

import { Moon, Sun } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type Theme = 'basic' | 'dark';

const STORAGE_KEY = 'chagok-theme';

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  root.dataset.theme = theme;
  root.style.colorScheme =
    theme === 'dark'
      ? 'dark'
      : 'light';

  localStorage.setItem(
    STORAGE_KEY,
    theme,
  );

  const themeColor =
    document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );

  if (themeColor) {
    themeColor.content =
      theme === 'dark'
        ? '#0d110e'
        : '#f5f1e7';
  }
}

export default function ThemeToggle() {
  const pathname = usePathname();

  const [theme, setTheme] =
    useState<Theme>('dark');

  useEffect(() => {
    const current =
      document.documentElement.dataset.theme ===
      'basic'
        ? 'basic'
        : 'dark';

    setTheme(current);
  }, []);

  /*
   * 테마 스위치는 홈 화면에서만 표시.
   *
   * 테마 자체는 documentElement에 적용되므로
   * 운동 / 식단 / 체성분 / AI로 이동해도 유지된다.
   */
  if (pathname !== '/dashboard') {
    return null;
  }

  const toggleTheme = () => {
    const nextTheme: Theme =
      theme === 'dark'
        ? 'basic'
        : 'dark';

    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={
        isDark
          ? '베이직 모드로 변경'
          : '다크 모드로 변경'
      }
      title={
        isDark
          ? '베이직 모드'
          : '다크 모드'
      }
      onClick={toggleTheme}
      className="
        relative
        flex
        h-8
        w-[58px]
        shrink-0
        items-center
        justify-between
        rounded-full
        border
        border-[var(--color-rule)]
        bg-[var(--color-surface-muted)]
        px-[7px]
        text-[var(--color-ink-tertiary)]
        shadow-sm
      "
      style={{
        minHeight: '32px',
      }}
    >
      <Sun
        size={13}
        strokeWidth={2}
        aria-hidden="true"
      />

      <Moon
        size={13}
        strokeWidth={2}
        aria-hidden="true"
      />

      <span
        aria-hidden="true"
        className={`
          pointer-events-none
          absolute
          left-[3px]
          top-[3px]
          h-6
          w-6
          rounded-full
          bg-[var(--color-accent)]
          shadow-sm
          transition-transform
          duration-200
          ${
            isDark
              ? 'translate-x-[26px]'
              : 'translate-x-0'
          }
        `}
      />
    </button>
  );
}