import { useEffect, useRef, useState } from 'react';
import type { EditorProject } from '../utils/project';
import { deleteDraft, loadDraft, saveDraft } from '../utils/drafts';

export function useDraft(
  project: EditorProject,
  restore: (p: EditorProject) => void
) {
  const [pending, setPending] =
    useState<Awaited<ReturnType<typeof loadDraft>>>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const latest = useRef(project);
  latest.current = project;
  useEffect(() => {
    let alive = true;
    loadDraft()
      .then((draft) => {
        if (alive) {
          setPending(draft);
          setReady(!draft);
        } else if (draft) {
          for (const image of draft.project.images)
            URL.revokeObjectURL(image.src);
        }
      })
      .catch(() => {
        if (alive) {
          setStatus('本地存储不可用，请及时导出');
          setReady(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !project.images.length) return;
    let alive = true;
    setStatus('正在保存草稿…');
    const timer = setTimeout(() => {
      saveDraft(project)
        .then(() => {
          if (alive) setStatus('草稿已保存在本机');
        })
        .catch((error) => {
          console.error('Local draft save failed', error);
          if (alive) setStatus('草稿保存失败，请检查存储空间并及时导出');
        });
    }, 700);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [project, ready]);
  useEffect(() => {
    const flush = () => {
      if (
        document.visibilityState === 'hidden' &&
        ready &&
        latest.current.images.length
      )
        void saveDraft(latest.current).catch(() => {});
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [ready]);
  return {
    pending,
    status,
    restore: () => {
      if (pending) {
        restore(pending.project);
        setPending(null);
        setReady(true);
      }
    },
    discard: async () => {
      await deleteDraft();
      setPending(null);
      setReady(true);
    },
  };
}
