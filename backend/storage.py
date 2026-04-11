"""Google Cloud Storage operations for dataset files."""

from google.cloud import storage
from datetime import timedelta
from google.auth import default as auth_default
from google.auth.transport import requests as auth_requests
from config import settings


def get_gcs_client() -> storage.Client:
    return storage.Client()


def get_bucket() -> storage.Bucket:
    client = get_gcs_client()
    return client.bucket(settings.gcs_bucket_name)


def upload_to_gcs(data: bytes, gcs_path: str, content_type: str = "application/octet-stream") -> str:
    """Upload bytes to GCS. Returns the gcs_path."""
    bucket = get_bucket()
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(data, content_type=content_type)
    return gcs_path


def generate_signed_url(gcs_path: str, expiration_hours: int = 1) -> str:
    """Generate a time-limited signed URL for downloading from GCS.

    Uses IAM-based signing so it works with any credential type
    (OAuth, service account, workload identity, etc.) without
    requiring a local private key.
    """
    credentials, project = auth_default()
    # Refresh credentials so .token is populated
    credentials.refresh(auth_requests.Request())

    if hasattr(credentials, "service_account_email"):
        service_account_email = credentials.service_account_email
    else:
        # For OAuth/user credentials, fall back to the default compute SA
        service_account_email = settings.gcs_signing_service_account

    bucket = get_bucket()
    blob = bucket.blob(gcs_path)
    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=expiration_hours),
        method="GET",
        service_account_email=service_account_email,
        access_token=credentials.token,
    )
    return url


def generate_signed_upload_url(gcs_path: str, expiration_hours: int = 1, content_type: str = "application/octet-stream") -> str:
    """Generate a time-limited signed URL for uploading to GCS."""
    credentials, project = auth_default()
    credentials.refresh(auth_requests.Request())

    if hasattr(credentials, "service_account_email"):
        service_account_email = credentials.service_account_email
    else:
        service_account_email = f"{project}@julyai-core.iam.gserviceaccount.com"

    bucket = get_bucket()
    blob = bucket.blob(gcs_path)
    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(hours=expiration_hours),
        method="PUT",
        content_type=content_type,
        service_account_email=service_account_email,
        access_token=credentials.token,
    )
    return url


def delete_from_gcs(gcs_path: str) -> None:
    """Delete an object from GCS."""
    bucket = get_bucket()
    blob = bucket.blob(gcs_path)
    blob.delete()


# --- Supabase Storage Helpers ---

def upload_to_supabase(data: bytes, path: str, bucket_name: str, content_type: str = "application/octet-stream"):
    """Upload bytes to a Supabase storage bucket."""
    from supabase_client import get_supabase_client
    supabase = get_supabase_client()
    
    # Ensure nested directories exist (Supabase does this automatically usually)
    res = supabase.storage.from_(bucket_name).upload(
        path,
        data,
        {"upsert": "true", "content-type": content_type}
    )
    # Check for error in response if not raised
    if hasattr(res, 'error') and res.error:
        raise Exception(f"Supabase storage upload error: {res.error}")
    return path


def delete_from_supabase(path: str, bucket_name: str):
    """Delete an object from a Supabase storage bucket."""
    from supabase_client import get_supabase_client
    supabase = get_supabase_client()
    supabase.storage.from_(bucket_name).remove([path])


def get_supabase_signed_url(path: str, bucket_name: str, expires_in: int = 3600):
    """Generate a signed URL for a Supabase storage object."""
    from supabase_client import get_supabase_client
    supabase = get_supabase_client()
    res = supabase.storage.from_(bucket_name).create_signed_url(path, expires_in)
    if isinstance(res, dict) and "signedURL" in res:
        return res["signedURL"]
    return res

