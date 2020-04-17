/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import * as React from "react";

import { ViewState, Viewport, IModelApp, IModelConnection } from "@bentley/imodeljs-frontend";

import {
  ToolWidget,
  ZoneState,
  WidgetState,
  ContentLayoutDef,
  ContentGroup,
  FrontstageProvider,
  Frontstage,
  Zone,
  Widget,
  CoreTools,
  SyncUiEventId,
  ContentViewManager,
  ItemList,
  CustomItemDef,
  StagePanel,
  IModelViewportControl,
  UiFramework,
  IModelConnectedViewSelector,
  IModelConnectedNavigationWidget,
  PopupButton,
  PopupButtonChildrenRenderPropArgs,
} from "@bentley/ui-framework";

import { TableContent } from "../contentviews/TableContent";
import { TreeWidget } from "../widgets/TreeWidget";
import { PropertyGridWidget } from "../widgets/PropertyGridWidget";
import { AppStatusBarWidget } from "../statusbars/AppStatusBar";
import { AppUi } from "../AppUi";
import { SvgSprite } from "@bentley/ui-core";
import civilIcon from "../../components/CivilBrowser/civil-model.svg";
import { CivilBrowser } from "../../components/CivilBrowser/CivilBrowser";
import { CivilDataModel } from "../../api/CivilDataModel";
import { TerrainSettings } from "../../components/TerrainSettings/TerrainSettings";
import { AdtDataLink } from "../../components/AdtDataLink";

/**
 * Sample Frontstage for Civil IoT Viewer application
 */
export class SampleFrontstage extends FrontstageProvider {
  // ID of the presentation ruleset used by all of the controls; the ruleset
  // can be found at `assets/presentation_rules/Default.PresentationRuleSet.xml`
  private _rulesetId = "Default";

  // Content layout for content views
  private _contentLayoutDef: ContentLayoutDef;

  // Content group for both layouts
  private _contentGroup: ContentGroup;

  private _adtDataLink: AdtDataLink = new AdtDataLink();

  constructor(public viewStates: ViewState[]) {
    super();
    // Set default Presentation Rule Set Id in Redux store
    UiFramework.setDefaultRulesetId(this._rulesetId);

    IModelApp.viewManager.onViewOpen.addOnce(async (vp: Viewport) => {
      // NEEDSWORK: find a better place to do this
      await CivilDataModel.initialize(vp.iModel);
    });

    // Create the content layouts.
    this._contentLayoutDef = new ContentLayoutDef({
      horizontalSplit: { percentage: 0.75, top: 0, bottom: 1 },
    });

    // Create the content group.
    this._contentGroup = new ContentGroup({
      contents: [
        {
          classId: IModelViewportControl,
          applicationData: {
            viewState: this.viewStates[0],
            iModelConnection: UiFramework.getIModelConnection(),
          },
        },
        {
          classId: TableContent,
          applicationData: {
            iModelConnection: UiFramework.getIModelConnection(),
            rulesetId: this._rulesetId,
          },
        },
      ],
    });

    this.runAdtDataLinkExample();
  }

  private async runAdtDataLinkExample() {
    if (!this._adtDataLink.getToken()) await this._adtDataLink.login();
    const nodeData = await this._adtDataLink.fetchDataForNode("BR2-SB");
    console.log("Data for BR2-SB: " + JSON.stringify(nodeData));
  }

