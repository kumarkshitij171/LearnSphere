package com.lms.notification_service.models.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/** Inbox row ids to mark read; absent or empty marks every unread row. Only the caller's rows are touched. */
@Data
public class InboxReadRequest {
    @Size(max = 500, message = "at most 500 ids per request")
    private List<String> ids;
}
