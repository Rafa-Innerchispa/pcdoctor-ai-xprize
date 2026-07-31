import {
  managedPropertySchema,
  propertyCommitmentSchema,
  propertyIssueSchema,
  propertySystemSchema,
  type ManagedProperty,
  type PropertyCommitment,
  type PropertyIssue,
  type PropertySystem,
} from "@fieldspark/contracts";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

type PortfolioRecord =
  | ManagedProperty
  | PropertySystem
  | PropertyIssue
  | PropertyCommitment;

export interface PortfolioStore {
  getProperty(id: string): Promise<ManagedProperty | undefined>;
  listProperties(tenantId: string): Promise<ManagedProperty[]>;
  upsertProperty(value: ManagedProperty): Promise<void>;
  listSystems(tenantId: string, propertyId?: string): Promise<PropertySystem[]>;
  upsertSystem(value: PropertySystem): Promise<void>;
  listIssues(tenantId: string, propertyId?: string): Promise<PropertyIssue[]>;
  upsertIssue(value: PropertyIssue): Promise<void>;
  listCommitments(
    tenantId: string,
    propertyId?: string,
  ): Promise<PropertyCommitment[]>;
  upsertCommitment(value: PropertyCommitment): Promise<void>;
}

class MemoryPortfolioStore implements PortfolioStore {
  private readonly properties = new Map<string, ManagedProperty>();
  private readonly systems = new Map<string, PropertySystem>();
  private readonly issues = new Map<string, PropertyIssue>();
  private readonly commitments = new Map<string, PropertyCommitment>();

  async getProperty(id: string) {
    return this.properties.get(id);
  }

  async listProperties(tenantId: string) {
    return [...this.properties.values()].filter(
      (value) => value.tenantId === tenantId,
    );
  }

  async upsertProperty(value: ManagedProperty) {
    this.properties.set(value.id, value);
  }

  async listSystems(tenantId: string, propertyId?: string) {
    return [...this.systems.values()].filter(
      (value) =>
        value.tenantId === tenantId &&
        (!propertyId || value.propertyId === propertyId),
    );
  }

  async upsertSystem(value: PropertySystem) {
    this.systems.set(value.id, value);
  }

  async listIssues(tenantId: string, propertyId?: string) {
    return [...this.issues.values()].filter(
      (value) =>
        value.tenantId === tenantId &&
        (!propertyId || value.propertyId === propertyId),
    );
  }

  async upsertIssue(value: PropertyIssue) {
    this.issues.set(value.id, value);
  }

  async listCommitments(tenantId: string, propertyId?: string) {
    return [...this.commitments.values()].filter(
      (value) =>
        value.tenantId === tenantId &&
        (!propertyId || value.propertyId === propertyId),
    );
  }

  async upsertCommitment(value: PropertyCommitment) {
    this.commitments.set(value.id, value);
  }
}

class FirestorePortfolioStore implements PortfolioStore {
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

  private async getPayload(collection: string, id: string) {
    const client = await this.auth.getClient();
    try {
      const response = await client.request<{
        fields?: { payload?: { stringValue?: string } };
      }>({
        url: `${this.baseUrl}/${collection}/${encodeURIComponent(id)}`,
        method: "GET",
      });
      return response.data.fields?.payload?.stringValue;
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

  private async listPayloads(collection: string) {
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
      .map((payload) => JSON.parse(payload) as unknown);
  }

  private async upsert(
    collection: string,
    value: PortfolioRecord,
    indexes: Record<string, string>,
  ) {
    const client = await this.auth.getClient();
    await client.request({
      url: `${this.baseUrl}/${collection}/${encodeURIComponent(value.id)}`,
      method: "PATCH",
      data: {
        fields: {
          ...Object.fromEntries(
            Object.entries(indexes).map(([key, indexValue]) => [
              key,
              { stringValue: indexValue },
            ]),
          ),
          updatedAt: { timestampValue: value.updatedAt },
          payload: { stringValue: JSON.stringify(value) },
        },
      },
    });
  }

  async getProperty(id: string) {
    const payload = await this.getPayload("managedProperties", id);
    return payload
      ? managedPropertySchema.parse(JSON.parse(payload))
      : undefined;
  }

  async listProperties(tenantId: string) {
    return (await this.listPayloads("managedProperties"))
      .map((value) => managedPropertySchema.parse(value))
      .filter((value) => value.tenantId === tenantId);
  }

  async upsertProperty(value: ManagedProperty) {
    await this.upsert("managedProperties", value, {
      tenantId: value.tenantId,
      status: value.status,
      propertyType: value.propertyType,
    });
  }

  async listSystems(tenantId: string, propertyId?: string) {
    return (await this.listPayloads("propertySystems"))
      .map((value) => propertySystemSchema.parse(value))
      .filter(
        (value) =>
          value.tenantId === tenantId &&
          (!propertyId || value.propertyId === propertyId),
      );
  }

  async upsertSystem(value: PropertySystem) {
    await this.upsert("propertySystems", value, {
      tenantId: value.tenantId,
      propertyId: value.propertyId,
      condition: value.condition,
    });
  }

  async listIssues(tenantId: string, propertyId?: string) {
    return (await this.listPayloads("propertyIssues"))
      .map((value) => propertyIssueSchema.parse(value))
      .filter(
        (value) =>
          value.tenantId === tenantId &&
          (!propertyId || value.propertyId === propertyId),
      );
  }

  async upsertIssue(value: PropertyIssue) {
    await this.upsert("propertyIssues", value, {
      tenantId: value.tenantId,
      propertyId: value.propertyId,
      status: value.status,
      priority: value.priority,
    });
  }

  async listCommitments(tenantId: string, propertyId?: string) {
    return (await this.listPayloads("propertyCommitments"))
      .map((value) => propertyCommitmentSchema.parse(value))
      .filter(
        (value) =>
          value.tenantId === tenantId &&
          (!propertyId || value.propertyId === propertyId),
      );
  }

  async upsertCommitment(value: PropertyCommitment) {
    await this.upsert("propertyCommitments", value, {
      tenantId: value.tenantId,
      propertyId: value.propertyId ?? "",
      status: value.status,
      commitmentType: value.commitmentType,
    });
  }
}

export function createPortfolioStore(config: AppConfig): PortfolioStore {
  return config.EVENT_STORE === "firestore"
    ? new FirestorePortfolioStore(config)
    : new MemoryPortfolioStore();
}
