export function getNewLogHeadEntries(previousLog: string[], currentLog: string[]): string[] {
  if (previousLog.length === 0) return currentLog;
  for (let start = 0; start < currentLog.length; start += 1) {
    const overlap = Math.min(previousLog.length, currentLog.length - start);
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (currentLog[start + index] !== previousLog[index]) {
        matches = false;
        break;
      }
    }
    if (matches) return currentLog.slice(0, start);
  }
  // The game log is capped. If enough entries are emitted at once, the previous
  // overlap can be truncated away; treating the whole log as new replays old UI
  // effects, so prefer dropping that ambiguous batch.
  return [];
}
