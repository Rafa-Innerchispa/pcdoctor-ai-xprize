import {
  customerContactSchema,
  type CustomerContact,
} from "@fieldspark/contracts";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

export interface CustomerStore {
  list(tenantId: string): Promise<CustomerContact[]>;
  upsertMany(customers: readonly CustomerContact[]): Promise<number>;
}

class MemoryCustomerStore implements CustomerStore {
  private readonly customers = new Map<string, CustomerContact>();

  async list(tenantId: string) {
    return [...this.customers.values()].filter(
      (customer) => customer.tenantId === tenantId,
    );
  }

  async upsertMany(customers: readonly CustomerContact[]) {
    for (const customer of customers) this.customers.set(customer.id, customer);
    return customers.length;
  }
}

class FirestoreCustomerStore implements CustomerStore {
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
      `/databases/${database}/documents/customers`;
  }

  async list(tenantId: string) {
    const client = await this.auth.getClient();
    const response = await client.request<{
      documents?: Array<{ fields?: { payload?: { stringValue?: string } } }>;
    }>({
      url: `${this.collectionUrl}?pageSize=2000`,
      method: "GET",
    });
    return (response.data.documents ?? [])
      .map((document) => document.fields?.payload?.stringValue)
      .filter((payload): payload is string => Boolean(payload))
      .map((payload) => customerContactSchema.parse(JSON.parse(payload)))
      .filter((customer) => customer.tenantId === tenantId);
  }

  async upsertMany(customers: readonly CustomerContact[]) {
    const client = await this.auth.getClient();
    await Promise.all(
      customers.map((customer) =>
        client.request({
          url: `${this.collectionUrl}/${encodeURIComponent(customer.id)}`,
          method: "PATCH",
          data: {
            fields: {
              tenantId: { stringValue: customer.tenantId },
              synthetic: { booleanValue: customer.synthetic },
              outboundAllowed: { booleanValue: false },
              updatedAt: { timestampValue: customer.updatedAt },
              payload: { stringValue: JSON.stringify(customer) },
            },
          },
        }),
      ),
    );
    return customers.length;
  }
}

export function createCustomerStore(config: AppConfig): CustomerStore {
  return config.EVENT_STORE === "firestore"
    ? new FirestoreCustomerStore(config)
    : new MemoryCustomerStore();
}
