'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

export default function Root() {
  const router = useRouter();
  const currentUser = useStore((s) => s.currentUser);

  useEffect(() => {
    const user = currentUser();
    router.replace(user ? '/dashboard' : '/login');
  }, [currentUser, router]);

  return null;
}
