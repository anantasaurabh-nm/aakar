# DoersOS — Notification System

**Type:** Core System App / Platform Service  
**Audience:** Junior Developers, AI Coding Agents, Backend & Frontend Developers  
**Status:** Architecture + Implementation Specification  
**Client:** PWA-first  
**Initial Channels:** In-App, Email, Web Push  
**Future Channels:** SMS, WhatsApp

---

## 1. Purpose

The DoersOS Notification System is a **Core System App** responsible for delivering notifications to users through configured communication channels.

It provides a stable interface that any DoersOS module or Core service can use without knowing:

- how notifications are stored
- how recipients are resolved
- how channels are implemented
- which external provider is used
- how retries work
- how user preferences are applied
- how delivery is tracked

> **The caller decides that a notification is needed. Notification decides how it is delivered.**

---

## 2. Architectural Position

```text
                         DoersOS Core
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
      Events              Scheduler            Automation
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ↓
                       Capability Registry
                              ↓
                    Notification System
                              │
                     Channel Router
                              │
          ┌───────────────────┼───────────────────┐
          ↓                   ↓                   ↓
       In-App              Email              Web Push
          │                   │                   │
          ↓                   ↓                   ↓
       DoersOS             Provider          Browser / PWA
```

Future:

```text
Notification
     │
     ├── In-App
     ├── Email
     ├── Push
     ├── SMS
     └── WhatsApp
```

---

## 3. Responsibility Boundary

### Notification owns

- Notification records
- Notification requests
- Channel routing
- Channel configuration
- Provider abstraction
- Delivery lifecycle
- Delivery status
- Retry handling
- Idempotency
- Templates
- User notification preferences
- Push subscriptions
- Notification history
- Notification capabilities
- Notification events

### Notification does NOT own

- Tasks
- CRM records
- Finance records
- HR records
- Business workflows
- Automation rules
- Scheduling rules
- AI reasoning
- Business escalation rules

Example:

```text
"When a task becomes overdue, notify the department head."
```

This belongs to **Automation**.

Notification receives only:

```text
"Send this message to this recipient."
```

---

## 4. DoersOS Modular Architecture Rules

### 4.1 No direct cross-module database access

Never:

```text
Notification → SELECT * FROM todo.task
```

Use contracts/capabilities/events.

### 4.2 No direct database access from AI

Never:

```text
AI → SQL → notification database
```

Use:

```text
AI → Capability Registry → notification.send
```

### 4.3 Authorization is mandatory

Every execution follows:

```text
Authentication
      ↓
Tenant Isolation
      ↓
RBAC
      ↓
Record Authorization
      ↓
Business Validation
      ↓
Operation
```

This applies to UI, API, AI, Scheduler, Automation, jobs and integrations.

---

## 5. Public Interface

Business modules interact with Notification through a stable platform interface.

Conceptual service:

```text
NotificationService
├── send()
├── send_batch()
├── list()
├── get()
├── mark_read()
├── mark_unread()
└── unread_count()
```

Consumers must not depend on:

- notification database tables
- provider SDKs
- SMTP libraries
- Web Push libraries
- Firebase SDKs
- vendor APIs

---

## 6. Primary Capability

The primary integration capability is:

```text
notification.send
```

Example:

```json
{
  "recipient": {
    "type": "user",
    "id": "USER_ID"
  },
  "message": {
    "title": "New Task Assigned",
    "body": "You have been assigned a new task."
  },
  "type": "action_required",
  "priority": "normal",
  "channels": ["in_app", "push", "email"],
  "source": {
    "module": "todo",
    "entity": "task",
    "id": "TASK_ID"
  },
  "idempotency_key": "todo.task.assigned:TASK_ID:USER_ID"
}
```

The exact API must be versioned and registered through the DoersOS Capability Registry.

---

## 7. Initial Capabilities

```text
notification.send
notification.send_batch

notification.list
notification.get
notification.count_unread

notification.mark_read
notification.mark_unread
```

Future capabilities:

```text
notification.preview
notification.retry
notification.cancel
notification.register_push_subscription
notification.remove_push_subscription
```

Do not implement future capabilities as empty placeholders.

---

## 8. Capability Metadata

Example:

```json
{
  "id": "notification.send",
  "module": "notification",
  "entity": "notification",
  "operation": "send",
  "description": "Send a notification to an authorized recipient through configured channels.",
  "input_schema": {},
  "output_schema": {},
  "required_permissions": [
    "notification.send"
  ],
  "version": "1.0"
}
```

