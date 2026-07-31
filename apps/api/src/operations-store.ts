import {
  deliveryDraftSchema,
  inspectionRecordSchema,
  quoteDocumentSchema,
  tenantOperationalSettingsSchema,
  type DeliveryDraft,
  type InspectionRecord,
  type QuoteDocument,
  type TenantOperationalSettings,
} from "@fieldspark/contracts";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

export interface OperationsStore {
  getSettings(tenantId: string): Promise<TenantOperationalSettings | undefined>;
  upsertSettings(value: TenantOperationalSettings): Promise<void>;
  getInspection(id: string): Promise<InspectionRecord | undefined>;
  listInspections(tenantId: string, caseId?: string): Promise<InspectionRecord[]>;
  upsertInspection(value: InspectionRecord): Promise<void>;
  getQuote(id: string): Promise<QuoteDocument | undefined>;
  listQuotes(tenantId: string, caseId?: string): Promise<QuoteDocument[]>;
  upsertQuote(value: QuoteDocument): Promise<void>;
  upsertDeliveryDraft(value: DeliveryDraft): Promise<void>;
}

class MemoryOperationsStore implements OperationsStore {
  private readonly settings = new Map<string, TenantOperationalSettings>();
  private readonly inspections = new Map<string, InspectionRecord>();
  private readonly quotes = new Map<string, QuoteDocument>();
  private readonly deliveries = new Map<string, DeliveryDraft>();

  async getSettings(tenantId: string) {
    return this.settings.get(tenantId);
  }
  async upsertSettings(value: TenantOperationalSettings) {
    this.settings.set(value.tenantId, value);
  }
  async getInspection(id: string) {
    return this.inspections.get(id);
  }
  async listInspections(tenantId: string, caseId?: string) {
    return [...this.inspections.values()].filter(
      (value) => value.tenantId === tenantId && (!caseId || value.caseId === caseId),
    );
  }
  async upsertInspection(value: InspectionRecord) {
    this.inspections.set(value.id, value);
  }
  async getQuote(id: string) {
    return this.quotes.get(id);
  }
  async listQuotes(tenantId: string, caseId?: string) {
    return [...this.quotes.values()].filter(
      (value) => value.tenantId === tenantId && (!caseId || value.caseId === caseId),
    );
  }
  async upsertQuote(value: QuoteDocument) {
    this.quotes.set(value.id, value);
  }
  async upsertDeliveryDraft(value: DeliveryDraft) {
    this.deliveries.set(value.id, value);
  }
}

type StoredRecord =
  | TenantOperationalSettings
  | InspectionRecord
  | QuoteDocument
  | DeliveryDraft;

class FirestoreOperationsStore implements OperationsStore {
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  private readonly baseUrl: string;

  constructor(config: AppConfig) {
    const database = encodeURIComponent(config.FIRESTORE_DATABASE);
    this.baseUrl =
      `https://firestore.googleapis.com/v1/projects/${config.GOOGLE_CLOUD_PROJECT}` +
      `/databases/${database}/documents`;
  }

  private async get(collection: string, id: string): Promise<unknown | undefined> {
    const client = await this.auth.getClient();
    try {
      const response = await client.request<{
        fields?: { payload?: { stringValue?: string } };
      }>({
        url: `${this.baseUrl}/${collection}/${encodeURIComponent(id)}`,
        method: "GET",
      });
      const payload = response.data.fields?.payload?.stringValue;
      return payload ? JSON.parse(payload) : undefined;
    } catch (error) {
      const status =
        typeof error === "object" && error && "response" in error
          ? (error.response as { status?: number } | undefined)?.status
          : undefined;
      if (status === 404) return undefined;
      throw error;
    }
  }

  private async list(collection: string): Promise<unknown[]> {
    const client = await this.auth.getClient();
    const response = await client.request<{
      documents?: Array<{ fields?: { payload?: { stringValue?: string } } }>;
    }>({
      url: `${this.baseUrl}/${collection}?pageSize=500`,
      method: "GET",
    });
    return (response.data.documents ?? [])
      .map((document) => document.fields?.payload?.stringValue)
      .filter((payload): payload is string => Boolean(payload))
      .map((payload) => JSON.parse(payload));
  }

  private async upsert(collection: string, id: string, value: StoredRecord) {
    const client = await this.auth.getClient();
    await client.request({
      url: `${this.baseUrl}/${collection}/${encodeURIComponent(id)}`,
      method: "PATCH",
      data: {
        fields: {
          tenantId: { stringValue: value.tenantId },
          updatedAt: {
            timestampValue: "updatedAt" in value ? value.updatedAt : value.createdAt,
          },
          payload: { stringValue: JSON.stringify(value) },
        },
      },
    });
  }

  async getSettings(tenantId: string) {
    const value = await this.get("tenantOperationalSettings", tenantId);
    return value ? tenantOperationalSettingsSchema.parse(value) : undefined;
  }
  async upsertSettings(value: TenantOperationalSettings) {
    await this.upsert("tenantOperationalSettings", value.tenantId, value);
  }
  async getInspection(id: string) {
    const value = await this.get("inspections", id);
    return value ? inspectionRecordSchema.parse(value) : undefined;
  }
  async listInspections(tenantId: string, caseId?: string) {
    return (await this.list("inspections"))
      .map((value) => inspectionRecordSchema.parse(value))
      .filter(
        (value) => value.tenantId === tenantId && (!caseId || value.caseId === caseId),
      );
  }
  async upsertInspection(value: InspectionRecord) {
    await this.upsert("inspections", value.id, value);
  }
  async getQuote(id: string) {
    const value = await this.get("quotes", id);
    return value ? quoteDocumentSchema.parse(value) : undefined;
  }
  async listQuotes(tenantId: string, caseId?: string) {
    return (await this.list("quotes"))
      .map((value) => quoteDocumentSchema.parse(value))
      .filter(
        (value) => value.tenantId === tenantId && (!caseId || value.caseId === caseId),
      );
  }
  async upsertQuote(value: QuoteDocument) {
    await this.upsert("quotes", value.id, value);
  }
  async upsertDeliveryDraft(value: DeliveryDraft) {
    await this.upsert("deliveryDrafts", value.id, value);
  }
}

export function createOperationsStore(config: AppConfig): OperationsStore {
  return config.EVENT_STORE === "firestore"
    ? new FirestoreOperationsStore(config)
    : new MemoryOperationsStore();
}
