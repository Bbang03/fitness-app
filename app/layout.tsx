import type {
  Metadata,
  Viewport,
} from 'next';

import 'galmuri/dist/galmuri.css';
import './globals.css';

import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';
import InstallBanner from '@/components/InstallBanner';
import AuthSessionSync from '@/components/AuthSessionSync';

const themeInitScript = `
(function () {
  try {
    var saved =
      localStorage.getItem('chagok-theme');

    var theme =
      saved === 'basic'
        ? 'basic'
        : 'dark';

    document.documentElement.dataset.theme =
      theme;

    document.documentElement.style.colorScheme =
      theme === 'dark'
        ? 'dark'
        : 'light';
  } catch (error) {
    document.documentElement.dataset.theme =
      'dark';
  }
})();
`;

export const metadata: Metadata = {
  title: '차곡 · ChaGOK',
  description:
    '운동 트래커 + 식단 기록 + 체성분 예측',
  manifest: '/manifest.json',

  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '차곡',
  },

  icons: {
    icon: [
      {
        url: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: '/icon-180.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d110e',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: themeInitScript,
          }}
        />
      </head>

      <body className="fittrack-apple chagok-app antialiased">
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