Follow the canonical DoersOS Capability Registry contract for the final implementation.

---

## 9. Notification Request

A notification request contains:

```text
recipient
message
type
priority
channels
source
idempotency_key
```

Example:

```json
{
  "recipient": {
    "type": "user",
    "id": "USER-123"
  },
  "message": {
    "title": "Approval Required",
    "body": "Invoice INV-102 requires your approval."
  },
  "type": "action_required",
  "priority": "high",
  "channels": ["in_app", "push", "email"],
  "source": {
    "module": "finance",
    "entity": "invoice",
    "id": "INV-102"
  }
}
```

---

## 10. Notification Entity

Initial persistent entity:

```text
notification
```

Recommended fields:

```text
id
recipient_id

title
body

type
priority

status
channel

source_module
source_entity
source_id

read_at
expires_at

created_at
updated_at
```

Apply standard DoersOS metadata where appropriate:

```text
record_date
record_status
created_by
updated_by
```

Use the platform's standard metadata mechanism rather than duplicating it unnecessarily.

---

## 11. Message vs Notification

Keep these concepts separate internally.

### Message

The communication content:

```text
title
body
structured data
template
```

### Notification

The delivery instruction:

```text
recipient
channel
priority
message
delivery status
```

This allows one logical message to potentially be delivered through multiple channels.

---

## 12. Notification Types

Initial types:

```text
informational
action_required
warning
success
error
system
```

Examples:

| Type | Example |
|---|---|
| informational | New comment |
| action_required | Approval required |
| warning | Task overdue |
| success | Invoice approved |
| error | Payment failed |
| system | Password changed |

The type provides semantic context; it does not contain business rules.

---

## 13. Priority

Initial priorities:

```text
low
normal
high
urgent
```

The originating system should specify priority.

Notification must not infer business priority from message text.

---

## 14. Source Reference

Notifications should contain structured origin information:

```json
{
  "source": {
    "module": "todo",
    "entity": "task",
    "id": "TASK-123"
  }
}
```

This allows the PWA to render an action such as:

```text
New Task Assigned

Prepare Q3 Report

[Open Task]
```

without parsing human-readable text.

The source record remains owned by its originating module.

---

## 15. Channels

Initial channels:

```text
in_app
email
push
```

Future channels:

```text
sms
whatsapp
```

Architecture:

```text
Notification
      ↓
Channel Router
      ↓
Channel
      ↓
Provider Adapter
      ↓
External Provider
```

---

## 16. Channel vs Provider

A **channel** describes what type of communication is used.

A **provider** describes who transports it.

Example:

```text
Email
├── SMTP
├── Resend
└── Amazon SES
```

```text
SMS
├── Twilio
├── MSG91
└── Other provider
```

```text
WhatsApp
├── Meta WhatsApp Business
├── Twilio
└── Other provider
```

Business modules must never know which provider is configured.

---

## 17. Channel Interface

Conceptual:

```text
NotificationChannel
├── get_channel_id()
├── validate_recipient()
├── send()
└── get_delivery_status()
```

A channel adapter receives a normalized notification request.

It must not receive Tasks-, Finance-, HR-specific business objects.

---

## 18. Provider Interface

Conceptual:

```text
NotificationProvider
├── get_provider_id()
├── validate_configuration()
├── send()
└── get_status()
```

Provider-specific implementation remains isolated behind this interface.

---

## 19. In-App Channel

In-App is the first channel.

Required functionality:

- create
- list
- unread count
- read
- unread
- source navigation
- expiry handling

Example:

```text
Notifications

● Approval Required
  Invoice INV-102 requires your approval.
  10 minutes ago

● New Task Assigned
  Prepare monthly report.
  1 hour ago
```

---

## 20. Email Channel

Email is an initial channel.

Architecture:

```text
notification.send
      ↓
Channel Router
      ↓
Email
      ↓
Provider Adapter
      ↓
Configured Email Provider
```

The provider must be configurable.

Possible providers may include:

```text
SMTP
Resend
Amazon SES
```

The provider list is configuration, not business-module logic.

---

## 21. Web Push Channel

DoersOS is PWA-first, so Web Push is a first-class initial channel.

Architecture:

```text
Notification System
        ↓
Push Channel
        ↓
Web Push Adapter
        ↓
Browser / OS Push Service
        ↓
PWA Service Worker
        ↓
User Device
```

Business modules only request:

```text
notification.send
```

They do not know that the user is using a PWA.

