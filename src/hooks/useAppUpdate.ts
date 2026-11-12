import { useEffect, useRef, useState } from 'react';

/** An installed update is activated only after this tab has saved its project. */
export function useAppUpdate(prepareReload: () => Promise<void>) {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prepareRef = useRef(prepareReload);
  prepareRef.current = prepareReload;
  const busyRef = useRef(false);
  const reloadOnControl = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      !import.meta.env.PROD ||
      !('serviceWorker' in navigator) ||
      !/^https?:$/.test(location.protocol)
    )
      return;
    let alive = true;
    let registration: ServiceWorkerRegistration | undefined;
    let hadController = !!navigator.serviceWorker.controller;
    let checking = false;
    const cleanups: (() => void)[] = [];
    const announce = (worker: ServiceWorker) => {
      if (!alive) return;
      setWaiting(worker);
      setDismissed(false);
      setError('');
    };
    const watchInstalling = () => {
      const worker = registration?.installing;
      if (!worker) return;
      const changed = () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller)
          announce(worker);
      };
      worker.addEventListener('statechange', changed);
      cleanups.push(() => worker.removeEventListener('statechange', changed));
      changed();
    };
    const controlled = () => {
      if (reloadOnControl.current) {
        location.reload();
      } else if (hadController && navigator.serviceWorker.controller) {
        // Another tab may activate an update. Keep this tab's edits until it opts in.
        announce(navigator.serviceWorker.controller);
      }
      hadController = !!navigator.serviceWorker.controller;
    };
    const check = () => {
      if (!registration || document.visibilityState === 'hidden' || checking)
        return;
      checking = true;
      void registration
        .update()
        .catch(() => {})
        .finally(() => {
          checking = false;
        });
    };
    const start = () => {
      void navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`, {
          updateViaCache: 'none',
        })
        .then((next) => {
          if (!alive) return;
          registration = next;
          if (next.waiting && navigator.serviceWorker.controller)
            announce(next.waiting);
          next.addEventListener('updatefound', watchInstalling);
          cleanups.push(() =>
            next.removeEventListener('updatefound', watchInstalling)
          );
          watchInstalling();
        })
        .catch((reason) => console.warn('Offline setup unavailable', reason));
    };
    navigator.serviceWorker.addEventListener('controllerchange', controlled);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        controlled
      );
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      window.removeEventListener('load', start);
      for (const cleanup of cleanups) cleanup();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const update = async () => {
    if (!waiting || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await prepareRef.current();
      if (waiting.state === 'activated') {
        location.reload();
        return;
      }
      if (waiting.state !== 'installed' && waiting.state !== 'activating')
        throw new Error('新版本暂时无法打开，请联网后重试。');
      reloadOnControl.current = true;
      timeoutRef.current = setTimeout(() => {
        reloadOnControl.current = false;
        busyRef.current = false;
        setBusy(false);
        setError('更新尚未完成，当前编辑仍在，请检查网络后重试。');
      }, 12000);
      waiting.postMessage({ type: 'PICSEW_ACTIVATE_UPDATE' });
    } catch (reason) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      reloadOnControl.current = false;
      busyRef.current = false;
      setBusy(false);
      setError(
        reason instanceof Error
          ? reason.message
          : '更新前无法保存草稿，请稍后重试。'
      );
    }
  };
  return {
    available: !!waiting && !dismissed,
    busy,
    error,
    update,
    dismiss: () => setDismissed(true),
  };
}
