import { mcpToolInputSchemas as inputs } from "@storymapper/contracts";
import * as maps from "@storymapper/server/application/story-map/story-map.use-cases";
import * as roadmaps from "@storymapper/server/application/roadmap/roadmap.use-cases";
import { deleteRelease } from "@storymapper/server/application/release/release.use-cases";
import { deletePersona } from "@storymapper/server/application/persona/persona.use-cases";
import { registerTool, type RegistrationContext } from "@storymapper/server/mcp/tools/register-tools";

export function registerStructureTools(context: RegistrationContext): void {
  const { application, actor } = context;
  registerTool(context, "CreateStoryMap", (input) => ({ data: maps.createStoryMap(application, actor, inputs.CreateStoryMap.parse(input)) }), undefined, true);
  registerTool(context, "GetStoryMapSnapshot", async (input) => ({ data: maps.getStoryMapSnapshot(application, actor, inputs.GetStoryMapSnapshot.parse(input).storyMapId) }));
  registerTool(context, "UpdateStoryMap", (input) => { const { storyMapId, baseVersion, patch, apply } = inputs.UpdateStoryMap.parse(input); return { data: maps.updateStoryMap(application, actor, storyMapId, { ...patch, baseVersion, apply }) }; }, undefined, true);
  registerTool(context, "DeleteStoryMap", (input) => { const { apply, ...params } = inputs.DeleteStoryMap.parse(input); return { data: maps.deleteStoryMap(application, actor, params, apply) }; }, undefined, true);
  registerTool(context, "DeleteRelease", (input) => { const parsed = inputs.DeleteRelease.parse(input); return { data: deleteRelease(application, actor, parsed.releaseId, parsed.baseVersion, parsed.apply) }; }, undefined, true);
  registerTool(context, "DeletePersona", (input) => { const { personaId, ...command } = inputs.DeletePersona.parse(input); return { data: deletePersona(application, actor, personaId, command) }; }, undefined, true);
  registerRoadmapTools(context);
}

function registerRoadmapTools(context: RegistrationContext): void {
  const { application, actor } = context;
  registerTool(context, "ListRoadmaps", async (input) => { const { projectId, storyMapId } = inputs.ListRoadmaps.parse(input); return { data: roadmaps.listRoadmaps(application, actor, projectId, storyMapId) }; });
  registerTool(context, "CreateRoadmap", (input) => ({ data: roadmaps.createRoadmap(application, actor, inputs.CreateRoadmap.parse(input)) }), undefined, true);
  registerTool(context, "GetRoadmapDetails", async (input) => ({ data: roadmaps.getRoadmapDetails(application, actor, inputs.GetRoadmapDetails.parse(input).roadmapId) }));
  registerTool(context, "UpdateRoadmap", (input) => { const { roadmapId, baseVersion, patch, apply } = inputs.UpdateRoadmap.parse(input); return { data: roadmaps.updateRoadmap(application, actor, roadmapId, { ...patch, baseVersion, apply }) }; }, undefined, true);
  registerTool(context, "CreateRoadmapColumn", (input) => ({ data: roadmaps.createRoadmapColumn(application, actor, inputs.CreateRoadmapColumn.parse(input)) }), undefined, true);
  registerTool(context, "CreateRoadmapSwimlane", (input) => ({ data: roadmaps.createRoadmapSwimlane(application, actor, inputs.CreateRoadmapSwimlane.parse(input)) }), undefined, true);
  registerTool(context, "CreateRoadmapCard", (input) => ({ data: roadmaps.createRoadmapCard(application, actor, inputs.CreateRoadmapCard.parse(input)) }), undefined, true);
  registerTool(context, "CreateRoadmapReference", (input) => ({ data: roadmaps.createRoadmapReference(application, actor, inputs.CreateRoadmapReference.parse(input)) }), undefined, true);
}
