export type ContextIdentity = Readonly<{ mode: "mock"; instance: string; revision: number }>;
export type FieldErrors = Readonly<Partial<Record<"mode" | "scenario" | "context" | "username" | "password" | "confirmation" | "proof" | PersonalField | PickerField, string>>>;
export type ServiceFailure = Readonly<{
  kind: "failure";
  error: Readonly<{
    code: "invalid_selection" | "demo_unavailable" | "invalid_account" | "invalid_credentials" | "invalid_proof" | "group_access" | "group_input" | "invite_invalid" | "library_access" | "library_input" | "library_conflict" | "personal_access" | "personal_input" | "picker_access" | "picker_input";
    message: string;
    retryable: boolean;
    fields?: FieldErrors;
  }>;
}>;
export type ServiceResult<T> =
  | Readonly<{ kind: "success"; value: T; context: ContextIdentity }>
  | ServiceFailure
  | Readonly<{ kind: "stale"; message: string }>
  | Readonly<{ kind: "cancelled"; message: string }>;
export type MockScenario = "ready" | "slow" | "unavailable";
export type RequestOptions = Readonly<{ signal?: AbortSignal; scenario?: MockScenario }>;
export type MockContext = Readonly<{
  identity: ContextIdentity;
  label: "Synthetic workspace";
  account: AccountSummary | null;
  group: GroupSummary | null;
}>;
export interface ContextService {
  readonly initialIdentity: ContextIdentity;
  read(options?: RequestOptions): Promise<ServiceResult<MockContext>>;
  reset(expected: ContextIdentity, options?: Pick<RequestOptions, "signal">): Promise<ServiceResult<MockContext>>;
}
export interface FrontendService {
  readonly mode: "mock";
  readonly context: ContextService;
  readonly accounts: AccountService;
  readonly groups: GroupService;
  readonly library: LibraryService;
  readonly entry: EntryService;
  readonly progress: ProgressService;
  readonly feedback: FeedbackService;
  readonly picker: PickerService;
}

export type EntrySource = "youtube" | "kinopoisk";
export type ProviderOutcome = "normal" | "not-configured" | "quota" | "deadline" | "empty" | "missing-runtime" | "unavailable-item";
export type ProviderOptions = RequestOptions & Readonly<{outcome?:ProviderOutcome}>;
export type EntryCandidate = Readonly<{id:string;title:string;channel:string|null;year:number|null;contentType:LibraryType|null;durationSeconds:number|null;coverUrl:string|null}>;
export type EntryPage = Readonly<{handle:string;source:EntrySource;query:string;page:number;visits:number;previous:boolean;next:boolean;candidates:readonly EntryCandidate[]}>;
export type EntryReview = Readonly<{handle:string;source:EntrySource;providerId:string;draft:LibraryDraft;expiresAt:number;notice:string}>;
export type EntrySaved = Readonly<{status:"saved";title:LibraryTitle}> | Readonly<{status:"confirmation";handle:string;message:string;matchId:string}>;
export interface EntryService {
  search(source:EntrySource,kind:"title"|"link",query:string,expected:ContextIdentity,options?:ProviderOptions):Promise<ServiceResult<EntryPage|EntryReview>>;
  page(handle:string,direction:"next"|"previous",expected:ContextIdentity,options?:ProviderOptions):Promise<ServiceResult<EntryPage>>;
  select(handle:string,id:string,expected:ContextIdentity,options?:ProviderOptions):Promise<ServiceResult<EntryReview>>;
  adopt(handle:string,expected:ContextIdentity,options?:RequestOptions):Promise<ServiceResult<EntryReview>>;
  discard(handle:string):void;
  cancelLookup(expected:ContextIdentity):void;
  save(draft:LibraryDraft,typicalConfirmed:boolean,reviewHandle:string|undefined,confirmation:string|undefined,expected:ContextIdentity,options?:RequestOptions):Promise<ServiceResult<EntrySaved>>;
  refresh(id:string,expected:ContextIdentity,options?:ProviderOptions):Promise<ServiceResult<LibraryTitle>>;
  advanceTime(amount:"ten-minutes"|"thirty-one-days",expected:ContextIdentity,options?:RequestOptions):Promise<ServiceResult<{now:number}>>;
}

