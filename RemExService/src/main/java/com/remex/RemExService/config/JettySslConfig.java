package com.remex.RemExService.config;

import org.eclipse.jetty.server.*;
import org.eclipse.jetty.util.ssl.SslContextFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.embedded.jetty.JettyServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;

import java.io.File;

@Configuration
public class JettySslConfig {

    private final ResourceLoader resourceLoader;

    @Value("${app.use-https:false}")
    private boolean useHttps;

    @Value("${http.server.port:9007}")
    private int httpPort;

    @Value("${https.server.port:1443}")
    private int httpsPort;

    @Value("${rsms.service.ssl.key-store}")
    private String keyStore;

    @Value("${rsms.service.ssl.trust-store}")
    private String trustStore;

    @Value("${rsms.service.ssl.key-store-password}")
    private String keyStorePassword;

    @Value("${rsms.service.ssl.key-store-password}")
    private String trustStorePassword;

    public JettySslConfig(ResourceLoader resourceLoader) {
        this.resourceLoader = resourceLoader;
    }

    @Bean
    public WebServerFactoryCustomizer<JettyServletWebServerFactory> jettyCustomizer() {
        return factory -> factory.addServerCustomizers(server -> {
            try {
                if (useHttps) {
                    Resource keyStoreResource = resourceLoader.getResource(keyStore);
                    Resource trustStoreResource = resourceLoader.getResource(trustStore);

                    File keyStoreFile = keyStoreResource.getFile();
                    File trustStoreFile = trustStoreResource.getFile();

                    HttpConfiguration https = new HttpConfiguration();
                    https.addCustomizer(new SecureRequestCustomizer());

                    SslContextFactory.Server sslContextFactory = new SslContextFactory.Server();
                    sslContextFactory.setKeyStorePath(keyStoreFile.getAbsolutePath());
                    sslContextFactory.setKeyStorePassword(keyStorePassword);
                    sslContextFactory.setTrustStorePath(trustStoreFile.getAbsolutePath());
                    sslContextFactory.setTrustStorePassword(trustStorePassword);
                    sslContextFactory.setNeedClientAuth(true);

                    ServerConnector sslConnector = new ServerConnector(
                            server,
                            new SslConnectionFactory(sslContextFactory, "http/1.1"),
                            new HttpConnectionFactory(https)
                    );
                    sslConnector.setPort(httpsPort);
                    server.setConnectors(new Connector[]{sslConnector});

                    System.out.println("✅ HTTPS Jetty server running on port " + httpsPort);
                } else {
                    HttpConfiguration http = new HttpConfiguration();
                    ServerConnector httpConnector = new ServerConnector(server, new HttpConnectionFactory(http));
                    httpConnector.setPort(httpPort);
                    server.setConnectors(new Connector[]{httpConnector});
                }
            } catch (Exception e) {
                throw new RuntimeException("❌ Failed to configure Jetty server", e);
            }
        });
    }
}