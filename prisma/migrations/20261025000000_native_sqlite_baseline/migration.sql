-- WatchNext native SQLite baseline for Prisma Migrate.
-- Existing native databases are marked as applied with `prisma migrate resolve --applied`; never deploy this baseline over them.
-- Fresh disposable databases receive the same immutable 0001–0005 schema and application ledger.
-- The native migration's transaction-local defer_foreign_keys toggles are deliberately omitted here: this baseline starts empty, and the schema protection itself is unchanged.

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY, filename TEXT NOT NULL, checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- BEGIN native/0001_initial.sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) > 0),
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 40 AND instr(name, char(0)) = 0),
  name_key TEXT NOT NULL CHECK(length(name_key) > 0),
  avatar_color TEXT NOT NULL CHECK(length(avatar_color) = 7 AND avatar_color GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(group_id, name_key),
  UNIQUE(id, group_id)
) STRICT;

CREATE TABLE titles (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200 AND instr(title, char(0)) = 0),
  title_key TEXT NOT NULL CHECK(length(title_key) > 0),
  content_type TEXT NOT NULL CHECK(content_type IN ('movie', 'series', 'anime', 'youtube')),
  duration_seconds INTEGER NOT NULL CHECK(duration_seconds BETWEEN 1 AND 86400),
  numbering_style TEXT NOT NULL CHECK(numbering_style IN ('none', 'season_episode', 'continuous')),
  provider_namespace TEXT,
  provider_id TEXT,
  source_url TEXT,
  watch_url TEXT,
  cover_url TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK((content_type IN ('movie', 'youtube') AND numbering_style = 'none') OR
        (content_type IN ('series', 'anime') AND numbering_style IN ('season_episode', 'continuous'))),
  CHECK((provider_namespace IS NULL AND provider_id IS NULL) OR
        (provider_namespace IS NOT NULL AND length(trim(provider_namespace)) > 0 AND
         provider_id IS NOT NULL AND length(trim(provider_id)) > 0)),
  UNIQUE(group_id, content_type, title_key),
  UNIQUE(group_id, provider_namespace, provider_id),
  UNIQUE(id, group_id),
  UNIQUE(id, group_id, numbering_style)
) STRICT;

CREATE INDEX titles_active ON titles(group_id, archived);

CREATE TABLE title_genres (
  title_id TEXT NOT NULL REFERENCES titles(id),
  genre_key TEXT NOT NULL CHECK(length(genre_key) > 0),
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 40 AND instr(label, char(0)) = 0),
  PRIMARY KEY(title_id, genre_key)
) STRICT;

CREATE TRIGGER genre_limit BEFORE INSERT ON title_genres
WHEN (SELECT count(*) FROM title_genres WHERE title_id = NEW.title_id) >= 10
BEGIN SELECT RAISE(ABORT, 'At most ten genres per title'); END;

CREATE TRIGGER genre_limit_move BEFORE UPDATE OF title_id ON title_genres
WHEN OLD.title_id <> NEW.title_id AND
     (SELECT count(*) FROM title_genres WHERE title_id = NEW.title_id) >= 10
BEGIN SELECT RAISE(ABORT, 'At most ten genres per title'); END;

CREATE TABLE moods (
  code TEXT PRIMARY KEY CHECK(code IN ('funny', 'relaxing', 'exciting', 'dark', 'emotional')),
  label TEXT NOT NULL UNIQUE
) STRICT;

INSERT INTO moods(code, label) VALUES
  ('funny', 'Funny'), ('relaxing', 'Relaxing'), ('exciting', 'Exciting'),
  ('dark', 'Dark'), ('emotional', 'Emotional');

CREATE TABLE title_moods (
  title_id TEXT NOT NULL REFERENCES titles(id),
  mood_code TEXT NOT NULL REFERENCES moods(code),
  PRIMARY KEY(title_id, mood_code)
) STRICT;

CREATE TABLE contributors (
  group_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(title_id, member_id),
  FOREIGN KEY(title_id, group_id) REFERENCES titles(id, group_id),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id)
) STRICT;

