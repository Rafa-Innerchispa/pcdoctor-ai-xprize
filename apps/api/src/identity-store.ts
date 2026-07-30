import {
  invitationSchema,
  membershipSchema,
  tenantSchema,
  userProfileSchema,
  type Invitation,
  type Membership,
  type Tenant,
  type UserProfile,
} from "@fieldspark/contracts";
import { GoogleAuth } from "google-auth-library";
import type { AppConfig } from "./config.js";

export interface IdentityStore {
  getUser(uid: string): Promise<UserProfile | undefined>;
  upsertUser(user: UserProfile): Promise<void>;
  getTenant(id: string): Promise<Tenant | undefined>;
  upsertTenant(tenant: Tenant): Promise<void>;
  getMembership(id: string): Promise<Membership | undefined>;
  listMemberships(): Promise<Membership[]>;
  upsertMembership(membership: Membership): Promise<void>;
  listInvitations(): Promise<Invitation[]>;
  upsertInvitation(invitation: Invitation): Promise<void>;
}

class MemoryIdentityStore implements IdentityStore {
  private readonly users = new Map<string, UserProfile>();
  private readonly tenants = new Map<string, Tenant>();
  private readonly memberships = new Map<string, Membership>();
  private readonly invitations = new Map<string, Invitation>();

  async getUser(uid: string) {
    return this.users.get(uid);
  }

  async upsertUser(user: UserProfile) {
    this.users.set(user.uid, user);
  }

  async getTenant(id: string) {
    return this.tenants.get(id);
  }

  async upsertTenant(tenant: Tenant) {
    this.tenants.set(tenant.id, tenant);
  }

  async getMembership(id: string) {
    return this.memberships.get(id);
  }

  async listMemberships() {
    return [...this.memberships.values()];
  }

  async upsertMembership(membership: Membership) {
    this.memberships.set(membership.id, membership);
  }

  async listInvitations() {
    return [...this.invitations.values()];
  }

  async upsertInvitation(invitation: Invitation) {
    this.invitations.set(invitation.id, invitation);
  }
}

class FirestoreIdentityStore implements IdentityStore {
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  private readonly baseUrl: string;

  constructor(config: AppConfig) {
    if (!config.GOOGLE_CLOUD_PROJECT) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required for Firestore.");
    }
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

  private async upsertPayload(
    collection: string,
    id: string,
    payload: unknown,
    index: Record<string, string>,
  ) {
    const client = await this.auth.getClient();
    await client.request({
      url: `${this.baseUrl}/${collection}/${encodeURIComponent(id)}`,
      method: "PATCH",
      data: {
        fields: {
          ...Object.fromEntries(
            Object.entries(index).map(([key, value]) => [
              key,
              { stringValue: value },
            ]),
          ),
          payload: { stringValue: JSON.stringify(payload) },
        },
      },
    });
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

  async getUser(uid: string) {
    const payload = await this.getPayload("users", uid);
    return payload ? userProfileSchema.parse(JSON.parse(payload)) : undefined;
  }

  async upsertUser(user: UserProfile) {
    await this.upsertPayload("users", user.uid, user, {
      email: user.email,
      status: user.status,
      updatedAt: user.updatedAt,
    });
  }

  async getTenant(id: string) {
    const payload = await this.getPayload("tenants", id);
    return payload ? tenantSchema.parse(JSON.parse(payload)) : undefined;
  }

  async upsertTenant(tenant: Tenant) {
    await this.upsertPayload("tenants", tenant.id, tenant, {
      slug: tenant.slug,
      status: tenant.status,
      updatedAt: tenant.updatedAt,
    });
  }

  async getMembership(id: string) {
    const payload = await this.getPayload("memberships", id);
    return payload ? membershipSchema.parse(JSON.parse(payload)) : undefined;
  }

  async listMemberships() {
    return (await this.listPayloads("memberships")).map((payload) =>
      membershipSchema.parse(payload),
    );
  }

  async upsertMembership(membership: Membership) {
    await this.upsertPayload(
      "memberships",
      membership.id,
      membership,
      {
        tenantId: membership.tenantId,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
        updatedAt: membership.updatedAt,
      },
    );
  }

  async listInvitations() {
    return (await this.listPayloads("invitations")).map((payload) =>
      invitationSchema.parse(payload),
    );
  }

  async upsertInvitation(invitation: Invitation) {
    await this.upsertPayload(
      "invitations",
      invitation.id,
      invitation,
      {
        tenantId: invitation.tenantId,
        email: invitation.email,
        status: invitation.status,
        updatedAt: invitation.updatedAt,
      },
    );
  }
}

export function createIdentityStore(config: AppConfig): IdentityStore {
  return config.EVENT_STORE === "firestore"
    ? new FirestoreIdentityStore(config)
    : new MemoryIdentityStore();
}

