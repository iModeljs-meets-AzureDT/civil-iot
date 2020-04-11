import { IModelHost, SnapshotDb } from "@bentley/imodeljs-backend";
import * as path from "path";
import { AdtExporter } from "./AdtExporter";
import { GenericExporter } from "./GenericExporter";

IModelHost.startup();

const outputDir = path.join(__dirname, "out");
// const iModelFileName = "d:/data/bim/CoffsHarborSnapshot.bim";
const iModelFileName = path.join(outputDir, "coffs-harbour-augmented.bim");
const iModelDb: SnapshotDb = SnapshotDb.openFile(iModelFileName);
const genericExporter = new GenericExporter(iModelDb, outputDir);
genericExporter.exportAll();
const adtExporter = new AdtExporter(iModelDb, outputDir);
adtExporter.exportAll();
iModelDb.close();

IModelHost.shutdown();
