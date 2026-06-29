import dotenv from 'dotenv';
import { app } from "./app";
import { connectDB } from "./utils/db";
import { ensureKafkaTopics } from "./services/kafka.service";
dotenv.config();

connectDB();

// Create Kafka topics up front so the first upload doesn't race auto-creation.
ensureKafkaTopics().catch((err) =>
  console.error('[Kafka] Failed to ensure topics on startup:', err)
);

const PORT: any = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})
