import type { FastifyPluginAsync } from "fastify";
import { deleteWorkflowStatusRequestSchema, deleteAnnotationRequestSchema, activityChangesQuerySchema, activityQuerySchema, createWorkflowStatusRequestSchema, updateWorkflowStatusRequestSchema, createAnnotationRequestSchema, updateAnnotationRequestSchema, createStoryTemplateRequestSchema, updateStoryTemplateRequestSchema, updateSafetySettingsRequestSchema } from "@storymapper/contracts";
import { localHumanActor } from "@storymapper/server/application/actors";
import { parseInput } from "@storymapper/server/application/http/validate";
import * as useCases from "@storymapper/server/application/customization/customization.use-cases";
import { registerApplicationRoute, requiredQuery, optionalQuery, routeParam } from "@storymapper/server/http/routes/application-route";
import { toApplicationDeps, type RouteDeps } from "@storymapper/server/http/routes/route-deps";

export const customizationRoutes: FastifyPluginAsync<RouteDeps> = async (server, deps) => {
  const application = toApplicationDeps(deps);
  const actor = localHumanActor;
  registerApplicationRoute(server, useCases.getCustomizationDescriptor, (request) => useCases.getCustomization(application, actor, requiredQuery(request, "projectId"), optionalQuery(request, "storyMapId")));
  registerApplicationRoute(server, useCases.createWorkflowStatusDescriptor, (request, reply) => reply.code(201).send(useCases.createWorkflowStatus(application, actor, parseInput(createWorkflowStatusRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.updateWorkflowStatusDescriptor, (request) => useCases.updateWorkflowStatus(application, actor, routeParam(request, "statusId"), parseInput(updateWorkflowStatusRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.deleteWorkflowStatusDescriptor, (request) => useCases.deleteWorkflowStatus(application, actor, routeParam(request, "statusId"), parseInput(deleteWorkflowStatusRequestSchema, request.body ?? {})));
  registerApplicationRoute(server, useCases.createAnnotationDescriptor, (request, reply) => reply.code(201).send(useCases.createAnnotation(application, actor, parseInput(createAnnotationRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.updateAnnotationDescriptor, (request) => useCases.updateAnnotation(application, actor, routeParam(request, "annotationId"), parseInput(updateAnnotationRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.deleteAnnotationDescriptor, (request) => useCases.deleteAnnotation(application, actor, routeParam(request, "annotationId"), parseInput(deleteAnnotationRequestSchema, request.body ?? {})));
  registerApplicationRoute(server, useCases.createStoryTemplateDescriptor, (request, reply) => reply.code(201).send(useCases.createStoryTemplate(application, actor, parseInput(createStoryTemplateRequestSchema, request.body))));
  registerApplicationRoute(server, useCases.updateStoryTemplateDescriptor, (request) => useCases.updateStoryTemplate(application, actor, routeParam(request, "templateId"), parseInput(updateStoryTemplateRequestSchema, request.body)));
  registerApplicationRoute(server, useCases.deleteStoryTemplateDescriptor, (request) => useCases.deleteStoryTemplate(application, actor, routeParam(request, "templateId")));
  registerApplicationRoute(server, useCases.listActivityChangesDescriptor, (request) => useCases.listActivityChanges(application, actor, parseInput(activityChangesQuerySchema, request.query)));
  registerApplicationRoute(server, useCases.listActivityDescriptor, (request) => useCases.listActivity(application, actor, undefined, parseInput(activityQuerySchema, request.query)));
  registerApplicationRoute(server, useCases.getSafetySettingsDescriptor, (request) => useCases.getSafetySettings(application, actor, requiredQuery(request, "projectId")));
  registerApplicationRoute(server, useCases.updateSafetySettingsDescriptor, (request) => useCases.updateSafetySettings(application, actor, requiredQuery(request, "projectId"), parseInput(updateSafetySettingsRequestSchema, request.body)));
};
