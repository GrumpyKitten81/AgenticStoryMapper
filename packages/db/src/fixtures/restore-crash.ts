import { randomUUID } from "node:crypto";
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { RestoreProjectResult } from "@storymapper/contracts";
import { DatabaseHandle, openStoryMapperDb, UnitOfWork, createRestorePoint, developmentSchemaVersion } from "@storymapper/db";
import { prepareRestoredHistory } from "@storymapper/db/restore-history";
import { publishPreparedRestore } from "@storymapper/db/restore-recovery";

const path = process.argv[2]!;
const handle = new DatabaseHandle(openStoryMapperDb(path));
const uow = new UnitOfWork(handle);
const actor = { actorType: "human", actorId: "crashed-restore-fixture" } as const;
const project = uow.run(actor, ({ repository: tx }) => tx.createProject({ name: "Crashed restore fixture" }));
const map = uow.run(actor, ({ repository: tx }) => tx.createStoryMap({ projectId: project.id, name: "Crashed restore map" }));
const card = uow.run(actor, ({ repository: tx }) => tx.createCard({ storyMapId: map.id, level: "activity", title: "Checkpointed snapshot state" }));
const point = createRestorePoint(handle, "manual");
handle.current.$client.pragma("wal_checkpoint(TRUNCATE)");
handle.current.$client.pragma("wal_autocheckpoint = 0");
uow.run(actor, ({ repository: tx }) => tx.updateCard(card.id, { title: "Committed only in crashed WAL" }));
const preRestorePoint = createRestorePoint(handle, "pre-restore");
const result: RestoreProjectResult = { restorePoint: point, preRestorePoint, epoch: randomUUID(), githubLinks: [], attachmentsRetained: true, undoneActivityEvents: 0, undoneChangeSets: 0 };
copyFileSync(join(dirname(path), "snapshots", point.fileName), `${path}.restoring`);
const candidate = new Database(`${path}.restoring`);
try { prepareRestoredHistory(handle.current.$client, candidate, project.id, actor, result); }
finally { candidate.close(); }
publishPreparedRestore(`${path}.restoring`, developmentSchemaVersion(handle.current), result.epoch);
writeFileSync(`${path}.fixture.json`, JSON.stringify({ cardId: card.id, epoch: result.epoch }));
process.kill(process.pid, "SIGKILL");
