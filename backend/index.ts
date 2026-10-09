// must stay first: modules below read process.env while they load
import 'dotenv/config';
import { app } from "./app";
import { connectDB } from "./utils/db";
import { ensureKafkaTopics, disconnectKafkaProducer } from "./services/kafka.service";
import { startOrderEventsConsumer, stopOrderEventsConsumer } from "./services/kafkaConsumer.service";
import { ensureUiConfigSeeded } from "./services/uiConfig.service";

connectDB();

// Create Kafka topics up front so the first upload doesn't race auto-creation.
ensureKafkaTopics().catch((err) =>
  console.error('[Kafka] Failed to ensure topics on startup:', err)
);

// order.paid -> Enrollment. Retries in the background, so the API stays up while Kafka is not.
startOrderEventsConsumer().catch((err) =>
  console.error('[Kafka] Failed to start the order events consumer:', err)
);

// First boot on an empty database: v1 of the UI config from config/ui/ui-config.default.json.
ensureUiConfigSeeded()
    .then((seeded) => seeded && console.log('[ui-config] Seeded v1 from the checked-in default'))
    .catch((err) => console.error('[ui-config] Seeding failed; serving the checked-in default:', err));

const PORT: any = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

const shutdown = async () => {
    await Promise.allSettled([stopOrderEventsConsumer(), disconnectKafkaProducer()]);
    server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
