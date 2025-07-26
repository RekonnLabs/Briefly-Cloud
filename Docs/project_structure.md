# 📁 Project Structure – Briefly Cloud

## Frontend
- `app/` - Next.js App Router
- `components/` - Reusable UI components
- `lib/` - Frontend utilities (LLM caller, vector helper)
- `pages/` - Static exports (settings, pricing)
- `styles/` - Tailwind config + globals

## Backend
- `app/main.py` - FastAPI entry point
- `routes/` - Modular routes (e.g. /auth, /embed, /chat)
- `services/` - Logic for Drive/OneDrive/embedding
- `utils/` - Helper logic for file parsing, chunking, etc.
- `db/` - Vector store + Supabase client config

## Docs
- `PRD.md`, `implementation_plan.md`, etc.
