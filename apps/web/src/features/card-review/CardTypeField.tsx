import { mapConceptStrings } from "@storymapper/web/ui-strings/map-concepts";
import { cardTypeSchema, type CardType } from "@storymapper/contracts";
import { cardReviewStrings as strings } from "@storymapper/web/ui-strings/card-review";

export function CardTypeField({ value, onChange, disabled = false }: { value: CardType | ""; onChange: (value: CardType | "") => void; disabled?: boolean }) {
  return <label>{mapConceptStrings.planningType}<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value ? cardTypeSchema.parse(event.target.value) : "")}><option value="">{strings.noType}</option>{cardTypeSchema.options.map((type) => <option key={type} value={type}>{mapConceptStrings.planningTypes[type]}</option>)}</select></label>;
}

export function BulkCardTypeField({ value, onChange, disabled = false }: { value: CardType | "" | "__none"; onChange: (value: CardType | "" | "__none") => void; disabled?: boolean }) {
  return <label>{mapConceptStrings.planningType}<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value === "__none" || event.target.value === "" ? event.target.value : cardTypeSchema.parse(event.target.value))}><option value="">{strings.keepType}</option><option value="__none">{strings.noType}</option>{cardTypeSchema.options.map((type) => <option key={type} value={type}>{mapConceptStrings.planningTypes[type]}</option>)}</select></label>;
}