---

## 22. Push Subscription

The PWA registers a browser push subscription.

Conceptual data:

```text
tenant_id
user_id
device/session identifier
subscription endpoint
subscription keys
status
created_at
updated_at
```

A user may have multiple active subscriptions:

```text
User
├── Desktop browser
├── Android PWA
└── Another device/browser
```

Do not assume one user has one subscription.

---

## 23. PWA Responsibilities

The PWA is responsible for:

```text
Request notification permission
Register service worker
Create push subscription
Send subscription to DoersOS
Receive push event
Display browser notification
Handle notification click
Open source record
```

DoersOS is responsible for:

```text
Store subscription
Associate with tenant/user
Authorize sending
Route push request
Track delivery
Handle invalid subscriptions
```

---

## 24. Push Payload

Use structured data.

Example:

```json
{
  "notification_id": "NOTIFICATION_ID",
  "title": "Task Assigned",
  "body": "Prepare Q3 report.",
  "source": {
    "module": "todo",
    "entity": "task",
    "id": "TASK-123"
  }
}
```

The service worker should not need to parse the message body to determine navigation.

---

## 25. Future SMS

The architecture must allow:

```text
notification.send
      ↓
SMS
      ↓
Provider Adapter
```

Later, Admin should primarily configure:

```text
Provider
Credentials
Sender configuration
```

No consuming business module should change.

---

## 26. Future WhatsApp

The same abstraction applies:

```text
notification.send
      ↓
WhatsApp
      ↓
Provider Adapter
```

Future configuration may include:

```text
Provider
Business Account
Phone Number
Credentials
Templates
```

No consuming business module should change.

---

## 27. Channel Availability

A requested channel may not be configured.

Example:

```text
Requested:
[in_app, push, email]

Configured:
in_app = yes
push = no
email = yes
```

The Notification System handles channel availability.

Consumers should not implement provider/configuration logic.

---

## 28. Fallback

Fallback must be explicit.

Do not silently turn:

```text
push
```

into:

```text
email
```

unless the notification request or configured channel policy permits fallback.

Delivery records should distinguish:

```text
requested channel
delivered channel
failed channel
```

---

## 29. User Preferences

Notification owns user preferences.

Example:

```text
                         In-App   Push   Email
Task Assigned              ✓       ✓       ✓
Task Completed             ✓       -       -
Task Overdue               ✓       ✓       ✓
Approval Required          ✓       ✓       ✓
Comments                   ✓       -       -
System Alerts              ✓       ✓       ✓
```

The final routing flow should be:

```text
Requested Channels
        ↓
Tenant Configuration
        ↓
User Preferences
        ↓
Channel Availability
        ↓
Recipient Reachability
        ↓
Delivery
```

---

## 30. Tenant Configuration

Provider configuration belongs to tenant/system configuration.

Example:

```text
Notification Channels

In-App
Status: Active

Email
Provider: SMTP
Status: Configured

Push
Status: Configured

SMS
Status: Not Configured

WhatsApp
Status: Not Configured
```

Secrets must be stored through DoersOS Secret Storage.

Never store credentials in:

- source code
- module.json
- ordinary database fields
- committed .env files
- logs

---

## 31. Templates

Notification should support structured templates.

Example:

```text
Template:
todo.task_assigned

Title:
New task assigned

Body:
You have been assigned {{task.title}}.

Due:
{{task.due_date}}
```

Templates should support structured variables.

Notification owns the rendering/delivery mechanism; the originating module may define its domain-specific templates.

---

## 32. Delivery Lifecycle

Conceptual lifecycle:

```text
Requested
    ↓
Resolved
    ↓
Queued
    ↓
Processing
    ↓
Delivered
```

Failure:

```text
Processing
    ↓
Failed
    ↓
Retry
    ↓
Delivered
```

Permanent failure:

```text
Failed
    ↓
Retry Limit
    ↓
Permanently Failed
```

The state machine must be centralized in Notification.

---

## 33. Read vs Delivery State

These are different.

### Delivery

```text
Was it delivered?
```

### Read

```text
Did the user read it?
```

Examples:

```text
Email:
delivered = yes
read = unknown
```

```text
In-App:
delivered = yes
read = no
```

Never use one field for both concepts.

---

## 34. Idempotency

Notification sending must support idempotency.

Example:

```text
todo.task.assigned:TASK-123:USER-456
```

If the same automation executes twice, the system can prevent an accidental duplicate.

---

## 35. Batch Notifications

