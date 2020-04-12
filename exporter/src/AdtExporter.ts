import { DbResult, GuidString, Id64String, IModelStatus, Logger, LogLevel } from "@bentley/bentleyjs-core";
import { ECSqlStatement, Element, IModelDb, IModelJsFs, PhysicalObject } from "@bentley/imodeljs-backend";
import { ElementProps, GeometricElement3dProps, IModelError, TypeDefinitionElementProps } from "@bentley/imodeljs-common";
import { FileSystemUtils } from "./FileSystemUtils";
import { ObservationTypeProps } from "./IoTDevices";
import { CompositionItemProps } from "./RoadNetworkComposition";

const loggerCategory = "AdtExporter";

interface AdtPropertyDefProps {
  "@type": "Property";
  "name": string;
  "schema": string;
}

interface AdtRelationshipDefProps {
  "@type": "Relationship";
  "name": string;
  "target": string;
}

interface AdtTelemetryDefProps {
  "@type": "Telemetry";
  "name": string;
  "schema": string;
}

type AdtMemberDefProps = AdtPropertyDefProps | AdtRelationshipDefProps | AdtTelemetryDefProps;

interface AdtTypeProps {
  "@id": string;
  "@type": "Interface";
  "@context": "http://azure.com/v3/contexts/Model.json";
  "displayName": string;
  "contents": AdtMemberDefProps[];
  "extends"?: string[];
}

/** The base properties required by all AdtInstances. */
interface AdtInstanceProps {
  $dtId: string; // Element.CodeValue
  name: string; // Element.UserLabel or Element.CodeValue
  $metadata: { $model: string };
}

/** The properties in common with all AdtPhysicalObjects */
interface AdtPhysicalObjectProps extends AdtInstanceProps {
  instanceId: Id64String; // Element.ECInstanceId
  federationGuid?: GuidString; // Element.FederationGuid
}

/** An AdtSensorInstance is a physical devices that records observations relative to a physical asset. */
interface AdtSensorInstanceProps extends AdtPhysicalObjectProps {
  type: string; // SensorType.CodeValue
  deviceId: string; // Must match IoT Hub
  observes: string; // urn for target of SensorObservesElement
  observationLabel1: string; // First SensorTypeHasObservationTypes.CodeValue
  observationUnit1: string; // First SensorTypeHasObservationTypes.Unit
  observationValue1?: number; // From IoT Hub
  observationLabel2?: string; // Optional second SensorTypeHasObservationTypes.CodeValue
  observationUnit2?: string; // Optional second SensorTypeHasObservationTypes.Unit
  observationValue2?: number; // From IoT Hub
}

/** An AdtPhysicalAsset is an AdtPhysicalObject worth tracking and observing with sensors. */
interface AdtPhysicalAssetProps extends AdtPhysicalObjectProps {
  classification: string;
  computedHealth: number;
}

export class AdtExporter {
  public iModelDb: IModelDb;
  public outputDir: string;

  public constructor(iModelDb: IModelDb, outputDir: string) {
    this.iModelDb = iModelDb;
    this.outputDir = outputDir;
    if (!IModelJsFs.existsSync(this.outputDir)) {
      IModelJsFs.mkdirSync(this.outputDir);
    }
    // initialize logging
    if (true) {
      Logger.initializeToConsole();
      Logger.setLevelDefault(LogLevel.Error);
      Logger.setLevel(loggerCategory, LogLevel.Trace);
    }
  }

  public exportAll(): void {
    this.exportAdtTypes();
    this.exportAdtInstances();
  }

  public exportAdtTypes(): void {
    const physicalObjectClassName: string = PhysicalObject.className;
    const physicalObjectClass: AdtTypeProps = this.createAdtType(physicalObjectClassName, [
      // The $dtId of the ADT instance will be the Element.CodeValue
      { "@type": "Property", "schema": "string", "name": "name" }, // Element.getDisplayLabel
      { "@type": "Property", "schema": "string", "name": "instanceId" }, // Element.ECInstanceId
      { "@type": "Property", "schema": "string", "name": "federationGuid" }, // Element.FederationGuid
    ]);
    const sensorClass: AdtTypeProps = this.createAdtType("Sensor", [
      { "@type": "Property", "schema": "string", "name": "type" }, // SensorType.CodeValue
      { "@type": "Property", "schema": "string", "name": "deviceId" }, // deviceId in IoT Hub
      { "@type": "Relationship", "target": this.buildAdtTypeUrn(physicalObjectClassName), "name": "observes" }, // SensorObservesElement
      // WIP: should be an array of ObservationTypes!
      { "@type": "Property", "schema": "string", "name": "observationLabel1" }, // First SensorTypeHasObservationTypes.CodeValue
      { "@type": "Property", "schema": "string", "name": "observationUnit1" }, // First SensorTypeHasObservationTypes.Unit
      { "@type": "Telemetry", "schema": "double", "name": "observationValue1" }, // From IoT Hub
      { "@type": "Property", "schema": "string", "name": "observationLabel2" }, // Second SensorTypeHasObservationTypes.CodeValue
      { "@type": "Property", "schema": "string", "name": "observationUnit2" }, // Second SensorTypeHasObservationTypes.Unit
      { "@type": "Telemetry", "schema": "double", "name": "observationValue2" }, // From IoT Hub
    ], physicalObjectClassName);
    const compositionClasses: AdtTypeProps[] = this.createCompositionTypes(physicalObjectClassName);
    FileSystemUtils.writeJsonFile(this.outputDir, "adt-types.json", [physicalObjectClass, sensorClass].concat(compositionClasses));
  }

