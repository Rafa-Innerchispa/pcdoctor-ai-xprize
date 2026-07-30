import {
  businessCaseSchema,
  type BusinessCase,
} from "@fieldspark/contracts";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

export interface CaseStore {
  get(caseId: string): Promise<BusinessCase | undefined>;
  list(tenantId: string): Promise<BusinessCase[]>;
  upsert(value: BusinessCase): Promise<void>;
}

class MemoryCaseStore implements CaseStore {
  private readonly cases = new Map<string, BusinessCase>();

  async get(caseId: string) {
    return this.cases.get(caseId);
  }

  async list(tenantId: string) {
    return [...this.cases.values()].filter(
      (businessCase) => businessCase.tenantId === tenantId,
    );
  }

  async upsert(value: BusinessCase) {
    this.cases.set(value.id, value);
  }
}

class FirestoreCaseStore implements CaseStore {
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  private readonly collectionUrl: string;

  constructor(config: AppConfig) {
    const database = encodeURIComponent(config.FIRESTORE_DATABASE);
    this.collectionUrl =
      `https://firestore.googleapis.com/v1/projects/${config.GOOGLE_CLOUD_PROJECT}` +
      `/databases/${database}/documents/businessCases`;
  }

  async get(caseId: string) {
    const client = await this.auth.getClient();
    try {
      const response = await client.request<{
        fields?: { payload?: { stringValue?: string } };
      }>({
        url: `${this.collectionUrl}/${encodeURIComponent(caseId)}`,
        method: "GET",
      });
      const payload = response.data.fields?.payload?.stringValue;
      return payload
        ? businessCaseSchema.parse(JSON.parse(payload))
        : undefined;
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

  async list(tenantId: string) {
    const client = await this.auth.getClient();
    const response = await client.request<{
      documents?: Array<{ fields?: { payload?: { stringValue?: string } } }>;
    }>({
      url: `${this.collectionUrl}?pageSize=500`,
      method: "GET",
    });
    return (response.data.documents ?? [])
      .map((document) => document.fields?.payload?.stringValue)
      .filter((payload): payload is string => Boolean(payload))
      .map((payload) => businessCaseSchema.parse(JSON.parse(payload)))
      .filter((businessCase) => businessCase.tenantId === tenantId);
  }

  async upsert(value: BusinessCase) {
    const client = await this.auth.getClient();
    await client.request({
      url: `${this.collectionUrl}/${encodeURIComponent(value.id)}`,
      method: "PATCH",
      data: {
        fields: {
          tenantId: { stringValue: value.tenantId },
          status: { stringValue: value.status },
          currentStage: { stringValue: value.currentStage },
          updatedAt: { timestampValue: value.updatedAt },
          payload: { stringValue: JSON.stringify(value) },
        },
      },
    });
  }
}

export function createCaseStore(config: AppConfig): CaseStore {
  return config.EVENT_STORE === "firestore"
    ? new FirestoreCaseStore(config)
    : new MemoryCaseStore();
}
