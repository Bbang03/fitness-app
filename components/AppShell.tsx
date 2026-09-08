import type {
  ReactNode,
} from 'react';

import BottomNav from '@/components/BottomNav';

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+20px)]">
      {children}

      <BottomNav />
    </div>
  );
}