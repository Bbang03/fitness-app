'use client';
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true); // start hidden until event fires

  useEffect(() => {
    if (localStorage.getItem('pwa-dismissed')) return;
    // Already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (dismissed || !deferredPrompt) return null;

  const handleInstall = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-dismissed', '1');
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto bg-zinc-800 border border-zinc-700 rounded-2xl p-4 flex items-center gap-3 shadow-2xl z-50 animate-in slide-in-from-bottom-4">
      <img
        src="/icon-192.png"
        width={40}
        height={40}
        alt=""
        className="w-10 h-10 rounded-xl flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">차곡 앱으로 설치</p>
        <p className="text-xs text-zinc-400 mt-0.5">홈 화면에 추가하면 오프라인에서도 사용 가능</p>
      </div>
      <button
        onClick={handleInstall}
        className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg flex-shrink-0 transition-colors"
      >
        설치
      </button>
      <button onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300 flex-shrink-0">
        <X size={16} />
      </button>
    </div>
  );
}
