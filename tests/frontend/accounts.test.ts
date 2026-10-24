// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createMockService } from "../../frontend/mock/service";
import type { ServiceResult } from "../../frontend/service/contracts";
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
async function done<T>(p: Promise<T>, ms = 80) { await vi.advanceTimersByTimeAsync(ms); return p; }
function ok<T>(r: ServiceResult<T>) { if (r.kind !== "success") throw Error("Expected success"); return r; }
const input = { username: "  Sample.User  ", password: " long password ", confirmation: " long password " };
it("registers display case, never returns credentials in context, and preserves exact passwords", async () => {
 const s = createMockService(), old = s.context.initialIdentity;
 const registration = ok(await done(s.accounts.register(input, old)));
 expect(registration.value.code).toContain("SYNTHETIC-"); expect(registration.context.revision).toBe(1);
 const context = ok(await done(s.accounts.read())); expect(context.value.account).toMatchObject({ username: "Sample.User", memberships: [], seeded: false });
 expect(JSON.stringify(context)).not.toContain(input.password); expect(JSON.stringify(context)).not.toContain(registration.value.code);
 expect((await s.accounts.signOut(old)).kind).toBe("stale");
 const out = ok(await done(s.accounts.signOut(context.context))); expect(out.value.account).toBeNull();
 const bad = await done(s.accounts.signIn({ username: "sample.user", password: input.password.trim() }, out.context));
 const unknown = await done(s.accounts.signIn({ username: "unknown", password: input.password }, out.context)); expect(bad).toEqual(unknown);
 const back = ok(await done(s.accounts.signIn({ username: "SAMPLE.USER", password: input.password }, out.context))); expect(back.value.account?.id).toBe(context.value.account?.id);
});
it("rejects duplicate normalized names, invalid ASCII/length, exact confirmation and Unicode codepoint bounds", async () => {
 const s = createMockService(); let context = s.context.initialIdentity;
 for (const patch of [{ username: "ab" }, { username: "x".repeat(33) }, { username: "ab\u00e9" }, { password: "short", confirmation: "short" }, { password: "x".repeat(129), confirmation: "x".repeat(129) }, { confirmation: "different password" }]) expect((await done(s.accounts.register({ ...input, ...patch }, context))).kind).toBe("failure");
 const registered = ok(await done(s.accounts.register({ ...input, password: "\u{1F600}".repeat(12), confirmation: "\u{1F600}".repeat(12) }, context))); context = registered.context;
 expect(await done(s.accounts.register({ ...input, username: "sample.USER" }, context))).toMatchObject({kind:"failure",error:{fields:{username:expect.any(String)}}});
});
it("rotates proof/password, consumes old proof, invalidates the target simulated session and keeps identity", async () => {
 const s = createMockService(); const a = ok(await done(s.accounts.register(input, s.context.initialIdentity)));
 const target = ok(await done(s.accounts.read())).value.account;
 const replacement = ok(await done(s.accounts.recover({ ...input, proof: a.value.code, password: "replacement password", confirmation: "replacement password" }, a.context)));
 expect(replacement.value.code).not.toBe(a.value.code); expect(replacement.value.next).toBe("signin");
 const context = ok(await done(s.accounts.read())); expect(context.value.account).toBeNull();
 const wrong = await done(s.accounts.recover({ ...input, proof: a.value.code }, context.context)); const unknown = await done(s.accounts.recover({ ...input, username: "unknown", proof: "wrong" }, context.context)); expect(wrong).toEqual(unknown);
 expect((await done(s.accounts.signIn(input, context.context))).kind).toBe("failure");
 const login = ok(await done(s.accounts.signIn({ username: input.username, password: "replacement password" }, context.context))); expect(login.value.account).toEqual(target);
 expect((await done(s.accounts.recover({ ...input, proof: replacement.value.code }, login.context))).kind).toBe("success");
});
it("commits one concurrent submission and rejects delayed operations after identity change/reset", async () => {
 const s = createMockService(), old = s.context.initialIdentity;
 const a = s.accounts.register(input, old), b = s.accounts.register(input, old); await vi.advanceTimersByTimeAsync(80); expect((await a).kind).toBe("success"); expect((await b).kind).toBe("stale");
 const c = ok(await done(s.accounts.read())); const pending = s.accounts.signIn(input, c.context, {scenario:"slow"});
 const reset = ok(await done(s.context.reset(c.context))); expect(reset.value.account).toBeNull(); await vi.advanceTimersByTimeAsync(1200); expect((await pending).kind).toBe("stale");
 expect((await done(s.accounts.signIn(input, reset.context))).kind).toBe("failure");
});
it("canceled/unavailable requests never commit and safe absent sign-out advances context", async () => {
 const s = createMockService(), old = s.context.initialIdentity, controller = new AbortController();
 const request = s.accounts.register(input, old, {scenario:"slow",signal:controller.signal}); controller.abort(); expect((await request).kind).toBe("cancelled"); expect(vi.getTimerCount()).toBe(0);
 expect((await done(s.accounts.register(input, old, {scenario:"unavailable"}),300)).kind).toBe("failure");
 const out = ok(await done(s.accounts.signOut(old))); expect(out.value.account).toBeNull(); expect(out.context.revision).toBe(1);
 expect((await done(s.accounts.register(input, out.context))).kind).toBe("success");
});
it("new instances are independent and seeded memberships are read-only summaries", async () => {
 const s = createMockService(), other = createMockService();
 const c = ok(await done(s.accounts.signIn({username:"demo.viewer",password:"synthetic password"},s.context.initialIdentity)));
 expect(c.value.account?.seeded).toBe(true); expect(c.value.account?.memberships).toHaveLength(2);
 expect(ok(await done(other.accounts.read())).value.account).toBeNull(); expect((await other.accounts.signOut(c.context)).kind).toBe("stale");
});
