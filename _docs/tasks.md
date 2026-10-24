# WatchNext backlog

## Graded iteration — staged issue index

Read [graded-mvp.md](graded-mvp.md), [specification](specification.md) and scoped QA-owned closure rules. Labels: `mvp`, `post-mvp`, `user-test-bug`. The initial step created plan/issues only; the subsequent frontend request authorizes #41 then #42 through their prerequisites/roles. Later stages remain planned, not authorized by reference access or issue creation. [Operation inventory](operation-inventory.md) maps complete coverage; baseline #1–#40 remains closed.

1. [#41 Operation inventory/reference pack](https://github.com/xiaodlb/watchnext/issues/41)
2. [#42 Typed mock service/mode foundation](https://github.com/xiaodlb/watchnext/issues/42)
3. [#55 Mock accounts/sign-in/recovery](https://github.com/xiaodlb/watchnext/issues/55)
4. [#56 Mock groups/owner/legacy](https://github.com/xiaodlb/watchnext/issues/56)
5. [#57 Mock library/Mine/detail/edit/archive](https://github.com/xiaodlb/watchnext/issues/57)
6. [#58 Mock manual/provider Add/review](https://github.com/xiaodlb/watchnext/issues/58)
7. [#59 Mock personal progress/feedback](https://github.com/xiaodlb/watchnext/issues/59)
8. [#60 Mock picker/cycle](https://github.com/xiaodlb/watchnext/issues/60)
9. [#61 Full frontend integration/coverage/evidence](https://github.com/xiaodlb/watchnext/issues/61)
10. [#43 Root openapi.yml](https://github.com/xiaodlb/watchnext/issues/43)
11. [#44 Real memory identity/group HTTP](https://github.com/xiaodlb/watchnext/issues/44)
12. [#45 Real memory library/provider HTTP](https://github.com/xiaodlb/watchnext/issues/45)
13. [#46 Real memory personal/picker HTTP](https://github.com/xiaodlb/watchnext/issues/46)
14. [#47 All graded UI operations over HTTP](https://github.com/xiaodlb/watchnext/issues/47)
15. [#48 Prisma mappings/safe baseline](https://github.com/xiaodlb/watchnext/issues/48)
16. [#49 Prisma identity/group repositories](https://github.com/xiaodlb/watchnext/issues/49)
17. [#50 Prisma library/history repositories](https://github.com/xiaodlb/watchnext/issues/50)
18. [#51 Full durable SQLite integration/upgrade](https://github.com/xiaodlb/watchnext/issues/51)
19. [#52 Optional post-MVP PostgreSQL portability](https://github.com/xiaodlb/watchnext/issues/52)
20. [#53 Genuine user testing/bugs](https://github.com/xiaodlb/watchnext/issues/53)
21. [#54 Submission evidence](https://github.com/xiaodlb/watchnext/issues/54)

## Completed account/discovery enhancement — historical sequence

After the planning-only phase the user explicitly requested implementation of the remaining GitHub issues. Read [the scope/explicit choices/defaults and authorization](account-discovery-enhancement.md). Refresh PM grooming, then Engineer/independent QA one issue at a time; live issue state is authoritative. [Current evidence](enhancement-audit.md) maps delivery; this remains an issue index. Follow this order and each issue's dependencies:

1. [#31 Account and membership storage; legacy separation](https://github.com/xiaodlb/watchnext/issues/31)
2. [#32 Registration, login, logout and sessions](https://github.com/xiaodlb/watchnext/issues/32)
3. [#33 Recovery-code password reset](https://github.com/xiaodlb/watchnext/issues/33)
4. [#34 Create/join/switch account groups and ownership guards](https://github.com/xiaodlb/watchnext/issues/34)
5. [#35 Creator removal and invite rotation](https://github.com/xiaodlb/watchnext/issues/35)
6. [#36 YouTube title/link search and enriched candidates](https://github.com/xiaodlb/watchnext/issues/36)
7. [#37 Kinopoisk posters and available fields](https://github.com/xiaodlb/watchnext/issues/37)
8. [#38 Automatic editable review and search/list/detail previews](https://github.com/xiaodlb/watchnext/issues/38)
9. [#39 Added by me and all-contributor attribution](https://github.com/xiaodlb/watchnext/issues/39)
10. [#40 Authenticated journeys and requirement audit](https://github.com/xiaodlb/watchnext/issues/40)

## Completed legacy-release backlog

Task descriptions/live QA state belong to GitHub issues. This document remains their index, not a duplicate status board. Work one selected issue at a time through the roles/process; the authorized backlog run and delegated choices are recorded in [plan.md](plan.md). The dated [completion audit](completion-audit.md) maps concrete requirement/evidence coverage.

Project context: an academic Next.js and TypeScript web app with local SQLite storage. See [the project scope](plan.md) for agreed behavior; mixed watch sessions, embedded playback, and automatic playback tracking remain outside the first release.

- [1. Set up an empty project with a passing test](https://github.com/xiaodlb/watchnext/issues/1)
- [2. Record the remaining first-release behavior decisions](https://github.com/xiaodlb/watchnext/issues/2)
- [3. Investigate metadata provider feasibility](https://github.com/xiaodlb/watchnext/issues/3)
- [4. Define the SQLite schema and migrations](https://github.com/xiaodlb/watchnext/issues/4)
- [5. Configure local database persistence](https://github.com/xiaodlb/watchnext/issues/5)
- [6. Build the application shell](https://github.com/xiaodlb/watchnext/issues/6)
- [7. Create groups and invite links](https://github.com/xiaodlb/watchnext/issues/7)
- [8. Resolve invitations and enforce group access](https://github.com/xiaodlb/watchnext/issues/8)
- [9. Create and select member profiles](https://github.com/xiaodlb/watchnext/issues/9)
- [10. Add titles manually](https://github.com/xiaodlb/watchnext/issues/10)
- [11. Display the active shared watchlist](https://github.com/xiaodlb/watchnext/issues/11)
- [12. Display title details and external watch links](https://github.com/xiaodlb/watchnext/issues/12)
- [13. Merge duplicate saves into contributor records](https://github.com/xiaodlb/watchnext/issues/13)
- [14. Allow contributors to edit title metadata](https://github.com/xiaodlb/watchnext/issues/14)
- [15. Remove contributions, archive, and restore titles](https://github.com/xiaodlb/watchnext/issues/15)
- [16. Define the metadata lookup interface](https://github.com/xiaodlb/watchnext/issues/16)
- [17. Implement YouTube video lookup](https://github.com/xiaodlb/watchnext/issues/17)
- [18. Implement Кинопоиск title lookup](https://github.com/xiaodlb/watchnext/issues/18)
- [19. Connect lookup results to the add-title form](https://github.com/xiaodlb/watchnext/issues/19)
- [20. Track personal series and anime progress](https://github.com/xiaodlb/watchnext/issues/20)
- [21. Track personal movie and video progress](https://github.com/xiaodlb/watchnext/issues/21)
- [22. Add shared individual ratings](https://github.com/xiaodlb/watchnext/issues/22)
- [23. Add shared personal notes](https://github.com/xiaodlb/watchnext/issues/23)
- [24. Implement viewer and episode eligibility rules](https://github.com/xiaodlb/watchnext/issues/24)
- [25. Implement time ranking and near-match fallback](https://github.com/xiaodlb/watchnext/issues/25)
- [26. Build the single-item picker screen](https://github.com/xiaodlb/watchnext/issues/26)
- [27. Implement Pick again without early repeats](https://github.com/xiaodlb/watchnext/issues/27)
- [28. Prepare repeatable academic demo data](https://github.com/xiaodlb/watchnext/issues/28)
- [29. Verify the complete local user journey](https://github.com/xiaodlb/watchnext/issues/29)
- [30. Document local setup, backup, and demonstration](https://github.com/xiaodlb/watchnext/issues/30)
