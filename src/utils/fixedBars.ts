/** Suggest stable edge bands; applying them always requires an explicit user action. */
export function commonEdgeBands(
  frames: Uint8ClampedArray[],
  width: number,
  height: number
) {
  if (
    frames.length < 2 ||
    width < 8 ||
    frames.some((f) => f.length !== width * height * 4)
  )
    return { top: 0, bottom: 0 };
  const stable = (y: number) => {
    let different = 0,
      total = 0;
    for (let x = 1; x < width - 1; x++)
      for (let frame = 1; frame < frames.length; frame++) {
        const p = (y * width + x) * 4;
        if (
          Math.abs(frames[0][p] - frames[frame][p]) +
            Math.abs(frames[0][p + 1] - frames[frame][p + 1]) +
            Math.abs(frames[0][p + 2] - frames[frame][p + 2]) >
          24
        )
          different++;
        total++;
      }
    return different / Math.max(1, total) < 0.12;
  };
  const max = Math.floor(height * 0.22);
  let top = 0,
    bottom = 0;
  while (top < max && stable(top)) top++;
  while (bottom < max && stable(height - 1 - bottom)) bottom++;
  return {
    top: top >= 3 ? top / height : 0,
    bottom: bottom >= 3 ? bottom / height : 0,
  };
}
