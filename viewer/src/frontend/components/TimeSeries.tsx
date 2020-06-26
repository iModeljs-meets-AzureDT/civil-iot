import TsiClient from "tsiclient";
import { AzureAuth } from "../api/AzureToken";
import { FrontstageManager, StagePanelState } from "@bentley/ui-framework";

const EnvironmentFqdn = "5d9c572a-aa3f-43c4-b3a7-a6e0ba79eb71.env.timeseries.azure.com";

export class TimeSeries {

  private static tsiClient = new TsiClient();
  private static lineChart: any = null;

  public static async showTsiDataForNode(_dtId: string) {
    const aggregateExpressions: any[] = [];
    const now = new Date();
    var startDate = new Date(now.valueOf() - 1000*60*60*1);
    var searchSpan = { from: startDate, to: now, bucketSize: '20s' };
    aggregateExpressions.push(
      new this.tsiClient.ux.AggregateExpression(
        {predicateString: `[cloudEvents:subject].String = '${_dtId}'`},
        {property: 'patch.value', type: "Double"},
        ['avg', 'min', 'max'],
        searchSpan,
        null,  // split by property
        {color:'#00B294', includeEnvelope: false, alias: 'Node Reading'}));

    const result = await this.tsiClient.server.getAggregates(await AzureAuth.getTsiToken(), EnvironmentFqdn, aggregateExpressions.map(function(ae){return ae.toTsx()}));
    if (result[0] && result[0].measures.length > 0) this.displayTsiGraph(result, aggregateExpressions)
  }

  private static displayTsiGraph(result: any, aggregateExpressions: any) {
    FrontstageManager.activeFrontstageDef!.bottomPanel!.panelState = StagePanelState.Open;

    var transformedResult = this.tsiClient.ux.transformAggregatesForVisualization(result, aggregateExpressions);
    const diagram = document.getElementById('diagramDIV');
    this.lineChart = !this.lineChart ? this.tsiClient.ux.LineChart(diagram) : this.lineChart;
    this.lineChart.render(transformedResult, {theme: 'light', legend: 'compact',  grid: true, tooltip: true}, aggregateExpressions);
  }
}
