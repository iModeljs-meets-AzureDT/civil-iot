import { ElementProps } from "@bentley/imodeljs-common";

export type RoadNetworkClassification = "National" | "State" | "Local";

export interface CompositionItemProps extends ElementProps {
  classification: RoadNetworkClassification;
}
