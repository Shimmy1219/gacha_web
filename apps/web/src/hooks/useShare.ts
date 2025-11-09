import { useCallback, useEffect, useRef, useState } from 'react';

type ShareStatus = 'shared' | 'copied' | 'error';

export interface ShareFeedback {
  entryKey: string;
  status: ShareStatus;
}

export interface ShareHandler {
  share: (entryKey: string, shareText: string) => Promise<void>;
  copy: (entryKey: string, shareText: string) => Promise<void>;
  feedback: ShareFeedback | null;
}

export function useShareHandler(): ShareHandler {
  const [feedback, setFeedback] = useState<ShareFeedback | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const scheduleClear = useCallback((delay: number) => {
    if (typeof window === 'undefined') {
      return;
    }
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setFeedback(null);
      timeoutRef.current = null;
    }, delay);
  }, []);

  const share = useCallback(
    async (entryKey: string, shareText: string) => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        setFeedback({ entryKey, status: 'error' });
        scheduleClear(4000);
        return;
      }

      try {
        if (navigator.share) {
          await navigator.share({ text: shareText });
          setFeedback({ entryKey, status: 'shared' });
          scheduleClear(2000);
          return;
        }
      } catch (error) {
        console.info(
          'Web Share API での共有に失敗しました。クリップボード共有へフォールバックします。',
          error
        );
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText);
          setFeedback({ entryKey, status: 'copied' });
          scheduleClear(2000);
          return;
        }
      } catch (error) {
        console.warn('共有テキストのコピーに失敗しました', error);
      }

      setFeedback({ entryKey, status: 'error' });
      scheduleClear(4000);
    },
    [scheduleClear]
  );

  const copy = useCallback(
    async (entryKey: string, shareText: string) => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        setFeedback({ entryKey, status: 'error' });
        scheduleClear(4000);
        return;
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareText);
          setFeedback({ entryKey, status: 'copied' });
          scheduleClear(2000);
          return;
        }
      } catch (error) {
        console.warn('共有テキストのコピーに失敗しました', error);
      }

      setFeedback({ entryKey, status: 'error' });
      scheduleClear(4000);
    },
    [scheduleClear]
  );

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return { share, copy, feedback };
}
