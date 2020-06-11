import TsiClient from "tsiclient";
import { AzureAuth } from "../api/AzureToken";

const EnvironmentFqdn = "5d9c572a-aa3f-43c4-b3a7-a6e0ba79eb71.env.timeseries.azure.com";

export class TimeSeries {

  private static tsiClient = new TsiClient();

  public static async showTsiDataForNode(dtId: string) {
    const aggregateExpressions: any[] = [];
    const now = new Date();
    // var endDate = new Date(now.valueOf() - 1000*60*60*15);
    var startDate = new Date(now.valueOf() - 1000*60*60*5);

    aggregateExpressions.push(
      new this.tsiClient.ux.AggregateExpression(
        {predicateString: `[cloudEvents:subject].String = '${dtId}'`},
        {property: 'patch.value', type: "Double"},
        ['avg', 'min', 'max'],
        { from: startDate, to: now, bucketSize: '1m' },
        null,  // split by property
        {color: 'pink', includeEnvelope: true, alias: dtId}));

    const result = await this.tsiClient.server.getAggregates(await AzureAuth.getTsiToken(), EnvironmentFqdn, aggregateExpressions.map(function(ae){return ae.toTsx()}));
    if (result[0] && result[0].measures.length > 0) this.displayTsiGraph(result, aggregateExpressions);
  }

  private static displayTsiGraph(result: any, aggregateExpressions: any) {
    var transformedResult = this.tsiClient.ux.transformAggregatesForVisualization(result, aggregateExpressions);
    const diagram = document.getElementById('diagramDIV');
    var lineChart = this.tsiClient.ux.LineChart(diagram);
    lineChart.render(transformedResult, {theme: 'light', legend: 'compact',  grid: true, tooltip: true}, aggregateExpressions);
  }

  private static triggerResize(timeoutMillis: number) {
    let resizeEvent = window.document.createEvent('UIEvents');
    (resizeEvent as any).initUIEvent('resize', true, false, window, 0);
    setTimeout(() => {window.dispatchEvent(resizeEvent); }, timeoutMillis);
  }
}
