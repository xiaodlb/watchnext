-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "schema_migrations" (
    "version" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "applied_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_mode" TEXT NOT NULL DEFAULT 'legacy',
    "owner_account_id" TEXT,
    "invite_generation" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "revoked_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generation" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "avatar_color" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "titles" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "title" TEXT,
    "title_key" TEXT,
    "content_type" TEXT,
    "duration_seconds" INTEGER,
    "numbering_style" TEXT NOT NULL,
    "provider_namespace" TEXT,
    "provider_id" TEXT,
    "source_url" TEXT,
    "watch_url" TEXT,
    "cover_url" TEXT,
    "metadata_unavailable" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_genres" (
    "title_id" TEXT NOT NULL,
    "genre_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "title_genres_pkey" PRIMARY KEY ("title_id","genre_key")
);

-- CreateTable
CREATE TABLE "moods" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "moods_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "title_moods" (
    "title_id" TEXT NOT NULL,
    "mood_code" TEXT NOT NULL,

    CONSTRAINT "title_moods_pkey" PRIMARY KEY ("title_id","mood_code")
);

-- CreateTable
CREATE TABLE "contributors" (
    "group_id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributors_pkey" PRIMARY KEY ("title_id","member_id")
);

-- CreateTable
CREATE TABLE "progress" (
    "group_id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "numbering_style" TEXT NOT NULL,
    "position_state" TEXT NOT NULL DEFAULT 'unknown',
    "next_season" INTEGER,
    "next_episode" INTEGER,
    "timestamp_seconds" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "progress_pkey" PRIMARY KEY ("title_id","member_id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "group_id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("title_id","member_id")
);

-- CreateTable
CREATE TABLE "notes" (
    "group_id" TEXT NOT NULL,
    "title_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("title_id","member_id")
);

-- CreateTable
CREATE TABLE "group_sessions" (
    "token_hash" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "invitation_id" TEXT NOT NULL,
    "active_member_id" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context_revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "group_sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "username_key" TEXT NOT NULL,
    "password_version" INTEGER NOT NULL,
    "password_algorithm" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "password_salt" TEXT NOT NULL,
    "password_n" INTEGER NOT NULL,
    "password_r" INTEGER NOT NULL,
    "password_p" INTEGER NOT NULL,
    "password_maxmem" INTEGER NOT NULL,
    "recovery_digest" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_sessions" (
    "token_hash" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "expires_at" BIGINT NOT NULL,
    "revoked_at" BIGINT,
    "selected_group_id" TEXT,
    "context_revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "account_sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateTable
CREATE TABLE "account_memberships" (
    "account_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "group_mode" TEXT NOT NULL DEFAULT 'account',
    "member_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "joined_invite_generation" INTEGER NOT NULL,
    "removed_invite_generation" INTEGER,
    "removed_at" TEXT,
    "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_memberships_pkey" PRIMARY KEY ("account_id","group_id")
);

-- CreateTable
CREATE TABLE "metadata_fields" (
    "title_id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "retrieved_at" TEXT,
    "expires_at" TEXT,

    CONSTRAINT "metadata_fields_pkey" PRIMARY KEY ("title_id","field")
);

-- CreateTable
CREATE TABLE "metadata_reviews" (
    "handle_hash" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "expires_at" TEXT NOT NULL,
    "payload" TEXT NOT NULL,

    CONSTRAINT "metadata_reviews_pkey" PRIMARY KEY ("handle_hash")
);

-- CreateTable
CREATE TABLE "pending_group_invitations" (
    "intent_hash" TEXT NOT NULL,
    "invitation_id" TEXT NOT NULL,
    "expires_at" BIGINT NOT NULL,

    CONSTRAINT "pending_group_invitations_pkey" PRIMARY KEY ("intent_hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_id_access_mode_key" ON "groups"("id", "access_mode");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_id_group_id_key" ON "invitations"("id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_group_id_name_key_key" ON "members"("group_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "members_id_group_id_key" ON "members"("id", "group_id");

-- CreateIndex
CREATE INDEX "titles_active" ON "titles"("group_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "titles_group_id_content_type_title_key_key" ON "titles"("group_id", "content_type", "title_key");

-- CreateIndex
CREATE UNIQUE INDEX "titles_group_id_provider_namespace_provider_id_key" ON "titles"("group_id", "provider_namespace", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "titles_id_group_id_key" ON "titles"("id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "titles_id_group_id_numbering_style_key" ON "titles"("id", "group_id", "numbering_style");

-- CreateIndex
CREATE UNIQUE INDEX "moods_label_key" ON "moods"("label");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_username_key_key" ON "accounts"("username_key");

-- CreateIndex
CREATE INDEX "account_sessions_account" ON "account_sessions"("account_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "account_memberships_member_id_key" ON "account_memberships"("member_id");

-- CreateIndex
CREATE INDEX "account_memberships_live" ON "account_memberships"("group_id", "status", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_memberships_member_id_group_id_key" ON "account_memberships"("member_id", "group_id");

-- CreateIndex
CREATE INDEX "metadata_expiry" ON "metadata_fields"("origin", "expires_at");

-- CreateIndex
CREATE INDEX "metadata_review_expiry" ON "metadata_reviews"("expires_at");

-- Provider-specific integrity protections. Prisma models the portable table
-- shape; these native PostgreSQL guards mirror the important SQLite baseline
-- rules that must remain authoritative below the HTTP service.
ALTER TABLE "groups" ADD CONSTRAINT "groups_name_valid" CHECK (char_length(btrim("name")) BETWEEN 1 AND 80);
ALTER TABLE "groups" ADD CONSTRAINT "groups_access_valid" CHECK ("access_mode" IN ('legacy', 'account'));
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_valid" CHECK (("access_mode" = 'legacy' AND "owner_account_id" IS NULL) OR ("access_mode" = 'account' AND "owner_account_id" IS NOT NULL));
ALTER TABLE "groups" ADD CONSTRAINT "groups_generation_valid" CHECK ("invite_generation" BETWEEN 1 AND 2147483647);
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_generation_valid" CHECK ("generation" BETWEEN 1 AND 2147483647);
-- PostgreSQL text cannot contain a NUL character, so chr(0) must not be
-- evaluated in a CHECK expression (it raises an error on every insert).
ALTER TABLE "members" ADD CONSTRAINT "members_name_valid" CHECK (char_length(btrim("name")) BETWEEN 1 AND 40);
ALTER TABLE "titles" ADD CONSTRAINT "titles_complete_or_unavailable" CHECK (("title" IS NOT NULL AND "title_key" IS NOT NULL AND "content_type" IS NOT NULL AND "duration_seconds" IS NOT NULL) OR ("metadata_unavailable" = true AND "provider_namespace" IS NOT NULL));
ALTER TABLE "titles" ADD CONSTRAINT "titles_duration_valid" CHECK ("duration_seconds" IS NULL OR "duration_seconds" BETWEEN 1 AND 86400);
ALTER TABLE "titles" ADD CONSTRAINT "titles_type_valid" CHECK ("content_type" IS NULL OR "content_type" IN ('movie', 'series', 'anime', 'youtube'));
ALTER TABLE "titles" ADD CONSTRAINT "titles_numbering_valid" CHECK (("content_type" IS NULL) OR ("content_type" IN ('movie', 'youtube') AND "numbering_style" = 'none') OR ("content_type" IN ('series', 'anime') AND "numbering_style" IN ('season_episode', 'continuous')));
ALTER TABLE "titles" ADD CONSTRAINT "titles_provider_pair_valid" CHECK (("provider_namespace" IS NULL AND "provider_id" IS NULL) OR ("provider_namespace" IS NOT NULL AND char_length(btrim("provider_namespace")) > 0 AND "provider_id" IS NOT NULL AND char_length(btrim("provider_id")) > 0));
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_label_valid" CHECK (char_length(btrim("label")) BETWEEN 1 AND 40);
ALTER TABLE "moods" ADD CONSTRAINT "moods_fixed_codes" CHECK ("code" IN ('funny', 'relaxing', 'exciting', 'dark', 'emotional'));
INSERT INTO "moods" ("code", "label") VALUES
  ('funny', 'Funny'), ('relaxing', 'Relaxing'), ('exciting', 'Exciting'),
  ('dark', 'Dark'), ('emotional', 'Emotional');
ALTER TABLE "progress" ADD CONSTRAINT "progress_position_valid" CHECK ("position_state" IN ('unknown', 'not_started', 'in_progress'));
ALTER TABLE "progress" ADD CONSTRAINT "progress_coordinates_valid" CHECK (("next_season" IS NULL OR "next_season" BETWEEN 1 AND 9999) AND ("next_episode" IS NULL OR "next_episode" BETWEEN 1 AND 9999) AND ("timestamp_seconds" IS NULL OR "timestamp_seconds" BETWEEN 0 AND 86400));
ALTER TABLE "progress" ADD CONSTRAINT "progress_shape_valid" CHECK (("numbering_style" = 'none' AND "next_season" IS NULL AND "next_episode" IS NULL) OR ("numbering_style" IN ('season_episode', 'continuous') AND "timestamp_seconds" IS NULL AND (("position_state" = 'unknown' AND "next_season" IS NULL AND "next_episode" IS NULL) OR ("position_state" IN ('not_started', 'in_progress') AND "next_episode" IS NOT NULL AND (("numbering_style" = 'season_episode' AND "next_season" IS NOT NULL) OR ("numbering_style" = 'continuous' AND "next_season" IS NULL))))));
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_valid" CHECK ("score" BETWEEN 1 AND 10);
ALTER TABLE "notes" ADD CONSTRAINT "notes_body_valid" CHECK (char_length(btrim("body")) BETWEEN 1 AND 2000);
ALTER TABLE "metadata_fields" ADD CONSTRAINT "metadata_fields_valid" CHECK ("field" IN ('title','contentType','duration','genres','sourceUrl','watchUrl','coverUrl') AND "origin" IN ('provider','user') AND ("origin" = 'user' OR ("retrieved_at" IS NOT NULL AND "expires_at" IS NOT NULL)));
ALTER TABLE "account_memberships" ADD CONSTRAINT "memberships_valid" CHECK ("group_mode" = 'account' AND "status" IN ('active', 'removed') AND (("status" = 'active' AND "removed_at" IS NULL AND "removed_invite_generation" IS NULL) OR ("status" = 'removed' AND "removed_at" IS NOT NULL AND "removed_invite_generation" IS NOT NULL AND "removed_invite_generation" >= "joined_invite_generation")));

CREATE FUNCTION watchnext_genre_limit() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW."title_id" <> OLD."title_id") AND (SELECT count(*) FROM "title_genres" WHERE "title_id" = NEW."title_id") >= 10 THEN RAISE EXCEPTION 'At most ten genres per title'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER watchnext_genre_limit BEFORE INSERT OR UPDATE OF "title_id" ON "title_genres" FOR EACH ROW EXECUTE FUNCTION watchnext_genre_limit();

CREATE FUNCTION watchnext_timestamp_limit() RETURNS trigger AS $$
BEGIN
  IF NEW."timestamp_seconds" IS NOT NULL AND NEW."timestamp_seconds" > (SELECT "duration_seconds" FROM "titles" WHERE "id" = NEW."title_id") THEN RAISE EXCEPTION 'Timestamp exceeds current duration'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER watchnext_timestamp_limit BEFORE INSERT OR UPDATE OF "timestamp_seconds", "title_id" ON "progress" FOR EACH ROW EXECUTE FUNCTION watchnext_timestamp_limit();

-- CreateIndex
CREATE INDEX "pending_group_invitations_expiry" ON "pending_group_invitations"("expires_at");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_account_id_fkey" FOREIGN KEY ("owner_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "titles" ADD CONSTRAINT "titles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_moods" ADD CONSTRAINT "title_moods_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_moods" ADD CONSTRAINT "title_moods_mood_code_fkey" FOREIGN KEY ("mood_code") REFERENCES "moods"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_title_id_group_id_fkey" FOREIGN KEY ("title_id", "group_id") REFERENCES "titles"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_member_id_group_id_fkey" FOREIGN KEY ("member_id", "group_id") REFERENCES "members"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress" ADD CONSTRAINT "progress_title_id_group_id_numbering_style_fkey" FOREIGN KEY ("title_id", "group_id", "numbering_style") REFERENCES "titles"("id", "group_id", "numbering_style") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress" ADD CONSTRAINT "progress_member_id_group_id_fkey" FOREIGN KEY ("member_id", "group_id") REFERENCES "members"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_title_id_group_id_fkey" FOREIGN KEY ("title_id", "group_id") REFERENCES "titles"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_member_id_group_id_fkey" FOREIGN KEY ("member_id", "group_id") REFERENCES "members"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_title_id_group_id_fkey" FOREIGN KEY ("title_id", "group_id") REFERENCES "titles"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_member_id_group_id_fkey" FOREIGN KEY ("member_id", "group_id") REFERENCES "members"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_invitation_id_group_id_fkey" FOREIGN KEY ("invitation_id", "group_id") REFERENCES "invitations"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_active_member_id_group_id_fkey" FOREIGN KEY ("active_member_id", "group_id") REFERENCES "members"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_sessions" ADD CONSTRAINT "account_sessions_selected_group_id_fkey" FOREIGN KEY ("selected_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_memberships" ADD CONSTRAINT "account_memberships_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_memberships" ADD CONSTRAINT "account_memberships_group_id_group_mode_fkey" FOREIGN KEY ("group_id", "group_mode") REFERENCES "groups"("id", "access_mode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_memberships" ADD CONSTRAINT "account_memberships_member_id_group_id_fkey" FOREIGN KEY ("member_id", "group_id") REFERENCES "members"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_fields" ADD CONSTRAINT "metadata_fields_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "titles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_reviews" ADD CONSTRAINT "metadata_reviews_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metadata_reviews" ADD CONSTRAINT "metadata_reviews_member_id_group_id_fkey" FOREIGN KEY ("member_id", "group_id") REFERENCES "members"("id", "group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_group_invitations" ADD CONSTRAINT "pending_group_invitations_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
