/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
 * Licensed under the MIT License. See LICENSE.md in the project root for license terms.
 *--------------------------------------------------------------------------------------------*/
import { IModelApp, Marker, BeButtonEvent, Cluster, MarkerSet, DecorateContext, BeButton, imageElementFromUrl, ScreenViewport } from "@bentley/imodeljs-frontend";
import { XYAndZ, XAndY, Range3d, Point3d } from "@bentley/geometry-core";
import { BeDuration } from "@bentley/bentleyjs-core";
import { ElectronRpcConfiguration } from "@bentley/imodeljs-common";
import { CivilComponentProps, CivilDataComponentType, CivilDataModel } from "../api/CivilDataModel";
import { CivilBrowser } from "./CivilBrowser/CivilBrowser";
import { AdtDataLink } from "../components/AdtDataLink";

const STATUS_TO_STRING = ["Normal", "Medium", "High"];
const STATUS_COUNT = 3;
const IMAGE_SIZE = 30;
const MIN_CLUSTER_SIZE = 2;
  // RGB values for:  green orange red
const COLORS = ["#92D050", "#ED7D31", "#C00000"];

/** Marker to show a sensor location. */
export class SensorMarker extends Marker {
  protected _component: CivilComponentProps;
  protected _image: HTMLImageElement;
  protected _isFeatured: boolean;
  protected _doTooltipPolling: boolean;

  public get status(): number {
    return 0; // this._component.status;
  }
  public get markerImage(): HTMLImageElement {
    return this._image;
  }

  public async updateTooltip(component: CivilComponentProps) {
    if ((IModelApp as any).adtDataLink === undefined)
      (IModelApp as any).adtDataLink = new AdtDataLink();

    const adtDataLink = (IModelApp as any).adtDataLink;
    if (!adtDataLink.getToken())
      await adtDataLink.login();

    const data = CivilDataModel.get();
    const asset = data.getComponentForId(component.composingId);
    const sensorData: any = await adtDataLink.fetchDataForNode(component.label);

    let title = "";
    title += "<b>Name:</b> " + component.label + "<br>";
    title += "<b>Type:</b> " + component.typeCode! + "<br>";
    title += "<b>Asset: </b>" + asset?.label + "<br>";
    switch (component.type) {
      case CivilDataComponentType.AirQualitySensor:
      case CivilDataComponentType.TemperatureSensor:
      case CivilDataComponentType.VibrationSensor:
      case CivilDataComponentType.TrafficSensor:
        if (sensorData && sensorData.hasOwnProperty("observationLabel1")) {
          const value1: string = sensorData.observationValue1.toFixed(2);
          title += "<b>" + sensorData.observationLabel1 + ": </b>" + value1 + " " + sensorData.observationUnit1 + "<br>";
        }
        if (sensorData && sensorData.hasOwnProperty("observationLabel2")) {
          const value2: string = sensorData.observationValue2.toFixed(2);
          title += "<b>" + sensorData.observationLabel2 + ": </b>" + value2 + " " + sensorData.observationUnit2 + "<br>";
        }
        break;
    }

    const div = document.createElement("div");
    div.innerHTML = title;
    this.title = div;
  }

  /** Create a new SensorMarker */
  constructor(public component: CivilComponentProps, image: HTMLImageElement, isFeatured: boolean) {
    super(
      {
        x: component.position ? component.position.x : 0,
        y: component.position ? component.position.y : 0,
        z: component.position ? component.position.z : 0,
      },
      { x: IMAGE_SIZE, y: IMAGE_SIZE },
    );

    this._doTooltipPolling = false;
    this._isFeatured = isFeatured;
    this._image = image;
    this.setImage(image);

    this.setScaleFactor({ low: 0.2, high: 1.4 }); // make size 20% at back of frustum and 140% at front of frustum (if camera is on)
    this._component = component;
  }

  /** Called when the mouse pointer moves over this Marker */
  public onMouseMove(_ev: BeButtonEvent): void {
  }

  /** Called when the mouse pointer leaves this Marker. */
  public onMouseLeave() {
    super.onMouseLeave();
    this._doTooltipPolling = false;
  }

