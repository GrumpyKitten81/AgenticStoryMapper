import { useState } from "react";
import { Check, ChevronDown, Columns3 } from "lucide-react";
import { useTreeColumnsStore } from "@storymapper/web/app/stores/tree-columns-store";
import { TREE_COLUMN_OPTIONS } from "@storymapper/web/features/story-map/components/tree-columns";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export function TreeColumnPicker({ estimationUnit }: { estimationUnit: string }) {
  const [open, setOpen] = useState(false);
  const hidden = useTreeColumnsStore((store) => store.hidden);
  const toggleColumn = useTreeColumnsStore((store) => store.toggleColumn);
  return (
    <div className="tree-column-picker card-visual-control" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <button type="button" className="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Columns3 size={15} />{strings.columns}<ChevronDown size={14} />
      </button>
      {open ? <div role="menu" aria-label={strings.columns} className="card-visual-popover export-menu">
        {TREE_COLUMN_OPTIONS.map(({ id, label }) => {
          const checked = !hidden.includes(id);
          return <button key={id} type="button" role="menuitemcheckbox" aria-checked={checked} onClick={() => toggleColumn(id)}>
            <Check size={15} visibility={checked ? "visible" : "hidden"} />{label(estimationUnit)}
          </button>;
        })}
      </div> : null}
    </div>
  );
}
