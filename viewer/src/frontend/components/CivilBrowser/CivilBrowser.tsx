/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { IModelConnection, PropertyRecord } from "@bentley/imodeljs-frontend";
import {
  useVisibleTreeNodes, ControlledTree, SelectionMode, ITreeDataProvider,
  useModelSource, useNodeLoader, TreeNodeItem, TreeEventHandler, TreeDataChangesListener, DelayLoadedTreeNodeItem,
} from "@bentley/ui-components";
import { BeEvent } from "@bentley/bentleyjs-core";

interface CivilBrowserProps {
  imodel?: IModelConnection;
}

/** A React component that renders the UI specific for this component */
export class CivilBrowser extends React.Component<CivilBrowserProps, {}> {

  constructor(props?: any, context?: any) {
    super(props, context);
  }

  /** The sample's render method */
  public render() {
    return (
      <>
        <div className="civil-browser-title">
          <span>Digital Twin</span>
        </div>
        <div className="civil-browser-tree">
          <CivilBrowserTree />
        </div>
      </>
    );
  }
}

class CivilBrowserDataProvider implements ITreeDataProvider {
  public onTreeNodeChanged = new BeEvent<TreeDataChangesListener>();

  public async getNodesCount(parent?: TreeNodeItem) {
    if (parent === undefined)
      return 5;

    switch (parent.id) {
      case "TestNode-1": return 3;
      case "TestNode-2": return 3;
      case "TestNode-2-2": return 2;
      case "TestNode-2-3": return 2;
      case "TestNode-3": return 3;
      case "TestNode-5": return 1;
      default: return 0;
    }
  }

  public async getNodes(parent?: TreeNodeItem) {
    if (parent === undefined) {
      return [
        createNode("TestNode-1", "TestNode 1", true), createNode("TestNode-2", "TestNode 2", true), createNode("TestNode-3", "TestNode 3", true),
        createNode("TestNode-4", "TestNode 4"), createNode("TestNode-5", "TestNode 5", true),
      ];
    }

    switch (parent.id) {
      case "TestNode-1": return [createNode("TestNode-1-1", "TestNode 1-1"), createNode("TestNode-1-2", "TestNode 1-2"), createNode("TestNode-1-3", "TestNode 1-3")];
      case "TestNode-2": return [createNode("TestNode-2-1", "TestNode 2-1"), createNode("TestNode-2-2", "TestNode 2-2", true), createNode("TestNode-2-3", "TestNode 2-3", true)];
      case "TestNode-2-2": return [createNode("TestNode-2-2-1", "TestNode 2-2-1"), createNode("TestNode-2-2-2", "TestNode 2-2-2")];
      case "TestNode-2-3": return [createNode("TestNode-2-3-1", "TestNode 2-3-1"), createNode("TestNode-2-3-2", "TestNode 2-3-2")];
      case "TestNode-3": return [createNode("TestNode-3-1", "TestNode 3-1"), createNode("TestNode-3-2", "TestNode 3-2"), createNode("TestNode-3-3", "TestNode 3-3")];
      case "TestNode-5": return [createNode("TestNode-5-1", "TestNode 5-1")];
      default: return [];
    }
  }
}

const createNode = (id: string, label: string, hasChildren?: boolean): DelayLoadedTreeNodeItem => {
  return {
    id,
    label,
    isCheckboxVisible: true,
    hasChildren,
  };
};

function CivilBrowserTree() {
  const dataProvider = React.useMemo(() => new CivilBrowserDataProvider(), []);
  const modelSource = useModelSource(dataProvider);
  const nodeLoader = useNodeLoader(dataProvider, modelSource);

  const eventHandlerParams = React.useMemo(() => ({ nodeLoader, modelSource: nodeLoader.modelSource, collapsedChildrenDisposalEnabled: true }), [nodeLoader]);
  const eventHandler = new TreeEventHandler(eventHandlerParams);
  const visibleNodes = useVisibleTreeNodes(nodeLoader.modelSource);

  return <>
    <ControlledTree
      nodeLoader={nodeLoader}
      selectionMode={SelectionMode.None}
      treeEvents={eventHandler}
      visibleNodes={visibleNodes}
    />
  </>;
}
