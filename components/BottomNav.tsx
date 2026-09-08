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
    <nav className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-white/[0.06] bg-zinc-950/90 backdrop-blur-xl">
      <div className="grid grid-cols-5 px-2 pt-2">
        {tabs.map(
          ({
            href,
            label,
            icon: Icon,
          }) => {
            const active =
              pathname === href ||
              pathname.startsWith(
                `${href}/`,
              );

            return (
              <Link
                key={href}
                href={href}
                className="group flex min-w-0 flex-col items-center justify-center gap-1 py-2"
              >
                <div
                  className={`flex h-8 min-w-11 items-center justify-center rounded-xl px-3 transition-all ${
                    active
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'text-zinc-600 group-hover:text-zinc-400'
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={
                      active
                        ? 2.4
                        : 1.8
                    }
                  />
                </div>

                <span
                  className={`text-[10px] font-medium transition-colors ${
                    active
                      ? 'text-blue-400'
                      : 'text-zinc-600'
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          },
        )}
      </div>

      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}