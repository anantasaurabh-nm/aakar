# DoersOS AI Models & Providers — PRD

**Status:** Draft  
**Version:** 1.0  
**Audience:** Developers  
**Depends on:** `prd-overview.md`, `DoersOS-Module-System-PRD.md`, `DoersOS-AI-Agent-SDUI-PRD.md`

---

## 1. Objective

Define the platform-level AI model configuration system for DoersOS.

Superadmins must be able to configure which AI models are used by the platform without requiring a code deployment.

The initial system provides two logical model profiles:

```text
light
reasoning
```

A profile identifies a configured provider and model.

The actual model identifier is intentionally free-form because model catalogs change frequently.

---

# 2. Core Principle

> **DoersOS depends on model profiles, not specific AI vendors or model names.**

The application asks for:

```text
light
```

or:

```text
reasoning
```

The platform resolves that profile to:

```text
Provider + Model
```

Example:

```text
light
  → OpenRouter
  → google/gemini-2.5-flash

reasoning
  → OpenAI
  → gpt-5.6
```

Changing the model must not require an application code change.

---

# 3. Model Profiles

Initial profiles:

```text
light
reasoning
```

### Light

For relatively simple, fast, low-cost tasks.

Examples:

```text
Intent classification
Agent routing
Simple extraction
Straightforward questions
Simple transformations
```

### Reasoning

For complex tasks requiring deeper analysis.

Examples:

```text
Multi-step reasoning
Cross-agent synthesis
Complex business analysis
Strategic recommendations
Difficult planning
```

These are **logical roles**, not specific models.

Future profiles may include:

```text
vision
coding
embedding
fast
high-quality
```

without changing the underlying provider architecture.

---

# 4. Provider Abstraction

The platform uses a common LLM provider interface.

Conceptually:

```text
Model Profile
      ↓
Model Router
      ↓
LLM Provider Interface
      ↓
Provider Adapter
      ↓
Provider API
```

Providers may include:

```text
OpenAI
Google Gemini
OpenRouter
Together
Other supported providers
```

The rest of DoersOS must not contain provider-specific API logic.

---

# 5. Direct Providers vs Gateways

Some providers communicate directly with model vendors.

Examples:

```text
OpenAI
Google Gemini
```

Others may provide access to multiple models/vendors.

Examples:

```text
OpenRouter
Together
```

For the application architecture, all are exposed through the same:

```text
LLMProvider
```

interface.

The distinction should not leak into agents, skills, or UI code.

---

# 6. Model Configuration

A profile contains:

```text
profile
provider
model
```

Example:

```json
{
  "profile": "light",
  "provider": "openrouter",
  "model": "google/gemini-2.5-flash"
}
```

Reasoning:

```json
{
  "profile": "reasoning",
  "provider": "openai",
  "model": "gpt-5.6"
}
```

---

# 7. Model ID Must Be Free-Form

Do not create a hard-coded model enum such as:

```ts
type Model =
  | 'gpt-5'
  | 'gemini-...'
  | 'claude-...';
```

Model IDs change frequently.

Store them as strings.

Example:

```text
google/gemini-2.5-flash
gpt-5.6
some-provider/model-name
```

The provider is responsible for determining whether a configured model identifier is valid.

---

# 8. Superadmin Configuration

AI model configuration belongs to DoersOS platform administration.

Recommended location:

```text
Admin Tools
└── AI Configuration
    └── Models
```

Superadmin can configure:

```text
Light Model

Provider
[ OpenRouter ]

Model
[ google/gemini-2.5-flash ]
```

and:

```text
Reasoning Model

Provider
[ OpenAI ]

Model
[ gpt-5.6 ]
```

Saving configuration must be a privileged operation.

---

# 9. Provider Credentials

Provider credentials are separate from model configuration.

Never store API keys in:

```text
module.json
SDUI
soul.md
skill.json
frontend code
client storage
```

Instead:

```text
AI Model Profile
      ↓
Provider
      ↓
Credential Reference
      ↓
Secure Credential Store
```

Example:

```json
{
  "profile": "reasoning",
  "provider": "openai",
  "model": "gpt-5.6",
  "credential": "openai-production"
}
```

`openai-production` is a reference only.

The actual secret remains server-side.

---

# 10. Credentials Must Never Reach

Provider credentials must never be exposed to:

```text
Browser
AI model
Agent prompt
Skill input
SDUI response
Logs
Client-side configuration
```

Only the server-side provider adapter may access them.

---

# 11. Model Router

DoersOS Core provides a Model Router.

Conceptually:

```text
AI Orchestrator
      ↓
Model Router
      ↓
Profile: light / reasoning
      ↓
Provider + Model
      ↓
LLM
```

Example:

```ts
modelRouter.resolve('light');
```

returns the configured provider/model implementation.

Agents should not instantiate provider clients directly.

---

# 12. Agent and Skill Model Selection

Agents and skills should remain vendor-neutral.

They should never contain:

