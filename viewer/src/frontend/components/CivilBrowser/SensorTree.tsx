/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { ITreeDataProvider, TreeNodeItem } from "@bentley/ui-components";
import { CivilDataModel, CivilComponentProps } from "../../api/CivilDataModel";
import { AbstractCivilTree, createCivilComponentTreeNode } from "./AbstractCivilTree";
import { SelectedNodeContext } from "./CivilBrowser";

interface SensorTreeProps {
  onNodeSelected(component: SelectedNodeContext | undefined): void;
  onClickFilterClear(): void;
  filterByNode?: SelectedNodeContext;
}

export function SensorTree(props: SensorTreeProps) {
  const dataProvider = React.useMemo(() => new SensorDataProvider(props.filterByNode), [props.filterByNode]);
  return (
    <>
      {props.filterByNode && <button className="filter-button" onClick={props.onClickFilterClear}>Filtered by: {props.filterByNode.component.label}</button>}
      {AbstractCivilTree({ dataProvider, ...props })}
    </>);
}

class SensorDataProvider implements ITreeDataProvider {
  private filterBy?: SelectedNodeContext;

  constructor(filterBy?: SelectedNodeContext) {
    this.filterBy = filterBy;
  }

  private async getComponentAndChildren(selected: SelectedNodeContext): Promise<CivilComponentProps[]> {
    let components: CivilComponentProps[] = [selected.component];
    const children = await selected.dataProvider.getNodes(selected.component);

    for (const child of children) {
      const childComponent = child as CivilComponentProps;
      const childAndChildren = await this.getComponentAndChildren({ component: childComponent, dataProvider: selected.dataProvider });
      components = components.concat(childAndChildren);
    }

    return components;
  }

  private async getFilteredSensorList() {
    const data = CivilDataModel.get();

    if (undefined === this.filterBy)
      return data.getAllSensors();

    const components = await this.getComponentAndChildren(this.filterBy);
    return data.getSensorsForParents(components);
  }

  public async getNodesCount(_parent?: TreeNodeItem) {
    return (await this.getFilteredSensorList()).length;
  }

  public async getNodes(_parent?: TreeNodeItem) {
    const components = await this.getFilteredSensorList();

    components.sort((a: CivilComponentProps, b: CivilComponentProps) => {
      if (a.type === b.type)
        if (a.label === b.label)
          return 0;
        else
          return a.label < b.label ? -1 : 1;

      return a.type < b.type ? -1 : 1;
    });

    const nodes = [];
    for (const component of components) {
      nodes.push(createCivilComponentTreeNode(component, false));
    }

    return nodes;
  }
}
