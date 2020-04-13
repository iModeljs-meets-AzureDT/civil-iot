/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import "./CivilBrowser.scss";
import { IModelConnection, IModelApp } from "@bentley/imodeljs-frontend";
import { SidePanelContainer } from "../SidePanelContainer/SidePanelContainer";
import { CivilMainMenu } from "./CivilMainMenu";
import { CivilComponentProps } from "../../api/CivilDataModel";
import { ModelBreakdownTree } from "./ModelBreakdownTree";
import { SensorTree } from "./SensorTree";
import { AssetTree } from "./AssetTree";
import { Range3d } from "@bentley/geometry-core";

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

  private _componentSelected = async (component: CivilComponentProps): Promise<void> => {
    // console.log("zoom to component with id " + component.id);

    if (undefined === component.geometricId) {
      alert("No geometryId");
      return;
    }

    await IModelApp.viewManager.selectedView!.zoomToElements([component.geometricId], { animateFrustumChange: true });
    this.props.imodel.selectionSet.replace(component.geometricId);
  }

  private _sensorSelected = async (sensor: CivilComponentProps): Promise<void> => {
    if (undefined !== sensor.position) {
      const range = Range3d.create(sensor.position);
      range.expandInPlace(20);
      IModelApp.viewManager.selectedView!.zoomToVolume(range, { animateFrustumChange: true });
    }
    this.props.imodel.selectionSet.replace(sensor.id);
  }

  /** The sample's render method */
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
        content = <SensorTree onNodeSelected={this._sensorSelected} />;
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
