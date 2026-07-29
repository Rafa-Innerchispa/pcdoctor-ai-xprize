import type { DemoWorkflow, SyntheticContact } from "@fieldspark/contracts";

const apiUrl = (
  import.meta.env.VITE_API_URL || "http://localhost:8080"
).replace(/\/$/, "");

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `request_failed_${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadDemoState() {
  const [contactResult, workflowResult] = await Promise.all([
    apiRequest<{
      contacts: SyntheticContact[];
      outboundAllowed: false;
    }>("/v1/demo/contacts"),
    apiRequest<{
      workflows: DemoWorkflow[];
      outboundAllowed: false;
      invoiceIssued: false;
    }>("/v1/demo/workflows"),
  ]);
  return {
    contacts: contactResult.contacts,
    workflows: workflowResult.workflows,
  };
}

export async function runWorkflowAction(
  contactId: string,
  action: "analyze" | "approve" | "reject" | "billing-review",
) {
  return apiRequest<{ workflow: DemoWorkflow }>(
    `/v1/demo/workflows/${encodeURIComponent(contactId)}/${action}`,
    { method: "POST", body: "{}" },
  );
}

export async function saveDraft(contactId: string, draftReply: string) {
  return apiRequest<{ workflow: DemoWorkflow }>(
    `/v1/demo/workflows/${encodeURIComponent(contactId)}/draft`,
    { method: "POST", body: JSON.stringify({ draftReply }) },
  );
}
