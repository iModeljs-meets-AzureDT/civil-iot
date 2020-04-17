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
  selectedComponent?: SelectedNodeContext;
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
      this.setState({ selectedComponent: undefined });
      return;
    }

    const component = selected.component;

    if (undefined !== component.geometricId) {
      EmphasizeAssets.emphasize([component.geometricId], IModelApp.viewManager.selectedView!);

      const margin = 0.25;
      const zoomOpts = { top: margin, bottom: margin, left: margin, right: margin };
      await IModelApp.viewManager.selectedView!.zoomToElements([component.geometricId], { ...zoomOpts, animateFrustumChange: true });

      const data = CivilDataModel.get();
      const components = data.getSensorsForParent(component.id);
      SensorMarkerSetDecoration.show(components);

      // this.props.imodel.selectionSet.replace(component.geometricId);
    }

    this.setState({ selectedComponent: selected });
  }

  private _clearComponentSelected = async (): Promise<void> => {
    await this._componentSelected();
  }

  public markerClicked = async (sensor: CivilComponentProps | undefined): Promise<void> => {
    await this._sensorSelected2(sensor, true);
    this.setState({ mode: CivilBrowserMode.Sensors });
  }

  private _sensorSelected = async (selected: SelectedNodeContext | undefined, skipZoom?: boolean): Promise<void> => {
    const _sensor = selected ? selected.component : undefined;
    await this._sensorSelected2(_sensor, skipZoom);

  }

  private _sensorSelected2 = async (sensor: CivilComponentProps | undefined, skipZoom?: boolean): Promise<void> => {
    if (!sensor) {
      this.props.imodel.selectionSet.emptyAll();
      SensorMarkerSetDecoration.clear();
      EmphasizeAssets.clearEmphasize(IModelApp.viewManager.selectedView!);
      return;
    }

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
  }

  /** When the user clicks on the marker, we will show a small popup menu */
  private showPopupMenu(cursorPoint: XAndY) {
    const menuEntries: PopupMenuEntry[] = [];

    menuEntries.push({ label: "Menu Option 1", onPicked: this.popupCallback });
    menuEntries.push({ label: "Menu Option 2", onPicked: this.popupCallback });

    const offset = 8;
    PopupMenu.onPopupMenuEvent.emit({
      menuVisible: true,
      menuX: cursorPoint.x - offset,
      menuY: cursorPoint.y - offset,
      entries: menuEntries,
    });
  }

  private popupCallback(_entry: PopupMenuEntry) {

  }

  public render() {
    let content;
    let title;
    let wantBackbutton = true;

    switch (this.state.mode) {
      case CivilBrowserMode.MainMenu: {
        content = <CivilMainMenu onNodeSelected={(mode: CivilBrowserMode) => this.setState({ mode })} />;
        title = "Coffs Harbour Digital Twin";
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
        content = <AssetTree onNodeSelected={this._componentSelected} onMeatballClicked={this.showPopupMenu} />;
        title = "Asset Types";
        break;
      }
      case CivilBrowserMode.Sensors: {
        content = <SensorTree onNodeSelected={this._sensorSelected} filterByNode={this.state.selectedComponent} onClickFilterClear={this._clearComponentSelected} onMeatballClicked={this.showPopupMenu} />;
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