Support:

```text
notification.send_batch
```

Useful for:

- daily task digests
- multiple approvals
- announcements
- scheduled summaries

Batch execution must still preserve tenant isolation and authorization.

---

## 36. Notification + Scheduler

Example:

```text
Every day at 08:00
        ↓
Scheduler
        ↓
Run configured action
        ↓
todo.task.search
        ↓
Build task summary
        ↓
notification.send
        ↓
Email / Push / In-App
```

Responsibilities:

| Component | Responsibility |
|---|---|
| Scheduler | Time |
| Tasks | Task data |
| Digest builder | Summary |
| Notification | Delivery |
| Email/Push provider | Transport |

---

## 37. Notification + Automation

Example:

```text
Task Created
      ↓
todo.task.created
      ↓
Automation
      ↓
Condition:
assigned_to != null
      ↓
notification.send
      ↓
In-App + Push
```

Responsibilities:

| Component | Responsibility |
|---|---|
| Tasks | Emit event |
| Event System | Transport event |
| Automation | Decide action |
| Notification | Deliver |
| PWA | Display Push |

---

## 38. Notification + AI

AI can use the same capability interface.

Example:

```text
User:
"Notify Sarah that the report is ready."

        ↓

AI Orchestrator
        ↓
Capability Registry
        ↓
notification.send
```

AI must not:

- access Notification tables
- call SMTP directly
- call Web Push directly
- call arbitrary messaging APIs

---

## 39. Notification + SDUI

Notification payloads should be structured so the PWA can render standard DoersOS UI.

Example:

```json
{
  "type": "action_required",
  "title": "Approval Required",
  "body": "Invoice INV-102 requires your approval.",
  "source": {
    "module": "finance",
    "entity": "invoice",
    "id": "INV-102"
  },
  "actions": [
    {
      "id": "open",
      "label": "Review",
      "action": "open_record"
    }
  ]
}
```

Notification must not contain React components or frontend implementation details.

---

## 40. Events Emitted by Notification

Initial event concepts:

```text
notification.created
notification.queued
notification.delivered
notification.failed
notification.read
```

These can later be consumed by:

- Automation
- Analytics
- Audit
- Monitoring

Events must have defined contracts before other systems depend on them.

---

## 41. Error Categories

### Validation

```text
Invalid recipient
Invalid channel
Missing message
Invalid payload
```

### Configuration

```text
Provider not configured
Invalid credentials
Channel disabled
```

### Delivery

```text
Provider unavailable
Network error
Recipient unreachable
```

### Authorization

```text
Caller is not authorized
```

Errors must be structured and machine-readable.

---

## 42. Auditability

Important operations should allow the system to determine:

```text
Tenant
Caller
Recipient
Channel
Source
Timestamp
Result
```

Never log provider secrets.

Avoid logging complete message bodies when they may contain sensitive business information unless explicitly required.

---

## 43. Recommended Module Structure

A possible implementation structure:

```text
notification/
├── README.md
├── module.json
├── schema.json
├── capabilities/
├── services/
│   ├── notification_service
│   ├── channel_router
│   └── delivery_service
├── channels/
│   ├── in_app/
│   ├── email/
│   └── push/
├── providers/
│   └── email/
├── templates/
├── events/
└── ui/
```

This is a reference structure, not a requirement to create empty directories.

Follow:

> **Convention → Configuration → Custom Code**

Only create implementation layers that are actually needed.

---

## 44. Frontend Boundary

The PWA communicates with Notification through defined APIs/capabilities.

It must not:

- query Notification storage
- implement delivery rules
- decide authorization
- select external providers
- send email directly
- send push directly

The frontend owns presentation and browser-specific push behavior.

---

## 45. V1 Scope

### Core Runtime

- Notification entity
- Notification service
- capability registration
- channel router
- authorization
- tenant isolation
- idempotency
- basic delivery lifecycle

### In-App

- create
- list
- unread count
- read/unread
- source navigation
- expiry

### Email

- channel abstraction
- provider adapter interface
- one initial provider
- configuration contract

### Web Push

- PWA permission flow
- service worker
- push subscription registration
- Web Push adapter
- notification click handling
- invalid subscription handling

### Admin

- channel status
- Email configuration
- Push configuration/status

---

## 46. V1 Does Not Need

Do not overbuild:

- SMS provider implementation
- WhatsApp provider implementation
- marketing campaigns
- advanced analytics
- AI-generated notification content
- complex notification workflows
- dozens of providers
- arbitrary broadcasting

