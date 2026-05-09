import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
    private kafka: Kafka;
    private producer: Producer;
    private readonly logger = new Logger(KafkaService.name);

    constructor(private config: ConfigService) {
        this.kafka = new Kafka({
            clientId: this.config.get('KAFKA_CLIENT_ID', 'lms-backend'),
            brokers: (this.config.get<string>('KAFKA_BROKERS', 'localhost:9092')).split(','),
        });
        this.producer = this.kafka.producer();
    }

    async onModuleInit() {
        await this.producer.connect();
        this.logger.log('Kafka producer connected');
    }

    async onModuleDestroy() {
        await this.producer.disconnect();
    }

    async emit(topic: string, key: string, payload: object) {
        await this.producer.send({
            topic,
            messages: [{ key, value: JSON.stringify(payload) }],
        });
    }
}
