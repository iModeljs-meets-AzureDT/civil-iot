/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { ITreeDataProvider, TreeNodeItem } from "@bentley/ui-components";
import { CivilDataModel, CivilComponentProps, CivilDataComponentType } from "../../api/CivilDataModel";
import { AbstractCivilTree, createCivilComponentTreeNode } from "./AbstractCivilTree";
import { SelectedNodeContext } from "./CivilBrowser";

interface AssetTreeProps {
  onNodeSelected(selected: SelectedNodeContext | undefined): void;
}

export function AssetTree(props: AssetTreeProps) {
  const dataProvider = React.useMemo(() => new AssetDataProvider(), []);
  return AbstractCivilTree({ dataProvider, ...props });
}

class AssetDataProvider implements ITreeDataProvider {

  public async getNodesCount(parent?: TreeNodeItem) {
    return (await this.getNodes(parent)).length;
  }

  public async getNodes(parent?: TreeNodeItem) {
    const nodes = [];

    if (undefined === parent) {
      const bridgeIcon = CivilDataModel.getIconForComponent(CivilDataComponentType.Bridge);
      const tunnelIcon = CivilDataModel.getIconForComponent(CivilDataComponentType.Tunnel);
      const roadIcon = CivilDataModel.getIconForComponent(CivilDataComponentType.RoadSegment);

      nodes.push({ id: "Bridges", label: "Bridges", icon: bridgeIcon, hasChildren: true, typeNode: CivilDataComponentType.Bridge });
      nodes.push({ id: "Tunnels", label: "Tunnels", icon: tunnelIcon, hasChildren: true, typeNode: CivilDataComponentType.Tunnel });
      nodes.push({ id: "Roads", label: "Roads", icon: roadIcon, hasChildren: true, typeNode: CivilDataComponentType.RoadSegment });

    } else if (undefined !== (parent as any).typeNode) {
      const data = CivilDataModel.get();
      const components = data.getComponentsForTypes([(parent as any).typeNode]);
      for (const component of components) {
        nodes.push(createCivilComponentTreeNode(component, false));
      }
    }

    return nodes;
  }
}
