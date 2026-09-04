import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import InstallBanner from '@/components/InstallBanner';
import AuthSessionSync from '@/components/AuthSessionSync';

export const metadata: Metadata = {
  title: 'FitTrack',
  description: '운동 트래커 + 식단 기록 + 인바디 예측',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FitTrack',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-512.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-zinc-950 text-white antialiased">
        <ServiceWorkerRegistrar />

        <AuthSessionSync>
          <div className="max-w-md mx-auto min-h-screen relative">
            {children}
          </div>
        </AuthSessionSync>

        <InstallBanner />
      </body>
    </html>
  );
}
