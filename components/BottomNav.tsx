'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Activity,
  Dumbbell,
  Home,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';

const tabs = [
  {
    href: '/dashboard',
    label: '홈',
    icon: Home,
  },
  {
    href: '/routines',
    label: '운동',
    icon: Dumbbell,
  },
  {
    href: '/meals',
    label: '식단',
    icon: UtensilsCrossed,
  },
  {
    href: '/inbody',
    label: '체성분',
    icon: Activity,
  },
  {
    href: '/insights',
    label: 'AI',
    icon: Sparkles,
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="
        fixed bottom-0 left-1/2 z-50
        w-full max-w-md -translate-x-1/2
        border-t border-[var(--color-rule)]
        bg-[var(--color-surface)]
        shadow-[0_-6px_18px_rgba(53,58,39,0.06)]
      "
    >
      <div className="grid grid-cols-5 px-2 pt-2">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="
                group
                flex min-h-14 min-w-0
                flex-col items-center justify-center
                gap-1
                px-1 py-1.5
              "
            >
              <div
                className={`
                  flex h-8 min-w-12
                  items-center justify-center
                  rounded-lg
                  px-3
                  transition-all duration-150
                  ${
                    active
                      ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'text-[var(--color-ink-tertiary)] group-hover:bg-[var(--color-surface-muted)] group-hover:text-[var(--color-ink-secondary)]'
                  }
                `}
              >
                <Icon
                  size={19}
                  strokeWidth={active ? 2.4 : 1.8}
                />
              </div>

              <span
                className={`
                  text-[10px]
                  leading-none
                  transition-colors duration-150
                  ${
                    active
                      ? 'font-bold text-[var(--color-accent)]'
                      : 'font-normal text-[var(--color-ink-tertiary)]'
                  }
                `}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}