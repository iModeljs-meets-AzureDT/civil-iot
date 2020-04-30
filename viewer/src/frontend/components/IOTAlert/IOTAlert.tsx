import * as React from "react";
import "./IOTAlert.scss";
import { Dialog, MessageContainer, MessageSeverity } from "@bentley/ui-core";
import { ModelessDialogManager } from "@bentley/ui-framework";


export interface IOTAlertProps {
  message: string;
  onButtonClick: () => void;
}

export class IOTAlert extends React.Component<IOTAlertProps> {

  public static readonly id = "IOTAlert";

  // user clicked the dialog button
  public static closeAlert() {
    ModelessDialogManager.closeDialog(IOTAlert.id);
  }

  // user closed the modeless dialog
  private _onCancel = () => {
    this._closeDialog();
  }

  private _closeDialog = () => {
    ModelessDialogManager.closeDialog(IOTAlert.id);
  }

  public render(): JSX.Element {
    const width = 376;
    const height = 70;
    const y = window.innerHeight - height - 70;
    const x = (window.innerWidth - width) / 2;

    return (
      <Dialog
        title={"IOT Alert"}
        modelessId={IOTAlert.id}
        opened={true}
        resizable={false}
        movable={true}
        modal={false}
        onClose={() => this._onCancel()}
        onEscape={() => this._onCancel()}
        width={width} height={height}
        minHeight={height}
        x = {x} y={y}
      >
        <MessageContainer severity={MessageSeverity.Warning}>
          {this.renderContent()}
        </MessageContainer>
      </Dialog>
    );
  }

  public renderContent() {
    return (
      <div>
        <span className="message-span">{this.props.message}</span>
        <button className="button-to-issue" onClick={this.props.onButtonClick}>
          <span>Go To Issue</span>
        </button>
      </div>
    );
  }

  public static showAlert(dtId: string, onAction: () => void) {
    ModelessDialogManager.closeDialog(IOTAlert.id);
    const _message = "Code Red in " + dtId;
    ModelessDialogManager.openDialog(<IOTAlert onButtonClick={onAction} message={_message} />, IOTAlert.id);

    // const message = new NotifyMessageDetails(OutputMessagePriority.Warning, _message, undefined);
    // MessageManager.addMessage(message);
  }
}
