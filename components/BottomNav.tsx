'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListChecks, UtensilsCrossed, CalendarDays, Activity } from 'lucide-react';

const tabs = [
  { href: '/dashboard', label: '홈',    icon: Home },
  { href: '/routines',  label: '루틴',  icon: ListChecks },
  { href: '/meals',     label: '식단',  icon: UtensilsCrossed },
  { href: '/inbody',    label: '인바디', icon: Activity },
  { href: '/history',   label: '기록',  icon: CalendarDays },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-zinc-900 border-t border-zinc-800 z-40">
      <div className="flex">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          // Don't mark /routines active for /routines/[id]/workout
          const reallyActive = active && !(href === '/routines' && pathname.includes('/workout'));
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${
                reallyActive ? 'text-blue-400' : 'text-zinc-500'
              }`}
            >
              <Icon size={22} strokeWidth={reallyActive ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-safe" />
    </nav>
  );
}
