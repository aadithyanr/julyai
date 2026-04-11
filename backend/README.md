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

## Setup Instructions

1. **Environment Initialization:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Configuration:**
   Set up your environment variables mirroring `.env.example` (ensure `GEMINI_API_KEY` is present).

3. **Running the Server:**
   ```bash
   python main.py
   ```
