using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Azure.EventHubs;
using Microsoft.Azure.WebJobs;
using Microsoft.Extensions.Logging;
using ADTApi;
using ADTApi.Models;
using Microsoft.Rest;
using Microsoft.Azure.Services.AppAuthentication;
using System.Net.Http.Headers;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;

namespace Company.Function
{
    public class UpdateTwin
    {
        private const double TEMPERATURE_UPPER_LIMIT = 100;
        private const double CO_UPPER_LIMIT = 4.5;
        private const double NO2_UPPER_LIMIT = 50;
        private const double VEHICLE_UPPER_LIMIT = 800;
        private const double TRUCK_UPPER_LIMIT = 160;
        private const double VIBRATION_UPPER_LIMIT = 0.3;
        private const double DEFLECTION_UPPER_LIMIT = 12;
        
        private const bool flush = false;
        private static string adtAppId = "0b07f429-9f4b-4714-9392-cc5e8e80c8b0";
        private const string adtInstanceUrl = "https://coffsharbor.api.wus2.digitaltwins.azure.net";
        private static AzureDigitalTwinsAPIClient client;

        [FunctionName("UpdateTwin")]
        public static async Task Run([EventHubTrigger("iothub-wsgrp", Connection = "EventHubConnectionAppSetting")] EventData[] events, ILogger log)
        {
            var exceptions = new List<Exception>();

            if (client == null) await Authenticate(log);
            else
            {
                foreach (EventData eventData in events)
                {
                    try
                    {
                        if (!flush) {
                            string messageBody = Encoding.UTF8.GetString(eventData.Body.Array, eventData.Body.Offset, eventData.Body.Count);
                            JObject messageData = JObject.Parse(messageBody); 
                            string deviceId = eventData.SystemProperties["iothub-connection-device-id"].ToString();
                            await ProcessDataForDevice(messageData, deviceId, log);
                        }

                        await Task.Yield();
                    }
                    catch (Exception e)
                    {
                        // We need to keep processing the rest of the batch - capture this exception and continue.
                        // Also, consider capturing details of the message that failed processing so it can be processed again later.
                        exceptions.Add(e);
                        client = null;
                    }
                }

                // Once processing of the batch is complete, if any messages in the batch failed processing throw an exception so that there is a record of the failure.

                if (exceptions.Count > 1)
                    throw new AggregateException(exceptions);

                if (exceptions.Count == 1)
                    throw exceptions.Single();
            }
        }

        public async static Task Authenticate(ILogger log)
        {
            var azureServiceTokenProvider = new AzureServiceTokenProvider();
            string accessToken = await azureServiceTokenProvider.GetAccessTokenAsync(adtAppId);

            var wc = new System.Net.Http.HttpClient();
            wc.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

            try
            {
                TokenCredentials tk = new TokenCredentials(accessToken);
                client = new AzureDigitalTwinsAPIClient(tk)
                {
                    BaseUri = new Uri(adtInstanceUrl)
                };
                log.LogInformation($"Azure Digital Twins client connection created.");
            }
            catch (Exception)
            {
                log.LogError($"Azure Digital Twins client connection failed.");
            }
        }

        private async static Task ProcessDataForDevice(JObject messageData, string deviceId, ILogger log) {

            deviceId = deviceId.Substring(deviceId.IndexOf('.') + 1);
            string query = $"SELECT * FROM DigitalTwins T WHERE IS_OF_MODEL(T, 'dtmi:adt:chb:Sensor;1') AND T.deviceId = '{deviceId}'";
            IList<object> items = await executeQuery(query);

            double value1 = -1; double value2 = -1;

            if (messageData.ContainsKey("temperature")) {
                value1 = double.Parse((messageData["temperature"].ToString()));
            } else if (messageData.ContainsKey("no2")) {
                value1 = double.Parse((messageData["co"].ToString()));
                value2 = double.Parse((messageData["no2"].ToString()));
            }  else if (messageData.ContainsKey("vehicles")) {
                value1 = double.Parse((messageData["vehicles"].ToString()));
                value2 = double.Parse((messageData["trucks"].ToString()));
            }  else if (messageData.ContainsKey("accelerometer")) {
                value1 = double.Parse((messageData["deflection"].ToString()));
                value2 = double.Parse((messageData["accelerometer"].ToString()));
            }

            bool exists1 = (items.First() as JObject).ContainsKey("observationValue1");
            bool exists2 = (items.First() as JObject).ContainsKey("observationValue2");
            string dtId = (items.First() as JObject)["$dtId"].ToString();
            string observedNodeId = (items.First() as JObject)["observes"].ToString();

            JsonPatch patch = generatePatchForSensor(value1, exists1, value2, exists2);
            try { await client.DigitalTwins.UpdateAsync(dtId, patch.Document); } catch {}

            updateHigherLevelTwin(observedNodeId, log);           
        }

