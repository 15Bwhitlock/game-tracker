package com.braydenwhitlock.gametracker.bgg.xml;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlElementWrapper;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlProperty;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlRootElement;

import java.util.ArrayList;
import java.util.List;

/**
 * Maps the BGG XML API2 {@code /search} response. Shape:
 * <pre>{@code
 * <items total="3">
 *   <item type="boardgame" id="13">
 *     <name type="primary" value="Catan"/>
 *     <yearpublished value="1995"/>
 *   </item>
 * </items>
 * }</pre>
 */
@JacksonXmlRootElement(localName = "items")
@JsonIgnoreProperties(ignoreUnknown = true)
public class BggSearchResponse {

    @JacksonXmlProperty(localName = "item")
    @JacksonXmlElementWrapper(useWrapping = false)
    private List<Item> items = new ArrayList<>();

    public List<Item> getItems() { return items; }
    public void setItems(List<Item> items) { this.items = items != null ? items : new ArrayList<>(); }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {

        @JacksonXmlProperty(isAttribute = true)
        private Integer id;

        @JacksonXmlProperty(localName = "name")
        private BggValueAttr name;

        @JacksonXmlProperty(localName = "yearpublished")
        private BggValueAttr yearPublished;

        public Integer getId() { return id; }
        public void setId(Integer id) { this.id = id; }

        public BggValueAttr getName() { return name; }
        public void setName(BggValueAttr name) { this.name = name; }

        public BggValueAttr getYearPublished() { return yearPublished; }
        public void setYearPublished(BggValueAttr yearPublished) { this.yearPublished = yearPublished; }
    }
}