CREATE TABLE progress (
  group_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  numbering_style TEXT NOT NULL,
  position_state TEXT NOT NULL DEFAULT 'unknown' CHECK(position_state IN ('unknown', 'not_started', 'in_progress')),
  next_season INTEGER,
  next_episode INTEGER,
  timestamp_seconds INTEGER CHECK(timestamp_seconds BETWEEN 0 AND 86400),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
  PRIMARY KEY(title_id, member_id),
  FOREIGN KEY(title_id, group_id, numbering_style) REFERENCES titles(id, group_id, numbering_style),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id),
  CHECK(next_season IS NULL OR next_season BETWEEN 1 AND 9999),
  CHECK(next_episode IS NULL OR next_episode BETWEEN 1 AND 9999),
  CHECK((numbering_style = 'none' AND next_season IS NULL AND next_episode IS NULL) OR
        (numbering_style IN ('season_episode', 'continuous') AND timestamp_seconds IS NULL AND
          ((position_state = 'unknown' AND next_season IS NULL AND next_episode IS NULL) OR
           (position_state IN ('not_started', 'in_progress') AND next_episode IS NOT NULL AND
             ((numbering_style = 'season_episode' AND next_season IS NOT NULL) OR
              (numbering_style = 'continuous' AND next_season IS NULL)) AND
             (position_state <> 'not_started' OR
               (next_episode = 1 AND (next_season IS NULL OR next_season = 1)))))))
) STRICT;

CREATE TRIGGER timestamp_insert BEFORE INSERT ON progress
WHEN NEW.timestamp_seconds > (SELECT duration_seconds FROM titles WHERE id = NEW.title_id)
BEGIN SELECT RAISE(ABORT, 'Timestamp exceeds current duration'); END;

CREATE TRIGGER timestamp_update BEFORE UPDATE OF timestamp_seconds, title_id ON progress
WHEN NEW.timestamp_seconds > (SELECT duration_seconds FROM titles WHERE id = NEW.title_id)
BEGIN SELECT RAISE(ABORT, 'Timestamp exceeds current duration'); END;

CREATE TABLE ratings (
  group_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),
  PRIMARY KEY(title_id, member_id),
  FOREIGN KEY(title_id, group_id) REFERENCES titles(id, group_id),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id)
) STRICT;

CREATE TABLE notes (
  group_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000 AND instr(body, char(0)) = 0),
  PRIMARY KEY(title_id, member_id),
  FOREIGN KEY(title_id, group_id) REFERENCES titles(id, group_id),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id)
) STRICT;

CREATE TRIGGER protect_history_type BEFORE UPDATE OF content_type, numbering_style ON titles
WHEN (OLD.content_type <> NEW.content_type OR OLD.numbering_style <> NEW.numbering_style) AND
     (EXISTS(SELECT 1 FROM progress WHERE title_id = OLD.id) OR
      EXISTS(SELECT 1 FROM ratings WHERE title_id = OLD.id) OR
      EXISTS(SELECT 1 FROM notes WHERE title_id = OLD.id))
BEGIN SELECT RAISE(ABORT, 'Cannot change content type or numbering with member history'); END;

-- END native/0001_initial.sql

-- BEGIN native/0002_group_sessions.sql
CREATE UNIQUE INDEX invitations_id_group ON invitations(id, group_id);

CREATE TABLE group_sessions (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash) = 64),
  group_id TEXT NOT NULL REFERENCES groups(id),
  invitation_id TEXT NOT NULL,
  active_member_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY(invitation_id, group_id) REFERENCES invitations(id, group_id),
  FOREIGN KEY(active_member_id, group_id) REFERENCES members(id, group_id)
) STRICT;

-- END native/0002_group_sessions.sql

