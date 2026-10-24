/**
 * The stable inventory-to-HTTP mapping for the future adapter. This file is
 * declarative only: #43 creates no fetch client, route handler or fallback.
 */
export const httpOperationIds = {
  A01: ["A01_registerAccount"], A02: ["A02_signIn"], A03: ["A03_signOut"], A04: ["A04_recoverAccount"], A05: ["A05_getContext"],
  G01: ["G01_createGroup"], G02: ["G02_resolveInvite"], G03: ["G03_joinPending"], G04: ["G04_selectGroup"], G05: ["G05_selectMode"], G06: ["G06_getManagement"], G07: ["G07_removeMember"], G08: ["G08_rotateInvite"],
  L01: ["L01_createLegacyGroup"], L02: ["L02_getProfiles", "G06_getManagement"], L03: ["L03_createProfile"], L04: ["L04_selectProfile"],
  W01: ["W01_listActiveTitles"], W02: ["W02_listArchivedTitles"], W03: ["W03_getTitle"], W04: ["W04_saveManualTitle"], W05: ["W05_confirmSave"], W06: ["W06_getEditDraft", "W06_updateTitle"], W07: ["W07_removeOwnContribution"], W08: ["W08_restoreTitle"],
  M01: ["M01_searchMetadata"], M02: ["M02_pageMetadata"], M03: ["M03_selectCandidate"], M04: ["M04_saveReviewedTitle"], M05: ["M05_refreshTitleMetadata"], M06: ["internal:metadataLifecycleBeforeAndAfterGatedOperation"],
  P01: ["P01_saveEpisode"], P02: ["P02_saveTimestamp", "P02_clearTimestamp"], P03: ["P03_setCompleted"], P04: ["P04_saveRating", "P04_clearRating"], P05: ["P05_saveNote", "P05_clearNote"],
  K01: ["K01_getPickerInputs"], K02: ["K02_pick"], K03: ["K03_nextPick"], K04: ["K04_restartPicker"],
} as const;

export type InventoryOperationId = keyof typeof httpOperationIds;

/** All mutating HTTP DTOs carry only a stale-intent revision, never actor authority. */
export type ExpectedHttpContext = Readonly<{ expectedContextRevision: number }>;

/** Stable safe error envelope defined by root openapi.yml. */
export type HttpFailure = Readonly<{ error: Readonly<{ code: string; message: string; retryable: boolean; fields?: Readonly<Record<string, string>> }> }>;
