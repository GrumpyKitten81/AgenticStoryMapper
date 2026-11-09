import type { Card, Release } from "@storymapper/contracts";
import { buildRoadmapCardReport } from "@storymapper/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPinned, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { panelStrings } from "@storymapper/ui-strings";
import { api, useRoadmapDetails, useRoadmaps } from "@storymapper/web/app/api";
import { RoadmapEditor } from "@storymapper/web/features/roadmaps/RoadmapEditor";

interface RoadmapPanelProps {
  projectId: string | undefined;
  storyMapId: string | undefined;
  estimationUnit: string;
  releases: Release[];
  cards: Card[];
  matchingCardIds?: ReadonlySet<string> | undefined;
  statusContext?: { remoteWorkItemLinks?: import("@storymapper/contracts").RemoteWorkItemLink[]; workflowStatuses?: import("@storymapper/contracts").WorkflowStatus[] } | undefined;
}

export function RoadmapPanel(props: RoadmapPanelProps) {
  return renderRoadmapPanel(useRoadmapPanelState(props));
}

function useRoadmapPanelState(props: RoadmapPanelProps) {
  const context = useRoadmapSelection(props);
  const { releases, roadmaps, selectedRoadmapId, setSelectedRoadmapId, selectedRoadmap, details, columnName, setColumnName, cardDraft, setCardDraft, storyCards, refresh } = context;
  const createColumn = useMutation({
    mutationFn: () => api.createRoadmapColumn({ roadmapId: selectedRoadmap, name: columnName.trim() }),
    onSuccess: () => {
      setColumnName("");
      refresh();
    }
  });
  const createCard = useMutation({
    mutationFn: async () => {
      const roadmapCard = await api.createRoadmapCard({
        roadmapId: selectedRoadmap,
        columnId: cardDraft.columnId || details.data?.columns[0]?.id || "",
        title: cardDraft.title.trim()
      });
      if (cardDraft.releaseId) {
        await api.createRoadmapReference({
          roadmapCardId: roadmapCard.id,
          targetType: "release",
          targetId: cardDraft.releaseId
        });
      }
      return roadmapCard;
    },
    onSuccess: () => {
      setCardDraft({ title: "", columnId: "", releaseId: "" });
      refresh();
    }
  });

  useEffect(() => {
    if (!selectedRoadmapId && roadmaps.data?.roadmaps[0]?.id) {
      setSelectedRoadmapId(roadmaps.data.roadmaps[0].id);
    }
  }, [roadmaps.data?.roadmaps, selectedRoadmapId]);

  const referenceLabelById = new Map([
    ...releases.map((release) => [release.id, panelStrings.releaseReference(release.name)] as const),
    ...storyCards.map((card) => [card.id, `${card.key}: ${card.title}`] as const)
  ]);
  const referencesByRoadmapCard = (details.data?.references ?? []).filter((ref) => !props.matchingCardIds || ref.targetType === "release" || referenceLabelById.has(ref.targetId)).reduce<Record<string, string[]>>((groups, reference) => {
    groups[reference.roadmapCardId] = [...(groups[reference.roadmapCardId] ?? []), referenceLabelById.get(reference.targetId) ?? reference.targetId];
    return groups;
  }, {});
  const reports = props.matchingCardIds || props.statusContext ? details.data?.cards.map((card) => buildRoadmapCardReport(card.id, details.data!.references.filter((reference) => reference.roadmapCardId === card.id), props.cards, { ...props.statusContext, matchingCardIds: props.matchingCardIds })) : details.data?.reports;
  const reportByCardId = new Map((reports ?? []).map((report) => [report.roadmapCardId, report]));
  return { ...context, createColumn, createCard, reportByCardId, referencesByRoadmapCard };
}

