-- Migration: shared_playgrounds table
-- Stores shareable link tokens for playgrounds.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS shared_playgrounds (
    token        TEXT PRIMARY KEY,
    playground_id UUID NOT NULL,
    user_id      UUID NOT NULL,
    name         TEXT NOT NULL DEFAULT 'Untitled',
    graph_json   JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_playground_id ON shared_playgrounds(playground_id);
CREATE INDEX IF NOT EXISTS idx_shared_user_id        ON shared_playgrounds(user_id);
