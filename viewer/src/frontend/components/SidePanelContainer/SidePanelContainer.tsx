import * as React from "react";
import { Icon } from "@bentley/ui-core";
import "./SidePanelContainer.scss";

export interface SidePanelContainerProps {
  title?: string;
  onBackButton(): void;
}

/*
 * Container for holding side panel content. This container also renders a title and a back button
 */
export class SidePanelContainer extends React.Component<
  SidePanelContainerProps
  > {
  public render() {
    return (
      <div className="max-height max-width">
        <div className={"side-panel-container-header"}>
          <div
            className="side-panel-container-back"
            onClick={this.props.onBackButton}
            title={"Back"}
          >
            <Icon iconSpec={"icon-chevron-left"}></Icon>
          </div>
          {this.props.title !== undefined && (
            <div className="side-panel-container-title">{this.props.title}</div>
          )}
        </div>
        <div className="side-panel-container-contents">{this.props.children}</div>
      </div >
    );
  }
}
