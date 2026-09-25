# DoersOS Notification System — Module Integration Guide

**Status:** Active Core Platform Standard  
**Audience:** DoersOS Module Developers, Backend & Frontend Developers, AI Agents  
**Related Spec:** [`DoersOS-Notification-System-Spec.md`](file:///var/www/web/dev-doers-os-4.altovation.in/_docs/DoersOS-Notification-System-Spec.md)  

---

## 1. Overview & Architectural Philosophy

The **DoersOS Notification System** is a **Core System App** responsible for delivering notifications to users across multiple communication channels:
- **In-App Notifications** (Persistent notification feed in header bell dropdown)
- **Web Push Notifications** (PWA & Desktop browser alerts via Service Worker)
- **Email** (SMTP servers, Resend API)
- **WhatsApp** (Meta WhatsApp Cloud API, Twilio WhatsApp)
- **SMS** (Twilio SMS)

### The Core Rule

> **"The caller decides that a notification is needed. Notification decides how it is delivered."**

Consuming business modules (e.g. `todo`, `finance`, `crm`, `hr`) **never**:
- Query the notification database tables directly.
- Import external vendor SDKs (e.g., `nodemailer`, `web-push`, Twilio, Meta, Resend).
- Manage SMTP connection strings or API keys.
- Decide which specific external transport sends the message.

---

## 2. Integration Methods

Any module can send notifications through three approved mechanisms:

```text
┌────────────────────────────────────────────────────────┐
│                   Consuming Module                     │
│          (Tasks, CRM, Finance, Automation)             │
└────────────┬─────────────────────────┬─────────────────┘
             │                         │
             ▼                         ▼
   Direct NestJS Service      Capability Registry
  (NotificationsService)      ('notification.send')
             │                         │
             └────────────┬────────────┘
                          ▼
             ┌─────────────────────────┐
             │   Notification System   │
             └────────────┬────────────┘
                          ▼
            Channel Router & Providers
      (In-App, Email, Web Push, WhatsApp, SMS)
```

---

### Method A: Direct Service Injection (`NotificationsService`)

Within backend services, inject `NotificationsService` directly via NestJS dependency injection. `NotificationsCoreModule` is `@Global()`, so you do not need to re-import it in your module.

#### Example: Task Assignment Notification in `todo`

```typescript
import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../../core/notifications/notifications.service';

@Injectable()
export class TodoTaskService {
  constructor(private readonly notificationsService: NotificationsService) {}

  async assignTask(task: { id: string; title: string; tenantId: string }, assigneeId: string, currentUserId: string) {
    // 1. Business logic: update assignment in task database
    // ...

    // 2. Deliver notification through the notification system
    await this.notificationsService.send(
      {
        recipient: {
          type: 'user',
          id: assigneeId,
        },
        message: {
          title: 'New Task Assigned',
          body: `You have been assigned to: "${task.title}".`,
        },
        type: 'action_required',
        priority: 'normal',
        channels: ['in_app', 'push', 'email'],
        source: {
          module: 'todo',
          entity: 'task',
          id: task.id,
        },
        actions: [
          {
            id: 'open',
            label: 'Open Task',
            action: 'open_record',
            url: `/app/todo?record=${task.id}`,
          },
        ],
        idempotency_key: `todo.task.assigned:${task.id}:${assigneeId}`,
      },
      task.tenantId,
      currentUserId,
    );
  }
}
```

---

### Method B: Via Capability Registry (`notification.send`)

Used by **Automation Rules**, **Scheduled Jobs**, **AI Copilot**, and cross-boundary workflows where direct code imports are not desired.

#### Capability ID: `notification.send`

```typescript
import { Injectable } from '@nestjs/common';
import { CapabilityRegistry } from '../capabilities/capability-registry.service';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';

@Injectable()
export class AutomationActionService {
  constructor(private readonly capabilityRegistry: CapabilityRegistry) {}

  async triggerApprovalNotification(invoiceId: string, managerId: string, user: AuthenticatedUser) {
    const result = await this.capabilityRegistry.execute(
      'notification.send',
      {
        recipient: {
          type: 'user',
          id: managerId,
        },
        message: {
          title: 'Approval Required: Invoice INV-102',
          body: 'An invoice exceeding $10,000 requires your management approval.',
        },
        type: 'action_required',
        priority: 'high',
        channels: ['in_app', 'email', 'push'],
        source: {
          module: 'finance',
          entity: 'invoice',
          id: invoiceId,
        },
        actions: [
          {
            id: 'review',
            label: 'Review Invoice',
            url: `/app/finance?record=${invoiceId}`,
          },
        ],
        idempotency_key: `finance.invoice.approval:${invoiceId}:${managerId}`,
      },
      user,
    );

    return result;
  }
}
```

---

### Method C: Batch Notifications (`notification.send_batch`)

Useful for digest builders, bulk task reminders, or multi-user announcements.

```typescript
await capabilityRegistry.execute(
  'notification.send_batch',
  {
    notifications: [
      {
        recipient: { type: 'user', id: 'user-1' },
        message: { title: 'Daily Digest', body: 'You have 3 tasks due today.' },
        channels: ['in_app', 'email'],
      },
      {
        recipient: { type: 'user', id: 'user-2' },
        message: { title: 'Daily Digest', body: 'You have 1 task due today.' },
        channels: ['in_app', 'email'],
      },
    ],
  },
  user,
);
```

---

## 3. Payload Reference (`NotificationSendInput`)

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `recipient` | `object` | **Yes** | Destination recipient definition | `{ type: 'user', id: 'USER-123' }` |
| `recipient.type` | `'user' \| 'email' \| 'phone'` | **Yes** | Type of recipient identifier | `'user'` |
| `recipient.id` | `string` | **Yes** | User ID, email address, or phone number | `'admin@doers.io'` |
| `message` | `object` | **Yes** | Message contents | See below |
| `message.title` | `string` | **Yes** | Header/subject line | `'Task Overdue'` |
| `message.body` | `string` | **Yes** | Plain text body content | `'Q3 financial audit is overdue.'` |
| `type` | `string` | No | Semantic category | `'informational'`, `'action_required'`, `'warning'`, `'success'`, `'error'`, `'system'` |
| `priority` | `string` | No | Urgency level | `'low'`, `'normal'`, `'high'`, `'urgent'` |
| `channels` | `string[]` | No | Channels to dispatch through (defaults to `['in_app']`) | `['in_app', 'push', 'email']` |
| `source` | `object` | No | Structured origin entity reference | `{ module: 'todo', entity: 'task', id: 'TASK-1' }` |
| `actions` | `array` | No | Action buttons rendered in UI and Push alerts | `[{ id: 'open', label: 'Review', url: '/app/todo?record=1' }]` |
| `idempotency_key`| `string` | No | Unique idempotency string to prevent duplicate sends | `'todo.assigned:TASK-1:USER-2'` |

---

## 4. System Administrator Configuration Guide

Administrators configure channels, credentials, and settings through **Admin Tools → Notifications & Alerts** (`/admin/notifications`).

### 4.1 Email / SMTP Configuration
Under the **Email (SMTP & Providers)** perspective:
1. Select provider: **Standard SMTP Server** or **Resend**.
2. For SMTP, specify:
   - **Hostname**: `smtp.gmail.com`, `mail.yourdomain.com`, etc.
   - **Port**: `587` (STARTTLS) or `465` (SSL).
   - **SSL/TLS**: Enable for port 465.
   - **Username / Email**: Mailbox username.
   - **Password**: App password or mailbox password.
   - **Sender Email & Display Name**: e.g., `DoersOS Notifications <no-reply@domain.com>`.
3. Click **Save Email Settings**.
4. Test live connectivity using the **Diagnostic Test** action.

### 4.2 Web Push (PWA & Desktop) Configuration
Under the **Web Push (PWA)** perspective:
1. The platform automatically generates an RFC 8292 compliant **VAPID Public & Private Keypair** on first boot.
2. Specify the **Contact Subject URI** (e.g. `mailto:support@yourdomain.com`).
3. Users and installed PWAs click **Enable Push** in the Header notification center to grant browser permissions.
4. The system automatically associates multiple device push subscriptions (Desktop, Mobile PWA) per user.

### 4.3 WhatsApp Business Configuration
Under the **WhatsApp Business** perspective:
- **Meta WhatsApp Cloud API**: Enter **Phone Number ID**, **WhatsApp Business Account ID**, and **Permanent Access Token**.
- **Twilio WhatsApp**: Enter **Account SID**, **Auth Token**, and **From Number** (`whatsapp:+1...`).
- Click **Save WhatsApp Settings** and run diagnostic verification.

### 4.4 SMS Messaging Configuration
Under the **SMS Messaging** perspective:
- Enter **Twilio Account SID**, **Auth Token**, and **Sender Phone Number**.

---

## 5. Security & Isolation Guarantee

1. **Tenant Isolation**: Every notification record and channel configuration is strictly isolated by `tenantId`.
2. **Encrypted Credentials**: All secrets (SMTP passwords, VAPID private keys, WhatsApp tokens, Twilio credentials) are encrypted at rest with **AES-256-GCM** using `CryptoService`. They are never exposed in UI previews or returned in public API payloads.
3. **RBAC Guarded**:
   - `notifications.send`: Required to dispatch notifications.
   - `notifications.read`: Required to view notifications and register push subscriptions.
   - `notifications.manage`: Required to configure SMTP, Web Push, and WhatsApp parameters.
