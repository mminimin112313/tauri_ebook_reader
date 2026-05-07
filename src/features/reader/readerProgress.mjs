export const PROGRESS_PERSIST_THRESHOLD = 0.005;

export function shouldPersistProgress({
  nextProgress,
  nextSpineIndex,
  nextBlockIndex,
  lastProgress,
  lastSpineIndex,
  lastBlockIndex,
}) {
  if (nextSpineIndex !== lastSpineIndex) return true;
  if ((nextBlockIndex ?? null) !== (lastBlockIndex ?? null)) return true;
  return Math.abs((nextProgress || 0) - (lastProgress || 0)) >= PROGRESS_PERSIST_THRESHOLD;
}
