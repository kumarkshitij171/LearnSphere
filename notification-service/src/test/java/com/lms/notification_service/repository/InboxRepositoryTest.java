package com.lms.notification_service.repository;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.entity.Notification;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import org.bson.Document;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.domain.Limit;
import org.springframework.data.mongodb.core.MongoOperations;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.convert.MappingMongoConverter;
import org.springframework.data.mongodb.core.convert.NoOpDbRefResolver;
import org.springframework.data.mongodb.core.index.IndexDefinition;
import org.springframework.data.mongodb.core.index.MongoPersistentEntityIndexResolver;
import org.springframework.data.mongodb.core.mapping.MongoMappingContext;
import org.springframework.data.mongodb.repository.support.MongoRepositoryFactory;

import java.util.List;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The inbox's derived queries: that they parse (always), and what Mongo does with them (NOTIFICATION_IT). */
class InboxRepositoryTest {

    private static final ChannelType IN_APP = ChannelType.IN_APP;
    private static final NotificationStatus SENT = NotificationStatus.SENT;
    private MongoClient client;

    @AfterEach
    void tearDown() {
        if (client != null) {
            client.getDatabase(database()).drop();
            client.close();
        }
    }

    @Test
    void everyQueryMethodParsesAgainstTheEntity() {
        // building the repository parses each derived query; a misspelt property would fail app startup
        MongoMappingContext context = new MongoMappingContext();
        MongoOperations operations = mock(MongoOperations.class);
        when(operations.getConverter()).thenReturn(new MappingMongoConverter(NoOpDbRefResolver.INSTANCE, context));
        assertThat(new MongoRepositoryFactory(operations).getRepository(NotificationRepository.class)).isNotNull();
    }

    @Test
    void theInboxIndexServesTheListQuery() {
        MongoMappingContext context = new MongoMappingContext();
        Iterable<? extends IndexDefinition> indexes = new MongoPersistentEntityIndexResolver(context)
                .resolveIndexFor(Notification.class);
        Document inbox = StreamSupport.stream(indexes.spliterator(), false)
                .filter(index -> "inbox_idx".equals(index.getIndexOptions().get("name")))
                .map(IndexDefinition::getIndexKeys)
                .findFirst().orElseThrow();
        assertThat(inbox.keySet()).containsExactly("tenantId", "userId", "channel", "createdAt");
        assertThat(inbox.get("createdAt")).isEqualTo(-1);
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "NOTIFICATION_IT", matches = "true")
    void onRealMongoTheCallerSeesAndMarksOnlyTheirOwnRows() {
        client = MongoClients.create(System.getenv().getOrDefault("MONGODB_URI",
                "mongodb://mongo:mongo123@localhost:27017/?authSource=admin"));
        MongoTemplate template = new MongoTemplate(client, database());
        NotificationRepository repo = new MongoRepositoryFactory(template).getRepository(NotificationRepository.class);

        Notification old = repo.save(row("learnsphere", "u1", IN_APP, SENT, 1_000));
        Notification mid = repo.save(row("learnsphere", "u1", IN_APP, SENT, 2_000));
        Notification newest = repo.save(row("learnsphere", "u1", IN_APP, SENT, 3_000));
        Notification theirs = repo.save(row("learnsphere", "u2", IN_APP, SENT, 4_000));
        repo.save(row("other", "u1", IN_APP, SENT, 5_000));
        repo.save(row("learnsphere", "u1", ChannelType.EMAIL, SENT, 6_000));
        repo.save(row("learnsphere", "u1", IN_APP, NotificationStatus.RETRYING, 7_000));

        List<Notification> listed = repo.findByTenantIdAndUserIdAndChannelAndStatusOrderByCreatedAtDesc(
                "learnsphere", "u1", IN_APP, SENT, Limit.of(2));
        assertThat(listed).extracting(Notification::getId).containsExactly(newest.getId(), mid.getId());
        assertThat(unread(repo)).isEqualTo(3);

        // ids from Mongo are ObjectIds: the string ids the API hands out must still match
        long marked = repo.findAndSetReadAtByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNullAndIdIn(
                "learnsphere", "u1", IN_APP, SENT, List.of(old.getId(), theirs.getId()), 42L);
        assertThat(marked).isEqualTo(1);
        assertThat(repo.findById(old.getId()).orElseThrow().getReadAt()).isEqualTo(42L);
        assertThat(repo.findById(old.getId()).orElseThrow().getUpdatedAt()).isEqualTo(42L);
        assertThat(repo.findById(theirs.getId()).orElseThrow().getReadAt()).isNull();
        assertThat(unread(repo)).isEqualTo(2);

        assertThat(repo.findAndSetReadAtByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNull(
                "learnsphere", "u1", IN_APP, SENT, 43L)).isEqualTo(2);
        assertThat(unread(repo)).isZero();
        assertThat(repo.findById(old.getId()).orElseThrow().getReadAt()).isEqualTo(42L);
        assertThat(repo.findById(theirs.getId()).orElseThrow().getReadAt()).isNull();
        assertThat(repo.countByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNull("other", "u1", IN_APP, SENT)).isEqualTo(1);
    }

    private static long unread(NotificationRepository repo) {
        return repo.countByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNull("learnsphere", "u1", IN_APP, SENT);
    }

    private static Notification row(String tenantId, String userId, ChannelType channel, NotificationStatus status, long createdAt) {
        Notification n = new Notification();
        n.setNotificationId("n-" + createdAt);
        n.setTenantId(tenantId);
        n.setUserId(userId);
        n.setChannel(channel);
        n.setStatus(status);
        n.setTitle("t" + createdAt);
        n.setCreatedAt(createdAt);
        n.setUpdatedAt(createdAt);
        return n;
    }

    private static String database() {
        return "notifications_it_inbox";
    }
}
