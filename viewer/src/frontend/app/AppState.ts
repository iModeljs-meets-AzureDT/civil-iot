/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createStore, combineReducers, Store } from "redux";
import { FrameworkState, FrameworkReducer, createAction, ActionsUnion, DeepReadonly } from "@bentley/ui-framework";

export interface CivilViewerAppState {
  sensorLocations?: any[];
}

const initialState: CivilViewerAppState = {};

export const CivilViewerAppActions = {
  setSensorLocations: (sensorLocations: any[]) =>
    createAction("SampleApp:SET_SENSOR_LOCATIONS", { sensorLocations }),
};

export type CivilViewerAppActionsUnion = ActionsUnion<
  typeof CivilViewerAppActions
>;

function CivilViewerAppReducer(
  state: CivilViewerAppState = initialState,
  action: CivilViewerAppActionsUnion,
): DeepReadonly<CivilViewerAppState> {
  switch (action.type) {
    case "SampleApp:SET_SENSOR_LOCATIONS":
      return { ...state, sensorLocations: action.payload.sensorLocations };
  }

  return state;
}

// React-redux interface stuff
export interface RootState {
  civilViewerAppState: CivilViewerAppState;
  frameworkState?: FrameworkState;
}

// React-redux interface stuff
export interface RootState {
  civilViewerAppState: CivilViewerAppState;
  frameworkState?: FrameworkState;
}

export type AppStore = Store<RootState>;

/**
 * Centralized state management class using  Redux actions, reducers and store.
 */
export class AppState {
  private _store: AppStore;
  private _rootReducer: any;

  constructor() {
    // this is the rootReducer for the sample application.
    this._rootReducer = combineReducers<RootState>({
      civilViewerAppState: CivilViewerAppReducer,
      frameworkState: FrameworkReducer,
    } as any);

    // create the Redux Store.
    this._store = createStore(this._rootReducer,
      (window as any).__REDUX_DEVTOOLS_EXTENSION__ && (window as any).__REDUX_DEVTOOLS_EXTENSION__());
  }

  public get store(): Store<RootState> {
    return this._store;
  }

}
