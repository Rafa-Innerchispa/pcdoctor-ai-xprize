import type { DemoWorkflow } from "@fieldspark/contracts";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

export interface WorkflowStore {
  upsert(workflow: DemoWorkflow): Promise<void>;
  get(contactId: string): Promise<DemoWorkflow | undefined>;
  list(): Promise<DemoWorkflow[]>;
}

class MemoryWorkflowStore implements WorkflowStore {
  private readonly workflows = new Map<string, DemoWorkflow>();

  async upsert(workflow: DemoWorkflow): Promise<void> {
    this.workflows.set(workflow.contactId, workflow);
  }

  async get(contactId: string): Promise<DemoWorkflow | undefined> {
    return this.workflows.get(contactId);
  }

  async list(): Promise<DemoWorkflow[]> {
    return [...this.workflows.values()];
  }
}

class FirestoreWorkflowStore implements WorkflowStore {
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  private readonly collectionUrl: string;

  constructor(config: AppConfig) {
    if (!config.GOOGLE_CLOUD_PROJECT) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required for Firestore.");
    }
    const database = encodeURIComponent(config.FIRESTORE_DATABASE);
    this.collectionUrl =
      `https://firestore.googleapis.com/v1/projects/${config.GOOGLE_CLOUD_PROJECT}` +
      `/databases/${database}/documents/demoWorkflows`;
  }

  async upsert(workflow: DemoWorkflow): Promise<void> {
    const client = await this.auth.getClient();
    await client.request({
      url: `${this.collectionUrl}/${encodeURIComponent(workflow.contactId)}`,
      method: "PATCH",
      data: {
        fields: {
          tenantId: { stringValue: workflow.tenantId },
          status: { stringValue: workflow.status },
          updatedAt: { timestampValue: workflow.updatedAt },
          payload: { stringValue: JSON.stringify(workflow) },
        },
      },
    });
  }

  async get(contactId: string): Promise<DemoWorkflow | undefined> {
    const client = await this.auth.getClient();
    try {
      const response = await client.request<{
        fields?: { payload?: { stringValue?: string } };
      }>({
        url: `${this.collectionUrl}/${encodeURIComponent(contactId)}`,
        method: "GET",
      });
      const payload = response.data.fields?.payload?.stringValue;
      return payload ? (JSON.parse(payload) as DemoWorkflow) : undefined;
    } catch (error) {
      const status =
        typeof error === "object" &&
        error &&
        "response" in error &&
        typeof error.response === "object" &&
        error.response &&
        "status" in error.response
          ? error.response.status
          : undefined;
      if (status === 404) return undefined;
      throw error;
    }
  }

  async list(): Promise<DemoWorkflow[]> {
    const client = await this.auth.getClient();
    const response = await client.request<{
      documents?: Array<{ fields?: { payload?: { stringValue?: string } } }>;
    }>({
      url: `${this.collectionUrl}?pageSize=20`,
      method: "GET",
    });
    return (response.data.documents ?? [])
      .map((document) => document.fields?.payload?.stringValue)
      .filter((payload): payload is string => Boolean(payload))
      .map((payload) => JSON.parse(payload) as DemoWorkflow);
  }
}

export function createWorkflowStore(config: AppConfig): WorkflowStore {
  return config.EVENT_STORE === "firestore"
    ? new FirestoreWorkflowStore(config)
    : new MemoryWorkflowStore();
}
