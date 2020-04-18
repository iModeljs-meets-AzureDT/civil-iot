import * as React from "react";
import "./IOTAlert.scss";
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "@bentley/imodeljs-frontend";

export interface IOTAlertProps {
  message: string;
  onButtonClick(): void;
}

export class IOTAlert extends React.Component<IOTAlertProps> {
  public render() {
    return (
      <>
        <span>{this.props.message}</span>
        <button onClick={this.props.onButtonClick}>Show Details</button>
      </>
    );
  }

  public static showAlert(messageIn: string, _onAction?: () => void) {
    {
      // const contents = <IOTAlert message={messageIn} onButtonClick={onAction} />;
      const errDetails = new NotifyMessageDetails(OutputMessagePriority.Warning, messageIn, undefined, OutputMessageType.Sticky);
      IModelApp.notifications.outputMessage(errDetails);
    }
  }
}
