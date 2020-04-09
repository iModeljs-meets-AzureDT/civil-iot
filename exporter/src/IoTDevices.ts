import { TypeDefinitionElementProps } from "@bentley/imodeljs-common";

export interface ObservationTypeProps extends TypeDefinitionElementProps {
  unit: string;
  minValue?: number;
  maxValue?: number;
}
