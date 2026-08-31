import type { CapabilityDescriptor, OrchestratorDecision } from '@erp/shared-contracts';

const DATE_KEYWORDS: Record<string, string> = {
  today: 'today',
  tomorrow: 'tomorrow',
  yesterday: 'yesterday',
  'this week': 'this_week',
  'last week': 'last_week',
  'this month': 'this_month',
  'last month': 'last_month',
};

function extractRecordDate(text: string): string | undefined {
  for (const [phrase, preset] of Object.entries(DATE_KEYWORDS)) {
    if (text.includes(phrase)) return preset;
  }
  return undefined;
}

function pickCapability(capabilities: CapabilityDescriptor[], operation: string, text: string): CapabilityDescriptor | undefined {
  const candidates = capabilities.filter((c) => c.id.endsWith(`.${operation}`));
  if (candidates.length <= 1) return candidates[0];
  // Prefer whichever module/entity name is actually mentioned in the message.
  return (
    candidates.find((c) => text.includes(c.entity ?? c.module) || text.includes(c.module)) ?? candidates[0]
  );
}

function extractPriority(text: string): string | undefined {
  if (/\b(urgent|critical)\b/i.test(text)) return 'URGENT';
  if (/\b(high|high-priority|high priority)\b/i.test(text)) return 'HIGH';
  if (/\b(medium|medium-priority|medium priority)\b/i.test(text)) return 'MEDIUM';
  if (/\b(low|low-priority|low priority)\b/i.test(text)) return 'LOW';
  return undefined;
}

function extractStatus(text: string): string | undefined {
  if (/\b(approved|completed)\b/i.test(text)) return 'approved';
  if (/\b(draft|open)\b/i.test(text)) return 'draft';
  if (/\b(submitted|pending)\b/i.test(text)) return 'submitted';
  if (/\b(cancelled|canceled)\b/i.test(text)) return 'cancelled';
  return undefined;
}

function extractCategory(text: string): string | undefined {
  const match = text.match(/\b(?:category|cat)\s*(?:=|:|\s+is|\s+from)?\s*([a-z0-9_-]+)/i);
  if (match && match[1]) {
    const val = match[1].toLowerCase();
    if (val === 'enginnering' || val === 'engineering' || val === 'engineer') return 'Engineering';
    if (val === 'general' || val === 'genral' || val === 'gen') return 'General';
    return match[1].charAt(0).toUpperCase() + match[1].slice(1);
  }
  if (/\b(?:engineering|enginnering)\b/i.test(text)) return 'Engineering';
  if (/\b(?:general|genral)\b/i.test(text)) return 'General';
  return undefined;
}

/**
 * Deterministic fallback used when no LLM provider is configured, or when a
 * provider call fails. Matches phrasing to a registered capability's
 * operation suffix rather than a hardcoded per-module intent list — keeps
 * the platform fully functional out of the box regardless of which
 * schema-driven modules happen to be installed.
 */
export function classifyWithRules(message: string, capabilities: CapabilityDescriptor[]): OrchestratorDecision | null {
  const text = message.toLowerCase().trim();
  const recordDate = extractRecordDate(text);
  const priority = extractPriority(text);
  const status = extractStatus(text);
  const isAll = /\b(all\s+records|all\s+todos|show\s+all|everything)\b/i.test(text);
  const category = isAll ? undefined : extractCategory(text);

  if (/\b(complete|finish|done|mark.*(complete|done))\b/.test(text)) {
    const capability = pickCapability(capabilities, 'complete', text);
    if (capability) return { capability: capability.id, parameters: { query: message }, confidence: 0.6, needsConfirmation: false };
  }

  if (/\b(create|add|new)\b.*\b(task|todo|reminder|record)\b/.test(text)) {
    const capability = pickCapability(capabilities, 'create', text);
    if (capability) {
      const extractedTitle = message.replace(/.*\b(create|add|new)\b\s*(a\s+)?(task|todo|reminder|record)?\s*(to|for|called|:)?\s*/i, '').trim();
      return { capability: capability.id, parameters: { ...(extractedTitle ? { title: extractedTitle } : {}), ...(priority ? { priority } : {}) }, confidence: 0.6, needsConfirmation: false };
    }
  }

  if (/\b(delete|remove)\b/.test(text)) {
    const capability = pickCapability(capabilities, 'delete', text);
    if (capability) return { capability: capability.id, parameters: { query: message }, confidence: 0.5, needsConfirmation: true };
  }

  if (/\b(insight|summary|how many|overview|stats?)\b/.test(text)) {
    const capability = pickCapability(capabilities, 'list', text); // insights piggybacks on the same entity's list capability discovery
    if (capability) {
      return { capability: `${capability.module}.${capability.entity}.insights`, parameters: { recordDate }, confidence: 0.6, needsConfirmation: false };
    }
  }

  const listCapability = pickCapability(capabilities, 'list', text);
  if (listCapability) {
    const parameters: Record<string, unknown> = isAll
      ? {}
      : {
          ...(recordDate ? { recordDate } : {}),
          ...(priority ? { priority } : {}),
          ...(status ? { status } : {}),
          ...(category ? { category } : {}),
        };
    return { capability: listCapability.id, parameters, confidence: 0.5, needsConfirmation: false };
  }

  return null;
}
