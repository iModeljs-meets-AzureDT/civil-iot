/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { ITreeDataProvider, TreeNodeItem, DelayLoadedTreeNodeItem } from "@bentley/ui-components";
import { CivilDataModel, CivilComponentProps } from "../../api/CivilDataModel";
import { AbstractCivilTree } from "./AbstractCivilTree";

interface ModelBreakdownTreeProps {
  onNodeSelected(component: CivilComponentProps): void;
}

export function ModelBreakdownTree(props: ModelBreakdownTreeProps) {
  const dataProvider = React.useMemo(() => new ModelBreakdownDataProvider(), []);
  return AbstractCivilTree({ dataProvider, ...props });
}

class ModelBreakdownDataProvider implements ITreeDataProvider {

  private createTreeNode = (component: CivilComponentProps, hasChildren: boolean): DelayLoadedTreeNodeItem => {
    const icon = CivilDataModel.getIconForComponent(component.type);
    return ({ ...component, hasChildren, icon });
  }

  public async getNodesCount(parent?: TreeNodeItem) {
    let parentId: string = "";

    if (parent)
      parentId = parent.id;

    const data = CivilDataModel.get();
    return data.getChildCount(parentId);
  }

  public async getNodes(parent?: TreeNodeItem) {
    let parentId: string = "";

    if (parent)
      parentId = parent.id;

    const data = CivilDataModel.get();
    const components = data.getComponentsForParent(parentId);

    const nodes = [];
    for (const component of components) {
      const hasChildren = 0 < data.getChildCount(component.id);
      nodes.push(this.createTreeNode(component, hasChildren));
    }

    return nodes;
  }
}
