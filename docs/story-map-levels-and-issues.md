<h1>Map levels, planning types and GitHub Issues</h1>
<!-- Date: 2026-11-08. Version: 1.
Reproducing statement: Explain Agentic Story Mapper’s four independent concepts, local Epic context and explicit templates and mappings in a short English guide.
Changelog: 2026-11-08 v1 — Explain approved local context, independent fields and templates. -->
<div class="map-concept-table-scroll" tabindex="0" role="region" aria-label="Map concepts comparison">
<table>
<thead><tr><th>Concept</th><th>Purpose</th><th>Behavior</th></tr></thead>
<tbody>
<tr><td>Map level</td><td>Activity, Step and Story describe the user journey and its detail.</td><td>Structural placement and explicit parent/child operations determine the map. Notes keep their existing special rules.</td></tr>
<tr><td>Planning type</td><td>Optional Epic, Feature, User Story, Bug, Task, Spike or Theme classification of a Card.</td><td>Independent of level. Changing a type does not move the Card. No type is inferred from its row.</td></tr>
<tr><td>GitHub Issue type</td><td>A repository’s native Issue classification.</td><td>Shown as last observed, alongside sync state. Outbound mappings use the local planning type; they do not make the two types equal.</td></tr>
<tr><td>Epic context</td><td>A title and goal framing one whole Story Map.</td><td>Local map metadata above all views, with an optional canonical GitHub Issue reference. It is neither a row nor a parent Card nor a sync binding.</td></tr>
</tbody>
</table>
</div>
<pre>Epic context (optional framing)
  Story Map
    Activity → Step → Story
      Each Card: optional planning type
      Each linked Card: last observed GitHub Issue type + sync state</pre>
<h2>Choose structure and classification separately</h2>
<p>Start with what users want to accomplish, then describe their steps and the small deliverables beneath them. A team may deliberately use Epic/Feature/User Story as a planning convention, but Agentic Story Mapper does not equate these types with Activity/Step/Story. A Feature or Bug can be classified without silently changing its structural placement.</p>
<p>Jeff Patton’s story mapping describes a user-centered backbone and delivery slices. Azure Boards uses process-specific work item hierarchies. Avion describes journeys, steps and stories. These are useful references; Agentic Story Mapper’s independent fields are its own product choice, not a claim that these sources prescribe one universal mapping.</p>
<h2>Use context, templates and GitHub deliberately</h2>
<p>Add or edit Epic context above the map. Both title and goal are required when present. An optional link must look like <code>https://github.com/owner/repo/issues/123</code>. Saving is local: there is no GitHub lookup, verification, Issue creation or synchronization. Several maps may reference the same Issue. Removing context clears only that metadata. Copy, JSON/Markdown export and archive/Restore retain it.</p>
<p>Activity, Step and Story description templates ask neutral questions about goals, actions and deliverables. Choose one explicitly; applying it changes only the description and asks before replacing existing text. Saved user templates remain separate and retain their configured defaults. Planning-type issue templates do not assign structural levels or native GitHub types.</p>
<p>Connection settings keep import placement rules separate from outbound planning-type mappings. Existing import defaults still place matching epics at Activity and features at Step; unmatched Issues retain the existing Story default. These placement rules do not assign a local planning type. Independently, an imported Issue can receive a planning type through a unique reverse match in the outbound type mapping. Binding and synchronization retain their explicit operations, conflict checks, ChangeSets and human remote confirmation.</p>
<h2>Primary sources</h2>
<ul>
<li><a href="https://jpattonassociates.com/wp-content/uploads/2015/03/story_mapping.pdf">Jeff Patton: User Story Mapping</a></li>
<li><a href="https://learn.microsoft.com/en-us/azure/devops/boards/backlogs/backlogs-overview?view=azure-devops">Microsoft: Azure Boards work items and work item types</a></li>
<li><a href="https://help.avion.io/docs/integrations/backlog-tools/services/jira-cloud/mapping-options">Avion: Story map</a></li>
</ul>
