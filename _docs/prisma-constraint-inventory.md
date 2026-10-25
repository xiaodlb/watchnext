# Native SQLite constraint inventory (#48)

This inventory is deliberately more than the Prisma schema. `prisma/schema.prisma` maps every table, scalar, stable text ID, nullable acquired field, relation and native unique key. It does **not** claim to make this database portable. “Adapter” means narrow SQLite-only SQL retained by a later adapter; “Service” means a portable domain invariant that #49–#51 must actively enforce.

| Native protection | Prisma mapping | Preservation owner |
| --- | --- | --- |
| `schema_migrations`: text primary version, filename/checksum/applied timestamp; ordered immutable prefix/checksum ledger | `SchemaMigration` model maps columns only | Adapter: `assertCurrentSchema`; baseline inserts exact 0001–0005 checksums. Never CRUD through Prisma. |
| All `STRICT` tables: schema_migrations, groups, invitations, members, titles, title_genres, moods, title_moods, contributors, progress, ratings, notes, group_sessions, metadata_fields/reviews, accounts/sessions/memberships, pending invitations | Prisma has scalar types, but no `STRICT` declaration | Adapter raw DDL baseline/native migrations. |
| `groups`: trimmed 1–80 name; access mode legacy/account; owner/null pairing; generation 1..2^31-1 | `Group` columns/defaults/owner relation | Service validates input; adapter keeps native CHECK. |
| `invitations`: non-empty unique token hash, group FK, generation range; `(id,group_id)` unique | `Invitation` unique/composite relation | Service creates/revokes opaque hash; adapter preserves CHECK/FK. |
| `members`: trimmed/no-NUL name 1–40, nonempty key, hex colour, `(group_id,name_key)` and `(id,group_id)` unique | `Member` scalar and both unique keys | Service validates canonical name/colour; adapter preserves CHECK. |
| `titles`: nullable acquired metadata only with `metadata_unavailable=1` provider; title/key/type/duration ranges; type-numbering pairing; provider namespace/id pairing; archived 0/1; three composite unique keys | `Title` optional acquired fields, booleans, four composite unique keys | Service metadata admission/type rules; adapter keeps every CHECK. |
| `titles_active(group_id,archived)` | `Title @@index` | Prisma maps index. |
| Native named indexes: `invitations_id_group`, `groups_id_mode`, `account_sessions_account`, `account_memberships_live`, `metadata_expiry`, `metadata_review_expiry`, `pending_group_invitations_expiry` (plus `titles_active`) | Matching `@@unique` / `@@index` declarations where representable | Prisma maps lookup/unique indexes; raw baseline preserves names and all native implicit PK/UNIQUE indexes. |
| `title_genres`: nonempty key, label 1–40/no-NUL, `(title_id,genre_key)` PK | `TitleGenre` composite ID | Service validates labels; adapter preserves CHECK. |
| `genre_limit`, `genre_limit_move`: maximum ten genres after insert/move | no trigger mapping | Adapter trigger; service also enforces user-facing limit. |
| `moods`: fixed five codes and unique label; `title_moods` two FKs/composite PK | `Mood`, `TitleMood` mapping | Adapter CHECK and seed rows; service only accepts fixed list. |
| `contributors`: composite title/member same-group FKs and `(title_id,member_id)` PK | `Contributor` compound relations/ID | Prisma maps relations; adapter preserves cross-group foreign keys. |
| `progress`: same-group composite FKs, state enum, coordinate/timestamp bounds, style/position consistency, completed boolean | `Progress` compound relations/ID, scalar types | Service owns progress transition semantics; adapter preserves CHECK. |
| `timestamp_insert`, `timestamp_update`: timestamp may not exceed current title duration | no trigger mapping | Adapter trigger; service validates on write. |
| `ratings`: same-group FKs, 1–10 score, composite PK | `Rating` mapping | Service validates score; adapter preserves CHECK/FK. |
| `notes`: same-group FKs, trimmed/no-NUL 1–2000 body, composite PK | `Note` mapping | Service validates text; adapter preserves CHECK/FK. |
| `protect_history_type`: block type/numbering change when progress/rating/note exists | no trigger mapping | Adapter trigger; service emits a domain error. |
| `invitations_id_group` | `Invitation @@unique([id,groupId])` | Prisma maps unique index. |
| `group_sessions`: 64-char token hash, group/invitation/member composite FKs and context revision bounds | `GroupSession` relations/scalars | Adapter preserves CHECK/FKs; service validates credential/context. |
| `accounts`: username/key constraints, fixed scrypt/version, hex hash/salt/recovery digest, scrypt parameter ranges | `Account` scalar mapping/username unique | Service owns credential hashing/validation; adapter preserves CHECK. |
| `account_sessions`: hex token, account FK, integer expiry/revocation ordering; account/expiry index; selected group/context revision | `AccountSession`, index and selected group relation | Service expires/revokes sessions; adapter preserves CHECK/FK. |
| `group_access_immutable`, `group_generation_monotonic` | no trigger mapping | Adapter triggers; service requires immutable mode/owner and monotonic generation. |
| `account_memberships`: account/group/member FKs, account-only mode, status/removal pairing, generation bounds, compound PK/unique member and live index | `AccountMembership` compound relations/keys/index | Service owns membership state; adapter preserves CHECK/FK. |
| `membership_generation_insert/update`, `membership_identity_immutable`, `membership_preserve`, `membership_owner_active_insert/update`, `membership_rejoin_generation` | no trigger mapping | Adapter triggers; service mirrors authorization/generation semantics. |
| `group_session_legacy_insert/update` | no trigger mapping | Adapter triggers; service separates legacy/account contexts. |
| `account_context_monotonic`, `legacy_context_monotonic` | no trigger mapping | Adapter triggers; service increments context revisions. |
| `metadata_fields`: fixed field/origin enum, cleared flag, provider timestamps required, composite key, expiry index | `MetadataField` mapping/index | Service owns provenance/expiry; adapter preserves CHECK. |
| `metadata_reviews`: handle hash PK, group/member FKs, expiry index | `MetadataReview` compound relation/index | Service owns review TTL/payload safety; adapter preserves FK. |
| `pending_group_invitations`: hex intent hash, invitation FK, nonnegative expiry, expiry index | `PendingGroupInvitation` mapping/index | Service owns intent expiry; adapter preserves CHECK/FK. |
| `PRAGMA foreign_keys=ON`, native migration-local `defer_foreign_keys=ON/OFF`, five-second `busy_timeout`, `BEGIN IMMEDIATE` mutation batches | no Prisma schema equivalent | SQLite adapter operation; #49/#50 must retain it. The baseline omits only the temporary defer toggles because it starts from an empty database. |
| `PRAGMA secure_delete=ON` for sensitive local SQLite data | no Prisma schema equivalent | SQLite adapter opens/enables it; backup/restore uses native WAL-safe tooling. |

`#49` owns identity, sessions, groups, memberships, invitations and their service invariants. `#50` owns titles, contributions, history, metadata and picker projections. `#51` is the first task allowed to select Prisma for the complete HTTP application and must prove the adapter/service split under restart and backup conditions.
