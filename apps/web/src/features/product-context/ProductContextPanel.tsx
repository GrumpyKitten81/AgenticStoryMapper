import { useState, type ReactElement } from "react";
import { BookOpenText, Copy } from "lucide-react";
import { Dialog } from "@storymapper/web/components/Dialog";
import { CopyButton } from "@storymapper/web/components/CopyButton";
import { productContextStrings as strings } from "@storymapper/web/ui-strings/product-context";
import { useProductContextEditor, type ProductContextDraft } from "@storymapper/web/features/product-context/useProductContextEditor";

const primaryFields = ["purpose", "keyFeatures", "targetUsers", "nonGoals"] as const;
const moreFields = ["productType", "platform", "pricing", "complianceConstraints", "glossary", "notes"] as const;
const multiline = new Set<keyof ProductContextDraft>(["keyFeatures", "nonGoals", "glossary", "notes", "workingRules"]);
const sections = ["overview", "workingRules", "more"] as const;
type Section = typeof sections[number];

export function ProductContextPanel({ projectId, storyMapId, storyMapName, disabled }: { projectId: string; storyMapId: string; storyMapName: string; disabled: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  const copyText = `${storyMapName} (${storyMapId})`;
  return <>
    <CopyButton text={copyText} className="secondary icon-button topbar-title-edit" title={`${strings.copyMap}: ${copyText}`} ariaLabel={strings.copyMap} statusClassName="visually-hidden"><Copy size={16} aria-hidden="true" /></CopyButton>
    <button type="button" className="secondary icon-button topbar-title-edit" title={strings.title} aria-label={strings.open} disabled={disabled} onClick={() => setOpen(true)}><BookOpenText size={16} aria-hidden="true" /></button>
    {open ? <ProductContextDialog projectId={projectId} storyMapId={storyMapId} onClose={() => setOpen(false)} /> : null}
  </>;
}

function ProductContextDialog({ projectId, storyMapId, onClose }: { projectId: string; storyMapId: string; onClose: () => void }): ReactElement {
  const { contextDraft, setContextDraft, saveContext, message } = useProductContextEditor(projectId, storyMapId);
  const [section, setSection] = useState<Section>("overview");
  const field = (name: keyof ProductContextDraft) => {
    const props = { value: contextDraft[name], disabled: saveContext.isPending, onChange: (event: { target: { value: string } }) => setContextDraft((draft) => ({ ...draft, [name]: event.target.value })) };
    return <label key={name}>{strings[name]}{multiline.has(name) ? <textarea rows={name === "workingRules" ? 8 : 3} placeholder={name === "workingRules" ? strings.workingRulesExample : undefined} {...props} /> : <input {...props} />}</label>;
  };
  const sectionFields = section === "overview" ? primaryFields : section === "more" ? moreFields : ["workingRules"] as const;
  return <Dialog title={strings.title} className="discovery-dialog product-context-dialog" onClose={() => { if (!saveContext.isPending) onClose(); }}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); saveContext.mutate(); }}>
      <p>{strings.help}</p>
      <div className="product-context-sections" role="tablist" aria-label={strings.sections} onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const index = sections.indexOf(section);
        const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + sections.length) % sections.length;
        setSection(sections[next]!);
        event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
      }}>
        {sections.map((name) => <button key={name} id={`product-context-tab-${name}`} type="button" role="tab" aria-selected={section === name} aria-controls="product-context-section" tabIndex={section === name ? 0 : -1} onClick={() => setSection(name)}>{strings[name]}</button>)}
      </div>
      <div id="product-context-section" role="tabpanel" aria-labelledby={`product-context-tab-${section}`} className="form-stack product-context-fields">
        {section === "workingRules" ? <p>{strings.workingRulesHelp}</p> : null}
        {sectionFields.map(field)}
      </div>
      {message ? <p role="status">{message}</p> : null}
      <div className="button-row"><button type="submit" disabled={saveContext.isPending}>{strings.save}</button><button type="button" className="secondary" disabled={saveContext.isPending} onClick={onClose}>{strings.close}</button></div>
    </form>
  </Dialog>;
}
