import { useEffect, useRef, useState } from 'react';
import { emptyProject, pushProject } from '../utils/project';
import type { EditorProject, ProjectHistory } from '../utils/project';

export function useEditorProject() {
  const [project, setProject] = useState(emptyProject);
  const current = useRef(project);
  const [timeline, setTimeline] = useState<ProjectHistory>(() => ({
    entries: [project],
    index: 0,
  }));
  const history = useRef(timeline);
  const group = useRef<{ key: string; at: number; index: number } | null>(null);
  const knownAssets = useRef(new Set<string>());
  useEffect(() => {
    const used = new Set(
      [
        ...project.images,
        ...timeline.entries.flatMap((entry) => entry.images),
      ].map((image) => image.src)
    );
    for (const src of knownAssets.current)
      if (!used.has(src)) {
        URL.revokeObjectURL(src);
        knownAssets.current.delete(src);
      }
    for (const src of used)
      if (src.startsWith('blob:')) knownAssets.current.add(src);
  }, [project, timeline]);
  const apply = (next: EditorProject, record: boolean) => {
    current.current = next;
    setProject(next);
    if (record) {
      group.current = null;
      history.current = pushProject(history.current, next);
      setTimeline(history.current);
    }
  };
  const edit = <K extends keyof EditorProject>(
    key: K,
    value: EditorProject[K] | ((old: EditorProject[K]) => EditorProject[K]),
    record = false
  ) => {
    const nextValue =
      typeof value === 'function' ? value(current.current[key]) : value;
    if (JSON.stringify(current.current[key]) === JSON.stringify(nextValue))
      return;
    const next = { ...current.current, [key]: nextValue };
    const before = current.current[key];
    const changed =
      typeof nextValue === 'object' &&
      nextValue &&
      typeof before === 'object' &&
      before
        ? Object.keys(nextValue)
            .filter(
              (field) =>
                JSON.stringify(
                  (nextValue as unknown as Record<string, unknown>)[field]
                ) !==
                JSON.stringify(
                  (before as unknown as Record<string, unknown>)[field]
                )
            )
            .join(',')
        : '';
    const groupKey = key + ':' + changed;
    if (
      record &&
      group.current?.key === groupKey &&
      Date.now() - group.current.at < 500 &&
      history.current.index === group.current.index
    ) {
      apply(next, false);
      const entries = [...history.current.entries];
      entries[history.current.index] = structuredClone(next);
      history.current = { ...history.current, entries };
      setTimeline(history.current);
    } else apply(next, record);
    if (record)
      group.current = {
        key: groupKey,
        at: Date.now(),
        index: history.current.index,
      };
  };
  const commitState = (
    images: EditorProject['images'],
    overlaps: number[],
    annotations: EditorProject['annotations']
  ) => apply({ ...current.current, images, overlaps, annotations }, true);
  const travel = (delta: number) => {
    group.current = null;
    const index = history.current.index + delta;
    if (index < 0 || index >= history.current.entries.length) return;
    history.current = { ...history.current, index };
    setTimeline(history.current);
    apply(structuredClone(history.current.entries[index]), false);
  };
  return {
    ...project,
    project,
    commitState,
    replaceState: (
      images: EditorProject['images'],
      overlaps: number[],
      annotations: EditorProject['annotations']
    ) => {
      const next = { ...current.current, images, overlaps, annotations };
      apply(next, false);
      const entries = [...history.current.entries];
      entries[history.current.index] = structuredClone(next);
      history.current = { ...history.current, entries };
      setTimeline(history.current);
    },
    restoreProject: (next: EditorProject) => apply(next, true),
    setImages: (v: EditorProject['images']) => edit('images', v),
    setOverlaps: (v: number[] | ((old: number[]) => number[])) =>
      edit('overlaps', v),
    setAnnotations: (v: EditorProject['annotations']) => edit('annotations', v),
    setDirection: (v: EditorProject['direction']) => edit('direction', v),
    setGap: (v: number) => edit('gap', v, true),
    setStatusBar: (v: EditorProject['statusBar']) => edit('statusBar', v, true),
    setMockup: (v: EditorProject['mockup']) => edit('mockup', v, true),
    setWatermark: (v: EditorProject['watermark']) => edit('watermark', v, true),
    setExportConfig: (v: EditorProject['exportConfig']) =>
      edit('exportConfig', v, true),
    undo: () => travel(-1),
    redo: () => travel(1),
    historyIndex: timeline.index,
    history: timeline.entries,
  };
}
