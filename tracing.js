const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

// Configure OTLP exporter for HTTP
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://172.17.40.9:16318/v1/traces',
  headers: {
  },
});

// service resource attributes
const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'sidian-ussd-service',
  serviceVersion: process.env.OTEL_SERVICE_VERSION || '1.0.0',
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false,
      },
      '@opentelemetry/instrumentation-net': {
        enabled: false,
      },
      '@opentelemetry/instrumentation-dns': {
        enabled: false,
      },
      // Keep HTTP instrumentation for API calls
      '@opentelemetry/instrumentation-http': {
        enabled: true,
      },
      // Keep Redis instrumentation
      '@opentelemetry/instrumentation-ioredis': {
        enabled: false,
      },
    }),
  ],
});

// Initialize the SDK
sdk.start();

// Shutdown
process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down successfully'))
    .catch((error) => console.log('Error shutting down OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});

process.on('SIGINT', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down successfully'))
    .catch((error) => console.log('Error shutting down OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});


module.exports = sdk;
