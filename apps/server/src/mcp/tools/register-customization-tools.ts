import { mcpToolInputSchemas as inputs } from "@storymapper/contracts";
import * as customization from "@storymapper/server/application/customization/customization.use-cases";
import { listConnectorConnections } from "@storymapper/server/application/connector/connector.use-cases";
import { registerTool, type RegistrationContext } from "@storymapper/server/mcp/tools/register-tools";

export function registerCustomizationTools(context: RegistrationContext): void {
  const { application, actor } = context;
  registerTool(context, "GetCustomization", async (input) => { const { projectId, storyMapId } = inputs.GetCustomization.parse(input); return { data: customization.getCustomization(application, actor, projectId, storyMapId) }; });
  registerTool(context, "GetSafetySettings", async (input) => ({ data: customization.getSafetySettings(application, actor, inputs.GetSafetySettings.parse(input).projectId) }));
  registerTool(context, "ListConnectorConnections", async (input) => ({ data: listConnectorConnections(application, actor, inputs.ListConnectorConnections.parse(input).projectId) }));
  registerTool(context, "ListActivity", async (input) => {
    const query = input as import("@storymapper/contracts").ActivityQuery;
    return { data: customization.listActivity(application, actor, undefined, query) };
  });
  registerTool(context, "CreateWorkflowStatus", (input) => ({ data: customization.createWorkflowStatus(application, actor, inputs.CreateWorkflowStatus.parse(input)) }), undefined, true);
  registerTool(context, "UpdateWorkflowStatus", (input) => { const { statusId, patch, apply } = inputs.UpdateWorkflowStatus.parse(input); return { data: customization.updateWorkflowStatus(application, actor, statusId, { ...patch, apply }) }; }, undefined, true);
  registerTool(context, "DeleteWorkflowStatus", (input) => { const { statusId, ...command } = inputs.DeleteWorkflowStatus.parse(input); return { data: customization.deleteWorkflowStatus(application, actor, statusId, command) }; }, undefined, true);
  registerTool(context, "CreateAnnotation", (input) => ({ data: customization.createAnnotation(application, actor, inputs.CreateAnnotation.parse(input)) }), undefined, true);
  registerTool(context, "UpdateAnnotation", (input) => { const { annotationId, patch, apply } = inputs.UpdateAnnotation.parse(input); return { data: customization.updateAnnotation(application, actor, annotationId, { ...patch, apply }) }; }, undefined, true);
  registerTool(context, "DeleteAnnotation", (input) => { const { annotationId, ...command } = inputs.DeleteAnnotation.parse(input); return { data: customization.deleteAnnotation(application, actor, annotationId, command) }; }, undefined, true);
  registerTool(context, "CreateStoryTemplate", (input) => ({ data: customization.createStoryTemplate(application, actor, inputs.CreateStoryTemplate.parse(input)) }), undefined, true);
  registerTool(context, "UpdateStoryTemplate", (input) => { const { templateId, patch, apply } = inputs.UpdateStoryTemplate.parse(input); return { data: customization.updateStoryTemplate(application, actor, templateId, { ...patch, apply }) }; }, undefined, true);
  registerTool(context, "DeleteStoryTemplate", (input) => { const parsed = inputs.DeleteStoryTemplate.parse(input); return { data: customization.deleteStoryTemplate(application, actor, parsed.templateId, parsed.apply) }; }, undefined, true);
}
