/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { EmphasizeElements, Viewport } from "@bentley/imodeljs-frontend";
import { ColorDef } from "@bentley/imodeljs-common";

export class EmphasizeAssets {

  public static clearColorize(vp: Viewport) {
    const emph = EmphasizeElements.getOrCreate(vp);
    emph.clearOverriddenElements(vp);
  }

  public static colorize(ids: string[], color: ColorDef, vp: Viewport) {
    const emph = EmphasizeElements.getOrCreate(vp);
    emph.wantEmphasis = true;
    emph.overrideElements(ids, vp, color);
  }

  public static clearEmphasize(vp: Viewport) {
    const emph = EmphasizeElements.getOrCreate(vp);
    emph.clearEmphasizedElements(vp);
  }

  public static emphasize(ids: string[], vp: Viewport) {
    const emph = EmphasizeElements.getOrCreate(vp);
    emph.wantEmphasis = true;
    emph.emphasizeElements(ids, vp);
  }
}
