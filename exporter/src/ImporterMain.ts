import { IModelHost, IModelJsFs, SnapshotDb, BriefcaseManager } from "@bentley/imodeljs-backend";
import * as path from "path";
import { SensorImporter } from "./SensorImporter";

async function main(process: NodeJS.Process): Promise<void> {
  try {
    IModelHost.startup();

    const outputDir = path.join(__dirname, "out");
    if (IModelJsFs.existsSync(outputDir)) {
      IModelJsFs.removeSync(outputDir);
    }
    IModelJsFs.mkdirSync(outputDir);

    let iModelDb: SnapshotDb;
    let inputDataFile: string;
    if (false) {
      inputDataFile = path.join(__dirname, "assets", "sample-input.json");
      const iModelFileName = path.join(outputDir, "sensor-sample.bim");
      iModelDb = SnapshotDb.createEmpty(iModelFileName, {
        rootSubject: { name: "Sensor Sample" },
        createClassViews: true,
      });
    } else {
      inputDataFile = path.join(__dirname, "assets", "coffs-harbour-augmented.json");
      const seedDbFile = "d:/data/bim/Coffs-Harbour-Pacific-Bypass-Snapshot.bim";
      const seedDb: SnapshotDb = SnapshotDb.openFile(seedDbFile);
      const iModelFileName = path.join(outputDir, "coffs-harbour-augmented.bim");
      iModelDb = SnapshotDb.createFrom(seedDb, iModelFileName, { createClassViews: true });
      BriefcaseManager.createStandaloneChangeSet(iModelDb); // WIP
      seedDb.close();
    }
    const importer = new SensorImporter(iModelDb);
    const iotSchemaFile = path.join(__dirname, "assets", "IoTDevices.ecschema.xml");
    const roadNetworkSchemaFile = path.join(__dirname, "assets", "RoadNetworkComposition.ecschema.xml");
    await importer.import([iotSchemaFile, roadNetworkSchemaFile], inputDataFile);
    iModelDb.close();

    IModelHost.shutdown();

  } catch (error) {
    process.stdout.write(error.message + "\n" + error.stack);
  }
}

if (require.main === module) { // Invoke main if Main.js is being run directly
  main(process); // tslint:disable-line: no-floating-promises
}
