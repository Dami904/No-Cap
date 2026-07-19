import { HackathonRegistry } from "generated";
import type { HackathonWindow } from "generated";

HackathonRegistry.WindowRegistered.handler(async ({ event, context }) => {
  // Keyed by hackathonId and upserted: a window can be re-registered to update
  // its times, so keep the latest by block number (events replay in order, so a
  // later event always has a >= block — but guard explicitly for reorgs).
  const id = event.params.hackathonId;
  const existing = await context.HackathonWindow.get(id);
  if (existing && existing.blockNumber > BigInt(event.block.number)) return;

  const entity: HackathonWindow = {
    id,
    hackathonId: event.params.hackathonId,
    organizer: event.params.organizer.toLowerCase(),
    name: event.params.name,
    startTime: event.params.startTime,
    endTime: event.params.endTime,
    blockNumber: BigInt(event.block.number),
  };
  context.HackathonWindow.set(entity);
});
