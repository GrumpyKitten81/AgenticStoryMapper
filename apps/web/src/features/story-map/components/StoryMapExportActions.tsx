import { ChevronDown, Download, FileText, Image } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type StoryMapExportFormat, type StoryMapViewKind } from "../export/story-map-view-export";
import { exportStoryMapViewAndRecord } from "../export/export-with-progress";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

interface StoryMapExportActionsProps {
  projectId: string;
  storyMapName: string;
  viewKind: StoryMapViewKind;
}

const exportOptions: Array<{ format: StoryMapExportFormat; label: string; Icon: typeof Download }> = [
  { format: "html", label: strings.exportFormats.html, Icon: FileText },
  { format: "png", label: strings.exportFormats.png, Icon: Image },
  { format: "pdf", label: strings.exportFormats.pdf, Icon: Download }
];

export function StoryMapExportActions({ projectId, storyMapName, viewKind }: StoryMapExportActionsProps) {
  const queryClient = useQueryClient();
  const [activeFormat, setActiveFormat] = useState<StoryMapExportFormat | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleExport(format: StoryMapExportFormat): Promise<void> {
    setOpen(false);
    setActiveFormat(format);
    setStatus(null);
    try {
      await exportStoryMapViewAndRecord({ projectId, storyMapName, viewKind, format });
      await queryClient.invalidateQueries({ queryKey: ["getting-started", projectId] });
      setStatus(strings.exportReady(format));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : strings.exportFailed);
    } finally {
      setActiveFormat(null);
    }
  }

  return (
    <div className="story-map-export-actions card-visual-control" aria-label={strings.storyMapExportActions} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <button type="button" className="secondary" aria-haspopup="menu" aria-expanded={open} disabled={activeFormat !== null} onClick={() => setOpen(!open)}>
        <Download size={15} />{activeFormat ? strings.exporting : strings.exportMenu}<ChevronDown size={14} />
      </button>
      {open ? <div role="menu" className="card-visual-popover export-menu">
        {exportOptions.map(({ format, label, Icon }) => (
          <button key={format} type="button" role="menuitem" onClick={() => void handleExport(format)}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div> : null}
      {status ? <span className="story-map-export-status" role="status">{status}</span> : null}
    </div>
  );
}