  /** Define the Frontstage properties */
  public get frontstage() {

    return (
      <Frontstage id="SampleFrontstage"
        defaultTool={CoreTools.selectElementCommand} defaultLayout={this._contentLayoutDef} contentGroup={this._contentGroup}
        isInFooterMode={true}

        topLeft={
          < Zone
            widgets={
              [
                <Widget isFreeform={true} element={<SampleToolWidget />} />,
              ]}
          />
        }
        topCenter={
          < Zone
            widgets={
              [
                <Widget isToolSettings={true} />,
              ]}
          />
        }
        topRight={
          < Zone
            widgets={
              [
                /** Use standard NavigationWidget delivered in ui-framework */
                <Widget isFreeform={true} element={<IModelConnectedNavigationWidget suffixVerticalItems=
                  {new ItemList([this._viewSelectorItemDef, this._terrainSettingsItemDef])} />} />,
              ]}
          />
        }
        centerRight={
          < Zone defaultState={ZoneState.Minimized} allowsMerging={true}
            widgets={
              [
                <Widget control={TreeWidget} fillZone={true}
                  iconSpec="icon-tree" labelKey="CivilViewerApp:components.tree"
                  applicationData={{
                    iModelConnection: UiFramework.getIModelConnection(),
                    rulesetId: this._rulesetId,
                  }}
                />,
              ]}
          />
        }
        bottomCenter={
          < Zone
            widgets={
              [
                <Widget isStatusBar={true} control={AppStatusBarWidget} />,
              ]}
          />
        }
        bottomRight={
          < Zone defaultState={ZoneState.Open} allowsMerging={true}
            widgets={
              [
                <Widget id="Properties" control={PropertyGridWidget} defaultState={WidgetState.Closed} fillZone={true}
                  iconSpec="icon-properties-list" labelKey="CivilViewerApp:components.properties"
                  applicationData={{
                    iModelConnection: UiFramework.getIModelConnection(),
                    rulesetId: this._rulesetId,
                  }}
                  syncEventIds={[SyncUiEventId.SelectionSetChanged]}
                  stateFunc={this._determineWidgetStateForSelectionSet}
                />,
              ]}
          />
        }
        rightPanel={
          < StagePanel
            allowedZones={[6, 9]}
          />
        }
        leftPanel={
          <StagePanel
            size={340} minSize={340}
            allowedZones={[6, 9]}
            widgets={[
              <Widget element={<CivilBrowser imodel={UiFramework.getIModelConnection()!} />} fillZone={true}
                iconSpec={<SvgSprite src={civilIcon} />} label="Model Breakdown"
                applicationData={{
                  iModelConnection: UiFramework.getIModelConnection(),
                }}
              />,
            ]}
          />
        }
      />
    );
  }

  /** Determine the WidgetState based on the Selection Set */
  private _determineWidgetStateForSelectionSet = (): WidgetState => {
    const activeContentControl = ContentViewManager.getActiveContentControl();
    if (activeContentControl && activeContentControl.viewport && (activeContentControl.viewport.view.iModel.selectionSet.size > 0))
      return WidgetState.Open;
    return WidgetState.Closed;
  }

  /** Get the CustomItemDef for ViewSelector  */
  private get _viewSelectorItemDef() {
    return new CustomItemDef({
      customId: "sampleApp:viewSelector",
      reactElement: (
        <IModelConnectedViewSelector
          listenForShowUpdates={false}  // Demo for showing only the same type of view in ViewSelector - See IModelViewport.tsx, onActivated
        />
      ),
    });
  }

  /** Get the CustomItemDef for TerrainSettings  */
  public get _terrainSettingsItemDef() {
    return new CustomItemDef({
      customId: "sampleApp:viewSelector",
      reactElement: (
        <PopupButton iconSpec="icon-network" label="Map Settings">
          {this._renderPopupContents}
        </PopupButton>
      ),
    });
  }

  private _renderPopupContents = ({ closePanel }: PopupButtonChildrenRenderPropArgs) => {
    return (
      <TerrainSettings onExecute={closePanel} onCancel={closePanel} />
    );
  }

}

/**
 * Define a ToolWidget with Buttons to display in the TopLeft zone.
 */
class SampleToolWidget extends React.Component {

  public render(): React.ReactNode {
    const horizontalItems = new ItemList([
      CoreTools.selectElementCommand,
    ]);

    return (
      <ToolWidget
        appButton={AppUi.backstageToggleCommand}
        horizontalItems={horizontalItems}
      />
    );
  }
}
