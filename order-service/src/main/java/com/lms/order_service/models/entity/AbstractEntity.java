package com.lms.order_service.models.entity;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Transient;
import lombok.Getter;
import org.springframework.data.domain.Persistable;

import java.time.Instant;
import java.util.UUID;

/**
 * Ids are assigned in code, so Spring Data cannot infer "new" from a null id: without
 * {@link Persistable} every save of a fresh entity is a merge into a copy, and later changes to the
 * original instance are silently lost.
 */
@Getter
@MappedSuperclass
public abstract class AbstractEntity implements Persistable<UUID> {

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Transient
    private boolean fresh = true;

    @Override
    public boolean isNew() {
        return fresh;
    }

    @PrePersist
    protected void entityCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void entityUpdate() {
        updatedAt = Instant.now();
    }

    @PostPersist
    @PostLoad
    protected void markPersisted() {
        fresh = false;
    }
}
