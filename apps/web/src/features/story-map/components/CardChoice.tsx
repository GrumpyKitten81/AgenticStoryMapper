import { useId, useLayoutEffect, useRef, useState } from "react";

interface ChoiceOption { value: string; label: string; swatch?: string }
interface CardChoiceProps {
  name: string;
  value: string;
  options: readonly ChoiceOption[];
  disabled: boolean;
  className?: string;
  onChange: (value: string) => void;
}

export function CardChoice({ name, value, options, disabled, className, onChange }: CardChoiceProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (open) popup.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
  }, [open]);
  const current = options.find((option) => option.value === value);
  const choices = current ? options : [{ value, label: value }, ...options];
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className="card-visual-control" onMouseDown={(event) => event.preventDefault()} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} type="button" disabled={disabled} className={className} aria-label={name} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      style={current?.swatch ? { background: current.swatch } : undefined}
      onClick={() => setOpen(!open)} onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); }
      }}>{current?.swatch ? null : current?.label ?? value}</button>
    {open ? <div ref={popup} id={id} role="listbox" aria-label={name} className="card-visual-popover" data-swatches={options.some((option) => option.swatch) || undefined} data-live-popover onKeyDown={(event) => {
      const buttons = Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    }}>{choices.map((option) => <button type="button" role="option" tabIndex={-1} aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); close(); }}
      {...(option.swatch ? { style: { background: option.swatch }, "aria-label": option.label, title: option.label } : {})}>
      {option.swatch ? null : option.label}
    </button>)}</div> : null}
  </div>;
}
