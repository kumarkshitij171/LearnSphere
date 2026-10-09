package com.lms.order_service.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.lms.order_service.exception.ApiException;
import com.lms.order_service.models.domain.ErrorType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.function.Supplier;

/**
 * The only way this service learns about courses: the catalogue owner's internal API (backend today,
 * course-service after the split). An outage is a 503 to the buyer, never a guess at the price.
 */
@Slf4j
@Component
public class CatalogueClient {

    private final RestClient catalogueRestClient;

    @JsonIgnoreProperties(ignoreUnknown = true)
    record CourseEnvelope(boolean success, CourseSnapshot course) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record EnrollmentEnvelope(boolean success, boolean enrolled) {
    }

    public CatalogueClient(RestClient catalogueRestClient) {
        this.catalogueRestClient = catalogueRestClient;
    }

    public CourseSnapshot require(String courseId) {
        CourseEnvelope envelope = call(() -> catalogueRestClient.get()
                .uri("/api/v1/internal/courses/{courseId}", courseId)
                .retrieve()
                .body(CourseEnvelope.class), "course " + courseId);

        CourseSnapshot course = envelope == null ? null : envelope.course();
        if (course == null || course.amountMinor() == null || course.amountMinor() < 0
                || course.currency() == null || !course.currency().matches("[A-Z]{3}")) {
            log.error("Catalogue returned an unusable snapshot for course {}: {}", courseId, envelope);
            throw new ApiException(ErrorType.INTERNAL, "Course data is unavailable");
        }
        return course;
    }

    public boolean isEnrolled(String userId, String courseId) {
        EnrollmentEnvelope envelope = call(() -> catalogueRestClient.get()
                .uri("/api/v1/internal/enrollments/{userId}/{courseId}", userId, courseId)
                .retrieve()
                .body(EnrollmentEnvelope.class), "enrolment " + userId + "/" + courseId);
        return envelope != null && envelope.enrolled();
    }

    private <T> T call(Supplier<T> request, String what) {
        try {
            return request.get();
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == HttpStatus.NOT_FOUND.value()) {
                throw ApiException.notFound("Course not found");
            }
            if (e.getStatusCode().is5xxServerError()) {
                throw ApiException.providerTransient("We could not start your purchase, please try again", e);
            }
            // 401/403 here means our internal key is wrong: a deploy problem, not the buyer's
            log.error("Catalogue rejected the lookup for {} with {}", what, e.getStatusCode());
            throw new ApiException(ErrorType.INTERNAL, "Course data is unavailable", e);
        } catch (ResourceAccessException e) {
            log.warn("Catalogue unreachable for {}: {}", what, e.getMessage());
            throw ApiException.providerTransient("We could not start your purchase, please try again", e);
        }
    }
}
