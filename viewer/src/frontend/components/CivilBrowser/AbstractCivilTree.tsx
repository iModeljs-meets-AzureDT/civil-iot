/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import {
  useVisibleTreeNodes, ControlledTree, SelectionMode, ITreeDataProvider, TreeEventHandler,
  useModelSource, useNodeLoader, TreeNodeItem,
  AbstractTreeNodeLoaderWithProvider, TreeDataProvider, TreeSelectionModificationEvent, TreeSelectionReplacementEvent,
  ITreeImageLoader, BeInspireTreeNodeITree, LoadedImage, TreeNodeRendererProps, TreeNodeRenderer, TreeRendererProps, TreeRenderer, DelayLoadedTreeNodeItem,
} from "@bentley/ui-components";
import { CivilComponentProps, CivilDataModel } from "../../api/CivilDataModel";
import { useDisposable } from "@bentley/ui-core";

interface AbstractCivilTreeProps {
  onNodeSelected(component: CivilComponentProps): void;
  dataProvider: ITreeDataProvider;
}

export function AbstractCivilTree(props: AbstractCivilTreeProps) {
  const modelSource = useModelSource(props.dataProvider);
  const nodeLoader = useNodeLoader(props.dataProvider, modelSource);

  const eventHandler = useDisposable(React.useCallback(() => new AbstractCivilSelectionHandler(nodeLoader, props.onNodeSelected), [nodeLoader]));
  const visibleNodes = useVisibleTreeNodes(nodeLoader.modelSource);

  return <>
    <div className="model-breakdown-tree">
      <ControlledTree
        nodeLoader={nodeLoader}
        selectionMode={SelectionMode.SingleAllowDeselect}
        treeEvents={eventHandler}
        visibleNodes={visibleNodes}
        iconsEnabled={true}
        treeRenderer={abstractCivilTreeRenderer}
      />
    </div>
  </>;
}

export function createCivilComponentTreeNode(component: CivilComponentProps, hasChildren: boolean): DelayLoadedTreeNodeItem {
  const icon = CivilDataModel.getIconForComponent(component.type);
  return ({ ...component, hasChildren, icon });
}

class AbstractCivilSelectionHandler extends TreeEventHandler {
  private _onNodeSelected: (component: CivilComponentProps | undefined) => void;

  constructor(nodeLoader: AbstractTreeNodeLoaderWithProvider<TreeDataProvider>, onNodeSelected: any) {
    super({ modelSource: nodeLoader.modelSource, nodeLoader, collapsedChildrenDisposalEnabled: true });

    this._onNodeSelected = onNodeSelected;
  }
  /** Selects or deselects nodes until event is handled, handler is disposed selection replaced event occurs.  */
  public onSelectionModified(event: TreeSelectionModificationEvent) {
    // call base selection handling
    const baseSubscription = super.onSelectionModified(event);
    // subscribe to selection modifications and additionally change checkboxes
    const subscription = event.modifications.subscribe(({ selectedNodeItems, deselectedNodeItems }) => {
      if (deselectedNodeItems && deselectedNodeItems.length > 0)
        this._onNodeSelected(undefined);
      else
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

class AbstractCivilTreeImageLoader implements ITreeImageLoader {
  public load(item: TreeNodeItem | BeInspireTreeNodeITree): LoadedImage | undefined {
    // setup path to the folder containing tree icons (it should be somewhere in ‘./lib/webresources’)
    const pathToIcons = "";
    return item.icon ? { sourceType: "url", value: `${pathToIcons}${item.icon}` } : undefined;
  }
}
const abstractCivilTreeImageLoader = new AbstractCivilTreeImageLoader();

function abstractCivilTreeNodeRenderer(props: TreeNodeRendererProps) {
  return <TreeNodeRenderer {...props} imageLoader={abstractCivilTreeImageLoader} />;
}

function abstractCivilTreeRenderer(props: TreeRendererProps) {
  return <TreeRenderer {...props} nodeRenderer={abstractCivilTreeNodeRenderer} />;
}
