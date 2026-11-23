import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import type { Project } from "@storymapper/contracts";
import { appStrings as strings } from "@storymapper/ui-strings";
import { useLastProjectStore } from "@storymapper/web/app/stores/last-project-store";

export function ProjectPicker({ projects }: { projects: readonly Project[] }) {
  const navigate = useNavigate();
  const lastOpenedProjectId = useLastProjectStore((state) => state.lastOpenedProjectId);
  const [projectId, setProjectId] = useState(() => projects.find((project) => project.id === lastOpenedProjectId)?.id ?? projects[0]!.id);
  const open = (event: React.FormEvent) => {
    event.preventDefault();
    void navigate({ to: "/projects/$projectId/story-maps", params: { projectId } });
  };
  return (
    <form className="form-stack project-picker" onSubmit={open}>
      <label>{strings.project}
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <button type="submit"><FolderOpen size={15} />{strings.openProject}</button>
    </form>
  );
}
