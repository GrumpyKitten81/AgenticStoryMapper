import { User, Bot, Github, Settings } from "lucide-react";
import type { ActorType } from "@storymapper/contracts";
import { whatChangedStrings as strings } from "@storymapper/ui-strings";

export function ActorBadge({ type }: ActorBadgeProps) {
  const Icon = { human: User, agent: Bot, github: Github, system: Settings }[type];
  return <span className="actor-badge"><Icon size={14} />{strings.actors[type]}</span>;
}

interface ActorBadgeProps { type: ActorType }