        private static async void updateHigherLevelTwin (string dtId, ILogger log) {
            string query = $"SELECT * FROM DigitalTwins T WHERE IS_OF_MODEL(T, 'dtmi:adt:chb:Sensor;1') AND T.observes = '{dtId}'";
            IList<object> items = await executeQuery(query);
            double maxPercentage = 0;

            foreach (JObject sensor in items)
            {
                if (sensor["type"].ToString().Equals("Interior Thermometer"))  {
                    double temperature = sensor.ContainsKey("observationValue1") ? double.Parse(sensor.GetValue("observationValue1").ToString()) : 0;
                    double percentage = temperature / TEMPERATURE_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                } else if (sensor["type"].ToString().Equals("Baseline Air Sensor")) {
                    double co = sensor.ContainsKey("observationValue1") ? double.Parse(sensor.GetValue("observationValue1").ToString()) : 0;
                    double percentage = co / CO_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                    double no2 = sensor.ContainsKey("observationValue2") ? double.Parse(sensor.GetValue("observationValue2").ToString()) : 0;
                    percentage = no2 / NO2_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                } else if (sensor["type"].ToString().Equals("Exterior Thermometer")) {
                    double temperature = sensor.ContainsKey("observationValue1") ? double.Parse(sensor.GetValue("observationValue1").ToString()) : 0;
                    double percentage = temperature / TEMPERATURE_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                } else if (sensor["type"].ToString().Equals("Tunnel Air Sensor")) {
                    double co = sensor.ContainsKey("observationValue1") ? double.Parse(sensor.GetValue("observationValue1").ToString()) : 0;
                    double percentage = co / CO_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                    double no2 = sensor.ContainsKey("observationValue2") ? double.Parse(sensor.GetValue("observationValue2").ToString()) : 0;
                    percentage = no2 / NO2_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                } else if (sensor["type"].ToString().Equals("Vehicle Counter")) {
                    double vehicleCount = sensor.ContainsKey("observationValue1") ? double.Parse(sensor.GetValue("observationValue1").ToString()) : 0;
                    double percentage = vehicleCount / VEHICLE_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                    double truckCount = sensor.ContainsKey("observationValue2") ? double.Parse(sensor.GetValue("observationValue2").ToString()) : 0;
                    percentage = truckCount / TRUCK_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                } else if (sensor["type"].ToString().Equals("Bridge Sensor")) {
                    double deflection = sensor.ContainsKey("observationValue1") ? double.Parse(sensor.GetValue("observationValue1").ToString()) : 0;
                    double percentage = deflection / DEFLECTION_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;
                    double vibration = sensor.ContainsKey("observationValue2") ? double.Parse(sensor.GetValue("observationValue2").ToString()) : 0;
                    percentage = vibration / VIBRATION_UPPER_LIMIT;
                    maxPercentage = (percentage > maxPercentage) ? percentage : maxPercentage;                    
                }
            }

            query = $"SELECT * FROM DigitalTwins T WHERE T.$dtId = '{dtId}'";
            items = await executeQuery(query);

            if (items.Count > 0) {
                bool exists = (items.First() as JObject).ContainsKey("computedHealth");
                if (exists) if (double.Parse(((items.First() as JObject)["computedHealth"]).ToString()) == (maxPercentage * 100)) return;
                log.LogInformation($"{adtInstanceUrl} COMPUTED HEALTH FOR {dtId}: {maxPercentage * 100}");
                JsonPatch patch = generatePatchForComponent(maxPercentage * 100, exists);
                try { await client.DigitalTwins.UpdateAsync(dtId, patch.Document); } catch {}
            }
        }

        private static JsonPatch generatePatchForSensor(double value1, bool exists1, double value2 = -1, bool exists2 = false) {
            JsonPatch patch = new JsonPatch();

            if (value1 >= 0) {
                if (exists1) patch.AppendReplaceOp("/observationValue1", value1);
                else patch.AppendAddOp("/observationValue1", value1);
            }

            if (value2 >= 0) {
                if (exists2) patch.AppendReplaceOp("/observationValue2", value2);
                else patch.AppendAddOp("/observationValue2", value2);
            }

            return patch;
        }

        private static JsonPatch generatePatchForComponent(double value, bool exists) {
            JsonPatch patch = new JsonPatch();

            if (exists) patch.AppendReplaceOp("/computedHealth", value);
            else patch.AppendAddOp("/computedHealth", value);

            return patch;
        }

        private static async Task<IList<object>> executeQuery(string query) {
            IList<object> items = new List<object>();
            try { 
                QueryResult result = await client.Query.QueryTwinsAsync(new QuerySpecification(query));
                items = result.Items;
             } catch {}
            return items;
        }
    }

    public class JsonPatch
    {
        private List<Dictionary<string,object>> ops = new List<Dictionary<string, object>>();
        public JsonPatch()
        {
            ops = new List<Dictionary<string, object>>();
        }

        public void AppendReplaceOp(string path, object value)
        {
            Dictionary<string, object> op = new Dictionary<string, object>();
            op.Add("op", "replace");
            op.Add("path", path);
            op.Add("value", value);
            ops.Add(op);
        }

        public void AppendAddOp(string path, object value)
        {
            Dictionary<string, object> op = new Dictionary<string, object>();
            op.Add("op", "add");
            op.Add("path", path);
            op.Add("value", value);
            ops.Add(op);
        }

        public void AppendRemoveOp(string path)
        {
            Dictionary<string, object> op = new Dictionary<string, object>();
            op.Add("op", "remove");
            op.Add("path", path);
            ops.Add(op);
        }

        public string Serialize() 
        {
            string jpatch = JsonConvert.SerializeObject(ops);
            return jpatch;
        }

        public object Document
        {
            get { return ops; }
        }
    }

}
