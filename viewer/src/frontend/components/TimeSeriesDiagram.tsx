/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";
import { FrontstageManager, StagePanelState } from "@bentley/ui-framework";

/** A widget control for browsing the building structure */
export class TimeSeriesDiagram extends React.Component {

  public closeMyParent = (_event: any) => {
    FrontstageManager.activeFrontstageDef!.bottomPanel!.panelState = StagePanelState.Off;
  }

  public render() {
    return (
            <>
                <button onClick={this.closeMyParent} style={{ float: "right", marginRight: "5px", marginTop: "5px", fontWeight: "bold" }}>X</button>
                <div ref="diagramDIV" id="diagramDIV" style={{ width: "100%", height: "325px", marginLeft: "10px", pointerEvents: "auto" }} ></div>
            </>
    );
  }
}