  private createCompositionTypes(baseClassName: string): AdtTypeProps[] {
    const sql = "SELECT DISTINCT ECClassId FROM RoadNetworkComposition:CompositionItem";
    const compositionTypeNames: string[] = this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): string[] => {
      const classNames: string[] = [];
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        classNames.push(statement.getValue(0).getClassNameForClassId().split(".")[1]);
      }
      return classNames;
    });
    return compositionTypeNames.map((compositionTypeName: string) => {
      return this.createAdtType(compositionTypeName, [
        { "@type": "Property", "schema": "string", "name": "classification" }, // CompositionItem.Classification
        { "@type": "Property", "schema": "double", "name": "computedHealth" }, // Computed by an Azure Function in ADT
      ], baseClassName);
    });
  }

  public exportAdtInstances(): void {
    // write adtInstances as JSON
    const adtInstances: AdtInstanceProps[] = this.createAdtInstances();
    FileSystemUtils.writeJsonFile(this.outputDir, "adt-instances.json", adtInstances);
    // write create scripts
    const outputFileName: string = FileSystemUtils.prepareFile(this.outputDir, `create-adt-instances.txt`);
    adtInstances.forEach((adtInstance: AdtInstanceProps) => {
      FileSystemUtils.writeLine(outputFileName, this.buildCreateAdtInstanceUrl(adtInstance));
      FileSystemUtils.writeLine(outputFileName, JSON.stringify(this.buildMetaDataString(adtInstance)));
      const addScript = Object.entries(adtInstance).map((entry: [string, any]) => {
        return {
          op: "add",
          path: `/${entry[0]}`,
          value: entry[1],
        };
      }).filter((item) => {
        return !item.path.startsWith("/$") && item.value;
      });
      FileSystemUtils.writeLine(outputFileName, JSON.stringify(addScript, undefined, 2));
      FileSystemUtils.writeLine(outputFileName, "");
    });
  }

  private buildCreateAdtInstanceUrl(adtInstance: AdtInstanceProps): string {
    return `https://$adtApiHostName/digitaltwins/${adtInstance.$dtId}?api-version=$adtApiVersion`;
  }

  private buildMetaDataString(adtInstance: AdtInstanceProps): any {
    return { $metadata: adtInstance.$metadata };
  }

  public createAdtInstances(): AdtInstanceProps[] {
    const adtInstances: AdtInstanceProps[] = [];
    // PhysicalAsset instances
    const observedSql = "SELECT DISTINCT TargetECInstanceId FROM IoTDevices:SensorObservesElement";
    this.iModelDb.withPreparedStatement(observedSql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const observedElementId: Id64String = statement.getValue(0).getId();
        const observedElementProps: CompositionItemProps = this.iModelDb.elements.getElementProps(observedElementId);
        const observedObject: AdtPhysicalAssetProps = this.createAdtPhysicalObject(observedElementProps) as AdtPhysicalAssetProps;
        observedObject.classification = observedElementProps.classification;
        observedObject.computedHealth = 0.0; // will be populated by the Azure Function on the ADT side
        adtInstances.push(observedObject);
      }
    });
    // Sensor instances
    const sensorSql = "SELECT ECInstanceId,TypeDefinition.Id FROM IoTDevices:Sensor ORDER BY ECInstanceId";
    this.iModelDb.withPreparedStatement(sensorSql, (statement: ECSqlStatement): void => {
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const sensorId: Id64String = statement.getValue(0).getId();
        const sensorTypeId: Id64String = statement.getValue(1).getId();
        const sensorTypeProps: TypeDefinitionElementProps = this.iModelDb.elements.getElementProps(sensorTypeId);
        const sensorProps: GeometricElement3dProps = this.iModelDb.elements.getElementProps(sensorId);
        const sensorInstance: AdtSensorInstanceProps = this.createAdtPhysicalObject(sensorProps) as AdtSensorInstanceProps;
        sensorInstance.type = sensorTypeProps.code.value!;
        if (sensorTypeProps.federationGuid && sensorProps?.jsonProperties?.iot?.sensorTypeIndex) {
          sensorInstance.deviceId = `${this.getSimulationId()}.${sensorTypeProps.federationGuid}.${sensorProps.jsonProperties.iot.sensorTypeIndex}`;
        }
        const observedElement: Element | undefined = this.queryObservedElement(sensorProps.id!);
        if (undefined !== observedElement) {
          sensorInstance.observes = this.buildAdtInstanceUrn(observedElement);
        }
        const observationTypes: ObservationTypeProps[] = this.queryObservationTypes(sensorTypeId);
        if (observationTypes.length > 0) {
          sensorInstance.observationLabel1 = observationTypes[0].code.value!;
          sensorInstance.observationUnit1 = observationTypes[0].unit;
          sensorInstance.observationValue1 = 0.0; // will come from IoT Hub
        }
        if (observationTypes.length > 1) {
          sensorInstance.observationLabel2 = observationTypes[1].code.value;
          sensorInstance.observationUnit2 = observationTypes[1].unit;
          sensorInstance.observationValue2 = 0.0; // will come from IoT Hub
        }
        // WIP: only the first two ObservationTypes are supported now
        adtInstances.push(sensorInstance);
      }
    });
    return adtInstances;
  }

  private createAdtType(className: string, memberDefs: AdtMemberDefProps[], baseClassName?: string): AdtTypeProps {
    return {
      "@id": this.buildAdtTypeUrn(className),
      "@type": "Interface",
      "@context": "http://azure.com/v3/contexts/Model.json",
      "displayName": className,
      "contents": memberDefs,
      "extends": baseClassName ? [this.buildAdtTypeUrn(baseClassName)] : undefined,
    };
  }

  private createAdtPhysicalObject(elementProps: ElementProps): AdtPhysicalObjectProps {
    return {
      $dtId: this.buildAdtInstanceUrn(elementProps),
      name: elementProps.userLabel ? elementProps.userLabel : elementProps.code.value!,
      instanceId: elementProps.id!,
      federationGuid: elementProps.federationGuid,
      $metadata: { $model: this.buildAdtTypeUrn(elementProps.classFullName.split(":")[1]) },
    };
  }

  private buildAdtTypeUrn(className: string): string {
    const versionNumber = 3; // needs to be incremented each time the schema changes after it has been uploaded to ADT
    const iModelId: string = "chb"; // hyphens seem to cause problems, so don't use a guid
    return `urn:adt:${iModelId}:${className}:${versionNumber}`;
  }

  private buildAdtInstanceUrn(elementProps: ElementProps): string {
    if ((undefined === elementProps.code.value) || ("" === elementProps.code.value)) {
      throw new IModelError(IModelStatus.InvalidCode, "A CodeValue is required for an ADT instance");
    }
    return elementProps.code.value;
  }

  private getSimulationId(): GuidString {
    // the identifier for the simulation in IoT Hub
    return "6a6cab04-c18f-4e37-a6e4-94928e32d36f";
  }

  private queryObservedElement(sensorId: Id64String): Element | undefined {
    const sql = "SELECT TargetECInstanceId FROM IoTDevices:SensorObservesElement WHERE SourceECInstanceId=:sensorId LIMIT 1";
    const elementId: Id64String | undefined = this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): Id64String | undefined => {
      statement.bindId("sensorId", sensorId);
      return DbResult.BE_SQLITE_ROW === statement.step() ? statement.getValue(0).getId() : undefined;
    });
    return elementId ? this.iModelDb.elements.getElement(elementId) : undefined;
  }

  private queryObservationTypes(sensorTypeId: Id64String): ObservationTypeProps[] {
    const observationTypes: ObservationTypeProps[] = [];
    const sql = "SELECT TargetECInstanceId FROM IoTDevices:SensorTypeHasObservationTypes WHERE SourceECInstanceId=:sensorTypeId";
    this.iModelDb.withPreparedStatement(sql, (statement: ECSqlStatement): void => {
      statement.bindId("sensorTypeId", sensorTypeId);
      while (DbResult.BE_SQLITE_ROW === statement.step()) {
        const observationTypeId: Id64String = statement.getValue(0).getId();
        const observationTypeProps: ObservationTypeProps = this.iModelDb.elements.getElementProps(observationTypeId);
        observationTypes.push(observationTypeProps);
      }
    });
    return observationTypes;
  }
}