  private async updateTooltipLoop(vp: ScreenViewport, viewPoint: Point3d) {
    while (this._doTooltipPolling === true) {
      // tslint:disable-next-line: no-floating-promises
      this.updateTooltip(this._component);
      if (this.title)
        vp.openToolTip(this.title, viewPoint, this.tooltipOptions);
      await BeDuration.wait(1000);
    }
  }

  /** Called when the mouse pointer enters this Marker. */
  public onMouseEnter(ev: BeButtonEvent) {
    this._doTooltipPolling = true;
    const viewPoint: Point3d = ev.viewPoint;
    const vp: ScreenViewport = ev.viewport as ScreenViewport;
    super.onMouseEnter(ev);

    // tslint:disable-next-line: no-floating-promises
    this.updateTooltipLoop(vp, viewPoint);
  }

  /** Show the cluster as a white circle with an outline */
  public drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS[this.status];
    ctx.fillStyle = this._isFeatured ? "cyan" : "white";
    ctx.lineWidth = this._isFeatured ? 5 : 3;
    ctx.arc(0, 0, this._isFeatured ? 25 : 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /** Open an image specified as a data URL in a new window/tab. Works around differences between browsers and Electron.
   * @param url The base64-encoded image URL.
   * @param title An optional title to apply to the new window.
   * @beta
   */
  public openImageDataUrlInNewWindow(url: string, title?: string): void {
    const newWindow = window.open(url, title);
    newWindow!.focus();
    if (!ElectronRpcConfiguration.isElectron) {
      newWindow!.onload = () => {
        const div = newWindow!.document.createElement("div");
        div.innerHTML = "<img src='" + url + "'/>";
        newWindow!.document.body.replaceWith(div);
        if (undefined !== title)
          newWindow!.document.title = title;
      };
    }
  }


  public onMouseButton(ev: BeButtonEvent): boolean {
    if (this._component.type === CivilDataComponentType.TrafficCamera) {
      const data = CivilDataModel.get();
      const asset = data.getComponentForId(this._component.composingId);
      this.openImageDataUrlInNewWindow("traffic-cam-image.jpg", asset!.label);
      return true;
    }

    if (
      BeButton.Data !== ev.button ||
      !ev.isDown ||
      !ev.viewport ||
      !ev.viewport.view.isSpatialView()
    )
      return true;
    // tslint:disable-next-line: no-floating-promises
    ((IModelApp as any).civilBrowser as CivilBrowser).markerClicked(this._component);
    // ev.viewport!.iModel.selectionSet.replace(this._component.id);
    return true; // Don't allow clicks to be sent to active tool...
  }
}

/** A Marker used to show a cluster of sensors. */
class SensorClusterMarker extends Marker {
  private _cluster: Cluster<SensorMarker>;
  private _maxStatus: number = 100;

  /** Create a new cluster marker */
  constructor(location: XYAndZ, size: XAndY, cluster: Cluster<SensorMarker>) {
    super(location, size);

    this._cluster = cluster;
    this._cluster.markers.forEach((marker) => {
      if (marker.status < this._maxStatus) this._maxStatus = marker.status;
    });
    this.label = cluster.markers.length.toLocaleString();
    this.labelColor = COLORS[this._maxStatus];
    this.labelFont = "bold 16px san-serif";
    const statusCounts: number[] = new Array<number>();
    for (let i: number = 0; i < STATUS_COUNT; i++) statusCounts[i] = 0;
    cluster.markers.forEach((marker) => {
      statusCounts[marker.status]++;
    });

    let title = "<table><caption><b>Status:</b></caption>";
    for (let i: number = 0; i < STATUS_COUNT; i++) {
      if (statusCounts[i])
        title +=
          "<tr><td>" +
          STATUS_TO_STRING[i] +
          "</td><td><b>" +
          statusCounts[i] +
          "<b></td></tr>";
    }
    title += "</table>";

    const div = document.createElement("div");
    div.innerHTML = title;
    this.title = div;
  }

