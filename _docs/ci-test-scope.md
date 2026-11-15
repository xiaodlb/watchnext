# CI test scope after the Lovable frontend replacement

WatchNext replaced the old Next.js visual interface and the experimental mock UI with the Lovable frontend. The historical tests for those removed components remain in `tests/` for reference, but cannot run: their imported `app/` and `app/mock/` components were deliberately removed. The CI workflow names each excluded file explicitly. New test files are not automatically excluded.

CI continues to run the backend and shared unit tests, the remaining frontend service tests, Lovable's own UI tests, and three Docker Compose/browser scenarios on each supported architecture. The excluded old component tests are not evidence for the current interface. The Lovable unit suite currently has limited coverage; the Compose browser journeys provide additional integration coverage, and further current UI test migration is needed.

`tests/frontend/isolation.test.ts` is also historical: it inspects the removed mock page and preview entry point. Its claims do not apply to the current Lovable application. A replacement privacy and isolation test should be designed against that application rather than restoring the deleted mock page.
