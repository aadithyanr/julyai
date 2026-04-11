import os
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not url or not key:
    print("❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env")
    exit(1)

print(f"Connecting to: {url}")
supabase = create_client(url, key)

REQUIRED_TABLES = ['playgrounds', 'trained_models', 'user_histories', 'levels', 'datasets']
REQUIRED_BUCKETS = ['ai-models', 'datasets']

print("\n--- Checking Tables ---")
for table in REQUIRED_TABLES:
    try:
        # Just try to select 0 rows
        supabase.table(table).select("count", count="exact").limit(0).execute()
        print(f"✅ Table '{table}' exists.")
    except Exception as e:
        print(f"❌ Table '{table}' check failed: {e}")

print("\n--- Checking Buckets ---")
try:
    buckets = supabase.storage.list_buckets()
    bucket_names = [b.name for b in buckets]
    print(f"Buckets found: {bucket_names}")
    for b in REQUIRED_BUCKETS:
        if b in bucket_names:
            print(f"✅ Bucket '{b}' exists.")
        else:
            print(f"❌ Bucket '{b}' is MISSING (Create it in Supabase Storage and make it PUBLIC)")
except Exception as e:
    print(f"❌ Storage check failed: {e}")

print("\n--- Checking Auth ---")
try:
    # Just check if we can reach the health endpoint implicitly
    res = supabase.auth.get_user()
    print("✅ Auth system reachable.")
except Exception as e:
    # This might fail if key is service role but that's okay, it means it's reachable
    print(f"ℹ️ Auth check note: {e}")
