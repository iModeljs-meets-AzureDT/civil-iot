/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { IModelConnection, IModelApp } from "@bentley/imodeljs-frontend";
import { SidePanelContainer } from "../SidePanelContainer/SidePanelContainer";
import { CivilMainMenu } from "./CivilMainMenu";
import { CivilDataModel, CivilComponentProps } from "../../api/CivilDataModel";
import { ModelBreakdownTree } from "./ModelBreakdownTree";
import { SensorTree } from "./SensorTree";
import { SensorMarkerSetDecoration } from "../../components/SensorMarker";
import { AssetTree } from "./AssetTree";
import { Range3d, XAndY } from "@bentley/geometry-core";
import { EmphasizeAssets } from "../../api/EmphasizeAssets";
import { ITreeDataProvider } from "@bentley/ui-components";
import { PopupMenu, PopupMenuEntry } from "./PopupMenu";

export enum CivilBrowserMode {
  MainMenu = "1",
  ModelBreakdown = "2",
  Assets = "3",
  Sensors = "4",
}

export interface SelectedNodeContext {
  component: CivilComponentProps;    // The node that is selected
  dataProvider: ITreeDataProvider;    // For getting context about it's parent or children
}

interface CivilBrowserState {
  mode: CivilBrowserMode;
  sensorFilterNode?: SelectedNodeContext;
  selectedComponentId?: string;
  selectedSensorId?: string;
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
    // Save the instance on IModelApp so it can be accessed from sensor markers
    (IModelApp as any).civilBrowser = this;
  }

  private _componentSelected = async (selected?: SelectedNodeContext): Promise<void> => {
    // console.log("zoom to component with id " + component.id);

    if (undefined === selected) {
      this.props.imodel.selectionSet.emptyAll();
      SensorMarkerSetDecoration.clear();
      EmphasizeAssets.clearEmphasize(IModelApp.viewManager.selectedView!);
      this.setState({ sensorFilterNode: undefined });
      return;
    }

    focusOnComponent2(selected.component, false);

    this.setState({ sensorFilterNode: selected });
  }

  private _clearComponentSelected = async (): Promise<void> => {
    await this._componentSelected();
  }

  public markerClicked = async (sensor: CivilComponentProps): Promise<void> => {
    await focusOnSensor2(sensor, true);
    this.setState({ mode: CivilBrowserMode.Sensors, selectedSensorId: sensor.id });
  }

  private _sensorSelected = async (selected: SelectedNodeContext | undefined, skipZoom?: boolean): Promise<void> => {
    const sensor = selected ? selected.component : undefined;

    if (!sensor) {
      this.props.imodel.selectionSet.emptyAll();
      SensorMarkerSetDecoration.clear();
      EmphasizeAssets.clearEmphasize(IModelApp.viewManager.selectedView!);
      return;
    }

    await focusOnSensor2(sensor, skipZoom);
  }

  /** When the user clicks on the meatball button, we will show a small popup menu */
  private showPopupMenu(cursorPoint: XAndY, node: SelectedNodeContext) {

    const data = CivilDataModel.get();
    const component = data.getComponentForId(node.component.id);

    const entries = [];

    if (undefined !== component) {
      const typeString = CivilDataModel.getStringForComponentType(component.type);

      entries.push({ label: "Go to " + typeString, node, onPicked: focusOnComponent });
      entries.push({ label: "Show sensors", node, onPicked: showSensors });
    }

    const sensor = data.getSensorForId(node.component.id);

    if (undefined !== sensor) {
      const typeString = CivilDataModel.getStringForComponentType(sensor.type);

      entries.push({ label: "Go to " + typeString, node, onPicked: focusOnSensor });
      entries.push({ label: "Show asset", node, onPicked: showAsset });
    }

    const menuEntries: PopupMenuEntry[] = [];

    for (const entry of entries)
      menuEntries.push(entry);

    const offset = 8;
    PopupMenu.onPopupMenuEvent.emit({
      menuVisible: true,
      menuX: cursorPoint.x - offset,
      menuY: cursorPoint.y - offset,
      entries: menuEntries,
    });
  }

  public render() {
    let content;
    let title;
    let wantBackbutton = true;

    switch (this.state.mode) {
      case CivilBrowserMode.MainMenu: {
        content = <CivilMainMenu onNodeSelected={(mode: CivilBrowserMode) => this.setState({ mode })} />;
        title = "Coffs Harbour Operations";
        wantBackbutton = false;
        break;
      }
      case CivilBrowserMode.ModelBreakdown: {
        content = <ModelBreakdownTree onNodeSelected={this._componentSelected} onMeatballClicked={this.showPopupMenu} />;
        title = "Asset Hierarchy";
        break;
      }
      case CivilBrowserMode.Assets: {
        content = <AssetTree
          onNodeSelected={this._componentSelected} onMeatballClicked={this.showPopupMenu}
          targetNodeId={this.state.selectedComponentId} />;
        title = "Asset Types";
        break;
      }
      case CivilBrowserMode.Sensors: {
        content = <SensorTree
          onNodeSelected={this._sensorSelected} onMeatballClicked={this.showPopupMenu}
          targetNodeId={this.state.selectedSensorId}
          filterByNode={this.state.sensorFilterNode} onClickFilterClear={this._clearComponentSelected} />;
        title = "Sensors";
        break;
      }
    }

    return (
      <>
        <SidePanelContainer title={title} wantBackButton={wantBackbutton} onBackButton={() => { this.setState({ mode: CivilBrowserMode.MainMenu }); }}>
          {content}
        </SidePanelContainer>
      </>
    );
  }
}

