# JulyAI Core (Backend)

The backend service for the **JulyAI** Visual Intelligence Platform. It provides a robust API for the frontend visual editor, handling model validation, generative AI feedback, cloud compilation, and model training orchestration.

## Architecture & Stack
- **Framework:** FastAPI (Python)
- **AI Engine:** Google GenAI SDK (Gemini 2.0 Flash)
- **Deployment:** Google Cloud Run / RunPod containerization
- **Database:** Supabase (PostgreSQL)

## Key Responsibilities
1. **Model Validation (`compiler/`):** Validates the graph logic built from the frontend visual nodes.
2. **Generative Feedback (`routers/feedback.py`):** Uses Google Gemini to analyze the neural network architecture and provide educational/structural feedback.
3. **Training Orchestration (`training/`):** Compiles the visual graph into PyTorch code and orchestrates remote training jobs via RunPod flash instances.
4. **Deployments (`routers/deploy.py`):** Packages models and turns them into live inferencing endpoints.

## Setup Instructions

1. **Environment Initialization:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Configuration:**
   Set up your environment variables mirroring `.env.example` (ensure `GEMINI_API_KEY` is present).

3. **Database Setup (Supabase Migrations):**
   New database tables (like `deployments`) need to be created when setting up a new Supabase project.

   **Automatic Migration (Recommended):**
   Add your direct Postgres database inside `.env` to enable auto-migrations on startup:
   ```env
   SUPABASE_DB_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
   ```
   *You can find this URI in Supabase Dashboard > Settings > Database > Connection String.*

   **Manual Migration:**
   If you don't use `SUPABASE_DB_URL`, run the `.sql` files found in `backend/migrations/` inside your Supabase Dashboard SQL Editor manually.

4. **Running the Server:**
   ```bash
   python main.py
   ```
