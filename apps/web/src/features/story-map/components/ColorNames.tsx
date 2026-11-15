import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StoryMap } from "@storymapper/contracts";
import { ColorNamesEditor } from "@storymapper/web/features/story-map/components/ColorNamesEditor";
import { colorNameStrings as strings } from "@storymapper/web/ui-strings/color-names";

export function ColorNames({ map }: { map: StoryMap }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useColorNamesPosition(open, trigger, popup);
  function close() { popup.current?.hidePopover(); trigger.current?.focus(); }
  return <>
    <button ref={trigger} type="button" className="secondary" popoverTarget={id} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}>{strings.title}</button>
    {createPortal(<div ref={popup} id={id} popover="auto" role={open ? "dialog" : undefined} aria-labelledby={`${id}-title`} className="color-names-popover" data-live-popover={open || undefined}
      onToggle={(event) => setOpen(event.newState === "open")}>
      {open ? <ColorNamesEditor map={map} titleId={`${id}-title`} onClose={close} /> : null}
    </div>, document.body)}
  </>;
}

function useColorNamesPosition(open: boolean, trigger: React.RefObject<HTMLButtonElement | null>, popup: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const anchor = trigger.current, panel = popup.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      const gap = Number.parseFloat(getComputedStyle(panel).paddingTop);
      panel.style.left = `${Math.max(gap, Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - gap))}px`;
      panel.style.top = `${Math.max(gap, Math.min(rect.bottom + gap, window.innerHeight - panel.offsetHeight - gap))}px`;
    }
    position();
    popup.current?.querySelector<HTMLInputElement>("input")?.focus();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open, trigger, popup]);
}
