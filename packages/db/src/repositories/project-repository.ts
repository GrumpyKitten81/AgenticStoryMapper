import { and, eq } from "drizzle-orm";
import { DatabaseHandle, RepositoryContext, type TransactionContext } from "@storymapper/db/database-handle";
import type { Project } from "@storymapper/contracts";
import { projects } from "@storymapper/db/schema";

export class ProjectRepository<Mode extends "root" | "transaction" = "root"> {
  private readonly context: RepositoryContext;

  constructor(handle: DatabaseHandle, transaction?: TransactionContext) { this.context = new RepositoryContext(handle, transaction); }

  private get db() { return this.context.database; }

  list(): Project[] {
    return this.db.select().from(projects).where(eq(projects.historicalStub, false)).all().map(toProject);
  }

  getById(id: string): Project | undefined {
    const project = this.db.select().from(projects).where(and(eq(projects.id, id), eq(projects.historicalStub, false))).get();
    return project ? toProject(project) : undefined;
  }

  private createProject(project: Project): Project {
    this.context.assertWritable();
    this.db.insert(projects).values(project).run();
    this.context.transaction!.hasBusinessActivity = true;
    this.context.transaction!.liveEntities.set(`project:${project.id}`, { entityType: "project", entityId: project.id, projectId: project.id, version: null });
    return project;
  }

  create = this.createProject.bind(this) as Mode extends "transaction" ? (project: Project) => Project : never;
}

function toProject(row: typeof projects.$inferSelect): Project {
  const project: Project = {
    historicalStub: row.historicalStub,
    id: row.id,
    name: row.name,
    localPath: row.localPath,
    defaultLanguage: row.defaultLanguage,
    defaultEstimationUnit: row.defaultEstimationUnit,
    createdAt: row.createdAt
  };

  if (row.description !== null) {
    project.description = row.description;
  }

  return project;
}