function renderRoadmapPanel(model: ReturnType<typeof useRoadmapPanelState>) {
  const { roadmaps, roadmapName, setRoadmapName, projectId, createRoadmap, selectedRoadmap, setSelectedRoadmapId, details, refresh, columnName, setColumnName, createColumn, cardDraft, setCardDraft, releases, createCard, reportByCardId, estimationUnit, referencesByRoadmapCard } = model;
  return (
    <section className="panel roadmap-panel form-stack">
      <div className="panel-title-row">
        <h2>{panelStrings.roadmaps}</h2>
        <span>{roadmaps.data?.roadmaps.length ?? 0}</span>
      </div>
      <div className="inline-add button-row">
        <input value={roadmapName} onChange={(event) => setRoadmapName(event.target.value)} placeholder={panelStrings.newRoadmap} />
        <button type="button" disabled={!projectId || !roadmapName.trim()} onClick={() => createRoadmap.mutate()}>
          <Plus size={15} /> {panelStrings.roadmap}</button>
      </div>
      {(roadmaps.data?.roadmaps.length ?? 0) > 0 ? (
        <label>
          {panelStrings.roadmap}<select value={selectedRoadmap} onChange={(event) => setSelectedRoadmapId(event.target.value)}>
            {(roadmaps.data?.roadmaps ?? []).map((roadmap) => (
              <option key={roadmap.id} value={roadmap.id}>{roadmap.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      {details.data ? (
        renderRoadmapCardForm(model, details.data)
      ) : (
        <p>{panelStrings.noRoadmapSelected}</p>
      )}
    </section>
  );
}

function renderRoadmapChart(model: ReturnType<typeof useRoadmapPanelState>, data: NonNullable<ReturnType<typeof useRoadmapPanelState>["details"]["data"]>) {
  const { details, reportByCardId, estimationUnit, referencesByRoadmapCard } = model;
  return <div className="roadmap-board">
    {data.columns.map((column) => (
      <section className="roadmap-column" key={column.id}>
        <div className="roadmap-column-heading">
          <MapPinned size={15} />
          <strong>{column.name}</strong>
        </div>
        {data.cards.filter((card) => card.columnId === column.id).map((card) => {
          const report = reportByCardId.get(card.id);
          return (
            <article className="roadmap-card" key={card.id}>
              <strong>{card.title}</strong>
              <span>{panelStrings.roadmapProgress(report?.progressRatio ?? 0, report?.estimateTotal ?? 0, estimationUnit)}</span>
              {(referencesByRoadmapCard[card.id] ?? []).map((label) => (
                <small key={label}>{label}</small>
              ))}
            </article>
          );
        })}
      </section>
    ))}
  </div>;
}

function useRoadmapSelection({ matchingCardIds, statusContext, projectId, storyMapId, estimationUnit, releases, cards }: RoadmapPanelProps) {
  const queryClient = useQueryClient();
  const roadmaps = useRoadmaps(projectId, storyMapId);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState("");
  const selectedRoadmap = selectedRoadmapId || roadmaps.data?.roadmaps[0]?.id || "";
  const details = useRoadmapDetails(selectedRoadmap || undefined);
  const [roadmapName, setRoadmapName] = useState("");
  const [columnName, setColumnName] = useState("");
  const [cardDraft, setCardDraft] = useState({ title: "", columnId: "", releaseId: "" });
  const storyCards = useMemo(() => cards.filter((card) => card.level === "story"), [cards]);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["roadmaps", projectId, storyMapId] });
    queryClient.invalidateQueries({ queryKey: ["roadmap", selectedRoadmap] });
    queryClient.invalidateQueries({ queryKey: ["story-map", storyMapId] });
    queryClient.invalidateQueries({ queryKey: ["activity", projectId] });
  };
  const createRoadmap = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error(panelStrings.projectIsRequired);
      return api.createRoadmap({
        projectId,
        storyMapId,
        name: roadmapName.trim(),
        type: "release"
      });
    },
    onSuccess: (roadmap) => {
      setRoadmapName("");
      setSelectedRoadmapId(roadmap.id);
      refresh();
    }
  });
  return { matchingCardIds, statusContext, projectId, estimationUnit, releases, roadmaps, selectedRoadmapId, setSelectedRoadmapId, selectedRoadmap, details, roadmapName, setRoadmapName, columnName, setColumnName, cardDraft, setCardDraft, storyCards, refresh, createRoadmap };
}

function renderRoadmapCardForm(model: ReturnType<typeof useRoadmapPanelState>, data: NonNullable<ReturnType<typeof useRoadmapPanelState>["details"]["data"]>) {
  const { details, refresh, columnName, setColumnName, selectedRoadmap, createColumn, cardDraft, setCardDraft, releases, createCard } = model;
  return <>
    <RoadmapEditor key={data.roadmap.id} roadmap={data.roadmap} onSaved={refresh} />
    <div className="inline-add button-row">
      <input value={columnName} onChange={(event) => setColumnName(event.target.value)} placeholder={panelStrings.column} />
      <button type="button" disabled={!selectedRoadmap || !columnName.trim()} onClick={() => createColumn.mutate()}>
        <Plus size={15} /> {panelStrings.column}</button>
    </div>
    <div className="roadmap-card-form form-stack">
      <input value={cardDraft.title} onChange={(event) => setCardDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder={panelStrings.roadmapCard} />
      <select value={cardDraft.columnId} onChange={(event) => setCardDraft((draft) => ({ ...draft, columnId: event.target.value }))}>
        <option value="">{panelStrings.firstColumn}</option>
        {data.columns.map((column) => (
          <option key={column.id} value={column.id}>{column.name}</option>
        ))}
      </select>
      <select value={cardDraft.releaseId} onChange={(event) => setCardDraft((draft) => ({ ...draft, releaseId: event.target.value }))}>
        <option value="">{panelStrings.noReleaseLink}</option>
        {releases.map((release) => (
          <option key={release.id} value={release.id}>{release.name}</option>
        ))}
      </select>
      <button type="button" disabled={!selectedRoadmap || !cardDraft.title.trim() || data.columns.length === 0} onClick={() => createCard.mutate()}>
        <Plus size={15} /> {panelStrings.card}</button>
    </div>
    {renderRoadmapChart(model, data)}
  </>;
}
