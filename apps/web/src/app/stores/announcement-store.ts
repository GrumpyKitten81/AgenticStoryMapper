import { create } from "zustand";

interface AnnouncementState {
  status: string;
  alert: string;
  revision: number;
  announce: (message: string, kind: "status" | "alert") => void;
}

export const useAnnouncementStore = create<AnnouncementState>((set) => ({
  status: "",
  alert: "",
  revision: 0,
  announce: (message, kind) => set((state) => ({ status: kind === "status" ? message : "", alert: kind === "alert" ? message : "", revision: state.revision + 1 }))
}));
