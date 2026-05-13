package com.braydenwhitlock.gametracker.bgg.xml;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlProperty;

/**
 * BGG XML uses {@code <element value="..."/>} (and sometimes {@code type="..."}) shapes
 * for primitive-ish values. This is the common mapping for those.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class BggValueAttr {

    @JacksonXmlProperty(isAttribute = true)
    private String value;

    @JacksonXmlProperty(isAttribute = true)
    private String type;

    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
}
