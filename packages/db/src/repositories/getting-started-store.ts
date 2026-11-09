import { eq } from "drizzle-orm";
import { DomainError } from "@storymapper/contracts";
import type { GettingStartedChecklist } from "@storymapper/contracts";
import { RepositoryContext } from "@storymapper/db/database-handle";
import { cards, connectorConnections, projectSettings, storyMaps } from "@storymapper/db/schema";

export class GettingStartedStore {
  constructor(private readonly context: RepositoryContext) {}

  private get db() { return this.context.database; }

  private track(projectId: string): void {
    this.context.transaction!.hasBusinessActivity = true;
    this.context.transaction!.liveEntities.set(`projectSettings:${projectId}`, { entityType: "projectSettings", entityId: projectId, projectId, version: null });
  }

  read(projectId: string): GettingStartedChecklist {
    const row = this.db.select().from(projectSettings).where(eq(projectSettings.projectId, projectId)).get();
    if (!row) throw new DomainError("not_found", `Project ${projectId} not found.`);
    return {
      projectId, initialized: row.gettingStartedInitialized, dismissed: row.gettingStartedDismissed,
      sampleStoryMapId: row.sampleStoryMapId,
      completed: {
        createStoryMap: row.completedStoryMap, addCards: row.completedCards,
        connectGitHub: row.completedGitHub, export: row.completedExport
      }
    };
  }

  initialize(projectId: string, sampleStoryMapId: string | null): void {
    this.context.assertWritable();
    this.track(projectId);
    this.db.update(projectSettings).set({ gettingStartedInitialized: true, sampleStoryMapId })
      .where(eq(projectSettings.projectId, projectId)).run();
  }

  dismiss(projectId: string): void {
    this.context.assertWritable();
    this.read(projectId);
    this.track(projectId);
    this.db.update(projectSettings).set({ gettingStartedDismissed: true })
      .where(eq(projectSettings.projectId, projectId)).run();
  }

  complete(projectId: string, item: keyof GettingStartedChecklist["completed"]): void {
    this.context.assertWritable();
    const state = this.read(projectId);
    if (state.completed[item]) return;
    this.track(projectId);
    const columns = { createStoryMap: "completedStoryMap", addCards: "completedCards", connectGitHub: "completedGitHub", export: "completedExport" } as const;
    this.db.update(projectSettings).set({ [columns[item]]: true }).where(eq(projectSettings.projectId, projectId)).run();
  }

  recognize(projectId: string): GettingStartedChecklist {
    this.context.assertWritable();
    const state = this.read(projectId);
    const visibleMaps = this.db.select().from(storyMaps).where(eq(storyMaps.projectId, projectId)).all().filter((map) => !map.deleted);
    if (visibleMaps.some((map) => map.id !== state.sampleStoryMapId)) this.complete(projectId, "createStoryMap");
    const mapIds = new Set(visibleMaps.map((map) => map.id));
    if (this.db.select().from(cards).where(eq(cards.creationSource, "human")).all().some((card) => mapIds.has(card.storyMapId))) {
      this.complete(projectId, "addCards");
    }
    if (this.db.select().from(connectorConnections).where(eq(connectorConnections.projectId, projectId)).all().some((connection) => connection.provider === "github")) {
      this.complete(projectId, "connectGitHub");
    }
    return this.read(projectId);
  }
}
