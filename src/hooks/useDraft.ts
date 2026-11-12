import { useEffect, useRef, useState } from 'react';
import type { EditorProject } from '../utils/project';
import { deleteDraft, loadDraft, saveDraft } from '../utils/drafts';

export function useDraft(
  project: EditorProject,
  restore: (p: EditorProject) => void,
  enabled = true
) {
  const [pending, setPending] =
    useState<Awaited<ReturnType<typeof loadDraft>>>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const latest = useRef(project);
  const ownsDraft = useRef(false);
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
    if (!ready || !enabled) return;
    if (project.images.length) ownsDraft.current = true;
    else if (!ownsDraft.current) return;
    let alive = true;
    setStatus(project.images.length ? '正在保存草稿…' : '');
    const timer = setTimeout(() => {
      (project.images.length ? saveDraft(project) : deleteDraft())
        .then(() => {
          if (!project.images.length && !latest.current.images.length)
            ownsDraft.current = false;
          if (alive) setStatus(project.images.length ? '草稿已保存在本机' : '');
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
  }, [project, ready, enabled]);
  useEffect(() => {
    const flush = () => {
      const snapshot = latest.current;
      if (
        document.visibilityState === 'hidden' &&
        ready &&
        enabled &&
        (snapshot.images.length || ownsDraft.current)
      )
        void (
          snapshot.images.length
            ? saveDraft(snapshot)
            : deleteDraft()
        )
          .then(() => {
            if (!snapshot.images.length && !latest.current.images.length)
              ownsDraft.current = false;
          })
          .catch(() => {});
    };
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [ready, enabled]);
  return {
    pending,
    status,
    saveForReload: async () => {
      if (!enabled) return;
      if (!ready) {
        if (latest.current.images.length)
          throw new Error('请先选择恢复草稿或新建并替换草稿，再更新应用。');
        return;
      }
      if (!latest.current.images.length && !ownsDraft.current) return;
      try {
        // Include edits that completed while a prior write was still running.
        let snapshot;
        do {
          snapshot = latest.current;
          await (snapshot.images.length ? saveDraft(snapshot) : deleteDraft());
        } while (snapshot !== latest.current);
        if (!latest.current.images.length) ownsDraft.current = false;
        setStatus(latest.current.images.length ? '草稿已保存在本机' : '');
      } catch {
        setStatus('草稿保存失败，请及时导出');
        throw new Error(
          '更新前无法保存草稿，请检查本机存储后重试，或先保存成品图片。'
        );
      }
    },
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
