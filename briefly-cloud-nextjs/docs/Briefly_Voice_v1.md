# Briefly Voice v1

## Overview
Briefly Voice v1 provides a consistent, cost-effective, and structured approach to all LLM interactions across the Briefly platform. It ensures tone consistency, manages costs through intelligent routing, and enforces structured output formats.

## Core Components

### 1. Voice System (`brieflyVoice.ts`)
- **Persona**: Professional, knowledgeable, supportive AI assistant
- **Style**: Concise, actionable, structured responses
- **Format**: One-line answer + bullets + "Next steps" section

### 2. Prompt Builder (`promptBuilder.ts`)
- **System Messages**: Consistent persona and style
- **Developer Messages**: Task-specific framing (≤160 tokens combined)
- **Context Integration**: Top-K RAG snippets (6 max, 600-900 tokens)
- **Tool Management**: Only includes tools actually used

### 3. Response Linter (`responseLinter.ts`)
- **Structure Enforcement**: Ensures "Next steps" block exists
- **Format Optimization**: Converts long paragraphs to bullets
- **Missing Info Handling**: Prompts for missing context when needed

### 4. Budget Management (`budgets.ts`)
- **Token Limits**: Default ~600 tokens, Boost ~1200 tokens
- **Context Limits**: Top-K = 6 snippets maximum
- **Cost Optimization**: Smart routing based on tier and complexity

## Model Routing Strategy

### Free Tier
- **Default**: GPT-5 nano
- **Escalation**: GPT-5 mini (low confidence or longer output needed)

### Pro Tier
- **Default**: GPT-5 mini
- **Boost**: GPT-5 (when boost=true)

### Routing Flags
All responses include `modelRoute: 'nano'|'mini'|'gpt5'` for transparency.

## Integration Points

### API Routes
- `/api/chat/route.ts` - Main chat interface
- `/api/chat/enhanced/route.ts` - Enhanced chat with context
- Any job/edge handlers generating content

### Services
- Document processing services
- Content generation utilities
- RAG context assembly

## Telemetry

Each LLM call logs:
- Model route used
- Input/output token counts
- Latency (ms)
- Context count (K)
- Linter applied flag
- Boost usage

## Testing

Automated tests verify:
- "Next steps" block presence
- Long paragraph → bullet conversion
- Missing context handling
- Consistent voice application

## Usage Example

```typescript
import { buildMessages, buildDeveloper } from "@/lib/prompt/promptBuilder";
import { BUDGETS } from "@/lib/prompt/budgets";
import { enforce as lint } from "@/lib/prompt/responseLinter";

const response = await generateReply({
  userMessage: "How do I upload documents?",
  contextSnippets: ragResults.slice(0, BUDGETS.TOP_K),
  historySummary: "User is new to platform",
  toolsUsed: ["document_upload"],
  tier: "pro",
  boost: false
});
```

## Benefits

1. **Consistency**: Unified voice across all interactions
2. **Cost Control**: Smart routing and token budgets
3. **Quality**: Structured, actionable responses
4. **Transparency**: Clear routing and usage metrics
5. **Maintainability**: Centralized prompt management