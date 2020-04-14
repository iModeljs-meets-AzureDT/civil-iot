/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { ToolButton } from "@bentley/ui-framework";
import { SvgSprite, Popup, Position, Toggle, CommonProps } from "@bentley/ui-core";
import terrainIcon from "../../components/TerrainSettings/terrain.svg";
import { IModelApp, ScreenViewport, SpatialViewState } from "@bentley/imodeljs-frontend";
import { BackgroundMapType } from "@bentley/imodeljs-common";
import "./TerrainSettings.scss";

interface TerrainSettingsProps extends CommonProps {
  onExecute?: () => void;
  onCancel?: () => void;
}

interface TerrainSettingsState {
  showPopup: boolean;
  mapIsOn: boolean;
  terrainIsOn: boolean;
  transparency: number;
}

export class TerrainSettings extends React.Component<TerrainSettingsProps, TerrainSettingsState> {
  constructor(props: TerrainSettingsProps, context?: any) {
    super(props, context);

    let mapIsOn = false;
    let terrainIsOn = false;
    let transparency = 0;

    const vp = IModelApp.viewManager.selectedView as ScreenViewport;
    if (undefined !== vp) {
      const view = vp.view as SpatialViewState;
      const backgroundMap = view.getDisplayStyle3d().settings.backgroundMap;
      mapIsOn = view.viewFlags.backgroundMap;
      terrainIsOn = backgroundMap.applyTerrain;
      transparency = false === backgroundMap.transparency ? 0 : backgroundMap.transparency;
    }

    this.state = { showPopup: false, mapIsOn, terrainIsOn, transparency };
  }

  private _onChangeTransparency = (event: React.ChangeEvent<HTMLInputElement>) => {
    const transparency = Number(event.target.value);

    this.setState({ transparency }, () => {
      const vp = IModelApp.viewManager.selectedView as ScreenViewport;
      vp.changeBackgroundMapProps({ transparency });
    });
  }

  private _onToggleMap = (turnOn: boolean) => {
    const vp = IModelApp.viewManager.selectedView as ScreenViewport;

    const view = vp.view as SpatialViewState;
    const newFlags = view.viewFlags.clone();
    newFlags.backgroundMap = turnOn;
    vp.viewFlags = newFlags;

    if (turnOn) {
      if (
        (view.getDisplayStyle3d().settings.backgroundMap
          .providerName as string) !== "BingProvider"
      ) {
        vp.changeBackgroundMapProps({
          providerName: "BingProvider",
          providerData: { mapType: BackgroundMapType.Hybrid },
        });
      }
    }

    vp.synchWithView(false);
    this.setState({ mapIsOn: turnOn });
  }

  private _onToggleTerrain = (turnOn: boolean) => {
    const vp = IModelApp.viewManager.selectedView as ScreenViewport;
    vp.changeBackgroundMapProps({ applyTerrain: turnOn });
    vp.synchWithView(false);
    vp.invalidateScene();

    this.setState({ terrainIsOn: turnOn });
  }

  public render() {
    return (
      <div className="terrain-settings">
        <span>Show Map</span>
        <Toggle isOn={this.state.mapIsOn} onChange={this._onToggleMap} />
        <span>Show Terrain</span>
        <Toggle isOn={this.state.terrainIsOn} onChange={this._onToggleTerrain} disabled={!this.state.mapIsOn} />
        <span>Transparency</span>
        <input type="range" min="0" max="1" step="0.01" value={this.state.transparency} onChange={this._onChangeTransparency} disabled={!this.state.mapIsOn}></input>
      </div>
    );
  }
}
