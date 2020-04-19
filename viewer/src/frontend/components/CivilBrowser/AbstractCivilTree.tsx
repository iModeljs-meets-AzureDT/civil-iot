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
  ITreeImageLoader, BeInspireTreeNodeITree, LoadedImage, TreeNodeRendererProps, TreeNodeRenderer, TreeRendererProps, TreeRenderer, DelayLoadedTreeNodeItem, TreeModelSource,
} from "@bentley/ui-components";
import { CivilComponentProps, CivilDataModel } from "../../api/CivilDataModel";
import { useDisposable } from "@bentley/ui-core";
import { SelectedNodeContext } from "./CivilBrowser";
import { XAndY } from "@bentley/geometry-core";

interface AbstractCivilTreeProps {
  onNodeSelected(selected: SelectedNodeContext): void;
  onMeatballClicked(pos: XAndY, selected: SelectedNodeContext): void;
  targetNodeId?: string;
  dataProvider: ITreeDataProvider;
}

export function AbstractCivilTree(props: AbstractCivilTreeProps) {
  const modelSource = useModelSource(props.dataProvider);
  const nodeLoader = useNodeLoader(props.dataProvider, modelSource);

  const eventHandler = useDisposable(React.useCallback(() => new AbstractCivilSelectionHandler(nodeLoader, props.onNodeSelected), [nodeLoader]));
  const visibleNodes = useVisibleTreeNodes(nodeLoader.modelSource);
  useTargetSelection(modelSource, props.targetNodeId);

  return <>
    <div className="model-breakdown-tree">
      <ControlledTree
        nodeLoader={nodeLoader}
        selectionMode={SelectionMode.SingleAllowDeselect}
        treeEvents={eventHandler}
        visibleNodes={visibleNodes}
        iconsEnabled={true}
        treeRenderer={useAbstractCivilTreeRenderer(props)}
      />
    </div>
  </>;
}

export function createCivilComponentTreeNode(component: CivilComponentProps, hasChildren: boolean): DelayLoadedTreeNodeItem {
  const icon = CivilDataModel.getIconForComponent(component.type);
  return ({ ...component, hasChildren, icon });
}

const useTargetSelection = (modelSource: TreeModelSource, targetNodeId?: string) => {
  const targetSelected = React.useRef(false);

  // when target id changes reset targetSelected flag
  React.useEffect(() => {
    if (targetNodeId)
      targetSelected.current = false;
  }, [targetNodeId]);

  React.useEffect(() => {
    if (!targetNodeId) {
      return undefined;
    }

    targetSelected.current = false;
    const selectTarget = () => {
      if (targetSelected.current)
        return;

      modelSource.modifyModel((model) => {
        const node = model.getNode(targetNodeId);
        if (!node)
          return;

        // deselect all other nodes
        for (const otherNode of model.iterateTreeModelNodes())
          otherNode.isSelected = false;

        // expand the parent
        // This isn't working.  We never get here because the target node isn't in the tree model yet?
        if (undefined !== node.parentId) {
          const parentNode = model.getNode(node.parentId);
          if (undefined !== parentNode)
            parentNode.isExpanded = true;
        }

        node.isSelected = true;
        targetSelected.current = true;
      });
    };
    // try to select target node
    selectTarget();

    // if target node was selected do nothing
    if (targetSelected.current)
      return undefined;

    // if target node was not selected (tree is not loaded yet) listen for model changes and try to select node
    return modelSource.onModelChanged.addListener(selectTarget);
  }, [modelSource, targetNodeId]);
};

class AbstractCivilSelectionHandler extends TreeEventHandler {
  private _onNodeSelected: (selected?: SelectedNodeContext) => void;
  private _dataProvider: TreeDataProvider;

  constructor(nodeLoader: AbstractTreeNodeLoaderWithProvider<TreeDataProvider>, onNodeSelected: any) {
    super({ modelSource: nodeLoader.modelSource, nodeLoader, collapsedChildrenDisposalEnabled: true });

    this._onNodeSelected = onNodeSelected;
    this._dataProvider = nodeLoader.getDataProvider();
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
        this._onNodeSelected({ component: selectedNodeItems[0] as CivilComponentProps, dataProvider: this._dataProvider as ITreeDataProvider });
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
      this._onNodeSelected({ component: selectedNodeItems[0] as CivilComponentProps, dataProvider: this._dataProvider as ITreeDataProvider });
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

function createAbstractCivilTreeNodeRenderer(treeProps: AbstractCivilTreeProps) {
  return (props: TreeNodeRendererProps) => {
    const nodeContext: SelectedNodeContext = { component: props.node.item as CivilComponentProps, dataProvider: treeProps.dataProvider };
    return (
      <>
        <div className="civiltree-node-wrapper">
          <TreeNodeRenderer {...props} imageLoader={abstractCivilTreeImageLoader} />
          <button
            className="meatball-button"
            onClick={(e: React.MouseEvent) => { treeProps.onMeatballClicked({ x: e.pageX, y: e.pageY }, nodeContext); }} />
        </div>
      </>
    );
  };
}

function useAbstractCivilTreeRenderer(treeProps: AbstractCivilTreeProps) {
  const nodeRenderer = React.useCallback(createAbstractCivilTreeNodeRenderer(treeProps), [treeProps]);

  return React.useCallback((props: TreeRendererProps) => {
    return (
      <TreeRenderer {...props} nodeRenderer={nodeRenderer} />
    );
  }, [nodeRenderer]);
}
