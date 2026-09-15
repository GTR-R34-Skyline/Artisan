import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const INSTALL_DISMISSED_KEY = 'artisan.pwa.installDismissed';

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

/**
 * Minimal PWA chrome: offline awareness, optional install affordance, and SW updates.
 * Intentionally small so it does not reshape the existing ARTISAN UI.
 */
const PwaStatus: React.FC = () => {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [connectivityNotice, setConnectivityNotice] = useState<string | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneDisplay);
  const [installDismissed, setInstallDismissed] = useState(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const wasOffline = useRef(false);
  const connectivityTimer = useRef<number | null>(null);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (import.meta.env.DEV) {
        console.info('[pwa] registered', swUrl, Boolean(registration));
      }
    },
    onRegisterError(error) {
      console.warn('[pwa] registration failed', error);
    },
  });

  const showConnectivityNotice = useCallback((message: string) => {
    setConnectivityNotice(message);
    if (connectivityTimer.current) {
      window.clearTimeout(connectivityTimer.current);
    }
    connectivityTimer.current = window.setTimeout(() => {
      setConnectivityNotice(null);
      connectivityTimer.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        showConnectivityNotice("You're back online");
      }
      wasOffline.current = false;
    };
    const onOffline = () => {
      wasOffline.current = true;
      setOnline(false);
      showConnectivityNotice("You're offline");
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (connectivityTimer.current) {
        window.clearTimeout(connectivityTimer.current);
      }
    };
  }, [showConnectivityNotice]);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    try {
      await installEvent.userChoice;
    } finally {
      setInstallEvent(null);
    }
  };

  const dismissInstall = () => {
    setInstallDismissed(true);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
    } catch {
      // ignore quota / private mode
    }
  };

  const showInstall = Boolean(installEvent) && !installed && !installDismissed && online;
  const showUpdate = needRefresh;
  const showOfflinePill = !online && !connectivityNotice;

  if (!connectivityNotice && !showInstall && !showUpdate && !showOfflinePill) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      aria-live="polite"
    >
      {connectivityNotice && (
        <div
          role="status"
          className="pointer-events-auto rounded-full border border-stone-300/80 bg-ivory/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700 shadow-sm backdrop-blur-sm"
        >
          {connectivityNotice}
        </div>
      )}

      {showOfflinePill && (
        <div
          role="status"
          className="pointer-events-auto rounded-full border border-stone-300/80 bg-ivory/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700 shadow-sm backdrop-blur-sm"
        >
          You&apos;re offline
        </div>
      )}

      {showUpdate && (
        <div
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-stone-300/80 bg-ivory/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700 shadow-sm backdrop-blur-sm"
        >
          <span>New version available. Refresh to update.</span>
          <button
            type="button"
            className="rounded-full bg-stone-950 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-forest"
            onClick={() => void updateServiceWorker(true)}
          >
            Refresh
          </button>
        </div>
      )}

      {showInstall && (
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full border border-stone-300/80 bg-ivory/95 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700 shadow-sm backdrop-blur-sm">
          <span>Install ARTISAN</span>
          <button
            type="button"
            className="rounded-full bg-stone-950 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-forest"
            onClick={() => void handleInstall()}
          >
            Install
          </button>
          <button
            type="button"
            aria-label="Dismiss install prompt"
            className="text-stone-500 hover:text-stone-950"
            onClick={dismissInstall}
          >
            Not now
          </button>
        </div>
      )}
    </div>
  );
};

export default PwaStatus;
