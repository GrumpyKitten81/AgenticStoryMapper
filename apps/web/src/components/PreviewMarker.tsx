import type { ChangeSetPreviewMarker } from "@storymapper/contracts";
import { changeSetStrings as strings } from "@storymapper/ui-strings";

export function PreviewMarker({ marker }: PreviewMarkerProps) {
  return marker ? <span className={`preview-marker preview-${marker.kind}`}><span aria-hidden="true">{strings.glyphs[marker.kind]}</span> {strings.markers[marker.kind]}</span> : null;
}

interface PreviewMarkerProps { marker: ChangeSetPreviewMarker | undefined }
