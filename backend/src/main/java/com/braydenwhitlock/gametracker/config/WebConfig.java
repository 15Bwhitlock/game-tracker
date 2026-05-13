package com.braydenwhitlock.gametracker.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.ResourceResolver;
import org.springframework.web.servlet.resource.ResourceResolverChain;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ClassPathResource;

import java.io.IOException;
import java.util.List;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // PATCH must be listed explicitly — browsers send a preflight OPTIONS request
        // before PATCH calls, and Spring rejects it if the method isn't whitelisted,
        // returning a CORS error instead of a proper HTTP response.
        registry.addMapping("/api/**")
                .allowedOrigins("http://localhost:4200")
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*");
    }

    /**
     * Forward non-API, non-asset requests to index.html so Angular's client-side
     * router handles them after a hard refresh or direct URL entry.
     */
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .resourceChain(true)
                .addResolver(new ResourceResolver() {
                    @Override
                    public Resource resolveResource(HttpServletRequest request, String requestPath,
                                                    List<? extends Resource> locations, ResourceResolverChain chain) {
                        Resource resource = chain.resolveResource(request, requestPath, locations);
                        if (resource != null) return resource;
                        // Fall back to index.html for Angular routes
                        try {
                            Resource index = new ClassPathResource("static/index.html");
                            return index.exists() ? index : null;
                        } catch (Exception e) {
                            return null;
                        }
                    }

                    @Override
                    public String resolveUrlPath(String resourcePath, List<? extends Resource> locations,
                                                 ResourceResolverChain chain) {
                        return chain.resolveUrlPath(resourcePath, locations);
                    }
                });
    }
}
