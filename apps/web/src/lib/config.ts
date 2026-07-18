import type { Address } from "viem";
import { SPARK_HACKATHON, SPARK_HACKATHON_ID } from "@nocap/shared";

/** Fill these after `forge script Deploy` — or set NEXT_PUBLIC_* env vars. */
export const ADDRESSES = {
  registry: (process.env.NEXT_PUBLIC_NOCAP_REGISTRY ??
    "0x0000000000000000000000000000000000000000") as Address,
  hackathonRegistry: (process.env.NEXT_PUBLIC_HACKATHON_REGISTRY ??
    "0x0000000000000000000000000000000000000000") as Address,
  badge: (process.env.NEXT_PUBLIC_NOCAP_BADGE ??
    "0x0000000000000000000000000000000000000000") as Address,
  deploymentBlock: BigInt(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK ?? "0"),
  // HackathonRegistry was redeployed later than NoCapRegistry — scoping window
  // scans to its own deploy block avoids scanning ~120k empty earlier blocks.
  hackathonDeploymentBlock: BigInt(
    process.env.NEXT_PUBLIC_HACKATHON_DEPLOYMENT_BLOCK ??
      process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK ??
      "0"
  ),
};

export const DEFAULT_HACKATHON = {
  id: SPARK_HACKATHON_ID,
  idString: SPARK_HACKATHON.idString,
  name: SPARK_HACKATHON.name,
  startTime: SPARK_HACKATHON.startTime,
  endTime: SPARK_HACKATHON.endTime,
};

/** owner/repo of THIS project — set once pushed to GitHub, so the landing page can
 *  link to NoCap's own live timeline (PRODUCT.md: "Dogfood: NoCap's own repo timeline
 *  on the landing path"). Left unset until real git history + a real anchor exist. */
export const SELF_REPO = process.env.NEXT_PUBLIC_SELF_REPO ?? "";

export const SITE = {
  name: "NoCap",
  tagline: "your build, no cap.",
  description:
    "Onchain build-provenance protocol — auto-anchors commit fingerprints to Monad so timelines are verifiable, not claimed.",
};
