package com.lms.notification_service.controller;

import com.lms.notification_service.config.CorsConfig;
import com.lms.notification_service.exception.handlers.GlobalExceptionHandler;
import com.lms.notification_service.filters.ApiAuthFilter;
import com.lms.notification_service.filters.NotificationApiFilter;
import com.lms.notification_service.kafka.NotificationProducer;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.repository.DeadLetterRepository;
import com.lms.notification_service.repository.NotificationRepository;
import com.lms.notification_service.repository.TemplateRepository;
import com.lms.notification_service.security.AccessTokenVerifier;
import com.lms.notification_service.security.AuthProperties;
import com.lms.notification_service.service.InboxService;
import com.lms.notification_service.service.NotificationService;
import com.lms.notification_service.support.InMemoryStore;
import com.lms.notification_service.support.Tokens;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Real filter chain (CORS → tenant → auth) in front of the inbox and the admin history routes it sits beside. */
class InboxControllerTest {

    private static final String U1 = "Bearer " + Tokens.access("u1", "STUDENT");
    private static final String ADMIN = "Bearer " + Tokens.access("a1", "ADMIN");
    private static final long T0 = Instant.parse("2026-10-28T10:00:00Z").toEpochMilli();

    private final NotificationRepository repository = mock(NotificationRepository.class);
    private final NotificationService history = mock(NotificationService.class);
    private final InMemoryStore store = new InMemoryStore();
    private final JsonMapper json = JsonMapper.builder().build();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        store.wire(repository, mock(DeadLetterRepository.class), mock(TemplateRepository.class));
        AuthProperties props = new AuthProperties(Tokens.SECRET, "access_token", Tokens.INTERNAL_KEY);
        AccessTokenVerifier verifier = new AccessTokenVerifier(Tokens.SECRET, json, Clock.systemUTC());
        NotificationApiFilter tenant = new NotificationApiFilter();
        ReflectionTestUtils.setField(tenant, "defaultTenant", "learnsphere");
        mvc = MockMvcBuilders
                .standaloneSetup(new InboxController(new InboxService(repository)),
                        new NotificationController(mock(NotificationProducer.class), history))
                .setControllerAdvice(new GlobalExceptionHandler())
                .addFilters(new CorsConfig().corsFilter(List.of("http://localhost:3000")).getFilter(),
                        tenant, new ApiAuthFilter(verifier, props))
                .build();
    }

    private JsonNode inbox(String auth, String query) throws Exception {
        String body = mvc.perform(get("/api/v1/notifications/inbox" + query).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private static List<String> titles(JsonNode response) {
        List<String> titles = new java.util.ArrayList<>();
        response.path("items").forEach(item -> titles.add(item.path("title").asString()));
        return titles;
    }

    @Test
    void listsOnlyTheCallersInAppRowsNewestFirstWithTheUnreadCount() throws Exception {
        store.inboxRow("learnsphere", "u1", "old", T0);
        store.inboxRow("learnsphere", "u1", "read", T0 + 1000).setReadAt(T0 + 5000);
        Notification newest = store.inboxRow("learnsphere", "u1", "new", T0 + 2000);
        newest.setLink("/courses/c1");
        store.inboxRow("learnsphere", "u2", "someone else's", T0 + 3000);
        store.inboxRow("other-tenant", "u1", "another tenant", T0 + 3000);
        store.inboxRow("learnsphere", "u1", "an email", T0 + 3000).setChannel(ChannelType.EMAIL);
        store.inboxRow("learnsphere", "u1", "still retrying", T0 + 3000).setStatus(NotificationStatus.RETRYING);

        JsonNode response = inbox(U1, "");

        assertThat(titles(response)).containsExactly("new", "read", "old");
        assertThat(response.path("unread").asInt()).isEqualTo(2);
        JsonNode first = response.path("items").get(0);
        assertThat(first.propertyNames()).containsExactlyInAnyOrder(
                "id", "notificationId", "title", "body", "link", "createdAt", "readAt");
        assertThat(first.path("id").asString()).isEqualTo(newest.getId());
        assertThat(first.path("notificationId").asString()).isEqualTo(newest.getNotificationId());
        assertThat(first.path("body").asString()).isEqualTo("new body");
        assertThat(first.path("link").asString()).isEqualTo("/courses/c1");
        assertThat(first.path("createdAt").asString()).isEqualTo("2026-10-28T10:00:02Z");
        assertThat(first.get("readAt").isNull()).isTrue();
        assertThat(response.path("items").get(1).path("readAt").asString()).isEqualTo("2026-10-28T10:00:05Z");
        assertThat(response.path("items").get(2).get("link").isNull()).isTrue();
    }

    @Test
    void theTenantHeaderScopesTheInbox() throws Exception {
        store.inboxRow("learnsphere", "u1", "default tenant", T0);
        store.inboxRow("other-tenant", "u1", "another tenant", T0);
        String body = mvc.perform(get("/api/v1/notifications/inbox").header("Authorization", U1).header("x-tenant-id", "other-tenant"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(titles(json.readTree(body))).containsExactly("another tenant");
    }

    @Test
    void theLimitDefaultsTo30AndStaysWithin1To100() throws Exception {
        IntStream.range(0, 120).forEach(i -> store.inboxRow("learnsphere", "u1", "n" + i, T0 + i));
        assertThat(inbox(U1, "").path("items").size()).isEqualTo(30);
        assertThat(inbox(U1, "?limit=5").path("items").size()).isEqualTo(5);
        assertThat(inbox(U1, "?limit=500").path("items").size()).isEqualTo(100);
        assertThat(inbox(U1, "?limit=0").path("items").size()).isEqualTo(1);
        assertThat(inbox(U1, "?limit=5").path("unread").asInt()).isEqualTo(120);
        mvc.perform(get("/api/v1/notifications/inbox?limit=lots").header("Authorization", U1)).andExpect(status().isBadRequest());
    }

    @Test
    void marksTheGivenRowsReadButNeverSomeoneElses() throws Exception {
        Notification a = store.inboxRow("learnsphere", "u1", "a", T0);
        Notification b = store.inboxRow("learnsphere", "u1", "b", T0 + 1);
        Notification theirs = store.inboxRow("learnsphere", "u2", "theirs", T0 + 2);

        mvc.perform(post("/api/v1/notifications/inbox/read").header("Authorization", U1).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"%s\",\"%s\",\"no-such-id\"]}".formatted(a.getId(), theirs.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(1));

        assertThat(a.getReadAt()).isNotNull();
        assertThat(b.getReadAt()).isNull();
        assertThat(theirs.getReadAt()).isNull();
    }

    @Test
    void noIdsMarksEverythingTheCallerHasRead() throws Exception {
        for (String body : new String[]{"{}", "{\"ids\":[]}", "{\"ids\":null}", ""}) {
            store.clear();
            Notification mine = store.inboxRow("learnsphere", "u1", "mine", T0);
            Notification mineToo = store.inboxRow("learnsphere", "u1", "mine too", T0 + 1);
            Notification theirs = store.inboxRow("learnsphere", "u2", "theirs", T0 + 2);
            Notification otherTenant = store.inboxRow("other-tenant", "u1", "elsewhere", T0 + 3);

            var request = post("/api/v1/notifications/inbox/read").header("Authorization", U1);
            if (!body.isEmpty()) request.contentType(MediaType.APPLICATION_JSON).content(body);
            mvc.perform(request).andExpect(status().isOk()).andExpect(jsonPath("$.unread").value(0));

            assertThat(mine.getReadAt()).as(body).isNotNull();
            assertThat(mineToo.getReadAt()).as(body).isNotNull();
            assertThat(theirs.getReadAt()).as(body).isNull();
            assertThat(otherTenant.getReadAt()).as(body).isNull();
        }
    }

    @Test
    void anAlreadyReadRowKeepsItsFirstReadTime() throws Exception {
        Notification read = store.inboxRow("learnsphere", "u1", "read", T0);
        read.setReadAt(T0 + 10);
        mvc.perform(post("/api/v1/notifications/inbox/read").header("Authorization", U1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"ids\":[\"%s\"]}".formatted(read.getId()))).andExpect(status().isOk());
        assertThat(read.getReadAt()).isEqualTo(T0 + 10);
    }

    @Test
    void theInboxNeedsAUserToken() throws Exception {
        mvc.perform(get("/api/v1/notifications/inbox")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/notifications/inbox").header("Authorization", "Bearer forged.token.here"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/notifications/inbox/read").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        // the internal key is a service, not a person: no inbox to show it
        mvc.perform(get("/api/v1/notifications/inbox").header("x-tenant-id", "learnsphere").header("X-Internal-Api-Key", Tokens.INTERNAL_KEY))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/notifications/inbox/read").header("x-tenant-id", "learnsphere")
                        .header("X-Internal-Api-Key", Tokens.INTERNAL_KEY).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        verify(repository, never()).findAndSetReadAtByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNull(
                anyString(), anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void aMalformedBodyIsABadRequest() throws Exception {
        mvc.perform(post("/api/v1/notifications/inbox/read").header("Authorization", U1)
                .contentType(MediaType.APPLICATION_JSON).content("{\"ids\":")).andExpect(status().isBadRequest());
    }

    @Test
    void theInboxRouteDoesNotOpenTheAdminHistoryRoutes() throws Exception {
        store.inboxRow("learnsphere", "a1", "the admin's own", T0);
        store.inboxRow("learnsphere", "u1", "a student's", T0);
        // a literal "inbox" segment wins over /{notificationId}
        assertThat(titles(inbox(U1, ""))).containsExactly("a student's");
        assertThat(titles(inbox(ADMIN, ""))).containsExactly("the admin's own");
        verify(history, never()).history(anyString(), anyString());

        mvc.perform(get("/api/v1/notifications/n1").header("x-tenant-id", "learnsphere").header("Authorization", U1))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/notifications/inboxes").header("x-tenant-id", "learnsphere").header("Authorization", U1))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/notifications/inboxes").header("x-tenant-id", "learnsphere").header("Authorization", ADMIN))
                .andExpect(status().isNotFound());
        verify(history).history("learnsphere", "inboxes");
    }

    @Test
    void theBrowserCanPreflightTheInboxAndRead401s() throws Exception {
        mvc.perform(options("/api/v1/notifications/inbox/read").header("Origin", "http://localhost:3000")
                        .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(options("/api/v1/notifications/inbox").header("Origin", "http://localhost:3000")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
        mvc.perform(get("/api/v1/notifications/inbox").header("Origin", "http://localhost:3000"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
        mvc.perform(get("/api/v1/notifications/inbox").header("Origin", "http://localhost:3000").header("Authorization", U1))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"));
    }
}
