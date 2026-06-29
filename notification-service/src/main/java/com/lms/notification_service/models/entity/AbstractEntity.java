package com.lms.notification_service.models.entity;

import com.lms.notification_service.utils.CommonUtils;
import lombok.Data;

@Data
public class AbstractEntity {

    private long createdAt;
    private long updatedAt;

    public void entityCreate(){
        setCreatedAt(CommonUtils.getCurrentTimeStamp());
        setUpdatedAt(CommonUtils.getCurrentTimeStamp());
    }

    public void entityUpdate(){
        setUpdatedAt(CommonUtils.getCurrentTimeStamp());
    }

}