  /** Show the cluster as a white circle with an outline */
  public drawFunc(ctx: CanvasRenderingContext2D) {
    ctx.beginPath();
    ctx.strokeStyle = COLORS[this._maxStatus];
    ctx.fillStyle = "white";
    ctx.lineWidth = 3;
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  public onMouseButton(ev: BeButtonEvent): boolean {
    if (
      BeButton.Data !== ev.button ||
      !ev.isDown ||
      !ev.viewport ||
      !ev.viewport.view.isSpatialView()
    )
      return true;

    const elementIds: any = [];
    const positions: Point3d[] = [];
    this._cluster.markers.forEach((marker) => {
      elementIds.push(marker.component.id);
      if (marker.component.position)
        positions.push(marker.component.position);
    });
    const vp = ev.viewport;
    if (0 < elementIds.length && vp) {
      vp.iModel.selectionSet.replace(elementIds);
      const range = Range3d.createArray(positions);
      range.expandInPlace(20);
      vp.zoomToVolume(range, { animateFrustumChange: true });

      IModelApp.notifications.clearToolTip();
    }
    return true; // Don't allow clicks to be sent to active tool...
  }
}

export class SensorMarkerSet extends MarkerSet<SensorMarker> {
  public minimumClusterSize = MIN_CLUSTER_SIZE;
  protected getClusterMarker(cluster: Cluster<SensorMarker>): Marker {
    return SensorClusterMarker.makeFrom(
      cluster.markers[0],
      cluster,
      cluster.markers[0].markerImage,
    );
  }
}

export class SensorMarkerSetDecoration {
  private _markerSet = new SensorMarkerSet();
  private _loading?: Promise<any>;
  private _images: Array<HTMLImageElement | undefined> = [];
  public static decorator?: SensorMarkerSetDecoration; // static variable so we can tell if the decorator is active.

  public constructor(sensors: CivilComponentProps[], featuredSensorId?: string) {
    this.loadAll(sensors, featuredSensorId); // tslint:disable-line: no-floating-promises
  }

  // load all images. After they're loaded, make the incident markers
  private async loadAll(sensors: CivilComponentProps[], featuredSensorId?: string) {
    const typeIndex = [
      CivilDataComponentType.AirQualitySensor,
      CivilDataComponentType.TemperatureSensor,
      CivilDataComponentType.VibrationSensor,
      CivilDataComponentType.TrafficSensor,
      CivilDataComponentType.TrafficCamera,
    ];
    const loads: any = [];
    typeIndex.forEach((type) => {
      loads.push(imageElementFromUrl(CivilDataModel.getIconForComponent(type)));
    });
    await (this._loading = Promise.all(loads)); // this is a member so we can tell if we're still loading
    for (const img of loads) {
      const image = await img;
      this._images.push(image);
    }
    this._loading = undefined;

    sensors.forEach((component) => {
      if (component.position === undefined ||
         (component.position.x === 0 &&
          component.position.y === 0 &&
          component.position.z === 0)) {
        // tslint:disable-next-line: no-console
        console.log("Missing position for element id: " + component.id);
      } else {
        let index = 0;
        typeIndex.forEach((type) => {
          if (component.type === type)
            this.addMarker(component, this._images[index]!,
              (featuredSensorId !== undefined && component.id === featuredSensorId));
          else
            index = index + 1;
        });
      }
    });
  }

  private addMarker(component: CivilComponentProps, image: HTMLImageElement, isFeatured: boolean) {
    const marker = new SensorMarker(component, image, isFeatured);
    this._markerSet.markers.add(marker);
  }

  /** We added this class as a ViewManager.decorator below. This method is called to ask for our decorations. We add the MarkerSet. */
  public decorate(context: DecorateContext): void {
    if (undefined !== this._loading) return;
    if (context.viewport.view.isSpatialView())
      this._markerSet.addDecoration(context);
  }

  /** Show markers (clear existing ones if any). */
  public static show(sensors: CivilComponentProps[], featuredSensorId?: string) {
    this.clear();
    // create the SensorMarkerSetDecoration object and add it as a ViewManager decorator.
    SensorMarkerSetDecoration.decorator = new SensorMarkerSetDecoration(sensors, featuredSensorId);
    IModelApp.viewManager.addDecorator(SensorMarkerSetDecoration.decorator!);
  }

  /** Stop showing markers if currently active. */
  public static clear() {
    if (undefined === SensorMarkerSetDecoration.decorator) return;
    IModelApp.viewManager.dropDecorator(SensorMarkerSetDecoration.decorator!);
    SensorMarkerSetDecoration.decorator = undefined;
  }

  /** Toggle display of markers on and off. */
  public static toggle(sensors: CivilComponentProps[]) {
    if (undefined === SensorMarkerSetDecoration.decorator)
      return this.show(sensors);
    this.clear();
  }
}
