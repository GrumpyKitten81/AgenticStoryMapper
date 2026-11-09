export function mergeSavedDraft<Draft extends object>(current: Draft, submitted: Draft, baseline: Draft, saved: Draft, patch: object): Draft {
  return Object.fromEntries(Object.entries(current).map(([field, value]) => {
    const key = field as keyof Draft;
    const unchangedDuringSave = value === submitted[key];
    const adoptSaved = unchangedDuringSave && (field in patch || submitted[key] === baseline[key]);
    return [field, adoptSaved ? saved[key] : value];
  })) as Draft;
}
