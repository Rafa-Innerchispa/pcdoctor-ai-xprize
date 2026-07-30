import {
  ecIdentityValidationSchema,
  type EcIdentityValidation,
} from "@fieldspark/contracts";
import type { AppConfig } from "./config.js";

export class EcuadorIdentityError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 422,
  ) {
    super(message);
  }
}

function digits(value: string) {
  return value.replace(/[\s-]/g, "");
}

export function isValidEcuadorCedula(value: string): boolean {
  const clean = digits(value);
  if (!/^\d{10}$/.test(clean)) return false;
  const province = Number(clean.slice(0, 2));
  if (province < 1 || province > 24 || Number(clean[2]) > 5) return false;
  const total = [...clean.slice(0, 9)].reduce((sum, character, index) => {
    const product = Number(character) * (index % 2 === 0 ? 2 : 1);
    return sum + (product > 9 ? product - 9 : product);
  }, 0);
  return (10 - (total % 10)) % 10 === Number(clean[9]);
}

export function isValidEcuadorRuc(value: string): boolean {
  const clean = digits(value);
  if (!/^\d{13}$/.test(clean)) return false;
  const province = Number(clean.slice(0, 2));
  if ((province < 1 || province > 24) && province !== 30) return false;
  const third = Number(clean[2]);

  if (third <= 5) {
    return isValidEcuadorCedula(clean.slice(0, 10)) && clean.endsWith("001");
  }
  if (third === 6) {
    const coefficients = [3, 2, 7, 6, 5, 4, 3, 2];
    const total = coefficients.reduce(
      (sum, coefficient, index) =>
        sum + Number(clean[index]) * coefficient,
      0,
    );
    const remainder = 11 - (total % 11);
    const verifier = remainder === 11 ? 0 : remainder;
    return verifier === Number(clean[8]) && clean.endsWith("0001");
  }
  if (third === 9) {
    const coefficients = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    const total = coefficients.reduce(
      (sum, coefficient, index) =>
        sum + Number(clean[index]) * coefficient,
      0,
    );
    const remainder = 11 - (total % 11);
    const verifier = remainder === 11 ? 0 : remainder;
    return verifier === Number(clean[9]) && clean.endsWith("001");
  }
  return false;
}

export function validateEcuadorIdentifier(value: string): {
  identifier: string;
  identifierType: "cedula" | "ruc";
} {
  const identifier = digits(value);
  if (isValidEcuadorCedula(identifier)) {
    return { identifier, identifierType: "cedula" };
  }
  if (isValidEcuadorRuc(identifier)) {
    return { identifier, identifierType: "ruc" };
  }
  throw new EcuadorIdentityError(
    "invalid_ec_identifier",
    "La cédula o RUC no supera la validación ecuatoriana.",
  );
}

export function buildLocalIdentityValidation(
  value: string,
): EcIdentityValidation {
  const local = validateEcuadorIdentifier(value);
  return ecIdentityValidationSchema.parse({
    ...local,
    locallyValid: true,
    registryVerified: false,
    source: "local_checksum",
    legalName: "",
    commercialName: "",
    activity: "",
    status: "locally_valid",
    verifiedAt: new Date().toISOString(),
  });
}

type RegistryPayload = {
  data?: {
    main?: Array<Record<string, unknown>> | Record<string, unknown>;
  };
};

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

export class AuthorizedTaxRegistry {
  private token = "";
  private tokenExpiresAt = 0;
  private readonly cache = new Map<
    string,
    { expiresAt: number; value: EcIdentityValidation }
  >();

  constructor(private readonly config: AppConfig) {}

  get configured() {
    return Boolean(
      this.config.RUC_API_LIVE_ENABLED &&
        this.config.RUC_API_TOKEN_BASE_URL &&
        this.config.RUC_API_LOOKUP_BASE_URL &&
        this.config.RUC_API_USERNAME &&
        this.config.RUC_API_PASSWORD,
    );
  }

  async validate(value: string): Promise<EcIdentityValidation> {
    const local = validateEcuadorIdentifier(value);
    const now = Date.now();
    const cached = this.cache.get(local.identifier);
    if (cached && cached.expiresAt > now) return cached.value;

    if (local.identifierType === "cedula") {
      return buildLocalIdentityValidation(local.identifier);
    }
    if (!this.configured) {
      throw new EcuadorIdentityError(
        "tax_registry_not_configured",
        "La consulta tributaria autorizada todavía no está configurada.",
        503,
      );
    }

    const token = await this.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.RUC_API_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(
        `${this.config.RUC_API_LOOKUP_BASE_URL.replace(/\/$/, "")}/api/ruc/${local.identifier}`,
        {
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        },
      );
    } catch {
      throw new EcuadorIdentityError(
        "tax_registry_unavailable",
        "No se pudo consultar el registro tributario.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 404) {
      throw new EcuadorIdentityError(
        "taxpayer_not_found",
        "El registro tributario no encontró ese RUC.",
        404,
      );
    }
    if (!response.ok) {
      throw new EcuadorIdentityError(
        "tax_registry_error",
        "El registro tributario devolvió un error.",
        502,
      );
    }
    const payload = (await response.json()) as RegistryPayload;
    const raw = payload.data?.main;
    const record = Array.isArray(raw) ? raw[0] : raw;
    if (!record) {
      throw new EcuadorIdentityError(
        "tax_registry_invalid_response",
        "El registro tributario devolvió una respuesta incompleta.",
        502,
      );
    }
    const result = ecIdentityValidationSchema.parse({
      ...local,
      locallyValid: true,
      registryVerified: true,
      source: "authorized_registry",
      legalName: stringField(record, "razonSocial"),
      commercialName: stringField(record, "nombreComercial"),
      activity: stringField(record, "actividadContribuyente"),
      status: "verified",
      verifiedAt: new Date().toISOString(),
    });
    this.cache.set(local.identifier, {
      expiresAt: now + this.config.RUC_API_CACHE_TTL_MS,
      value: result,
    });
    return result;
  }

  private async getToken() {
    if (this.token && this.tokenExpiresAt > Date.now() + 30_000) {
      return this.token;
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.RUC_API_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(
        `${this.config.RUC_API_TOKEN_BASE_URL.replace(/\/$/, "")}/v1/deuna/creacion-token`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            usuario: this.config.RUC_API_USERNAME,
            pass: this.config.RUC_API_PASSWORD,
          }),
          signal: controller.signal,
        },
      );
    } catch {
      throw new EcuadorIdentityError(
        "tax_registry_token_unavailable",
        "No se pudo autenticar con el registro tributario.",
        503,
      );
    } finally {
      clearTimeout(timeout);
    }
    const payload = (await response.json().catch(() => null)) as {
      data?: { response?: unknown };
    } | null;
    const token = payload?.data?.response;
    if (!response.ok || typeof token !== "string" || !token) {
      throw new EcuadorIdentityError(
        "tax_registry_token_rejected",
        "El registro tributario rechazó la autenticación.",
        502,
      );
    }
    this.token = token;
    this.tokenExpiresAt = Date.now() + 10 * 60_000;
    return token;
  }
}
