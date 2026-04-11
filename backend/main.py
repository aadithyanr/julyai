"""AIPlayground Backend - FastAPI server for visual ML model building."""

import os

# Set SSL certs before any imports that trigger downloads (e.g. torchvision
# datasets). Ensures MNIST/CIFAR-10 etc. can download on systems where Python
# doesn't use the system CA bundle (e.g. some macOS installs).
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import feedback, graphs, datasets, training, models, export, deploy
from config import settings

app = FastAPI(
    title="JulyAI Core",
    description="Backend API for the JulyAI visual intelligence platform",
    version="1.0.0",
)

# CORS: allow frontend to connect
# Get allowed origins from environment variable or use defaults
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"https://.*[\._]?(najrudin\.com\.np|currycoder\.link)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(feedback.router)
app.include_router(graphs.router)
app.include_router(datasets.router)
app.include_router(training.router)
app.include_router(models.router)
app.include_router(export.router)
app.include_router(deploy.router)


@app.on_event("startup")
async def startup_auto_migrate_and_load():
    """Auto-create missing tables and load active deployments on server start."""
    from auto_migrate import run_auto_migrations
    run_auto_migrations()
    await deploy.load_all_deployments()


@app.get("/")
async def root():
    return {"status": "ok", "service": "JulyAI Architecture Service"}


@app.get("/health")
async def health():
    import torch

    return {
        "status": "healthy",
        "cuda_available": torch.cuda.is_available(),
        "device": str(torch.device("cuda" if torch.cuda.is_available() else "cpu")),
        "runpod_enabled": settings.runpod_enabled,
        "mode": "runpod" if settings.runpod_enabled else "local",
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8020, reload=True)
