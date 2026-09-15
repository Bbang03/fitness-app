import type {
  ReactNode,
} from 'react';

import BottomNav from '@/components/BottomNav';
import ChagokBrand from '@/components/ChagokBrand';

export default function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="fittrack-apple min-h-screen pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+20px)]">
      <ChagokBrand />
      {children}

      <BottomNav />
    </div>
  );
}
