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
        content = <ModelBreakdownTree onNodeSelected={this._treeNodeSelected} />;
        title = "Model breakdown";
        break;
      }
      case CivilBrowserMode.Assets: {
        title = "Assets";
        break;
      }
      case CivilBrowserMode.Sensors: {
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
