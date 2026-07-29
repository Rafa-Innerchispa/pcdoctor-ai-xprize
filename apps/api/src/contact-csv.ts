import type { SyntheticContact } from "@fieldspark/contracts";

const columns: ReadonlyArray<
  readonly [string, (contact: SyntheticContact) => string | number | boolean]
> = [
  ["id", (contact) => contact.id],
  ["tenant_id", (contact) => contact.tenantId],
  ["playbook", (contact) => contact.playbook],
  ["display_name", (contact) => contact.displayName],
  ["account_name", (contact) => contact.accountName],
  ["phone", (contact) => contact.phone],
  ["email", (contact) => contact.email],
  ["channel", (contact) => contact.channel],
  ["segment", (contact) => contact.segment],
  ["opportunity", (contact) => contact.opportunity],
  ["next_action", (contact) => contact.nextAction],
  ["estimated_value_usd", (contact) => contact.estimatedValueUsd],
  ["priority", (contact) => contact.priority],
  ["status", (contact) => contact.status],
  ["consent_status", (contact) => contact.consentStatus],
  ["outbound_allowed", (contact) => contact.outboundAllowed],
  ["environment", (contact) => contact.environment],
  ["synthetic", (contact) => contact.synthetic],
  ["last_interaction_at", (contact) => contact.lastInteractionAt],
  ["due_at", (contact) => contact.dueAt],
  ["billing_state", (contact) => contact.billingState],
];

function escapeCsv(value: string | number | boolean): string {
  const normalized = String(value);
  return /[",\r\n]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
}

export function contactsToCsv(contacts: readonly SyntheticContact[]): string {
  const header = columns.map(([name]) => name).join(",");
  const rows = contacts.map((contact) =>
    columns.map(([, read]) => escapeCsv(read(contact))).join(","),
  );
  return [header, ...rows].join("\r\n");
}
