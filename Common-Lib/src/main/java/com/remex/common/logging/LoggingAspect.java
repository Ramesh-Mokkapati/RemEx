package com.remex.common.logging;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.*;
import org.aspectj.lang.reflect.MethodSignature;
import org.eclipse.jetty.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Arrays;

@Aspect
@Component
public class LoggingAspect {
    private static final Logger logger = LoggerFactory.getLogger(LoggingAspect.class);
    private ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    @Pointcut("execution(* com.remex.RemExService.controllers..*(..))")
    public void applicationControllerMethods(){
    }

    @Before("applicationControllerMethods()")
    public void logBeforeMethod(JoinPoint joinPoint){
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Object [] args = joinPoint.getArgs();

        logger.info("Executing Method: {} in Class: {} with Arguments: {}", signature.getMethod().getName(),
                signature.getDeclaringTypeName(), Arrays.toString(args));
    }

    @AfterReturning(value = "applicationControllerMethods()", returning = "result")
    public void logAfterMethod(JoinPoint joinPoint, Object result) throws JsonProcessingException {
        String methodName = ((MethodSignature) joinPoint.getSignature()).getMethod().getName();
        try {
            if(result instanceof HttpStatus && result.equals(HttpStatus.FAILED_DEPENDENCY_424)){
                logger.error("Method {} returned HTTP 424 (Failed Dependency)", methodName);
            }
            else {
                logger.info("Method {} executed Successfully with Result: {}", methodName, objectMapper.writeValueAsString(result));
            }
        }
        catch (Exception e){
            try {
                logger.error("Method {} failed to logAfterMethod: {}", methodName, e.toString());
            }
            catch (Exception nestedException) {

            }
        }
    }

    @AfterThrowing(value = "applicationControllerMethods()", throwing = "exception")
    public void logAfterException(JoinPoint joinPoint, Exception exception){
        String methodName = ((MethodSignature) joinPoint.getSignature()).getMethod().getName();
        logger.error("Exception in Method: {} - Message: {}", methodName, exception.getMessage(), exception);
    }
}