```text
OpenAI
Gemini
OpenRouter
gpt-5.6
gemini-2.5-flash
```

as implementation dependencies.

They may indicate a model preference or complexity level.

Example:

```json
{
  "id": "get-tasks",
  "complexity": "low"
}
```

and:

```json
{
  "id": "analyze-sales-risk",
  "complexity": "high"
}
```

The platform maps:

```text
low  → light
high → reasoning
```

---

# 13. Model Selection Precedence

Model selection should follow:

```text
Platform Configuration
        ↓
Agent/Skill Preference
        ↓
Runtime Policy
        ↓
Selected Profile
        ↓
Provider + Model
```

The exact model available to the system remains controlled by platform configuration.

A module cannot introduce an arbitrary provider/model and automatically use it.

---

# 14. Example — Simple Request

User:

```text
Show me my today's todo.
```

Possible flow:

```text
AI Chat
   ↓
Orchestrator
   ↓
Light Model
   ↓
Todo Agent
   ↓
get-tasks
   ↓
Response Planner
   ↓
SDUI
```

The light profile may resolve to:

```text
OpenRouter
google/gemini-2.5-flash
```

No application code changes if the superadmin later changes it to another model.

---

# 15. Example — Complex Request

User:

```text
Analyze my sales pipeline and identify the biggest risks.
```

Flow:

```text
AI Chat
   ↓
Orchestrator
   ↓
Reasoning Model
   ↓
CRM Agent
   ↓
Skills
   ↓
Structured results
   ↓
Reasoning / synthesis
   ↓
Response Planner
   ↓
Text or SDUI
```

The reasoning profile could resolve to:

```text
OpenAI
gpt-5.6
```

---

# 16. Model Fallback

The architecture should support fallback models.

Example:

```text
Reasoning
    │
    ▼
Primary
OpenAI / gpt-5.6
    │
    │ failure
    ▼
Fallback
OpenRouter / configured reasoning model
```

Possible failure conditions:

```text
Provider timeout
Rate limit
Provider outage
Temporary model failure
```

Fallback configuration is optional for V1 but the architecture should not prevent it.

Fallback must remain within the allowed platform configuration.

---

# 17. Provider Health

The provider layer should normalize common operational failures.

Example:

```text
Provider Error
     ↓
Provider Adapter
     ↓
Normalized Error
     ↓
Model Router
```

Possible normalized states:

```text
timeout
rate_limited
unavailable
invalid_model
authentication_failure
unknown
```

Do not expose raw provider errors to end users.

---

# 18. Common Configuration

V1 should keep model configuration small.

Possible common fields:

```text
provider
model
timeout
```

Do not expose every provider-specific parameter.

Avoid creating an administrative interface containing dozens of low-level LLM settings.

Provider-specific configuration should remain inside the provider adapter unless a platform-level requirement emerges.

---

# 19. Temperature and Similar Parameters

Do not make provider-specific parameters part of the core model profile initially.

For example, avoid requiring:

```text
temperature
top_p
frequency_penalty
presence_penalty
provider-specific options
```

unless the platform has a demonstrated need.

If introduced later, define a small common abstraction and allow provider adapters to translate it.

---

# 20. Model Configuration Storage

Conceptual structure:

```json
{
  "ai": {
    "profiles": {
      "light": {
        "provider": "openrouter",
        "model": "google/gemini-2.5-flash"
      },
      "reasoning": {
        "provider": "openai",
        "model": "gpt-5.6"
      }
    }
  }
}
```

The actual storage mechanism is an implementation detail.

Do not expose secrets through this configuration object.

---

# 21. Configuration Validation

When saving a model configuration:

1. Validate profile.
2. Validate provider.
3. Validate model string.
4. Validate credential reference.
5. Verify provider configuration.
6. Optionally perform a provider/model health check.
7. Save only after validation succeeds.

The system should clearly report:

```text
Provider not configured
Credential unavailable
Model unavailable
Invalid model identifier
Provider authentication failed
```

---

# 22. Runtime Configuration Changes

Changing:

```text
light model
reasoning model
```

should not require a deployment.

New configuration should be picked up by subsequent AI requests.

In-flight requests should continue using the configuration resolved when they started.

---

# 23. Observability

Every AI request should record enough metadata for operational debugging.

At minimum:

```text
request ID
model profile
provider
model
latency
success/failure
error category
token usage where available
cost where available
```

Example:

```json
{
  "requestId": "req-123",
  "profile": "reasoning",
  "provider": "openai",
  "model": "gpt-5.6",
  "latencyMs": 4820,
  "status": "success"
}
```

Do not log:

```text
API keys
provider secrets
system prompts
unnecessary sensitive user content
```

---

# 24. Cost Tracking

Where provider APIs expose usage/cost information, normalize it.

Example:

```text
Request
 ├── profile: reasoning
 ├── provider: openai
 ├── model: gpt-5.6
 ├── input tokens
 ├── output tokens
 └── estimated cost
```

