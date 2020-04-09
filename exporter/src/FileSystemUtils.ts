
import { IModelJsFs } from "@bentley/imodeljs-backend";
import * as path from "path";

/** Utilities for managing and writing to files. */
export class FileSystemUtils {
  /** Build the filePath and then remove it if the file exists. */
  public static prepareFile(dirName: string, fileBaseName: string): string {
    const filePath: string = path.join(dirName, fileBaseName);
    if (IModelJsFs.existsSync(filePath)) {
      IModelJsFs.removeSync(filePath);
    }
    return filePath;
  }

  /** Write the specified line and a newline character to the specified output file. */
  public static writeLine(outputFileName: string, line: string, indentLevel: number = 0): void {
    if (indentLevel > 0) {
      for (let i = 0; i < indentLevel; i++) { IModelJsFs.appendFileSync(outputFileName, "  "); }
    }
    IModelJsFs.appendFileSync(outputFileName, line);
    IModelJsFs.appendFileSync(outputFileName, "\n");
  }

  /** Write stringified JSON to the specified file. */
  public static writeJsonFile(dirName: string, fileBaseName: string, json: any): void {
    const filePath: string = this.prepareFile(dirName, fileBaseName);
    FileSystemUtils.writeLine(filePath, JSON.stringify(json, undefined, 2));
  }
}