The architecture must support these later without redesign.

---

## 47. Future Channel Readiness

The architecture must allow:

```text
Push
SMS
WhatsApp
```

to be activated later primarily through configuration.

Adding a new channel/provider must not require changes to:

- Tasks
- CRM
- Finance
- HR
- Automation
- Scheduler
- AI Skills

---

## 48. Tasks Integration Example

Tasks can emit:

```text
todo.task.created
todo.task.assigned
todo.task.completed
todo.task.overdue
```

Automation can consume:

```text
todo.task.assigned
```

and invoke:

```text
notification.send
```

Correct:

```text
Tasks
  ↓
Event
  ↓
Automation
  ↓
notification.send
```

A direct Tasks → Notification call is also valid where the business behavior explicitly requires it.

Tasks must never import an Email/Push provider SDK.

---

## 49. Coding Agent Rules

An AI coding agent implementing Notification must:

1. Read the DoersOS Module System specification.
2. Read the Capability Registry specification.
3. Read the RBAC/security specification.
4. Treat Notification as a Core System App.
5. Keep public interfaces stable and versioned.
6. Never expose the database as an integration interface.
7. Never allow direct SQL from consuming modules.
8. Never expose provider SDKs to consuming modules.
9. Keep channel and provider abstractions separate.
10. Keep business decisions outside Notification.
11. Enforce tenant isolation server-side.
12. Enforce authorization server-side.
13. Store secrets only through Secret Storage.
14. Build PWA Web Push support in the initial architecture.
15. Do not implement SMS/WhatsApp provider integrations until required.
16. Never assume one user has one push subscription.
17. Support idempotency.
18. Keep delivery state separate from read state.
19. Use structured source references.
20. Emit defined events.
21. Do not create empty architecture directories.
22. Do not modify unrelated modules unnecessarily.
23. Cross-module interaction must use contracts, capabilities, or events.
24. Do not bypass the Capability Registry for AI execution.
25. Follow **Convention → Configuration → Custom Code**.

---

## 50. Junior Developer Rules

When deciding where code belongs:

```text
Does this decide WHY a notification should happen?
        ↓
      Yes
        ↓
Business Module / Automation / Scheduler
```

```text
Does this decide HOW a notification is delivered?
        ↓
      Yes
        ↓
Notification System
```

Use this mental model:

```text
Business data
    ↓
Business Module

Time
    ↓
Scheduler

Event reaction
    ↓
Automation

Communication
    ↓
Notification
```

---

## 51. Acceptance Criteria

The Notification System is ready for initial integration when:

- [ ] It is registered as a Core System App.
- [ ] `notification.send` is registered in the Capability Registry.
- [ ] Notification data is tenant-isolated.
- [ ] Authorization is enforced server-side.
- [ ] In-App delivery works.
- [ ] Email delivery works through an adapter.
- [ ] Web Push works with the PWA service worker.
- [ ] Push subscriptions can be registered and revoked.
- [ ] A user can have multiple push subscriptions.
- [ ] Read/unread state works.
- [ ] Delivery state is tracked separately.
- [ ] Source references work.
- [ ] Idempotency is supported.
- [ ] Provider credentials are stored securely.
- [ ] Provider-specific code is isolated.
- [ ] No consuming module directly accesses Notification storage.
- [ ] No consuming module imports an Email/Push provider SDK.
- [ ] Scheduler can call Notification.
- [ ] Automation can call Notification.
- [ ] AI can call Notification through the Capability Registry.
- [ ] SMS can be added later without changing consumers.
- [ ] WhatsApp can be added later without changing consumers.

---

## 52. Final Architecture Principle

The Notification System should remain a **small, stable platform primitive**.

```text
                    DOERSOS
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
     Scheduler      Automation       AI
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                Capability Registry
                       ↓
               notification.send
                       ↓
              Notification System
                       ↓
                Channel Router
                       │
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
    In-App           Email            Push
       │               │               │
       ↓               ↓               ↓
    DoersOS        Provider            PWA
                                      │
                              Browser / Device

Future:
                       ↓
                 ┌─────┴─────┐
                 ↓           ↓
                SMS       WhatsApp
```

### Fundamental DoersOS rule

> **Modules decide what happened. Scheduler decides when. Automation decides what action to take. Notification decides how to communicate it.**

This separation allows DoersOS to add new modules, channels, providers, automation rules, scheduled jobs, and AI capabilities without creating tightly coupled dependencies.