This enables future dashboards such as:

```text
AI Usage
AI Cost
Cost by module
Cost by tenant
Cost by model
```

Cost tracking is not required for the initial UI but the architecture should preserve the information.

---

# 25. Multi-Tenant Consideration

V1 should support platform-level model configuration.

Future versions may support tenant-specific configuration.

If tenant-level configuration is introduced:

```text
Platform Default
      ↓
Tenant Configuration
      ↓
Runtime Policy
      ↓
Selected Profile
```

Tenant configuration must never allow access to credentials belonging to another tenant.

---

# 26. Security

### Superadmin only

Changing provider/model configuration requires a privileged administrative permission.

### Server-side only

Provider API calls must originate from trusted backend services.

### No client secrets

The browser never receives provider credentials.

### No AI authority

The AI model cannot:

```text
Change models
Change providers
Read credentials
Create credentials
Modify AI configuration
```

### No arbitrary provider access

AI cannot request:

```text
"Call this arbitrary URL as an LLM provider."
```

Only registered providers are allowed.

---

# 27. Provider Interface

Conceptual interface:

```ts
interface LLMProvider {
  generate(request: LLMRequest): Promise<LLMResponse>;
}
```

The implementation may internally handle:

```text
Authentication
Provider API format
Model ID
Streaming
Usage
Errors
Retries
```

The rest of DoersOS uses the common interface.

---

# 28. Streaming

The architecture should support streaming responses.

Possible interface:

```text
AI Orchestrator
      ↓
Model Router
      ↓
LLM Provider
      ↓
Stream
      ↓
AI Chat
```

Streaming behavior is provider-specific internally but should appear as a common capability to the application.

---

# 29. Provider Registry

DoersOS Core maintains a controlled provider registry.

Conceptually:

```text
providers/
├── openai
├── gemini
├── openrouter
└── together
```

Each provider adapter implements the common provider interface.

New providers require platform/provider implementation and registration.

A module should not silently register an arbitrary external LLM provider.

---

# 30. Relationship to Modules

AI model configuration is **platform-level**, not module-level.

Modules provide:

```text
Agents
Skills
Complexity/preferences
```

DoersOS Core provides:

```text
Model Profiles
Provider Registry
Model Router
Credentials
Runtime policy
```

Example:

```text
Todo Module
    ↓
get-tasks skill
    ↓
complexity: low
    ↓
Model Router
    ↓
light
    ↓
OpenRouter
    ↓
configured model
```

---

# 31. Relationship to SDUI

The model system does not change the SDUI contract.

AI can still produce:

```text
Text
Action Result
SDUI
```

The model provider is an implementation detail of the AI layer.

```text
Model
 ↓
Orchestrator
 ↓
Agent
 ↓
Response Planner
 ↓
SDUI
```

---

# 32. Admin UI

Recommended initial interface:

```text
Admin Tools
└── AI Configuration
    │
    └── Models
         │
         ├── Light Model
         │    ├── Provider
         │    └── Model
         │
         └── Reasoning Model
              ├── Provider
              └── Model
```

Provider credentials should be managed separately:

```text
AI Configuration
├── Models
└── Connections
```

A connection contains the secure provider credential.

---

# 33. V1 Scope

Implement:

```text
Model Profiles
 ├── light
 └── reasoning

Provider Registry
 ├── OpenAI
 ├── Gemini
 ├── OpenRouter
 └── Together

Model Router
Provider abstraction
Secure credential references
Superadmin configuration
Model validation
Basic usage/latency logging
```

Model IDs remain free-form strings.

---

# 34. Future Scope

Potential future features:

```text
Model fallback
Tenant-level model configuration
AI budgets
Usage limits
Cost dashboards
Provider health monitoring
More model profiles
Vision models
Embedding models
Fine-tuned models
Automatic model routing
Model performance evaluation
A/B testing
```

These should not complicate the V1 implementation.

---

# 35. Definition of Done

- [ ] DoersOS has `light` and `reasoning` model profiles.
- [ ] Superadmin can configure each profile.
- [ ] Provider is configurable independently from model ID.
- [ ] Model IDs are free-form strings.
- [ ] OpenAI, Gemini, OpenRouter, and Together provider adapters are supported/pluggable.
- [ ] Model Router resolves profiles to provider/model implementations.
- [ ] Agents and skills do not depend on specific providers/models.
- [ ] Skills can express complexity or model preference.
- [ ] Provider credentials are stored securely and referenced indirectly.
- [ ] Credentials never reach the browser or AI model.
- [ ] Only registered providers can be used.
- [ ] AI cannot modify model/provider configuration.
- [ ] Model configuration changes do not require deployment.
- [ ] Configuration is validated before activation.
- [ ] Runtime provider errors are normalized.
- [ ] AI request metadata records selected profile/provider/model.
- [ ] Provider-specific configuration does not leak into core contracts.
- [ ] Tenant isolation remains enforced.
- [ ] Superadmin permissions protect configuration changes.
