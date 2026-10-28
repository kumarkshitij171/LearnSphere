package com.lms.order_service.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** The catalogue's facts at the moment of purchase; amountMinor is computed by the catalogue, never here. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CourseSnapshot(
        String id,
        String title,
        String currency,
        @JsonProperty("isPublished") boolean published,
        String instructorId,
        Long amountMinor) {
}
