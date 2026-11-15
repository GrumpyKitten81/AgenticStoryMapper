import { useState, type ReactElement } from "react";
import { BookOpenText, Copy } from "lucide-react";
import { Dialog } from "@storymapper/web/components/Dialog";
import { CopyButton } from "@storymapper/web/components/CopyButton";
import { productContextStrings as strings } from "@storymapper/web/ui-strings/product-context";
import { useProductContextEditor, type ProductContextDraft } from "@storymapper/web/features/product-context/useProductContextEditor";

const primaryFields = ["purpose", "keyFeatures", "targetUsers", "nonGoals"] as const;
const moreFields = ["productType", "platform", "pricing", "complianceConstraints", "glossary", "notes"] as const;
const multiline = new Set<keyof ProductContextDraft>(["keyFeatures", "nonGoals", "glossary", "notes"]);

export function ProductContextPanel({ projectId, storyMapId, disabled }: { projectId: string; storyMapId: string; disabled: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  return <>
    <CopyButton text={storyMapId} className="secondary icon-button topbar-title-edit" title={`${strings.mapId}: ${storyMapId} · ${strings.copyMapId}`} ariaLabel={`${strings.copyMapId} — ${strings.mapId}`} statusClassName="visually-hidden"><Copy size={16} aria-hidden="true" /></CopyButton>
    <button type="button" className="secondary icon-button topbar-title-edit" title={strings.title} aria-label={strings.open} disabled={disabled} onClick={() => setOpen(true)}><BookOpenText size={16} aria-hidden="true" /></button>
    {open ? <ProductContextDialog projectId={projectId} storyMapId={storyMapId} onClose={() => setOpen(false)} /> : null}
  </>;
}

function ProductContextDialog({ projectId, storyMapId, onClose }: { projectId: string; storyMapId: string; onClose: () => void }): ReactElement {
  const { contextDraft, setContextDraft, saveContext, message } = useProductContextEditor(projectId, storyMapId);
  const field = (name: keyof ProductContextDraft) => {
    const props = { value: contextDraft[name], disabled: saveContext.isPending, onChange: (event: { target: { value: string } }) => setContextDraft((draft) => ({ ...draft, [name]: event.target.value })) };
    return <label key={name}>{strings[name]}{multiline.has(name) ? <textarea rows={3} {...props} /> : <input {...props} />}</label>;
  };
  return <Dialog title={strings.title} onClose={() => { if (!saveContext.isPending) onClose(); }}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); saveContext.mutate(); }}>
      <p>{strings.help}</p>
      {primaryFields.map(field)}
      <details className="disclosure"><summary>{strings.more}</summary><div className="form-stack">{moreFields.map(field)}</div></details>
      {message ? <p role="status">{message}</p> : null}
      <div className="button-row"><button type="submit" disabled={saveContext.isPending}>{strings.save}</button><button type="button" className="secondary" disabled={saveContext.isPending} onClick={onClose}>{strings.close}</button></div>
    </form>
  </Dialog>;
}
