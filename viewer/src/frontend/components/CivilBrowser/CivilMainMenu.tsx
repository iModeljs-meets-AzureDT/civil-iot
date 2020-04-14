/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { CivilBrowserMode } from "./CivilBrowser";
import {
  useVisibleTreeNodes, ControlledTree, SelectionMode, ITreeDataProvider,
  useModelSource, useNodeLoader, TreeNodeItem,
  TreeEventHandler, TreeDataChangesListener,
  DelayLoadedTreeNodeItem, AbstractTreeNodeLoaderWithProvider, TreeDataProvider, TreeSelectionModificationEvent, TreeSelectionReplacementEvent,
  TreeRenderer, TreeRendererProps, TreeNodeRenderer, TreeNodeRendererProps, ITreeImageLoader, BeInspireTreeNodeITree, LoadedImage,
} from "@bentley/ui-components";
import { useDisposable } from "@bentley/ui-core";
import { BeEvent } from "@bentley/bentleyjs-core";

export interface CivilMainMenuProps {
  onNodeSelected(selected: CivilBrowserMode): void;
}

export function CivilMainMenu(props: CivilMainMenuProps) {
  const dataProvider = React.useMemo(() => new MenuDataProvider(), []);
  const modelSource = useModelSource(dataProvider);
  const nodeLoader = useNodeLoader(dataProvider, modelSource);

  const eventHandler = useDisposable(React.useCallback(() => new MainMenuSelectionHandler(nodeLoader, props.onNodeSelected), [nodeLoader]));
  const visibleNodes = useVisibleTreeNodes(nodeLoader.modelSource);

  return <>
    <div className="main-menu-tree">
      <ControlledTree
        nodeLoader={nodeLoader}
        selectionMode={SelectionMode.SingleAllowDeselect}
        treeEvents={eventHandler}
        visibleNodes={visibleNodes}
        iconsEnabled={true}
        treeRenderer={mainMenuTreeRenderer}
      />
    </div>
  </>;
}

export class MenuDataProvider implements ITreeDataProvider {
  public onTreeNodeChanged = new BeEvent<TreeDataChangesListener>();

  public async getNodesCount(_parent?: TreeNodeItem) {
    return 0;
  }

  public async getNodes(parent?: TreeNodeItem) {
    if (parent === undefined) {
      return [
        this.createNode(CivilBrowserMode.ModelBreakdown, "Model Breakdown", "HierarchyTree_36.png"),
        this.createNode(CivilBrowserMode.Assets, "Assets", "Road_36.png"),
        this.createNode(CivilBrowserMode.Sensors, "Sensors", "traffic-sensor.svg"),
      ];
    }
    return [];
  }

  private createNode = (id: string, label: string, icon: string): DelayLoadedTreeNodeItem => {
    return { id, label, hasChildren: false, icon };
  }
}

class MainMenuSelectionHandler extends TreeEventHandler {
  private _onNodeSelected: (mode: CivilBrowserMode) => void;

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
      this._onNodeSelected(selectedNodeItems[0].id as CivilBrowserMode);
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
      this._onNodeSelected(selectedNodeItems[0].id as CivilBrowserMode);
    });
    // stop handling when base selection handling is stopped
    baseSubscription?.add(subscription);
    return baseSubscription;
  }
}

class MainMenuTreeImageLoader implements ITreeImageLoader {
  public load(item: TreeNodeItem | BeInspireTreeNodeITree): LoadedImage | undefined {
    // setup path to the folder containing tree icons (it should be somewhere in ‘./lib/webresources’)
    const pathToIcons = "";
    return item.icon ? { sourceType: "url", value: `${pathToIcons}${item.icon}` } : undefined;
  }
}
const mainMenuTreeImageLoader = new MainMenuTreeImageLoader();

function modelBreakdownTreeNodeRenderer(props: TreeNodeRendererProps) {
  return <TreeNodeRenderer {...props} imageLoader={mainMenuTreeImageLoader} />;
}

function mainMenuTreeRenderer(props: TreeRendererProps) {
  return <TreeRenderer {...props} nodeRenderer={modelBreakdownTreeNodeRenderer} />;
}
