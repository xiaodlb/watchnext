import { createMockLibrary } from "./library";
import { createMockGroups } from "./groups";
import { sameContext, selectDemo } from "../service/contracts";
import type { ContextIdentity, FrontendService, MockContext, MockScenario, RequestOptions, ServiceResult, AccountInput, AccountSummary, PrivateDisclosure, FieldErrors } from "../service/contracts";
let instances = 0;
export const scenarioDelays: Readonly<Record<MockScenario, number>> = Object.freeze({ ready: 80, slow: 1200, unavailable: 300 });
/** Domains still listed as not available in the preview. #60 removed the last one (picker). */
export const pendingDomains: readonly Readonly<{ key: string; label: string; issue: number }>[] = Object.freeze([]);
function cancelled(): ServiceResult<never> { return { kind: "cancelled", message: "Preview request canceled. No demo state was changed." }; }
function stale(): ServiceResult<never> { return { kind: "stale", message: "The demo context changed. Load the current preview before trying again." }; }
function wait(delay: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const finish = (completed: boolean) => { clearTimeout(timer); signal?.removeEventListener("abort", abort); resolve(completed); };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), delay);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
/** Pure, per-instance browser state. No storage, cookies, fetch, native imports or credentials. */
export function createMockService(options: { now?: () => number } = {}): FrontendService {
  const instance = `synthetic-preview-${++instances}`;
  let revision = 0, codeCounter = 0;
  let maintenance=()=>{};
  type Record = { summary: AccountSummary; password: string; proof: string };
  const records = new Map<string, Record>();
  const seed = () => { records.clear(); records.set("demo.viewer", { summary: { id: "seeded-viewer", username: "Demo.Viewer", seeded: true, memberships: ["Synthetic Friday friends", "Synthetic weekend pair"] }, password: "synthetic password", proof: "SYNTHETIC-SEED-PROOF" }); };
  const seedAccounts = seed;
  seedAccounts();
  const seedOwner = () => records.set("demo.owner", { summary: { id: "seeded-owner", username: "Demo.Owner", seeded: true, memberships: ["Synthetic Friday friends"] }, password: "synthetic password", proof: "SYNTHETIC-OWNER-PROOF" });
  seedOwner();
  let current: AccountSummary | null = null;
  const code = () => `SYNTHETIC-${instance}-${++codeCounter}`;

  const identity = (): ContextIdentity => Object.freeze({ mode: "mock", instance, revision });
  const result = (): ServiceResult<MockContext> => {
    const snapshot = identity();
    return { kind: "success", value: Object.freeze({ identity: snapshot, label: "Synthetic workspace", account: current ? { ...current, memberships: groups.memberships(current.id).map(g => g.name) } : null, group: groups.current() }), context: snapshot };
  };
  async function gate<T>(expected: ContextIdentity, options: RequestOptions, commit: () => ServiceResult<T>): Promise<ServiceResult<T>> {
    maintenance();
    if (options.signal?.aborted) return cancelled();
    if (!sameContext(expected, identity())) return stale();
    const selected = selectDemo("mock", options.scenario);
    if (selected.kind === "failure") return selected;
    if (!await wait(scenarioDelays[selected.value.scenario], options.signal)) return cancelled();
    if (!sameContext(expected, identity())) return stale();
    if (selected.value.scenario === "unavailable") return { kind: "failure", error: { code: "demo_unavailable", message: "Synthetic accounts are unavailable. Choose Ready and retry.", retryable: true } };
    const committed=commit(); maintenance(); return committed;
  }
  const invalid = (fields: FieldErrors): ServiceResult<never> => ({ kind: "failure", error: { code: "invalid_account", message: "Check the account fields and try again.", retryable: true, fields } });
  const validate = (input: AccountInput): FieldErrors => {
    const fields: { username?: string; password?: string; confirmation?: string } = {};
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(input.username.trim())) fields.username = "Use 3–32 ASCII letters, numbers, underscore, dot or hyphen.";
    if ([...input.password].length < 12 || [...input.password].length > 128) fields.password = "Use 12–128 characters; spaces and case are preserved.";
    if (input.confirmation !== input.password) fields.confirmation = "Passwords must match exactly.";
    return fields;
  };
  const read = async (options: RequestOptions = {}) => gate(identity(), options, result);
  const groups = createMockGroups({ account: () => current, identity, bump: () => { revision++; }, code, now: options.now ?? Date.now, gate });
  const library = createMockLibrary({ identity, workspace: groups.workspace, now: options.now ?? Date.now, gate });
  maintenance=library.expire;
  return Object.freeze({ mode: "mock", library: library.service, entry: library.entry, progress: library.progress, feedback: library.feedback, picker: library.picker, groups: groups.service, accounts: Object.freeze({
    read,
    async register(input: AccountInput, expected: ContextIdentity, options: RequestOptions = {}): Promise<ServiceResult<PrivateDisclosure>> {
      return gate<PrivateDisclosure>(expected, options, () => {
        const fields = validate(input); if (Object.keys(fields).length) return invalid(fields);
        const key = input.username.trim().toLowerCase();
        if (records.has(key)) return invalid({ username: "That synthetic username is already registered." });
        const before = current;
        const proof = code(); current = Object.freeze({ id: `account-${records.size}`, username: input.username.trim(), seeded: false, memberships: Object.freeze([]) });
        records.set(key, { summary: current, password: input.password, proof }); revision++; groups.accountChanged(before, current);
        return { kind: "success", value: { code: proof, next: "account" }, context: identity() };
      });
    },
    async signIn(input: AccountInput, expected: ContextIdentity, options: RequestOptions = {}): Promise<ServiceResult<MockContext>> {
      return gate(expected, options, () => {
        const record = records.get(input.username.trim().toLowerCase());
        if (!record || record.password !== input.password) return { kind: "failure", error: { code: "invalid_credentials", message: "Username or password is incorrect.", retryable: true } };
        const before = current; current = record.summary; revision++; groups.accountChanged(before, current); return result();
      });
    },
    async signOut(expected: ContextIdentity, options: RequestOptions = {}): Promise<ServiceResult<MockContext>> {
      return gate(expected, options, () => { const before = current; current = null; revision++; groups.accountChanged(before, current); return result(); });
    },
    async recover(input: AccountInput, expected: ContextIdentity, options: RequestOptions = {}): Promise<ServiceResult<PrivateDisclosure>> {
      return gate<PrivateDisclosure>(expected, options, () => {
        const fields = validate(input); if (Object.keys(fields).length) return invalid(fields);
        const record = records.get(input.username.trim().toLowerCase());
        if (!record || record.proof !== input.proof) return { kind: "failure", error: { code: "invalid_proof", message: "Username or recovery code is incorrect or no longer valid.", retryable: true } };
        const proof = code(); record.password = input.password; record.proof = proof;
        const before = current;
        if (current?.id === record.summary.id) current = null;
        revision++; groups.accountChanged(before, current); return { kind: "success", value: { code: proof, next: "signin" }, context: identity() };
      });
    },
  }), context: Object.freeze({
    initialIdentity: identity(),
    async read(options: RequestOptions = {}): Promise<ServiceResult<MockContext>> {
      const selection = selectDemo("mock", options.scenario);
      if (selection.kind === "failure") return selection;
      const before = identity();
      if (!await wait(scenarioDelays[selection.value.scenario], options.signal)) return cancelled();
      if (!sameContext(before, identity())) return stale();
      if (selection.value.scenario === "unavailable") return { kind: "failure", error: { code: "demo_unavailable", message: "The synthetic preview is unavailable for this request. Choose Ready and retry.", retryable: true } };
      return result();
    },
    async reset(expected: ContextIdentity, options: Pick<RequestOptions, "signal"> = {}): Promise<ServiceResult<MockContext>> {
      if (options.signal?.aborted) return cancelled();
      const before = identity();
      if (!sameContext(expected, before)) return stale();
      if (!await wait(scenarioDelays.ready, options.signal)) return cancelled();
      if (!sameContext(before, identity())) return stale();
      seed(); seedOwner(); groups.reset(); library.reset(); current = null; revision++;
      return result();
    },
  }) });
}
