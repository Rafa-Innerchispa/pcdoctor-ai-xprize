import type { AuditEvent } from "@fieldspark/contracts";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

export interface EventStore {
  append(event: AuditEvent): Promise<void>;
  list(tenantId?: string): Promise<AuditEvent[]>;
}

class MemoryEventStore implements EventStore {
  private readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.unshift(event);
  }

  async list(tenantId?: string): Promise<AuditEvent[]> {
    return tenantId
      ? this.events.filter((event) => event.tenantId === tenantId)
      : [...this.events];
  }
}

class FirestoreEventStore implements EventStore {
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
      `/databases/${database}/documents/auditEvents`;
  }

  async append(event: AuditEvent): Promise<void> {
    const client = await this.auth.getClient();
    await client.request({
      url: `${this.collectionUrl}?documentId=${event.eventId}`,
      method: "POST",
      data: {
        fields: {
          tenantId: { stringValue: event.tenantId },
          timestamp: { timestampValue: event.timestamp },
          payload: { stringValue: JSON.stringify(event) },
        },
      },
    });
  }

  async list(tenantId?: string): Promise<AuditEvent[]> {
    const client = await this.auth.getClient();
    const response = await client.request<{
      documents?: Array<{ fields?: { payload?: { stringValue?: string } } }>;
    }>({
      url: `${this.collectionUrl}?pageSize=100&orderBy=timestamp%20desc`,
      method: "GET",
    });
    return (response.data.documents ?? [])
      .map((document) => document.fields?.payload?.stringValue)
      .filter((payload): payload is string => Boolean(payload))
      .map((payload) => JSON.parse(payload) as AuditEvent)
      .filter((event) => !tenantId || event.tenantId === tenantId);
  }
}

export function createEventStore(config: AppConfig): EventStore {
  return config.EVENT_STORE === "firestore"
    ? new FirestoreEventStore(config)
    : new MemoryEventStore();
}
