export const generatedMcpToolDefinitions = [
  {
    "name": "ApplyChangeSet",
    "description": "Apply a stored ChangeSet with recorded approval unless the Agent mode is `propose`.",
    "permission": "write"
  },
  {
    "name": "ApproveChangeSet",
    "description": "Approve a stored ChangeSet and its selected operations when the human-controlled Agent mode is `autonomous`.",
    "permission": "approval"
  },
  {
    "name": "DeleteOrArchiveStoryMapCard",
    "description": "Archive a story map card.",
    "permission": "write"
  },
  {
    "name": "BulkUpdateCards",
    "description": "Apply one field patch to several Cards in a Story Map after checking every Card's baseVersion.",
    "permission": "write"
  },
  {
    "name": "CardReview",
    "description": "Request, start or submit a structured Card review, or propose selected corrections. Human decisions and settings are rejected for agents.",
    "permission": "proposal"
  },
  {
    "name": "ComparePlanStates",
    "description": "Compare two recorded Plan states from the same Story Map.",
    "permission": "read"
  },
  {
    "name": "CreateAiProposal",
    "description": "Generate a deterministic proposed ChangeSet from a template and selected Story Map context.",
    "permission": "proposal"
  },
  {
    "name": "CreateAnnotation",
    "description": "Create a Project annotation for use on linked Cards.",
    "permission": "write"
  },
  {
    "name": "CreateStoryMapCard",
    "description": "Create an activity, step, story or note card.",
    "permission": "write"
  },
  {
    "name": "CreateCardAttachment",
    "description": "Attach an existing local file to a Card and return its attachment metadata.",
    "permission": "write"
  },
  {
    "name": "CreateCardSourceLink",
    "description": "Record Card origin evidence from a same-Project chunk, existing GitHub Issue identity or nonblank text note.",
    "permission": "write"
  },
  {
    "name": "CreateGitHubIssueDryRun",
    "description": "Preview the GitHub Issue that would be created from a Card without writing to GitHub.",
    "permission": "write"
  },
  {
    "name": "CreateGitHubLink",
    "description": "Link a Card or Release to a GitHub Issue or Milestone.",
    "permission": "write"
  },
  {
    "name": "CreateStoryMapPersona",
    "description": "Create a project-level or story-map persona.",
    "permission": "write"
  },
  {
    "name": "CreateStoryMapRelease",
    "description": "Create a release on a story map.",
    "permission": "write"
  },
  {
    "name": "CreateRoadmap",
    "description": "Create a Project Roadmap with its initial columns.",
    "permission": "write"
  },
  {
    "name": "CreateRoadmapCard",
    "description": "Add a planning item to a Roadmap column and optional swimlane.",
    "permission": "write"
  },
  {
    "name": "CreateRoadmapColumn",
    "description": "Add an ordered column to a Roadmap.",
    "permission": "write"
  },
  {
    "name": "CreateRoadmapReference",
    "description": "Link a Roadmap card to a Card, Release, or other supported target.",
    "permission": "write"
  },
  {
    "name": "CreateRoadmapSwimlane",
    "description": "Add an ordered swimlane to a Roadmap.",
    "permission": "write"
  },
  {
    "name": "CreateStoryMap",
    "description": "Create a Story Map in the selected Project.",
    "permission": "write"
  },
  {
    "name": "CreateStoryTemplate",
    "description": "Create a reusable story template in a Project.",
    "permission": "write"
  },
  {
    "name": "CreateWorkflowStatus",
    "description": "Create a Project workflow status with its status group and ordering.",
    "permission": "write"
  },
  {
    "name": "DeleteAnnotation",
    "description": "Delete a Project annotation and its Card assignments.",
    "permission": "write"
  },
  {
    "name": "DeleteCard",
    "description": "Delete or archive a Card using the requested child-handling strategy.",
    "permission": "write"
  },
  {
    "name": "DeleteCardAnnotation",
    "description": "Remove an annotation assignment from a Card.",
    "permission": "write"
  },
  {
    "name": "DeleteCardAttachment",
    "description": "Remove an attachment record from a Card.",
    "permission": "write"
  },
  {
    "name": "DeleteCardDependency",
    "description": "Remove a Card prerequisite using the dependent Card base version. External writes create a ChangeSet.",
    "permission": "write"
  },
  {
    "name": "DeleteCardPersona",
    "description": "Remove a persona assignment from a Card.",
    "permission": "write"
  },
  {
    "name": "DeleteCardSourceLink",
    "description": "Remove Card origin evidence by its kind and identity.",
    "permission": "write"
  },
  {
    "name": "DeleteCards",
    "description": "Atomically delete the explicit selected Cards, rehome surviving children using the chosen strategy, and check every captured selected and affected Card baseline.",
    "permission": "write"
  },
  {
    "name": "DeleteGitHubLink",
    "description": "Remove a Card or Release link to a GitHub Issue or Milestone.",
    "permission": "write"
  },
  {
    "name": "DeletePersona",
    "description": "Delete a Project persona and its Card assignments.",
    "permission": "write"
  },
  {
    "name": "DeleteRelease",
    "description": "Delete a Release and apply the requested handling to assigned Cards.",
    "permission": "write"
  },
  {
    "name": "DeleteStoryMap",
    "description": "Delete a Story Map and its owned contents.",
    "permission": "write"
  },
  {
    "name": "DeleteStoryTemplate",
    "description": "Delete a reusable story template from a Project.",
    "permission": "write"
  },
  {
    "name": "DeleteWorkflowStatus",
    "description": "Delete a workflow status and handle Cards that use it.",
    "permission": "write"
  },
  {
    "name": "ExportAudit",
    "description": "Export the selected Project's Activity audit in the requested format.",
    "permission": "write"
  },
  {
    "name": "ExportStoryMap",
    "description": "Export a Story Map snapshot in the requested format.",
    "permission": "write"
  },
  {
    "name": "GetBacklogHealthReport",
    "description": "Read backlog quality counts and the Cards that need attention.",
    "permission": "read"
  },
  {
    "name": "GetStoryMapCardDetails",
    "description": "Read full card details.",
    "permission": "read"
  },
  {
    "name": "GetCardHistory",
    "description": "Read version history and changes for one Card.",
    "permission": "read"
  },
  {
    "name": "GetCardReviews",
    "description": "Read captured Card Definition of Ready requests, reports, decisions and summaries.",
    "permission": "read"
  },
  {
    "name": "GetCustomization",
    "description": "Read Product Context and templates for a Project or Story Map.",
    "permission": "read"
  },
  {
    "name": "GetGitHubSyncHealth",
    "description": "Read GitHub link, sync-run, and unresolved-conflict health for a Story Map.",
    "permission": "read"
  },
  {
    "name": "GetPlanDriftReport",
    "description": "Read durable synchronized source plan drift for a Story Map and system.",
    "permission": "read"
  },
  {
    "name": "GetPlanState",
    "description": "Read one immutable recorded Plan state.",
    "permission": "read"
  },
  {
    "name": "GetProductContext",
    "description": "Read the Project or Story Map Product Context used by proposal prompts.",
    "permission": "read"
  },
  {
    "name": "GetStoryMapReleaseDetails",
    "description": "Read releases and release reports for a story map.",
    "permission": "read"
  },
  {
    "name": "GetReleaseNotes",
    "description": "Generate deterministic read-only Markdown release notes grouped by Activity for visible Stories in configured done statuses.",
    "permission": "read"
  },
  {
    "name": "GetReleaseSummaryReport",
    "description": "Read completion and scope totals for a Story Map's Releases.",
    "permission": "read"
  },
  {
    "name": "GetReleaseTimelineReport",
    "description": "Read the scheduled Card timeline across a Story Map's Releases.",
    "permission": "read"
  },
  {
    "name": "GetRoadmapDetails",
    "description": "Read a Roadmap with its columns, swimlanes, cards, and references.",
    "permission": "read"
  },
  {
    "name": "GetSafetySettings",
    "description": "Read the Agent mode and GitHub safety settings for a Project.",
    "permission": "read"
  },
  {
    "name": "GetSlicesReport",
    "description": "Read Story-only Slice summaries and dependency ordering.",
    "permission": "read"
  },
  {
    "name": "GetSourceCoverageReport",
    "description": "Read source-document coverage and Cards without linked evidence.",
    "permission": "read"
  },
  {
    "name": "GetSourceDocument",
    "description": "Read a source document, its chunks, and linked Cards.",
    "permission": "read"
  },
  {
    "name": "GetStoryMapData",
    "description": "Read reference data for a story map.",
    "permission": "read"
  },
  {
    "name": "GetStoryMapSnapshot",
    "description": "Read a complete Story Map snapshot for planning or export.",
    "permission": "read"
  },
  {
    "name": "GetWorkItemSyncHealth",
    "description": "Read external work-item links, sync runs, and open conflicts.",
    "permission": "read"
  },
  {
    "name": "ImportGitHubTicket",
    "description": "Create a linked Card atomically from a reviewed GitHub Issue, or retain its incoming proposal for review.",
    "permission": "github"
  },
  {
    "name": "ImportSourceDocument",
    "description": "Import inline Markdown or text content into a Project and create source chunks.",
    "permission": "write"
  },
  {
    "name": "ImportGitHubIssues",
    "description": "Prepares GitHub Issue imports and returns a proposed or applied local ChangeSet.",
    "permission": "github"
  },
  {
    "name": "ListActivity",
    "description": "List filtered Activity events and agent tool-call audit summaries.",
    "permission": "read"
  },
  {
    "name": "ListAiTemplates",
    "description": "List editable prompt templates available to a Project.",
    "permission": "read"
  },
  {
    "name": "ListCardAttachments",
    "description": "List attachment metadata for a Card without returning file contents.",
    "permission": "read"
  },
  {
    "name": "GetStoryMapCards",
    "description": "Read card hierarchy and positions.",
    "permission": "read"
  },
  {
    "name": "ListChangeSets",
    "description": "List proposed, approved, applied, or rejected ChangeSets for accessible Projects.",
    "permission": "read"
  },
  {
    "name": "ListConnectorConnections",
    "description": "List Project connector names and non-secret connection settings.",
    "permission": "read"
  },
  {
    "name": "ListGitHubLinks",
    "description": "Read GitHub issue and milestone links for a story map.",
    "permission": "read"
  },
  {
    "name": "GetStoryMapPersonaDetails",
    "description": "Read personas available to a project or story map.",
    "permission": "read"
  },
  {
    "name": "ListPlanDriftSystems",
    "description": "List source systems referenced by a Story Map or retained synchronization evidence.",
    "permission": "read"
  },
  {
    "name": "ListPlanStates",
    "description": "List immutable recorded Plan states for one Story Map.",
    "permission": "read"
  },
  {
    "name": "ListProjects",
    "description": "List local Agentic Story Mapper projects.",
    "permission": "read"
  },
  {
    "name": "ListRoadmaps",
    "description": "List Roadmaps and their Project scope.",
    "permission": "read"
  },
  {
    "name": "ListSourceDocuments",
    "description": "List imported source documents for a Project.",
    "permission": "read"
  },
  {
    "name": "ListStoryMaps",
    "description": "List story maps and counts.",
    "permission": "read"
  },
  {
    "name": "LookupGitHubTicket",
    "description": "Read one GitHub Issue for the reviewed Card placement without creating local domain data.",
    "permission": "github"
  },
  {
    "name": "MoveStoryMapCard",
    "description": "Move or reparent a story map card.",
    "permission": "write"
  },
  {
    "name": "ParkCard",
    "description": "Remove a Card from active planning while retaining it in the Story Map.",
    "permission": "write"
  },
  {
    "name": "PlanWorkItems",
    "description": "Preview work-item synchronization changes without writing to the remote provider.",
    "permission": "github"
  },
  {
    "name": "ProposeBacklogGrooming",
    "description": "Create a proposed backlog grooming ChangeSet.",
    "permission": "proposal"
  },
  {
    "name": "ProposeMapFromSourceDocument",
    "description": "Create a proposed ChangeSet from a source document.",
    "permission": "proposal"
  },
  {
    "name": "ProposeReleaseSlice",
    "description": "Store a deterministic first-12-visible-Stories happy-path proposal with an explicit existing or new Release target; never apply it.",
    "permission": "proposal"
  },
  {
    "name": "PullStoryMapGitHubLinks",
    "description": "Pulls GitHub data into a local ChangeSet; outgoing provider writes require human confirmation.",
    "permission": "github"
  },
  {
    "name": "PushCardsToGitHub",
    "description": "Prepares a proposed GitHub push Dry Run plan; provider mutation requires separate human HTTP confirmation.",
    "permission": "github"
  },
  {
    "name": "ResolveSyncConflict",
    "description": "Resolves incoming sync fields through a local ChangeSet; outgoing resolution prepares a Dry Run for human confirmation.",
    "permission": "github"
  },
  {
    "name": "SetCardAnnotation",
    "description": "Assign or remove an annotation on a Card.",
    "permission": "write"
  },
  {
    "name": "SetCardDependency",
    "description": "Set an acyclic same-map Card prerequisite using the dependent Card base version. External writes create a ChangeSet.",
    "permission": "write"
  },
  {
    "name": "SetCardPersona",
    "description": "Assign or remove a persona on a Card.",
    "permission": "write"
  },
  {
    "name": "SetExternalRef",
    "description": "Bind a Card, Release, or Persona to a scoped external identity.",
    "permission": "write"
  },
  {
    "name": "SubmitChangeSet",
    "description": "Submit a complete planning cut as one ChangeSet. Validates operations sequentially and applies by default; Agent mode `propose` or apply=false retains a proposal. Source imports require inline content. For BMad Persona, foundation or theme cuts, submit typed Release and Card assignment operations with rationale and explicit apply=false to store a proposal.",
    "permission": "write"
  },
  {
    "name": "SyncGitHubLinks",
    "description": "Prepares GitHub sync and routes local effects through a ChangeSet; outgoing provider writes require human confirmation.",
    "permission": "github"
  },
  {
    "name": "UnparkCard",
    "description": "Return a parked Card to active Story Map planning.",
    "permission": "write"
  },
  {
    "name": "UpdateAnnotation",
    "description": "Change a Project annotation's name or description.",
    "permission": "write"
  },
  {
    "name": "UpdateStoryMapCard",
    "description": "Update story map card fields.",
    "permission": "write"
  },
  {
    "name": "UpdateDeliveryStatus",
    "description": "Assign configured Workflow Status names to 1–100 unique Cards addressed by scoped external references in one atomic ChangeSet. Agent mode `propose` or apply=false stores a proposal.",
    "permission": "write"
  },
  {
    "name": "UpdateGitHubLink",
    "description": "Change fields on an existing GitHub Issue or Milestone link.",
    "permission": "write"
  },
  {
    "name": "UpdateStoryMapPersona",
    "description": "Update persona details.",
    "permission": "write"
  },
  {
    "name": "UpdateStoryMapRelease",
    "description": "Update release details.",
    "permission": "write"
  },
  {
    "name": "UpdateRoadmap",
    "description": "Change a Roadmap's name, description, or ordering.",
    "permission": "write"
  },
  {
    "name": "UpdateStoryMap",
    "description": "Change a Story Map's editable fields and default connector.",
    "permission": "write"
  },
  {
    "name": "UpdateStoryTemplate",
    "description": "Change a reusable story template's guidance and examples.",
    "permission": "write"
  },
  {
    "name": "UpdateWorkflowStatus",
    "description": "Change a Project workflow status's name, group, or ordering.",
    "permission": "write"
  },
  {
    "name": "UpsertProductContext",
    "description": "Create or update Product Context for a Project or Story Map.",
    "permission": "write"
  }
] as const;
