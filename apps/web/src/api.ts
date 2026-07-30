import type {
  BusinessCase,
  CaseTransitionRequest,
  DemoWorkflow,
  EcIdentityValidation,
  FieldSparkPermission,
  FieldSparkRole,
  FieldSparkSession,
  Invitation,
  Membership,
  PlaybookDefinition,
  SyntheticContact,
} from "@fieldspark/contracts";
import { getCurrentIdToken } from "./firebase";

export const apiUrl = (
  import.meta.env.VITE_API_URL || "http://localhost:8080"
).replace(/\/$/, "");

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getCurrentIdToken();
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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

export async function loadSession() {
  return apiRequest<FieldSparkSession>("/v1/session");
}

export async function updateProfile(profile: {
  displayName: string;
  phone: string;
  taxId: string;
  personType: "natural" | "company";
  legalName: string;
}) {
  return apiRequest<FieldSparkSession>("/v1/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export async function loadTenantMembers(tenantId: string) {
  return apiRequest<{
    members: Array<{
      membership: Membership;
      user: {
        uid: string;
        displayName: string;
        email: string;
        photoUrl: string | null;
        status: string;
      } | null;
    }>;
  }>(`/v1/tenants/${encodeURIComponent(tenantId)}/members`);
}

export async function loadInvitations(tenantId: string) {
  return apiRequest<{ invitations: Invitation[] }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/invitations`,
  );
}

export async function createInvitation(
  tenantId: string,
  input: {
    email: string;
    role: Exclude<FieldSparkRole, "platform_owner">;
    permissions: FieldSparkPermission[];
  },
) {
  return apiRequest<{ invitation: Invitation }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/invitations`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function updateMember(
  tenantId: string,
  userId: string,
  input: {
    role: Exclude<FieldSparkRole, "platform_owner">;
    permissions: FieldSparkPermission[];
    status: "active" | "suspended";
  },
) {
  return apiRequest<{ membership: Membership }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(userId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function loadPlaybooks() {
  return apiRequest<{ playbooks: PlaybookDefinition[] }>("/v1/playbooks");
}

export async function validateEcIdentity(
  identifier: string,
  lookup: "local" | "authorized" = "local",
) {
  return apiRequest<{
    validation: EcIdentityValidation;
    registryConfigured: boolean;
  }>("/v1/identity/validate", {
    method: "POST",
    body: JSON.stringify({ identifier, lookup }),
  });
}

export async function loadBusinessCases(tenantId: string) {
  return apiRequest<{ cases: BusinessCase[] }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/cases`,
  );
}

export async function createBusinessCase(
  tenantId: string,
  input: {
    customerId: string;
    customerUserId?: string | null;
    customerName: string;
    customerIdentifier: string;
    title: string;
    description: string;
    assignedTo?: string | null;
    synthetic: boolean;
  },
) {
  return apiRequest<{ case: BusinessCase }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/cases`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function transitionBusinessCase(
  tenantId: string,
  caseId: string,
  input: CaseTransitionRequest,
) {
  return apiRequest<{ case: BusinessCase }>(
    `/v1/tenants/${encodeURIComponent(tenantId)}/cases/${encodeURIComponent(caseId)}/transitions`,
    { method: "POST", body: JSON.stringify(input) },
  );
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
