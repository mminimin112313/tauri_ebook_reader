export function formatPageDisplay(pageDisplay) {
  const index = Math.max(0, Number(pageDisplay?.index) || 0);
  const count = Math.max(1, Number(pageDisplay?.count) || 1);
  const pending = pageDisplay?.pending === true;
  const current = index + 1;
  const total = pending ? '...' : count;
  const ratio = count > 1 ? index / (count - 1) : 0;

  return {
    current,
    total,
    label: pending ? `Page ${current} of calculating` : `Page ${current} of ${count}`,
    ratio,
    canScrub: !pending && count > 1,
  };
}

export function pageIndexFromSliderValue(value, count) {
  const lastIndex = Math.max(0, (Number(count) || 1) - 1);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(lastIndex, Math.round(numeric)));
}
