/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { IModelConnection, PropertyRecord, IModelApp } from "@bentley/imodeljs-frontend";
import {
  useVisibleTreeNodes, ControlledTree, SelectionMode, ITreeDataProvider,
  useModelSource, useNodeLoader, TreeNodeItem,
  TreeEventHandler, TreeDataChangesListener,
  DelayLoadedTreeNodeItem, AbstractTreeNodeLoaderWithProvider, TreeDataProvider, TreeSelectionModificationEvent, TreeSelectionReplacementEvent, TreeModelSource,
} from "@bentley/ui-components";
import { BeEvent } from "@bentley/bentleyjs-core";
import { CivilDataModel, CivilComponentProps, CivilDataModelLevel } from "../../api/CivilDataModel";
import { useDisposable } from "@bentley/ui-core";
import { SidePanelContainer } from "../SidePanelContainer/SidePanelContainer";
import { CivilMainMenu } from "./CivilMainMenu";

export enum CivilBrowserMode {
  MainMenu = "1",
  ModelBreakdown = "2",
  Assets = "3",
  Sensors = "4",
}

interface CivilBrowserState {
  mode: CivilBrowserMode;
}

interface CivilBrowserProps {
  imodel: IModelConnection;
}

/** A React component that renders the UI specific for this component */
export class CivilBrowser extends React.Component<CivilBrowserProps, CivilBrowserState> {

  constructor(props?: any, context?: any) {
    super(props, context);

    this.state = {
      mode: CivilBrowserMode.MainMenu,
    };
  }

  private _treeNodeSelected = async (component: CivilComponentProps): Promise<void> => {
    // console.log("zoom to component with id " + component.id);

    await IModelApp.viewManager.selectedView!.zoomToElements([component.id], { animateFrustumChange: true });
    this.props.imodel.selectionSet.replace(component.id);
  }

  /** The sample's render method */
  public render() {
    let content;

    switch (this.state.mode) {
      case CivilBrowserMode.MainMenu: content = <CivilMainMenu onNodeSelected={(mode: CivilBrowserMode) => this.setState({ mode })} />; break;
      case CivilBrowserMode.ModelBreakdown: content = <CivilBrowserTree onNodeSelected={this._treeNodeSelected} />; break;
    }

    return (
      <>
        <SidePanelContainer title="Civil Model Browser" onBackButton={() => { this.setState({ mode: CivilBrowserMode.MainMenu }); }}>
          {content}
        </SidePanelContainer>
      </>
    );
  }
}

const createTreeNode = (component: CivilComponentProps, hasChildren: boolean): DelayLoadedTreeNodeItem => {
  return ({ ...component, hasChildren });
};

interface CivilBrowserTreeProps {
  onNodeSelected(component: CivilComponentProps): void;
}

function CivilBrowserTree(props: CivilBrowserTreeProps) {
  const dataProvider = React.useMemo(() => new CivilBrowserDataProvider(), []);
  const modelSource = useModelSource(dataProvider);
  const nodeLoader = useNodeLoader(dataProvider, modelSource);

  const eventHandler = useDisposable(React.useCallback(() => new CivilBrowserTreeSelectionHandler(nodeLoader, props.onNodeSelected), [nodeLoader]));
  const visibleNodes = useVisibleTreeNodes(nodeLoader.modelSource);

  return <>
    <ControlledTree
      nodeLoader={nodeLoader}
      selectionMode={SelectionMode.SingleAllowDeselect}
      treeEvents={eventHandler}
      visibleNodes={visibleNodes}
    />
  </>;
}

class CivilBrowserDataProvider implements ITreeDataProvider {
  public onTreeNodeChanged = new BeEvent<TreeDataChangesListener>();

  public async getNodesCount(parent?: TreeNodeItem) {
    const data = CivilDataModel.get();
    if (parent === undefined)
      return data.getAllTopNodes().length;

    return data.getChildCount(parent as CivilComponentProps);
  }

  public async getNodes(parent?: TreeNodeItem) {
    const data = CivilDataModel.get();
    let components: CivilComponentProps[];

    if (parent === undefined) {
      components = data.getAllTopNodes();
    } else {
      components = data.getChildren(parent as CivilComponentProps);
    }

    const nodes = [];
    for (const component of components) {
      const hasChildren = 0 < data.getChildCount(component);
      nodes.push(createTreeNode(component, hasChildren));
    }

    return nodes;
  }
}

class CivilBrowserTreeSelectionHandler extends TreeEventHandler {
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
