# civil-iot

This repository demonstrates a powerful integration between Microsoft's Azure Digital Twin and Bentley iTwin technology platform.  It visualizes IoT sensor data in the context of a 3d physical model illustrating a roadway operations scenario.

[View our demo](https://www.youtube.com/watch?v=gDFXaOVBepI)

## Contents

There are three applications in this repository:

- Azure function - Listens to sensor data coming from an Azure IoTHub instance, computes a health score for relevant roadway assets, and writes all this information to an instance of Azure Digital Twins.  The deep dive video below has a code walkthough.

- Exporter - Queries the iModel and uses the contents to create a DTDL model for Azure Digital Twins and also produces the corresponding instance data.  The deep dive video has a code walkthough.

- Viewer - Embeds a custom iTwin Viewer that visualizes the 3D engineering model in context with terrain reality data.  Also inlcudes visualization of the live sensor data readings and computed asset health scores.  The deep dive video shows how to connect the iTwin Viewer to Azure Digital Twins and Azure Time Series Insights.

## Additional resources

- [Read about our experiences](https://medium.com/imodeljs/road-to-iot-15a6ce1c43e1)

- [Deep dive into how it works](https://www.youtube.com/watch?v=qhYt3bwtz14)

- [View the iModel.js Documentation](https://imodeljs.org)

- [View the Azure Digital Twins Documentation](https://docs.microsoft.com/en-us/azure/digital-twins/)
