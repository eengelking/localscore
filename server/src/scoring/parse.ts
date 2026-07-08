// Vector parsing & version handling per SPEC.md §2.5 and §6.1.

import pkg from "ae-cvss-calculator";
import { HttpError } from "../lib/errors.js";
import type { CvssVersion } from "../catalog/types.js";

const { Cvss3P1, Cvss4P0 } = pkg;
export type CvssInstance = InstanceType<typeof Cvss3P1> | InstanceType<typeof Cvss4P0>;

export interface ParsedVector {
  version: CvssVersion;
  instance: CvssInstance;
  note?: string;
}

const V30_PREFIX = "CVSS:3.0/";
const V31_PREFIX = "CVSS:3.1/";
const V40_PREFIX = "CVSS:4.0/";

export function parseBaseVector(raw: string): ParsedVector {
  const trimmed = raw.trim();

  if (trimmed.startsWith(V40_PREFIX)) {
    return { version: "4.0", instance: build(() => new Cvss4P0(trimmed)) };
  }

  if (trimmed.startsWith(V31_PREFIX)) {
    return { version: "3.1", instance: build(() => new Cvss3P1(trimmed)) };
  }

  if (trimmed.startsWith(V30_PREFIX)) {
    // 3.0 and 3.1 share the same metric letters/values; only the equations
    // differ (Roundup definition, a MISS ceiling in one branch). Score with
    // the v3.1 engine but disclose the simplification per SPEC.md §2.5.
    const rewritten = V31_PREFIX + trimmed.slice(V30_PREFIX.length);
    return {
      version: "3.1",
      instance: build(() => new Cvss3P1(rewritten)),
      note: "This is a CVSS v3.0 vector, scored using v3.1 equations (the two differ only in minor rounding details).",
    };
  }

  if (trimmed.startsWith("CVSS:2.0/") || isBareV2Vector(trimmed)) {
    throw new HttpError(400, "CVSS v2.0 isn't supported yet — paste a v3.0, v3.1, or v4.0 vector instead.");
  }

  throw new HttpError(
    400,
    'Unrecognized CVSS vector format — expected it to start with "CVSS:4.0/", "CVSS:3.1/", or "CVSS:3.0/".',
  );
}

function isBareV2Vector(v: string): boolean {
  // v2 vectors have no "CVSS:" prefix and use Au: (Authentication), a metric
  // that v3+ replaced with PR:.
  return !v.startsWith("CVSS:") && /(^|\/)Au:/.test(v);
}

function build<T extends CvssInstance>(make: () => T): T {
  try {
    const instance = make();
    if (!instance.isBaseFullyDefined()) {
      throw new Error("not all base metrics are defined");
    }
    return instance;
  } catch (err) {
    throw friendlyParseError(err);
  }
}

function friendlyParseError(err: unknown): HttpError {
  const message = err instanceof Error ? err.message : String(err);

  const badValue = message.match(/Unknown component value (\S+) for component (\S+)/);
  if (badValue) {
    const [, value, metric] = badValue;
    return new HttpError(400, `\`${metric}:${value}\` isn't a valid value for the ${metric} metric.`);
  }

  const badComponent = message.match(/Unknown component (\S+) when setting value (\S+)/);
  if (badComponent) {
    const [, metric] = badComponent;
    return new HttpError(400, `\`${metric}\` isn't a recognized CVSS metric.`);
  }

  if (message.includes("not all base metrics are defined")) {
    return new HttpError(400, "That vector is missing one or more required base metrics.");
  }

  return new HttpError(400, `That doesn't look like a valid CVSS vector (${message}).`);
}
