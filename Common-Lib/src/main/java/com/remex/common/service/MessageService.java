package com.remex.common.service;

import com.remex.common.models.EventLog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Records audit events for the service. Events are written to the
 * application log (see EventLog) rather than published to an external
 * message broker.
 */
@Service
public class MessageService {

    private final Logger log = LoggerFactory.getLogger(MessageService.class);

    public void sendMessage(EventLog auditEvent) {
        log.info("MessageService :: audit event {}", auditEvent);
    }
}