-- BEGIN native/0003_metadata_lifecycle.sql
DROP TRIGGER timestamp_insert;
DROP TRIGGER timestamp_update;
CREATE TABLE titles_replacement (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id),
  title TEXT CHECK(length(trim(title)) BETWEEN 1 AND 200 AND instr(title, char(0)) = 0),
  title_key TEXT CHECK(length(title_key) > 0),
  content_type TEXT CHECK(content_type IN ('movie', 'series', 'anime', 'youtube')),
  duration_seconds INTEGER CHECK(duration_seconds BETWEEN 1 AND 86400),
  numbering_style TEXT NOT NULL CHECK(numbering_style IN ('none', 'season_episode', 'continuous')),
  provider_namespace TEXT,
  provider_id TEXT,
  source_url TEXT,
  watch_url TEXT,
  cover_url TEXT,
  metadata_unavailable INTEGER NOT NULL DEFAULT 0 CHECK(metadata_unavailable IN (0,1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK((title IS NOT NULL AND title_key IS NOT NULL AND content_type IS NOT NULL AND duration_seconds IS NOT NULL) OR (metadata_unavailable=1 AND provider_namespace IS NOT NULL)),
  CHECK((content_type IN ('movie', 'youtube') AND numbering_style = 'none') OR
        (content_type IN ('series', 'anime') AND numbering_style IN ('season_episode', 'continuous'))),
  CHECK((provider_namespace IS NULL AND provider_id IS NULL) OR
        (provider_namespace IS NOT NULL AND length(trim(provider_namespace)) > 0 AND
         provider_id IS NOT NULL AND length(trim(provider_id)) > 0)),
  UNIQUE(group_id, content_type, title_key),
  UNIQUE(group_id, provider_namespace, provider_id),
  UNIQUE(id, group_id),
  UNIQUE(id, group_id, numbering_style)
) STRICT;


INSERT INTO titles_replacement(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id,source_url,watch_url,cover_url,archived,created_at) SELECT id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id,source_url,watch_url,cover_url,archived,created_at FROM titles;
DROP TABLE titles;
ALTER TABLE titles_replacement RENAME TO titles;
CREATE INDEX titles_active ON titles(group_id,archived);
CREATE TRIGGER timestamp_insert BEFORE INSERT ON progress
WHEN NEW.timestamp_seconds > (SELECT duration_seconds FROM titles WHERE id = NEW.title_id)
BEGIN SELECT RAISE(ABORT, 'Timestamp exceeds current duration'); END;

CREATE TRIGGER timestamp_update BEFORE UPDATE OF timestamp_seconds, title_id ON progress
WHEN NEW.timestamp_seconds > (SELECT duration_seconds FROM titles WHERE id = NEW.title_id)
BEGIN SELECT RAISE(ABORT, 'Timestamp exceeds current duration'); END;

CREATE TRIGGER protect_history_type BEFORE UPDATE OF content_type, numbering_style ON titles
WHEN (OLD.content_type <> NEW.content_type OR OLD.numbering_style <> NEW.numbering_style) AND
     (EXISTS(SELECT 1 FROM progress WHERE title_id = OLD.id) OR
      EXISTS(SELECT 1 FROM ratings WHERE title_id = OLD.id) OR
      EXISTS(SELECT 1 FROM notes WHERE title_id = OLD.id))
BEGIN SELECT RAISE(ABORT, 'Cannot change content type or numbering with member history'); END;

CREATE TABLE metadata_fields (
 title_id TEXT NOT NULL REFERENCES titles(id),
 field TEXT NOT NULL CHECK(field IN ('title','contentType','duration','genres','sourceUrl','watchUrl','coverUrl')),
 origin TEXT NOT NULL CHECK(origin IN ('provider','user')),
 cleared INTEGER NOT NULL DEFAULT 0 CHECK(cleared IN (0,1)),
 retrieved_at TEXT, expires_at TEXT,
 CHECK(origin='user' OR (retrieved_at IS NOT NULL AND expires_at IS NOT NULL)),
 PRIMARY KEY(title_id,field)
) STRICT;
CREATE INDEX metadata_expiry ON metadata_fields(origin,expires_at);
CREATE TABLE metadata_reviews (
 handle_hash TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES groups(id), member_id TEXT NOT NULL, session_id TEXT NOT NULL,
 expires_at TEXT NOT NULL, payload TEXT NOT NULL,
 FOREIGN KEY(member_id,group_id) REFERENCES members(id,group_id)
) STRICT;
CREATE INDEX metadata_review_expiry ON metadata_reviews(expires_at);

-- Rebuilding a referenced table leaves SQLite's deferred DROP counter pending.
-- Check every actual reference before resetting that counter; foreign_keys stays ON.
CREATE TEMP TABLE metadata_fk_assertion(ok INTEGER CHECK(ok=1));
INSERT INTO metadata_fk_assertion SELECT NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check);
DROP TABLE metadata_fk_assertion;

-- END native/0003_metadata_lifecycle.sql

