import { indexer, NoCapRegistry } from "envio";
import type { Anchor, Project } from "envio";

indexer.onEvent(
  { contract: "NoCapRegistry", event: "Anchored" },
  async ({ event, context }) => {
  const entity: Anchor = {
    id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
    // Lowercase every address on the way in so GraphQL _eq filters match a
    // checksummed address the frontend gets from a wallet without per-query casing.
    builder: event.params.builder.toLowerCase(),
    repoId: event.params.repoId,
    commitHash: event.params.commitHash,
    label: event.params.label,
    timestamp: event.params.timestamp,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
  };
  context.Anchor.set(entity);
}
);

indexer.onEvent(
  { contract: "NoCapRegistry", event: "ProjectRegistered" },
  async ({ event, context }) => {
  // Keyed by repoId: registerProject reverts if the repo is already registered,
  // so there is exactly one ProjectRegistered per repo and repoId is a stable id.
  const entity: Project = {
    id: event.params.repoId,
    builder: event.params.builder.toLowerCase(),
    repoId: event.params.repoId,
    hackathonId: event.params.hackathonId,
    repoUrl: event.params.repoUrl,
    registeredAt: event.params.registeredAt,
    txHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
  };
  context.Project.set(entity);
}
);