export const libraryMoods = ["funny", "relaxing", "exciting", "dark", "emotional"] as const;
export type LibraryType = "movie" | "series" | "anime" | "youtube";
export type Numbering = "none" | "season_episode" | "continuous";
export type LibraryDraft = Readonly<{ title: string; contentType: LibraryType | ""; minutes: string; seconds: string; numberingStyle: Numbering; genres: string; moods: readonly string[]; watchUrl: string; sourceUrl: string; coverUrl: string }>;
export type EpisodePosition = "unknown" | "not_started" | "in_progress";
/** One structured whole-title personal record per group, title and member; absent fields are null. */
export type PersonalProgress =
  | Readonly<{ kind: "episode"; position: EpisodePosition; season: number | null; episode: number | null; completed: boolean }>
  | Readonly<{ kind: "watch"; timestampSeconds: number | null; completed: boolean }>;
export type LibraryHistory = Readonly<{ id: string; memberId: string; progress: PersonalProgress | null; rating: number | null; note: string | null }>;
export type LibraryTitle = Readonly<{ id: string; groupId: string; revision: number; createdBy: string; providerId: string | null; archived: boolean; title: string | null; contentType: LibraryType | null; durationSeconds: number | null; numberingStyle: Numbering; genres: readonly string[]; moods: readonly string[]; watchUrl: string | null; sourceUrl: string | null; coverUrl: string | null; origins: Readonly<Record<string, "authored" | "provider" | "unavailable">>; availability: string; contributors: readonly MemberSummary[]; history: readonly LibraryHistory[]; historyMembers: readonly MemberSummary[]; personal: PersonalPanel; canEdit: boolean; canRemove: boolean; canRefresh: boolean; canRestore: boolean }>;
export type LibraryList = Readonly<{ mode: "account" | "legacy"; filter: "all" | "mine"; notice: string | null; archived: boolean; items: readonly LibraryTitle[] }>;
export type LibrarySave = Readonly<{ status: "saved"; title: LibraryTitle }> | Readonly<{ status: "confirmation"; handle: string; message: string }>;
export interface LibraryService {
  list(filter: unknown, archived: boolean, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<LibraryList>>;
  detail(id: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<LibraryTitle>>;
  editDraft(id: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<LibraryTitle>>;
  save(id: string, revision: number, draft: LibraryDraft, confirmation: string | undefined, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<LibrarySave>>;
  removeOwn(id: string, revision: number, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<LibraryTitle>>;
  restore(id: string, revision: number, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<LibraryTitle>>;
}

export type PersonalField = "positionState" | "nextSeason" | "nextEpisode" | "timestamp" | "completed" | "rating" | "note";
export type OwnEpisodeProgress = Readonly<{ kind: "episode"; numberingStyle: "season_episode" | "continuous"; recorded: boolean; position: EpisodePosition; season: number | null; episode: number | null; completed: boolean; metadataUnavailable: boolean }>;
export type OwnWatchProgress = Readonly<{ kind: "watch"; recorded: boolean; timestampSeconds: number | null; completed: boolean; fullDurationSeconds: number | null; runtimeAvailable: boolean; beyondDuration: boolean }>;
/** The live actor's own projection. `progress` is null only when the title structure allows no progress. */
export type OwnPersonal = Readonly<{ memberId: string; memberName: string; recordId: string | null; progress: OwnEpisodeProgress | OwnWatchProgress | null; rating: number | null; note: string | null }>;
export type PersonalEntry = Readonly<{ member: MemberSummary; record: LibraryHistory | null; beyondDuration: boolean }>;
/** W03 detail projection: every group member's attributed history plus the live actor's own record/capability. */
export type PersonalPanel = Readonly<{ own: OwnPersonal | null; history: readonly PersonalEntry[]; writable: boolean; reason: string | null }>;
/** Stale-form claims only; they never grant authority. The live actor and current title decide. */
export type PersonalClaim = Readonly<{ memberId: string; numberingStyle: Numbering }>;
export type EpisodeInput = Readonly<{ position: EpisodePosition; season: string; episode: string }>;
export type PersonalCommit = Readonly<{ record: LibraryHistory | null; own: OwnPersonal; history: readonly PersonalEntry[] }>;
export interface ProgressService {
  saveEpisode(id: string, input: EpisodeInput, claim: PersonalClaim, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PersonalCommit>>;
  saveTimestamp(id: string, timestamp: string, claim: PersonalClaim, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PersonalCommit>>;
  clearTimestamp(id: string, claim: PersonalClaim, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PersonalCommit>>;
  setCompleted(id: string, completed: boolean, claim: PersonalClaim, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PersonalCommit>>;
}
export interface FeedbackService {
  saveRating(id: string, score: string, claim: PersonalClaim, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PersonalCommit>>;
  clearRating(id: string, claim: PersonalClaim, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PersonalCommit>>;
  saveNote(id: string, body: string, claim: PersonalClaim, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PersonalCommit>>;
  clearNote(id: string, claim: PersonalClaim, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PersonalCommit>>;
}
export type PickerField = "viewers" | "availableMinutes" | "mood" | "rewatches" | "form";
export type PickerViewer = Readonly<{ id: string; name: string; color: AvatarColor }>;
/** K01: the selected group's eligible viewers in member order (account: active members only; legacy: every profile). */
export type PickerInputs = Readonly<{ groupId: string; groupName: string; mode: "account" | "legacy"; viewers: readonly PickerViewer[]; canAddTitle: boolean }>;
/** Explicit picker inputs. `availableMinutes` is the raw whole-minute text; `rewatches` must be a real boolean. */
export type PickerInput = Readonly<{ viewerIds: readonly string[]; availableMinutes: string; mood: string; rewatches: boolean }>;
/** Synthetic coordination tag held only in UI memory. It grants no authority and is not a credential. */
export type PickerCycleHandle = Readonly<{ cycleId: string; step: string }>;
export type PickerTier = "exact" | "over_budget" | "different_mood";
export type PickerTarget = Readonly<{ kind: "item" }> | Readonly<{ kind: "episode"; numberingStyle: "continuous" | "season_episode"; nextSeason: number | null; nextEpisode: number; restart: boolean; catchUp: boolean }>;
/** Display model of the current candidate only; ratings and notes are never part of it. */
export type PickerCandidate = Readonly<{ id: string; title: string; contentType: LibraryType; durationSeconds: number; tier: PickerTier; message: string; target: PickerTarget; rewatchers: readonly PickerViewer[]; viewers: readonly PickerViewer[]; availableMinutes: string; requestedMood: string; rewatches: boolean; watchUrl: string | null }>;
export type PickerNoMatchReason = "no_active_titles" | "progress_required" | "viewer_ineligible" | "metadata_incomplete" | "time_mood_excluded";
export type PickerSuggestion = Readonly<{ kind: "add_title"; label: string }> | Readonly<{ kind: "open_title"; titleId: string; label: string }>;
export type PickerOutcome =
  | Readonly<{ kind: "picked"; refreshed: boolean; candidate: PickerCandidate; cycle: PickerCycleHandle }>
  | Readonly<{ kind: "exhausted"; refreshed: boolean; cycle: PickerCycleHandle }>
  | Readonly<{ kind: "no_match"; refreshed: boolean; message: string; reasons: readonly Readonly<{ code: PickerNoMatchReason; label: string }>[]; suggestions: readonly PickerSuggestion[] }>
  | Readonly<{ kind: "conflict"; refreshed: false; message: string }>;
export interface PickerService {
  getInputs(expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PickerInputs>>;
  pick(input: PickerInput, intentId: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PickerOutcome>>;
  next(cycle: PickerCycleHandle, intentId: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PickerOutcome>>;
  restart(input: PickerInput, cycle: PickerCycleHandle, intentId: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PickerOutcome>>;
}
export function libraryFilter(value: unknown): { filter: "all" | "mine"; notice: string | null } {
  return value === undefined || value === null || value === "all" ? { filter: "all", notice: null } : value === "mine" ? { filter: "mine", notice: null } : { filter: "all", notice: "Unsupported or repeated library filter. Showing All." };
}

export const avatarColors = ["blue", "purple", "teal", "rose", "amber", "slate"] as const;
export type AvatarColor = typeof avatarColors[number];
export type GroupSummary = Readonly<{ id: string; name: string; kind: "account" | "legacy"; generation: number }>;
export type MemberSummary = Readonly<{ id: string; accountId: string | null; name: string; color: AvatarColor; owner: boolean; you: boolean; active: boolean; generation: number; removedAtGeneration: number | null; references: Readonly<{ contributions: readonly string[]; history: readonly string[] }> }>;
export type GroupWorkspace = Readonly<{
  mode: "account" | "legacy";
  memberships: readonly GroupSummary[];
  selected: GroupSummary | null;
  members: readonly MemberSummary[];
  profileId: string | null;
  canManage: boolean;
  pending: Readonly<{ needsAccount: boolean; groupName: string | null }> | null;
}>;
export type InviteDisclosure = Readonly<{ invite: string; kind: "account" | "legacy" }>;
export interface GroupService {
  read(options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  create(name: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<InviteDisclosure>>;
  select(id: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  resolve(invite: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  join(expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  mode(mode: "account" | "legacy", expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  remove(memberId: string, memberGeneration: number, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  rotate(generation: number, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<InviteDisclosure>>;
  createLegacy(name: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<InviteDisclosure>>;
  createProfile(name: string, color: AvatarColor, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
  selectProfile(id: string, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<GroupWorkspace>>;
}
export type DemoSelection = Readonly<{ mode: "mock"; scenario: MockScenario }>;
export type SelectionResult = Readonly<{ kind: "success"; value: DemoSelection }> | ServiceFailure;
export function selectDemo(mode: unknown, scenario: unknown): SelectionResult {
  const fields: Partial<Record<"mode" | "scenario", string>> = {};
  if (mode !== undefined && mode !== "mock") fields.mode = "Only the isolated mock preview is available at this entry.";
  if (scenario !== undefined && scenario !== "ready" && scenario !== "slow" && scenario !== "unavailable") fields.scenario = "Choose Ready, Slow or Unavailable.";
  if (Object.keys(fields).length) return { kind: "failure", error: { code: "invalid_selection", message: "Unsupported preview selection. Open the default mock preview and try again.", retryable: false, fields } };
  return { kind: "success", value: { mode: "mock", scenario: scenario === undefined ? "ready" : scenario as MockScenario } };
}
export function sameContext(a: ContextIdentity, b: ContextIdentity): boolean {
  return a.mode === b.mode && a.instance === b.instance && a.revision === b.revision;
}

export type AccountSummary = Readonly<{ id: string; username: string; seeded: boolean; memberships: readonly string[] }>;
export type AccountInput = Readonly<{ username: string; password: string; confirmation?: string; proof?: string }>;
export type PrivateDisclosure = Readonly<{ code: string; next: "account" | "signin" }>;
export interface AccountService {
  read(options?: RequestOptions): Promise<ServiceResult<MockContext>>;
  register(input: AccountInput, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PrivateDisclosure>>;
  signIn(input: AccountInput, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<MockContext>>;
  signOut(expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<MockContext>>;
  recover(input: AccountInput, expected: ContextIdentity, options?: RequestOptions): Promise<ServiceResult<PrivateDisclosure>>;
}
