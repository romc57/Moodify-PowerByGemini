# Moodify Project Rules

## Gemini 3 Pro API Best Practices

When working with the Gemini API in this project, follow these critical rules to avoid errors and performance issues.

### 1. The "Thought Signature" Trap (400 Error Prevention)

**Mechanism:** When Gemini 3 Pro performs Chain-of-Thought reasoning or executes a tool, it generates a cryptographic token called `thoughtSignature` in the JSON response.

**Rule:** You MUST pass this signature back in the next turn of the conversation.

**Implementation:**
- Store `thoughtSignature` from every API response
- Include it in subsequent requests to the same conversation
- Call `clearConversationState()` when starting a new session

```typescript
// BAD: Dropping the signature
const text = response.data.candidates[0].content.parts[0].text;

// GOOD: Preserve the signature
if (response.data.thoughtSignature) {
    this.lastThoughtSignature = response.data.thoughtSignature;
}
```

**Consequence:** Dropping the signature causes `400 Invalid Argument` errors.

---

### 2. The "Thinking Level" Latency Cost

**Mechanism:** Gemini 3 Pro is a reasoning model. It doesn't just predict tokens; it "plans."

**Rule:** Always explicitly set the `thinking_level` parameter.

| Level | Use Case | Latency |
|-------|----------|---------|
| `minimal` | Trivial tasks (validation, greetings) | Fastest |
| `low` | JSON generation, simple formatting, UI | Fast |
| `medium` | Moderate complexity tasks | Balanced |
| `high` | Complex refactoring, architecture planning | 15+ seconds |

**Implementation in this project:**
- `validateKey()` uses `thinking_level: 'minimal'`
- `generateRecommendation()` defaults to `thinking_level: 'low'`

**Gotcha:** If you don't set it, it defaults to `high`, causing unnecessary latency.

---

### 3. The "Output Token" vs "Context" Asymmetry

**Mechanism:** Gemini 3 Pro has massive input context (2M+ tokens) but limited output (~8k-64k tokens).

**Rules:**
- Always set `maxOutputTokens` as a safety cap
- Never ask for more than ~200 lines of code in a single turn
- Use iterative patterns: plan first (high thinking), then implement file-by-file (low thinking)

**Implementation in this project:**
- Recommendations use `maxOutputTokens: 500` (expected output ~200 tokens)

---

### 4. Quota Management (API Call Limits)

**Rule:** Be specific in prompts to constrain the model's search space.

**Examples:**
- BAD: "Fix the bugs"
- GOOD: "Fix the TypeError in auth.py"

**In this project:** Prompts are well-scoped to request one specific recommendation.

---

### 5. Determinism with Seed Parameter

**Mechanism:** Reasoning models have high entropy - same prompt can yield different outputs.

**Rule:** Use the `seed` parameter when you need reproducible results.

```typescript
// For testing/debugging with consistent output
gemini.generateRecommendation(vitals, relative, history, { seed: 12345 });
```

---

## Code Patterns

### GeminiService Usage

```typescript
import { gemini, ThinkingLevel } from '@/services/gemini/GeminiService';

// Standard recommendation (uses best practice defaults)
const result = await gemini.generateRecommendation(vitals, relativeVitals, history);

// With custom options
const result = await gemini.generateRecommendation(vitals, relativeVitals, history, {
    thinkingLevel: 'medium',  // Override for complex analysis
    seed: 42                   // For reproducible output
});

// Start a new conversation session
gemini.clearConversationState();
```

### API Request Structure

Always include these in `generationConfig`:
```typescript
generationConfig: {
    responseMimeType: "application/json",  // For structured output
    thinking_level: 'low',                 // Appropriate level
    maxOutputTokens: 500                   // Safety cap
}
```

---

## Summary Checklist

- [ ] Handle `thoughtSignature` - treat it like a CSRF token; never drop it
- [ ] Set `thinking_level` - hardcode `"low"` for all non-critical tasks
- [ ] Set `maxOutputTokens` - always cap output as a safety net
- [ ] Scope prompts - be specific to avoid quota burn
- [ ] Use `seed` - when you need reproducible results for testing