const focusOnSensor = (entry: PopupMenuEntry) => {
  const node = (entry as any).node as SelectedNodeContext;
  const sensor = node.component;
  focusOnSensor2(sensor, false);
};

const focusOnSensor2 = (sensor: CivilComponentProps, skipZoom?: boolean) => {
  const data = CivilDataModel.get();
  const assets = data.getComponentsByIds([sensor.composingId]);
  const withGeomIds = assets.filter((c: CivilComponentProps) => undefined !== c.geometricId);
  EmphasizeAssets.emphasize(withGeomIds.map((c: CivilComponentProps) => c.geometricId!), IModelApp.viewManager.selectedView!);

  const components = data.getSensorsOfSameParent(sensor);
  SensorMarkerSetDecoration.show(components, sensor.id);

  if (!skipZoom && undefined !== sensor.position) {
    const range = Range3d.create(sensor.position);
    range.expandInPlace(20);
    IModelApp.viewManager.selectedView!.zoomToVolume(range, { animateFrustumChange: true });
  }

  // this.props.imodel.selectionSet.replace(sensor.id);
};

const focusOnComponent = (entry: PopupMenuEntry) => {
  const node = (entry as any).node as SelectedNodeContext;
  const component = node.component;

  focusOnComponent2(component, false);
};

const focusOnComponent2 = (component: CivilComponentProps, skipZoom?: boolean) => {

  if (undefined !== component.geometricId) {
    EmphasizeAssets.emphasize([component.geometricId], IModelApp.viewManager.selectedView!);

    if (!skipZoom) {
      const margin = 0.25;
      const zoomOpts = { top: margin, bottom: margin, left: margin, right: margin };
      IModelApp.viewManager.selectedView!.zoomToElements([component.geometricId], { ...zoomOpts, animateFrustumChange: true });
    }

    const data = CivilDataModel.get();
    const components = data.getSensorsForParent(component.id);
    SensorMarkerSetDecoration.show(components);

    // this.props.imodel.selectionSet.replace(component.geometricId);
  }
};

const showSensors = (entry: PopupMenuEntry) => {
  const node = (entry as any).node as SelectedNodeContext;
  (IModelApp as any).civilBrowser.setState({ selectedComponent: node, mode: CivilBrowserMode.Sensors });
};

const showAsset = (entry: PopupMenuEntry) => {
  const node = (entry as any).node as SelectedNodeContext;
  const sensor = node.component;
  const asset = CivilDataModel.get().getComponentForId(sensor.composingId);

  (IModelApp as any).civilBrowser.setState({ selectedComponentId: asset?.id, mode: CivilBrowserMode.Assets });
};
