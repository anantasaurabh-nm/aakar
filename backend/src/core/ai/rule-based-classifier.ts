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

  if (/\b(complete|finish|done|mark.*(complete|done))\b/.test(text)) {
    const capability = pickCapability(capabilities, 'complete', text);
    if (capability) return { capability: capability.id, parameters: { query: message }, confidence: 0.6, needsConfirmation: false };
  }

  if (/\b(create|add|new)\b.*\b(task|todo|reminder|record)\b/.test(text)) {
    const capability = pickCapability(capabilities, 'create', text);
    if (capability) {
      const title = message.replace(/.*\b(create|add|new)\b\s*(a\s+)?(task|todo|reminder|record)?\s*(to|for|called|:)?\s*/i, '').trim();
      return { capability: capability.id, parameters: { title: title || message }, confidence: 0.6, needsConfirmation: false };
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
    return { capability: listCapability.id, parameters: { recordDate: recordDate ?? 'today' }, confidence: 0.4, needsConfirmation: false };
  }

  return null;
}
