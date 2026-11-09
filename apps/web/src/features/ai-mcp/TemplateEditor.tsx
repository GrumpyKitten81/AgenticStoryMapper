import type { AiFunctionTemplate } from "@storymapper/contracts";
import { panelStrings } from "@storymapper/ui-strings";
import { useTemplateEditor } from "@storymapper/web/features/ai-mcp/useTemplateEditor";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

export function TemplateEditor({ projectId, templates }: { projectId: string; templates: AiFunctionTemplate[] }) {
  const editor = useTemplateEditor(projectId);
  const { draft, setDraft, editingId, save, remove } = editor;
  const pending = save.isPending || remove.isPending;
  return <div className="product-context-panel form-stack">
    <h3>{panelStrings.functionTemplates}</h3>
    <p>{panelStrings.functionTemplatesHelp}</p>
    <div className="tool-list">{templates.filter((template) => isPersonasEnabled || template.id !== "personas").map((template) => <button type="button" className="secondary" key={template.id} title={template.id} disabled={pending} onClick={() => editor.select(template)}>{template.name}</button>)}</div>
    <button type="button" className="secondary" disabled={pending} onClick={() => editor.select()}>{panelStrings.newTemplate}</button>
    <label>{panelStrings.templateId}<input value={draft.id} disabled={Boolean(editingId) || pending} onChange={(event) => setDraft((value) => ({ ...value, id: event.target.value }))} /></label>
    <label>{panelStrings.templateName}<input value={draft.name} disabled={remove.isPending} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
    <label>{panelStrings.templateInstructions}<textarea rows={5} value={draft.instructions} disabled={remove.isPending} onChange={(event) => setDraft((value) => ({ ...value, instructions: event.target.value }))} /></label>
    <TemplateArguments editor={editor} />
    <TemplateGuidance editor={editor} />
    {editor.error ? <p role="alert">{editor.error}</p> : null}
    <div className="button-row"><button type="button" disabled={pending || (!isPersonasEnabled && draft.id.trim() === "personas") || !draft.id.trim() || !draft.name.trim() || !draft.instructions.trim()} onClick={editor.saveDraft}>{panelStrings.saveTemplate}</button>
    {editingId ? <button type="button" className="danger" disabled={pending} onClick={editor.deleteTemplate}>{panelStrings.deleteTemplate}</button> : null}</div>
  </div>;
}

function TemplateArguments({ editor }: { editor: ReturnType<typeof useTemplateEditor> }) {
  const { draft, setDraft } = editor;
  return <fieldset className="form-stack" disabled={editor.remove.isPending}>
    <legend>{panelStrings.promptArguments}</legend>
    {draft.arguments.map((argument, index) => <div className="context-grid form-stack" key={index}>
      <label>{panelStrings.argumentName}<input value={argument.name} onChange={(event) => setDraft((value) => ({ ...value, arguments: value.arguments.map((item, row) => row === index ? { ...item, name: event.target.value } : item) }))} /></label>
      <label>{panelStrings.argumentDescription}<input value={argument.description ?? ""} onChange={(event) => setDraft((value) => ({ ...value, arguments: value.arguments.map((item, row) => row === index ? { ...item, description: event.target.value } : item) }))} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={argument.required} onChange={(event) => setDraft((value) => ({ ...value, arguments: value.arguments.map((item, row) => row === index ? { ...item, required: event.target.checked } : item) }))} />{panelStrings.argumentRequired}</label>
      <button type="button" className="danger" onClick={() => setDraft((value) => ({ ...value, arguments: value.arguments.filter((_item, row) => row !== index) }))}>{panelStrings.removeArgument}</button>
    </div>)}
    <button type="button" className="secondary" onClick={() => setDraft((value) => ({ ...value, arguments: [...value.arguments, { name: "", required: false }] }))}>{panelStrings.addArgument}</button>
  </fieldset>;
}

function TemplateGuidance({ editor }: { editor: ReturnType<typeof useTemplateEditor> }) {
  const { draft, setDraft } = editor;
  return <fieldset className="form-stack" disabled={editor.remove.isPending}>
    <label>{panelStrings.templateOutputSchema}<input value={draft.outputSchemaName ?? ""} onChange={(event) => setDraft((value) => ({ ...value, outputSchemaName: event.target.value || undefined }))} /></label>
    {draft.examples.map((example, index) => <div className="form-stack" key={index}>
      <label>{panelStrings.templateExample}<textarea value={example} onChange={(event) => setDraft((value) => ({ ...value, examples: value.examples.map((item, row) => row === index ? event.target.value : item) }))} /></label>
      <button type="button" className="danger" onClick={() => setDraft((value) => ({ ...value, examples: value.examples.filter((_item, row) => row !== index) }))}>{panelStrings.removeExample}</button>
    </div>)}
    <button type="button" className="secondary" onClick={() => setDraft((value) => ({ ...value, examples: [...value.examples, ""] }))}>{panelStrings.addExample}</button>
  </fieldset>;
}
