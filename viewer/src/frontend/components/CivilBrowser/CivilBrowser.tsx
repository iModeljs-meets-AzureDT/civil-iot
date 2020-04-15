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
import { Range3d } from "@bentley/geometry-core";
import { EmphasizeAssets } from "../../api/EmphasizeAssets";
import { ITreeDataProvider } from "@bentley/ui-components";

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
      IModelApp.viewManager.selectedView!.zoomToElements([component.geometricId], { ...zoomOpts, animateFrustumChange: true });

      const data = CivilDataModel.get();
      const components = data.getSensorsForParent(component.id);
      SensorMarkerSetDecoration.show(components);

      // this.props.imodel.selectionSet.replace(component.geometricId);
    }

    this.setState({ selectedComponent: selected });
  }

  private _clearComponentSelected = async (): Promise<void> => {
    this._componentSelected();
  }

  private _sensorSelected = async (selected: SelectedNodeContext | undefined): Promise<void> => {
    if (!selected) {
      this.props.imodel.selectionSet.emptyAll();
      SensorMarkerSetDecoration.clear();
      EmphasizeAssets.clearEmphasize(IModelApp.viewManager.selectedView!);
      return;
    }

    const sensor = selected.component;

    const data = CivilDataModel.get();
    const assets = data.getComponentsByIds([sensor.composingId]);
    const withGeomIds = assets.filter((c: CivilComponentProps) => undefined !== c.geometricId);
    EmphasizeAssets.emphasize(withGeomIds.map((c: CivilComponentProps) => c.geometricId!), IModelApp.viewManager.selectedView!);

    const components = data.getSensorsOfSameParent(sensor);
    SensorMarkerSetDecoration.show(components, sensor.id);

    if (undefined !== sensor.position) {
      const range = Range3d.create(sensor.position);
      range.expandInPlace(20);
      IModelApp.viewManager.selectedView!.zoomToVolume(range, { animateFrustumChange: true });
    }

    // this.props.imodel.selectionSet.replace(sensor.id);
  }

  public render() {
    let content;
    let title;
    let wantBackbutton = true;

    switch (this.state.mode) {
      case CivilBrowserMode.MainMenu: {
        content = <CivilMainMenu onNodeSelected={(mode: CivilBrowserMode) => this.setState({ mode })} />;
        title = "Digital Twin";
        wantBackbutton = false;
        break;
      }
      case CivilBrowserMode.ModelBreakdown: {
        content = <ModelBreakdownTree onNodeSelected={this._componentSelected} />;
        title = "Model breakdown";
        break;
      }
      case CivilBrowserMode.Assets: {
        content = <AssetTree onNodeSelected={this._componentSelected} />;
        title = "Assets";
        break;
      }
      case CivilBrowserMode.Sensors: {
        content = <SensorTree onNodeSelected={this._sensorSelected} filterByNode={this.state.selectedComponent} onClickFilterClear={this._clearComponentSelected} />;
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
