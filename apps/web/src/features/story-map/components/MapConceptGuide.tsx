import { useState } from "react";
import guide from "@storymapper/web/docs/story-map-levels-and-issues.md?raw";
import { Dialog } from "@storymapper/web/components/Dialog";
import { mapConceptStrings as strings } from "@storymapper/web/ui-strings/map-concepts";

export function MapConceptGuide() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="secondary" onClick={() => setOpen(true)}>{strings.guide}</button>
    {open ? <Dialog title={strings.guide} onClose={() => setOpen(false)}><article className="map-concept-guide" dangerouslySetInnerHTML={{ __html: guide }} /><button type="button" className="secondary" onClick={() => setOpen(false)}>{strings.cancel}</button></Dialog> : null}
  </>;
}
