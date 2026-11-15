import { create } from "zustand";

interface AnnouncementState {
  status: string;
  alert: string;
  revision: number;
  statusRevision: number;
  alertRevision: number;
  announce: (message: string, kind: "status" | "alert") => void;
  announceFeedback: (message: string) => void;
}

export const useAnnouncementStore = create<AnnouncementState>((set) => ({
  status: "",
  alert: "",
  revision: 0,
  statusRevision: 0,
  alertRevision: 0,
  announce: (message, kind) => set((state) => kind === "status"
    ? { status: message, alert: "", statusRevision: state.statusRevision + 1, alertRevision: state.alertRevision + Number(Boolean(state.alert)), revision: state.revision + 1 }
    : { alert: message, status: "", alertRevision: state.alertRevision + 1, statusRevision: state.statusRevision + Number(Boolean(state.status)), revision: state.revision + 1 }),
  announceFeedback: (message) => set((state) => ({ status: message, statusRevision: state.statusRevision + 1, revision: state.revision + 1 }))
}));
