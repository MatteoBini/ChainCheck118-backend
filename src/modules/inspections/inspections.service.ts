import type { ItemOutcome, ItemResult } from "../checklists/checklists.service.js";

export interface Discrepancy {
  itemId: number;
  declared: ItemOutcome;
  observed: ItemOutcome;
}

/** Presuppone liste già validate da assertCompleteResults (stesse voci). */
export function compareResults(declared: ItemResult[], observed: ItemResult[]): Discrepancy[] {
  const declaredById = new Map(declared.map((result) => [result.itemId, result.outcome]));

  return observed.flatMap(({ itemId, outcome }) => {
    const declaredOutcome = declaredById.get(itemId)!;
    return declaredOutcome === outcome ? [] : [{ itemId, declared: declaredOutcome, observed: outcome }];
  });
}
