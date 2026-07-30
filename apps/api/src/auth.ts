import { OAuth2Client, type Certificates } from "google-auth-library";
import type { AppConfig } from "./config.js";

const FIREBASE_CERTIFICATES_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/" +
  "securetoken@system.gserviceaccount.com";

export interface AuthenticatedIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  photoUrl: string | null;
}

export interface AuthVerifier {
  verify(token: string): Promise<AuthenticatedIdentity>;
}

class FirebaseAuthVerifier implements AuthVerifier {
  private readonly verifier = new OAuth2Client();
  private readonly projectId: string;
  private readonly webApiKey: string;
  private certificates: Certificates | null = null;
  private certificatesExpireAt = 0;

  constructor(config: AppConfig) {
    if (!config.GOOGLE_CLOUD_PROJECT || !config.FIREBASE_WEB_API_KEY) {
      throw new Error(
        "GOOGLE_CLOUD_PROJECT and FIREBASE_WEB_API_KEY are required when authentication is enabled.",
      );
    }
    this.projectId = config.GOOGLE_CLOUD_PROJECT;
    this.webApiKey = config.FIREBASE_WEB_API_KEY;
  }

  private async getCertificates() {
    if (this.certificates && Date.now() < this.certificatesExpireAt) {
      return this.certificates;
    }
    const response = await fetch(FIREBASE_CERTIFICATES_URL);
    if (!response.ok) throw new Error("firebase_certificates_unavailable");
    const certificates = (await response.json()) as Certificates;
    const maxAge = Number(
      response.headers
        .get("cache-control")
        ?.match(/max-age=(\d+)/)?.[1] ?? "300",
    );
    this.certificates = certificates;
    this.certificatesExpireAt =
      Date.now() + Math.max(60, Math.min(maxAge, 3_600)) * 1_000;
    return certificates;
  }

  private async assertAccountIsActive(
    token: string,
    uid: string,
    authTime: number,
  ) {
    const response = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?" +
        `key=${encodeURIComponent(this.webApiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      },
    );
    if (!response.ok) throw new Error("firebase_account_unavailable");
    const body = (await response.json()) as {
      users?: Array<{
        localId?: string;
        disabled?: boolean;
        validSince?: string;
      }>;
    };
    const account = body.users?.[0];
    if (!account || account.localId !== uid || account.disabled) {
      throw new Error("firebase_account_inactive");
    }
    const validSince = Number(account.validSince ?? "0");
    if (Number.isFinite(validSince) && authTime < validSince) {
      throw new Error("firebase_token_revoked");
    }
  }

  async verify(token: string): Promise<AuthenticatedIdentity> {
    const [encodedHeader] = token.split(".");
    if (!encodedHeader) throw new Error("invalid_identity_token");
    const header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    ) as { alg?: string; kid?: string };
    if (header.alg !== "RS256" || !header.kid) {
      throw new Error("invalid_identity_algorithm");
    }
    const ticket = await this.verifier.verifySignedJwtWithCertsAsync(
      token,
      await this.getCertificates(),
      this.projectId,
      [`https://securetoken.google.com/${this.projectId}`],
      3_900,
    );
    const decoded = ticket.getPayload();
    if (
      !decoded?.sub ||
      decoded.sub.length > 128 ||
      !decoded.email ||
      decoded.email_verified !== true
    ) {
      throw new Error("verified_email_required");
    }
    const authTime = Number(
      (decoded as typeof decoded & { auth_time?: number }).auth_time,
    );
    if (!Number.isFinite(authTime)) {
      throw new Error("authentication_time_required");
    }
    await this.assertAccountIsActive(token, decoded.sub, authTime);
    return {
      uid: decoded.sub,
      email: decoded.email.toLowerCase(),
      emailVerified: true,
      displayName:
        typeof decoded.name === "string" ? decoded.name.slice(0, 120) : "",
      photoUrl:
        typeof decoded.picture === "string" ? decoded.picture : null,
    };
  }
}

export function createAuthVerifier(config: AppConfig): AuthVerifier | null {
  return config.AUTH_ENABLED ? new FirebaseAuthVerifier(config) : null;
}
