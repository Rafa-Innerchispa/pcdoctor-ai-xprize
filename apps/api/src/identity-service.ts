import {
  defaultPermissionsByRole,
  invitationSchema,
  membershipSchema,
  sessionSchema,
  tenantSchema,
  userProfileSchema,
  type FieldSparkSession,
  type Invitation,
  type Membership,
} from "@fieldspark/contracts";
import type { AuthenticatedIdentity } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { IdentityStore } from "./identity-store.js";

const ownerTenants = [
  {
    id: "pcdoctor-ec",
    slug: "pcdoctor",
    legalName: "PC Doctor",
    displayName: "PC Doctor",
    playbook: "pcdoctor",
    environment: "production",
  },
  {
    id: "iapro-ec",
    slug: "iapro",
    legalName: "IAPRO S.A.S.",
    displayName: "IAPRO",
    playbook: "iapro",
    environment: "production",
  },
  {
    id: "studio-pilot",
    slug: "estudio-fotografico",
    legalName: "Identidad legal pendiente de confirmación",
    displayName: "Estudio fotográfico",
    playbook: "photography_studio",
    environment: "staging",
  },
  {
    id: "servifran-pilot",
    slug: "servifran",
    legalName: "Identidad legal pendiente de confirmación",
    displayName: "SERVIFRAN",
    playbook: "condominium_management",
    environment: "staging",
  },
] as const;

export function membershipId(tenantId: string, userId: string) {
  return `${tenantId}__${userId}`;
}

export function invitationId(tenantId: string, email: string) {
  return `${tenantId}__${email.toLowerCase()}`;
}

export async function bootstrapSession(
  identity: AuthenticatedIdentity,
  config: AppConfig,
  store: IdentityStore,
): Promise<FieldSparkSession> {
  const now = new Date().toISOString();
  const existing = await store.getUser(identity.uid);
  let user = userProfileSchema.parse({
    uid: identity.uid,
    email: identity.email,
    emailVerified: identity.emailVerified,
    displayName: existing?.displayName || identity.displayName,
    phone: existing?.phone ?? "",
    taxId: existing?.taxId ?? "",
    personType: existing?.personType ?? null,
    legalName: existing?.legalName ?? "",
    photoUrl: identity.photoUrl ?? existing?.photoUrl ?? null,
    status: existing?.status ?? "pending_profile",
    profileComplete: existing?.profileComplete ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  await store.upsertUser(user);

  if (
    identity.email.toLowerCase() ===
    config.BOOTSTRAP_OWNER_EMAIL.toLowerCase()
  ) {
    for (const ownerTenant of ownerTenants) {
      const currentTenant = await store.getTenant(ownerTenant.id);
      if (!currentTenant) {
        await store.upsertTenant(
          tenantSchema.parse({
            ...ownerTenant,
            status: "active",
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
      const id = membershipId(ownerTenant.id, identity.uid);
      const currentMembership = await store.getMembership(id);
      if (!currentMembership) {
        await store.upsertMembership(
          membershipSchema.parse({
            id,
            tenantId: ownerTenant.id,
            userId: identity.uid,
            role: "platform_owner",
            permissions: [...defaultPermissionsByRole.platform_owner],
            status: "active",
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
    }
  }

  const invitations = (await store.listInvitations()).filter(
    (invitation) =>
      invitation.email === identity.email.toLowerCase() &&
      invitation.status === "pending",
  );
  for (const invitation of invitations) {
    const id = membershipId(invitation.tenantId, identity.uid);
    const currentMembership = await store.getMembership(id);
    if (!currentMembership) {
      await store.upsertMembership(
        membershipSchema.parse({
          id,
          tenantId: invitation.tenantId,
          userId: identity.uid,
          role: invitation.role,
          permissions:
            invitation.permissions.length > 0
              ? invitation.permissions
              : [...defaultPermissionsByRole[invitation.role]],
          status: "active",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    await store.upsertInvitation(
      invitationSchema.parse({
        ...invitation,
        status: "accepted",
        acceptedBy: identity.uid,
        updatedAt: now,
      }),
    );
  }

  const memberships = (await store.listMemberships()).filter(
    (membership) =>
      membership.userId === identity.uid && membership.status === "active",
  );
  if (user.profileComplete) {
    user = userProfileSchema.parse({
      ...user,
      status: memberships.length > 0 ? "active" : "pending_access",
      updatedAt: now,
    });
    await store.upsertUser(user);
  }

  const resolved: Array<{
    membership: Membership;
    tenant: NonNullable<Awaited<ReturnType<IdentityStore["getTenant"]>>>;
  }> = [];
  for (const membership of memberships) {
    const tenant = await store.getTenant(membership.tenantId);
    if (tenant?.status === "active") {
      resolved.push({ membership, tenant });
    }
  }
  return sessionSchema.parse({ user, memberships: resolved });
}

export async function findActiveMembership(
  store: IdentityStore,
  tenantId: string,
  userId: string,
) {
  const membership = await store.getMembership(membershipId(tenantId, userId));
  return membership?.status === "active" ? membership : undefined;
}

export function canManageMembers(membership: Membership) {
  return (
    membership.role === "platform_owner" ||
    membership.permissions.includes("members.manage")
  );
}

export type { Invitation };
