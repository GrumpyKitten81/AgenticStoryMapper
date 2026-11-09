export interface PublishTarget {
  storyMapId: string;
  location: string;
}

export interface PublishPlan {
  action: "create" | "update";
  target: PublishTarget;
  contentBytes: number;
}

export interface PublishResult {
  action: PublishPlan["action"];
  url?: string | undefined;
}

export interface PublishProvider {
  id: string;
  plan(target: PublishTarget, content: string): Promise<PublishPlan>;
  publish(plan: PublishPlan, content: string): Promise<PublishResult>;
}