-- BEGIN native/0004_accounts_memberships.sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL CHECK(length(username) BETWEEN 3 AND 32 AND instr(username,char(0)) = 0 AND username NOT GLOB '*[^A-Za-z0-9_.-]*'),
  username_key TEXT NOT NULL UNIQUE CHECK(username_key = lower(username) AND length(username_key) BETWEEN 3 AND 32),
  password_version INTEGER NOT NULL CHECK(password_version = 1),
  password_algorithm TEXT NOT NULL CHECK(password_algorithm = 'scrypt'),
  password_hash TEXT NOT NULL CHECK(length(password_hash) = 128 AND instr(password_hash,char(0)) = 0 AND password_hash NOT GLOB '*[^0-9a-f]*'),
  password_salt TEXT NOT NULL CHECK(length(password_salt) = 32 AND instr(password_salt,char(0)) = 0 AND password_salt NOT GLOB '*[^0-9a-f]*'),
  password_n INTEGER NOT NULL CHECK(password_n BETWEEN 16384 AND 1048576 AND (password_n & (password_n - 1)) = 0),
  password_r INTEGER NOT NULL CHECK(password_r BETWEEN 1 AND 32),
  password_p INTEGER NOT NULL CHECK(password_p BETWEEN 1 AND 16),
  password_maxmem INTEGER NOT NULL CHECK(password_maxmem BETWEEN 16777216 AND 2147483647),
  recovery_digest TEXT NOT NULL CHECK(length(recovery_digest) = 64 AND instr(recovery_digest,char(0)) = 0 AND recovery_digest NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash) = 64 AND instr(token_hash,char(0)) = 0 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL CHECK(created_at >= 0),
  expires_at INTEGER NOT NULL CHECK(expires_at > created_at),
  revoked_at INTEGER CHECK(revoked_at >= created_at)
) STRICT;
CREATE INDEX account_sessions_account ON account_sessions(account_id, expires_at);

ALTER TABLE groups ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'legacy' CHECK(access_mode IN ('legacy', 'account'));
ALTER TABLE groups ADD COLUMN owner_account_id TEXT REFERENCES accounts(id)
  CHECK((access_mode = 'legacy' AND owner_account_id IS NULL) OR (access_mode = 'account' AND owner_account_id IS NOT NULL));
ALTER TABLE groups ADD COLUMN invite_generation INTEGER NOT NULL DEFAULT 1 CHECK(invite_generation BETWEEN 1 AND 2147483647);
CREATE UNIQUE INDEX groups_id_mode ON groups(id, access_mode);
ALTER TABLE invitations ADD COLUMN generation INTEGER NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 2147483647);

-- Mode/ownership is chosen once at INSERT. Legacy identities cannot be claimed.
CREATE TRIGGER group_access_immutable BEFORE UPDATE OF access_mode, owner_account_id ON groups
WHEN NEW.access_mode <> OLD.access_mode OR NEW.owner_account_id IS NOT OLD.owner_account_id
BEGIN SELECT RAISE(ABORT, 'Group access mode and ownership are immutable'); END;
CREATE TRIGGER group_generation_monotonic BEFORE UPDATE OF invite_generation ON groups
WHEN NEW.invite_generation < OLD.invite_generation
BEGIN SELECT RAISE(ABORT, 'Invite generation cannot decrease'); END;

CREATE TABLE account_memberships (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  group_id TEXT NOT NULL,
  group_mode TEXT NOT NULL DEFAULT 'account' CHECK(group_mode = 'account'),
  member_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'removed')),
  joined_invite_generation INTEGER NOT NULL CHECK(joined_invite_generation BETWEEN 1 AND 2147483647),
  removed_invite_generation INTEGER CHECK(removed_invite_generation BETWEEN 1 AND 2147483647),
  removed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(account_id, group_id),
  FOREIGN KEY(group_id, group_mode) REFERENCES groups(id, access_mode),
  FOREIGN KEY(member_id, group_id) REFERENCES members(id, group_id),
  CHECK((status = 'active' AND removed_at IS NULL AND removed_invite_generation IS NULL) OR
        (status = 'removed' AND removed_at IS NOT NULL AND removed_invite_generation IS NOT NULL AND
         removed_invite_generation >= joined_invite_generation))
) STRICT;
CREATE INDEX account_memberships_live ON account_memberships(group_id, status, account_id);

