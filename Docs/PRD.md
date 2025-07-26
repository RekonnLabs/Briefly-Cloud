# 📄 Product Requirements Document (PRD) – Briefly Cloud v1.0

## 🎯 Overview
Briefly Cloud is a document-aware productivity assistant that allows users to connect cloud storage (Google Drive or OneDrive) and receive intelligent, context-aware answers using GPT-4o or their own LLM API (BYOK). It runs as a locally installed app (Electron) and is focused on fast, reliable retrieval of knowledge from the user's own documents.

## 🚀 Core MVP Features
1. **OAuth Connection**
   - Google Drive and OneDrive supported at launch
   - User selects preferred service during onboarding
   - Token storage secured via Supabase

2. **Cloud Document Indexing**
   - Background indexing starts after Drive link is connected
   - Visual progress bar shows indexing completion
   - Supported File Types:
     - PDF (.pdf)
     - Word Docs (.docx)
     - Excel (.xlsx)
     - Plain text (.txt)
     - Markdown (.md)
   - Skips unsupported files but logs the reason in UI
   - OCR support is not included in MVP

3. **Vector Embedding**
   - Document text is split into overlapping chunks (~500–800 tokens)
   - Embeddings stored in a **remote vector DB**
     - MVP uses Chroma Cloud (or fallback to Supabase pgvector)
   - Each user has isolated namespace in DB

4. **Contextual AI Chat**
   - Detects plan level (Free, Pro, BYOK)
   - Injects top-k chunks into prompt context
   - Streams LLM response into chat window
   - Error messages shown in chat if:
     - BYOK key fails
     - Vector retrieval fails
     - No context found
   - Example error message:
     > "⚠️ We couldn't complete your request using your LLM key. Please check your key or upgrade to Rekonn Labs Pro."

5. **Subscription Tiers**
   - **Free Tier**
     - 100 queries/month
     - GPT-3.5 or similar model
     - 1 cloud folder
   - **Pro Tier ($30/mo)**
     - 1 cloud folder
     - GPT-4o provided by Rekonn Labs
     - Higher context limits, priority latency
   - **Pro (BYOK) Tier ($10/mo)**
     - User provides OpenAI or Claude key
     - Rekonn Labs handles embedding and storage
     - Must track invalid keys, quota errors
   - **Power Tier** (future)
     - Teams, multi-user memory, audit history

6. **User Interface**
   - Repurposed from Briefly Solo with these modifications:
     - Onboarding modal (Plan + OAuth selection)
     - Settings panel (API key, plan, cloud connection)
     - Chat window unchanged
     - Progress bar added for indexing

7. **Desktop App**
   - Electron wrapper for desktop installation (macOS, Windows)
   - No auto-update logic in MVP

## ❌ Non-Goals for MVP
- No file uploads
- No SaaS web app
- No team/multi-user support
- No update logic in Electron
- No OCR for scanned PDFs

## 🧪 Tech Stack
- **Frontend**: Next.js (App Router) + TailwindCSS + TypeScript
- **Backend**: FastAPI + Supabase (Auth, Postgres, Stripe)
- **LLM**: GPT-4o (via OpenAI API) or user-provided key (BYOK)
- **Vector DB**: Chroma Cloud (default) or Supabase pgvector
- **Installable App**: Electron + cross-platform scripts
