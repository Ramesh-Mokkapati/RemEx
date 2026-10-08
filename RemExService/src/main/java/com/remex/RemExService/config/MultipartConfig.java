package com.remex.RemExService.config;

import javax.servlet.http.HttpServletRequest;
import org.apache.commons.fileupload.FileUploadBase;
import org.apache.commons.fileupload.servlet.ServletRequestContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.multipart.commons.CommonsMultipartResolver;

/**
 * Replaces Jetty's default multipart resolver (MultiPartInputStreamParser) with
 * CommonsMultipartResolver backed by Apache Commons FileUpload.
 *
 * Jetty's MultiPartInputStreamParser reads the HTTP request body through a
 * character-encoding-aware reader for boundary detection, which corrupts binary
 * file uploads (ZIP, EXE, DLL, etc.) by mangling bytes outside the ASCII range.
 *
 * Apache Commons FileUpload reads the body as raw bytes throughout, making it
 * safe for any binary content regardless of size or encoding.
 */
@Configuration
public class MultipartConfig {

    private static final long MAX_UPLOAD_SIZE = 500L * 1024 * 1024; // 500 MB

    @Bean(name = "multipartResolver")
    public CommonsMultipartResolver multipartResolver() {
        CommonsMultipartResolver resolver = new CommonsMultipartResolver() {
            /**
             * The default implementation only considers POST requests as multipart.
             * Override to also support PUT (used by PUT /vrecthumbnail for saving
             * user-selected thumbnails into VREC files).
             */
            @Override
            public boolean isMultipart(HttpServletRequest request) {
                String method = request.getMethod();
                if (!"POST".equalsIgnoreCase(method) && !"PUT".equalsIgnoreCase(method)) {
                    return false;
                }
                // Use FileUploadBase.isMultipartContent (content-type check only)
                // instead of ServletFileUpload.isMultipartContent which rejects
                // non-POST methods internally, breaking PUT multipart uploads.
                return FileUploadBase.isMultipartContent(new ServletRequestContext(request));
            }
        };
        resolver.setMaxUploadSize(MAX_UPLOAD_SIZE);
        resolver.setMaxUploadSizePerFile(MAX_UPLOAD_SIZE);
        // Keep in-memory threshold at 0 so large files are always streamed to disk
        // rather than buffered in heap, avoiding OutOfMemoryError on large uploads.
        resolver.setMaxInMemorySize(0);
        return resolver;
    }
}