CREATE TRIGGER membership_generation_insert BEFORE INSERT ON account_memberships
WHEN NEW.joined_invite_generation > (SELECT invite_generation FROM groups WHERE id = NEW.group_id)
  OR NEW.removed_invite_generation > (SELECT invite_generation FROM groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Membership generation exceeds current invite generation'); END;
CREATE TRIGGER membership_generation_update BEFORE UPDATE ON account_memberships
WHEN NEW.joined_invite_generation > (SELECT invite_generation FROM groups WHERE id = NEW.group_id)
  OR NEW.removed_invite_generation > (SELECT invite_generation FROM groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Membership generation exceeds current invite generation'); END;

CREATE TRIGGER membership_identity_immutable BEFORE UPDATE OF account_id, group_id, group_mode, member_id ON account_memberships
WHEN NEW.account_id <> OLD.account_id OR NEW.group_id <> OLD.group_id OR NEW.group_mode <> OLD.group_mode OR NEW.member_id <> OLD.member_id
BEGIN SELECT RAISE(ABORT, 'Membership identity is immutable'); END;
CREATE TRIGGER membership_preserve BEFORE DELETE ON account_memberships
BEGIN SELECT RAISE(ABORT, 'Remove membership without deleting its identity'); END;
CREATE TRIGGER membership_owner_active_insert BEFORE INSERT ON account_memberships
WHEN NEW.status = 'removed' AND NEW.account_id = (SELECT owner_account_id FROM groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Group owner must remain active'); END;
CREATE TRIGGER membership_owner_active_update BEFORE UPDATE OF status ON account_memberships
WHEN NEW.status = 'removed' AND NEW.account_id = (SELECT owner_account_id FROM groups WHERE id = NEW.group_id)
BEGIN SELECT RAISE(ABORT, 'Group owner must remain active'); END;
CREATE TRIGGER membership_rejoin_generation BEFORE UPDATE OF status, joined_invite_generation ON account_memberships
WHEN OLD.status = 'removed' AND NEW.status = 'active' AND NEW.joined_invite_generation <= OLD.removed_invite_generation
BEGIN SELECT RAISE(ABORT, 'Rejoin requires a newer invite generation'); END;

-- Legacy cookies must never point into an account-owned group.
CREATE TRIGGER group_session_legacy_insert BEFORE INSERT ON group_sessions
WHEN (SELECT access_mode FROM groups WHERE id = NEW.group_id) <> 'legacy'
BEGIN SELECT RAISE(ABORT, 'Legacy session requires a legacy group'); END;
CREATE TRIGGER group_session_legacy_update BEFORE UPDATE ON group_sessions
WHEN (SELECT access_mode FROM groups WHERE id = NEW.group_id) <> 'legacy'
BEGIN SELECT RAISE(ABORT, 'Legacy session requires a legacy group'); END;

-- END native/0004_accounts_memberships.sql

-- BEGIN native/0005_account_context.sql
ALTER TABLE account_sessions ADD COLUMN selected_group_id TEXT REFERENCES groups(id);
ALTER TABLE account_sessions ADD COLUMN context_revision INTEGER NOT NULL DEFAULT 0 CHECK(context_revision BETWEEN 0 AND 9007199254740990);
ALTER TABLE group_sessions ADD COLUMN context_revision INTEGER NOT NULL DEFAULT 0 CHECK(context_revision BETWEEN 0 AND 9007199254740990);
CREATE TRIGGER account_context_monotonic BEFORE UPDATE OF context_revision ON account_sessions
WHEN NEW.context_revision <= OLD.context_revision
BEGIN SELECT RAISE(ABORT, 'Context revision must increase'); END;
CREATE TRIGGER legacy_context_monotonic BEFORE UPDATE OF context_revision ON group_sessions
WHEN NEW.context_revision <= OLD.context_revision
BEGIN SELECT RAISE(ABORT, 'Context revision must increase'); END;
CREATE TABLE pending_group_invitations (
  intent_hash TEXT PRIMARY KEY CHECK(length(intent_hash)=64 AND intent_hash NOT GLOB '*[^0-9a-f]*'),
  invitation_id TEXT NOT NULL REFERENCES invitations(id),
  expires_at INTEGER NOT NULL CHECK(expires_at>=0)
) STRICT;
CREATE INDEX pending_group_invitations_expiry ON pending_group_invitations(expires_at);

-- END native/0005_account_context.sql

-- Preserve the immutable native application-ledger values.
INSERT INTO schema_migrations(version, filename, checksum) VALUES ('0001', '0001_initial.sql', 'ee5c35b2c3d857bb0b4ccdb2c2777c14901287af4fdb86684b009e72edbafaad');
INSERT INTO schema_migrations(version, filename, checksum) VALUES ('0002', '0002_group_sessions.sql', 'b85283d3d5cc256ac7f603b64fccbd438a23ada742d71287dcd8346effe125fb');
INSERT INTO schema_migrations(version, filename, checksum) VALUES ('0003', '0003_metadata_lifecycle.sql', '7aee1a402ad90911c01b6eadab68e2379612c6215c47945f794c746e070af927');
INSERT INTO schema_migrations(version, filename, checksum) VALUES ('0004', '0004_accounts_memberships.sql', '81e044ac0e8835bf619fde43de2c1337dabd5bf78e60519114934e640f8ead9d');
INSERT INTO schema_migrations(version, filename, checksum) VALUES ('0005', '0005_account_context.sql', '557c6bf6b34ee7ca855f8fc9eb4f6489f604be4ad8766f08a80291998a054c16');
