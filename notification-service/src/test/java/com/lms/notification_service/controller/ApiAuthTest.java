package com.lms.notification_service.controller;

import com.lms.notification_service.filters.ApiAuthFilter;
import com.lms.notification_service.filters.NotificationApiFilter;
import com.lms.notification_service.kafka.NotificationProducer;
import com.lms.notification_service.models.entity.DeviceToken;
import com.lms.notification_service.repository.DeviceTokenRepository;
import com.lms.notification_service.security.AccessTokenVerifier;
import com.lms.notification_service.security.AuthProperties;
import com.lms.notification_service.service.NotificationService;
import com.lms.notification_service.support.Tokens;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Real filter chain (tenant → auth) in front of real controllers. */
class ApiAuthTest {

    private final DeviceTokenRepository devices = mock(DeviceTokenRepository.class);
    private final NotificationProducer producer = mock(NotificationProducer.class);
    private MockMvc mvc;

    private static final String STUDENT = "Bearer " + Tokens.access("u1", "STUDENT");
    private static final String ADMIN = "Bearer " + Tokens.access("a1", "ADMIN");
    private static final String SEND_BODY = """
            {"userId":"u9","channels":["EMAIL"],"templateName":"order-receipt","target":{"email":"x@y.z"},"variables":{}}""";

    @BeforeEach
    void setUp() {
        AuthProperties props = new AuthProperties(Tokens.SECRET, "access_token", Tokens.INTERNAL_KEY);
        AccessTokenVerifier verifier = new AccessTokenVerifier(Tokens.SECRET, JsonMapper.builder().build(), Clock.systemUTC());
        NotificationApiFilter tenant = new NotificationApiFilter();
        ReflectionTestUtils.setField(tenant, "defaultTenant", "learnsphere");
        mvc = MockMvcBuilders
                .standaloneSetup(new DeviceController(devices), new NotificationController(producer, mock(NotificationService.class)))
                .addFilters(new com.lms.notification_service.config.CorsConfig()
                                .corsFilter(java.util.List.of("http://localhost:3000")).getFilter(),
                        tenant, new ApiAuthFilter(verifier, props))
                .build();
        when(devices.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void aSignedInUserRegistersADeviceForThemselvesOnly() throws Exception {
        when(devices.findByToken("fcm-1")).thenReturn(Optional.empty());
        mvc.perform(post("/api/v1/devices").header("Authorization", STUDENT).contentType(MediaType.APPLICATION_JSON)
                        // a userId smuggled into the body is ignored
                        .content("{\"token\":\"fcm-1\",\"platform\":\"WEB\",\"userId\":\"someone-else\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
        ArgumentCaptor<DeviceToken> saved = ArgumentCaptor.forClass(DeviceToken.class);
        verify(devices).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo("u1");
        // no X-Tenant-Id from the browser: device routes default it
        assertThat(saved.getValue().getTenantId()).isEqualTo("learnsphere");
    }

    @Test
    void devicesNeedASignedInUser() throws Exception {
        mvc.perform(post("/api/v1/devices").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"t\",\"platform\":\"WEB\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/devices").header("Authorization", "Bearer forged.token.here")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"t\",\"platform\":\"WEB\"}"))
                .andExpect(status().isUnauthorized());
        verify(devices, never()).save(any());
    }

    @Test
    void aUserCannotReadOrRemoveSomeoneElsesDevices() throws Exception {
        mvc.perform(get("/api/v1/devices/user/u2").header("Authorization", STUDENT)).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/devices/user/u2").header("Authorization", ADMIN)).andExpect(status().isOk());

        DeviceToken theirs = new DeviceToken();
        theirs.setUserId("u2");
        theirs.setToken("their-token");
        when(devices.findByToken("their-token")).thenReturn(Optional.of(theirs));
        mvc.perform(delete("/api/v1/devices/their-token").header("Authorization", STUDENT)).andExpect(status().isNoContent());
        assertThat(theirs.isActive()).isTrue();
        verify(devices, never()).save(any());
    }

    @Test
    void sendingIsForAdminsAndServicesOnly() throws Exception {
        mvc.perform(post("/api/v1/notifications").header("x-tenant-id", "learnsphere").header("Authorization", STUDENT)
                .contentType(MediaType.APPLICATION_JSON).content(SEND_BODY)).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/notifications").header("x-tenant-id", "learnsphere")
                .contentType(MediaType.APPLICATION_JSON).content(SEND_BODY)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/notifications").header("x-tenant-id", "learnsphere").header("X-Internal-Api-Key", "wrong")
                .contentType(MediaType.APPLICATION_JSON).content(SEND_BODY)).andExpect(status().isUnauthorized());
        verify(producer, never()).publish(any());

        mvc.perform(post("/api/v1/notifications").header("x-tenant-id", "learnsphere").header("Authorization", ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content(SEND_BODY)).andExpect(status().isAccepted());
        mvc.perform(post("/api/v1/notifications").header("x-tenant-id", "learnsphere").header("X-Internal-Api-Key", Tokens.INTERNAL_KEY)
                .contentType(MediaType.APPLICATION_JSON).content(SEND_BODY)).andExpect(status().isAccepted());
    }

    @Test
    void nonDeviceRoutesStillRequireATenant() throws Exception {
        mvc.perform(post("/api/v1/notifications").header("Authorization", ADMIN)
                .contentType(MediaType.APPLICATION_JSON).content(SEND_BODY)).andExpect(status().isUnauthorized());
        verify(producer, never()).publish(any());
    }

    @Test
    void theBrowserCanPreflightAndRead401sFromTheDeviceRoutes() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options("/api/v1/devices")
                        .header("Origin", "http://localhost:3000").header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Access-Control-Allow-Origin", "http://localhost:3000"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Access-Control-Allow-Credentials", "true"));
        mvc.perform(post("/api/v1/devices").header("Origin", "http://localhost:3000")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"t\",\"platform\":\"WEB\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header()
                        .string("Access-Control-Allow-Origin", "http://localhost:3000"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options("/api/v1/devices")
                        .header("Origin", "https://evil.example").header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }

    @Test
    void historyIsAdminOnly() throws Exception {
        mvc.perform(get("/api/v1/notifications/user/u1").header("x-tenant-id", "learnsphere").header("Authorization", STUDENT))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/notifications/user/u1").header("x-tenant-id", "learnsphere").header("Authorization", ADMIN))
                .andExpect(status().isOk());
    }
}
