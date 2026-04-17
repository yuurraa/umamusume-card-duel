import type { UmamusumeCard, UmamusumeInstance, SideId, TrainerCard } from "../../shared/src/types";

export type InspectTarget = {
  card: UmamusumeCard | TrainerCard;
  umamusume?: UmamusumeInstance;
  sideId?: SideId;
  isActive?: boolean;
};
