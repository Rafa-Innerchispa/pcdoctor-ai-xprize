import type { SyntheticContact } from "@fieldspark/contracts";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

export interface ContactStore {
  upsertMany(contacts: readonly SyntheticContact[]): Promise<number>;
  list(): Promise<SyntheticContact[]>;
}

class MemoryContactStore implements ContactStore {
  private readonly contacts = new Map<string, SyntheticContact>();

  async upsertMany(contacts: readonly SyntheticContact[]): Promise<number> {
    for (const contact of contacts) {
      this.contacts.set(contact.id, contact);
    }
    return this.contacts.size;
  }

  async list(): Promise<SyntheticContact[]> {
    return [...this.contacts.values()];
  }
}

class FirestoreContactStore implements ContactStore {
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
      `/databases/${database}/documents/contacts`;
  }

  async upsertMany(contacts: readonly SyntheticContact[]): Promise<number> {
    const client = await this.auth.getClient();
    await Promise.all(
      contacts.map((contact) =>
        client.request({
          url: `${this.collectionUrl}/${encodeURIComponent(contact.id)}`,
          method: "PATCH",
          data: {
            fields: {
              tenantId: { stringValue: contact.tenantId },
              environment: { stringValue: contact.environment },
              synthetic: { booleanValue: contact.synthetic },
              outboundAllowed: { booleanValue: contact.outboundAllowed },
              updatedAt: { timestampValue: new Date().toISOString() },
              payload: { stringValue: JSON.stringify(contact) },
            },
          },
        }),
      ),
    );
    return contacts.length;
  }

  async list(): Promise<SyntheticContact[]> {
    const client = await this.auth.getClient();
    const response = await client.request<{
      documents?: Array<{ fields?: { payload?: { stringValue?: string } } }>;
    }>({
      url: `${this.collectionUrl}?pageSize=100`,
      method: "GET",
    });
    return (response.data.documents ?? [])
      .map((document) => document.fields?.payload?.stringValue)
      .filter((payload): payload is string => Boolean(payload))
      .map((payload) => JSON.parse(payload) as SyntheticContact)
      .filter(
        (contact) =>
          contact.synthetic &&
          contact.environment === "synthetic" &&
          !contact.outboundAllowed,
      );
  }
}

export function createContactStore(config: AppConfig): ContactStore {
  return config.EVENT_STORE === "firestore"
    ? new FirestoreContactStore(config)
    : new MemoryContactStore();
}
