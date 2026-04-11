# JulyAI

**The Premium Visual Intelligence Platform**

JulyAI is a state-of-the-art visual node-based editor for designing, composing, and training neural networks directly in the browser. It combines a stunning "Obsidian Dark" interface with powerful AI orchestration powered by Google Gemini 2.0 Flash.

## Highlights
- **Visual Node Editor:** Drag and drop neural network layers (Linear, Conv2D, Dropout, etc.) to build architectures interactively.
- **Obsidian Dark Theme:** A beautifully crafted, premium dark mode optimized for long sessions of deep work.
- **Gemini-Powered Engine:** Integrated with Google Gemini for real-time architectural feedback, validation, and insight generation.
- **Supabase Authentication:** Secure, email-based authentication and cloud syncing for your models.
- **RunPod Integration:** Seamless provisioning of cloud GPUs for training your models.

## Repository Structure
- `/frontend`: Next.js 14 application containing the visual editor, dashboard, and design system.
- `/backend`: FastAPI Python server handling AI orchestration, model compilation, training jobs, and database interactions.

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Database Initialization
JulyAI uses Supabase. Ensure you set `SUPABASE_DB_URL` in `backend/.env` with your direct Postgres URL so the backend can automatically run migrations (create tables) when setting up a fresh Supabase project. Alternatively, manually run the `.sql` files in `backend/migrations/` in your Supabase SQL editor.

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

## License
Proprietary and Confidential. Default rights reserved to the authors of JulyAI.
