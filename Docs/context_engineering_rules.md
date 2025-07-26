# 🧠 Context Engineering Rules – Briefly Cloud

## 📌 General
- Always reference `implementation_plan.md` for task scope
- Never create files outside `project_structure.md` layout
- Use one LLM model per request (do not mix GPT and Claude logic)

## 📁 Frontend Rules
- Use Tailwind for styling
- Do not modify core layout unless specified
- Settings panel must update user tier and Drive link

## 🧠 LLM Rules
- Inject only relevant document chunks into prompt
- Retry on API failure (BYOK) up to 2x, then show user error
- GPT-4o requests should be streamed

## 🪪 Identity
- Store user profile with plan, API key, drive link
