/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import {
  useVisibleTreeNodes, ControlledTree, SelectionMode, ITreeDataProvider,
  useModelSource, useNodeLoader, TreeNodeItem,
  TreeEventHandler, TreeDataChangesListener,
  DelayLoadedTreeNodeItem, AbstractTreeNodeLoaderWithProvider, TreeDataProvider, TreeSelectionModificationEvent, TreeSelectionReplacementEvent,
  ITreeImageLoader, BeInspireTreeNodeITree, LoadedImage, TreeNodeRendererProps, TreeNodeRenderer, TreeRendererProps, TreeRenderer,
} from "@bentley/ui-components";
import { BeEvent } from "@bentley/bentleyjs-core";
import { CivilDataModel, CivilComponentProps } from "../../api/CivilDataModel";
import { useDisposable } from "@bentley/ui-core";

const createTreeNode = (component: CivilComponentProps, hasChildren: boolean): DelayLoadedTreeNodeItem => {
  const icon = CivilDataModel.getIconForComponent(component.type);
  return ({ ...component, hasChildren, icon });
};

interface ModelBreakdownTreeProps {
  onNodeSelected(component: CivilComponentProps): void;
}

export function ModelBreakdownTree(props: ModelBreakdownTreeProps) {
  const dataProvider = React.useMemo(() => new ModelBreakdownDataProvider(), []);
  const modelSource = useModelSource(dataProvider);
  const nodeLoader = useNodeLoader(dataProvider, modelSource);

  const eventHandler = useDisposable(React.useCallback(() => new ModelBreakdownSelectionHandler(nodeLoader, props.onNodeSelected), [nodeLoader]));
  const visibleNodes = useVisibleTreeNodes(nodeLoader.modelSource);

  return <>
    <div className="model-breakdown-tree">
      <ControlledTree
        nodeLoader={nodeLoader}
        selectionMode={SelectionMode.SingleAllowDeselect}
        treeEvents={eventHandler}
        visibleNodes={visibleNodes}
        iconsEnabled={true}
        treeRenderer={modelBreakdownTreeRenderer}
      />
    </div>
  </>;
}

class ModelBreakdownDataProvider implements ITreeDataProvider {
  public onTreeNodeChanged = new BeEvent<TreeDataChangesListener>();

  public async getNodesCount(_parent?: TreeNodeItem) {
    /*
    const data = CivilDataModel.get();
    if (parent === undefined)
      return data.getAllTopNodes().length;

    return data.getChildCount(parent as CivilComponentProps);
    */
    return 0;
  }

  public async getNodes(_parent?: TreeNodeItem) {
    const data = CivilDataModel.get();
    /*
    let components: CivilComponentProps[];

    if (parent === undefined) {
      components = data.getAllTopNodes();
    } else {
      components = data.getChildren(parent as CivilComponentProps);
    }
    */
    const components = data.getAllComponents();

    const nodes = [];
    for (const component of components) {
      const hasChildren = 0 < data.getChildCount(component);
      nodes.push(createTreeNode(component, hasChildren));
    }

    return nodes;
  }
}

class ModelBreakdownSelectionHandler extends TreeEventHandler {
  private _onNodeSelected: (component: CivilComponentProps) => void;

  constructor(nodeLoader: AbstractTreeNodeLoaderWithProvider<TreeDataProvider>, onNodeSelected: any) {
    super({ modelSource: nodeLoader.modelSource, nodeLoader, collapsedChildrenDisposalEnabled: true });

    this._onNodeSelected = onNodeSelected;
  }
  /** Selects or deselects nodes until event is handled, handler is disposed selection replaced event occurs.  */
  public onSelectionModified(event: TreeSelectionModificationEvent) {
    // call base selection handling
    const baseSubscription = super.onSelectionModified(event);
    // subscribe to selection modifications and additionally change checkboxes
    const subscription = event.modifications.subscribe(({ selectedNodeItems /*, deselectedNodeItems*/ }) => {
      this._onNodeSelected(selectedNodeItems[0] as CivilComponentProps);
    });
    // stop checkboxes handling when base selection handling is stopped
    baseSubscription?.add(subscription);
    return baseSubscription;
  }

  /** Replaces currently selected nodes until event is handled, handler is disposed or another selection replaced event occurs. */
  public onSelectionReplaced(event: TreeSelectionReplacementEvent) {
    // call base selection handling
    const baseSubscription = super.onSelectionReplaced(event);
    // subscribe to selection replacements and additionally handle checkboxes
    const subscription = event.replacements.subscribe(({ selectedNodeItems }) => {
      this._onNodeSelected(selectedNodeItems[0] as CivilComponentProps);
    });
    // stop handling when base selection handling is stopped
    baseSubscription?.add(subscription);
    return baseSubscription;
  }
}

class ModelBreakdownTreeImageLoader implements ITreeImageLoader {
  public load(item: TreeNodeItem | BeInspireTreeNodeITree): LoadedImage | undefined {
    // setup path to the folder containing tree icons (it should be somewhere in ‘./lib/webresources’)
    const pathToIcons = "";
    return item.icon ? { sourceType: "url", value: `${pathToIcons}${item.icon}` } : undefined;
  }
}
const modelBreakdownTreeImageLoader = new ModelBreakdownTreeImageLoader();

function modelBreakdownTreeNodeRenderer(props: TreeNodeRendererProps) {
  return <TreeNodeRenderer {...props} imageLoader={modelBreakdownTreeImageLoader} />;
}

function modelBreakdownTreeRenderer(props: TreeRendererProps) {
  return <TreeRenderer {...props} nodeRenderer={modelBreakdownTreeNodeRenderer} />;
}
