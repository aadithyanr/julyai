"""Auto-migration: ensure all required database tables exist on startup.

Uses Supabase's PostgREST to check if tables exist, and falls back to
direct PostgreSQL connection (psycopg2) for DDL execution when tables
are missing.

Configure SUPABASE_DB_URL in .env for auto-creation:
  SUPABASE_DB_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres

If SUPABASE_DB_URL is not set, the migration will log clear instructions
for manual table creation.

Safe to call on every server start — skips tables that already exist.
"""

import logging
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv
from config import settings

# Load .env so SUPABASE_DB_URL is available via os.getenv
# (pydantic-settings only loads declared fields, not extras)
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path, override=False)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Migration SQL — add new tables here
# ---------------------------------------------------------------------------

DEPLOYMENTS_SQL = """\
CREATE TABLE IF NOT EXISTS deployments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    playground_id UUID,
    model_id UUID,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'error')),
    graph_json JSONB NOT NULL,
    model_state_dict_b64 TEXT,
    input_shape JSONB,
    num_classes INTEGER DEFAULT 10,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deployments_api_key ON deployments(api_key);
CREATE INDEX IF NOT EXISTS idx_deployments_user_id ON deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
"""

_REQUIRED_TABLES: dict[str, str] = {
    "deployments": DEPLOYMENTS_SQL,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_rest_headers() -> dict[str, str]:
    key = (
        settings.supabase_service_role_key
        or settings.supabase_anon_key
        or settings.supabase_key
    )
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _table_exists(table_name: str) -> bool:
    """Check if a table exists via Supabase PostgREST (fast, no DB conn needed)."""
    try:
        url = f"{settings.supabase_url}/rest/v1/{table_name}?select=id&limit=0"
        resp = httpx.get(url, headers=_get_rest_headers(), timeout=10)
        return resp.status_code == 200
    except Exception:
        return False


def _run_sql_via_postgres(sql: str) -> bool:
    """Execute raw SQL via a direct PostgreSQL connection (psycopg2).

    Requires SUPABASE_DB_URL environment variable.
    """
    db_url = os.getenv("SUPABASE_DB_URL", "")
    if not db_url:
        return False

    try:
        import psycopg2
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.close()
        return True
    except ImportError:
        logger.debug("psycopg2 not installed — cannot auto-create tables")
        return False
    except Exception as e:
        logger.warning(f"PostgreSQL migration failed: {e}")
        return False


def _log_manual_instructions(table_name: str, sql: str) -> None:
    """Log clear instructions for manual table creation."""
    logger.warning(
        f"\n"
        f"{'=' * 60}\n"
        f"  TABLE '{table_name}' DOES NOT EXIST\n"
        f"\n"
        f"  Option 1 (automatic): Add to backend/.env:\n"
        f"    SUPABASE_DB_URL=postgresql://postgres.YOUR_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres\n"
        f"    (Find this in Supabase Dashboard > Settings > Database > Connection String)\n"
        f"\n"
        f"  Option 2 (manual): Run the SQL in Supabase Dashboard:\n"
        f"    Dashboard > SQL Editor > New Query > Paste contents of:\n"
        f"    backend/migrations/003_deployments.sql\n"
        f"{'=' * 60}"
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_auto_migrations() -> None:
    """Check all required tables exist, auto-create missing ones.

    Priority:
    1. Check table via PostgREST (fast)
    2. If missing, try direct Postgres DDL (requires SUPABASE_DB_URL)
    3. If no DB URL, log manual instructions
    """
    if not settings.supabase_url:
        logger.info("Supabase not configured — skipping auto-migration")
        return

    all_ok = True
    for table_name, create_sql in _REQUIRED_TABLES.items():
        if _table_exists(table_name):
            logger.info(f"[migrate] Table '{table_name}' verified")
            continue

        logger.info(f"[migrate] Table '{table_name}' not found — attempting auto-create...")

        if _run_sql_via_postgres(create_sql):
            # Verify it actually worked
            if _table_exists(table_name):
                logger.info(f"[migrate] Auto-created table '{table_name}' successfully")
                continue
            else:
                logger.warning(f"[migrate] SQL ran but table '{table_name}' still not accessible via PostgREST. "
                               "You may need to grant permissions or refresh PostgREST schema cache.")

        _log_manual_instructions(table_name, create_sql)
        all_ok = False

    if all_ok:
        logger.info("[migrate] All required tables verified")
