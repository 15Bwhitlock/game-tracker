package com.braydenwhitlock.gametracker.bgg.xml;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlElementWrapper;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlProperty;
import com.fasterxml.jackson.dataformat.xml.annotation.JacksonXmlRootElement;

import java.util.ArrayList;
import java.util.List;

/**
 * Maps the BGG XML API2 {@code /thing?id=...&stats=1} response. Shape (abridged):
 * <pre>{@code
 * <items>
 *   <item type="boardgame" id="13">
 *     <thumbnail>https://...</thumbnail>
 *     <image>https://...</image>
 *     <name type="primary" value="Catan"/>
 *     <name type="alternate" value="Die Siedler von Catan"/>
 *     <description>...</description>
 *     <yearpublished value="1995"/>
 *     <minplayers value="3"/>
 *     <maxplayers value="4"/>
 *     <minplaytime value="60"/>
 *     <maxplaytime value="120"/>
 *     <link type="boardgamecategory" id="1015" value="Negotiation"/>
 *     <link type="boardgamemechanic" id="2040" value="Dice Rolling"/>
 *     <statistics><ratings><averageweight value="2.34"/></ratings></statistics>
 *   </item>
 * </items>
 * }</pre>
 */
@JacksonXmlRootElement(localName = "items")
@JsonIgnoreProperties(ignoreUnknown = true)
public class BggThingResponse {

    @JacksonXmlProperty(localName = "item")
    @JacksonXmlElementWrapper(useWrapping = false)
    private List<Item> items = new ArrayList<>();

    public List<Item> getItems() { return items; }
    public void setItems(List<Item> items) { this.items = items != null ? items : new ArrayList<>(); }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {

        @JacksonXmlProperty(isAttribute = true)
        private Integer id;

        private String thumbnail;
        private String image;
        private String description;

        @JacksonXmlProperty(localName = "name")
        @JacksonXmlElementWrapper(useWrapping = false)
        private List<BggValueAttr> names = new ArrayList<>();

        @JacksonXmlProperty(localName = "yearpublished")
        private BggValueAttr yearPublished;

        @JacksonXmlProperty(localName = "minplayers")
        private BggValueAttr minPlayers;

        @JacksonXmlProperty(localName = "maxplayers")
        private BggValueAttr maxPlayers;

        @JacksonXmlProperty(localName = "minplaytime")
        private BggValueAttr minPlayTime;

        @JacksonXmlProperty(localName = "maxplaytime")
        private BggValueAttr maxPlayTime;

        @JacksonXmlProperty(localName = "link")
        @JacksonXmlElementWrapper(useWrapping = false)
        private List<Link> links = new ArrayList<>();

        @JacksonXmlProperty(localName = "statistics")
        private Statistics statistics;

        public Integer getId() { return id; }
        public void setId(Integer id) { this.id = id; }
        public String getThumbnail() { return thumbnail; }
        public void setThumbnail(String thumbnail) { this.thumbnail = thumbnail; }
        public String getImage() { return image; }
        public void setImage(String image) { this.image = image; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public List<BggValueAttr> getNames() { return names; }
        public void setNames(List<BggValueAttr> names) { this.names = names != null ? names : new ArrayList<>(); }
        public BggValueAttr getYearPublished() { return yearPublished; }
        public void setYearPublished(BggValueAttr yearPublished) { this.yearPublished = yearPublished; }
        public BggValueAttr getMinPlayers() { return minPlayers; }
        public void setMinPlayers(BggValueAttr minPlayers) { this.minPlayers = minPlayers; }
        public BggValueAttr getMaxPlayers() { return maxPlayers; }
        public void setMaxPlayers(BggValueAttr maxPlayers) { this.maxPlayers = maxPlayers; }
        public BggValueAttr getMinPlayTime() { return minPlayTime; }
        public void setMinPlayTime(BggValueAttr minPlayTime) { this.minPlayTime = minPlayTime; }
        public BggValueAttr getMaxPlayTime() { return maxPlayTime; }
        public void setMaxPlayTime(BggValueAttr maxPlayTime) { this.maxPlayTime = maxPlayTime; }
        public List<Link> getLinks() { return links; }
        public void setLinks(List<Link> links) { this.links = links != null ? links : new ArrayList<>(); }
        public Statistics getStatistics() { return statistics; }
        public void setStatistics(Statistics statistics) { this.statistics = statistics; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Link {

        @JacksonXmlProperty(isAttribute = true)
        private String type;

        @JacksonXmlProperty(isAttribute = true)
        private String value;

        public String getType() { return type; }
        public void setType(String type) { this.type = type; }
        public String getValue() { return value; }
        public void setValue(String value) { this.value = value; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Statistics {

        @JacksonXmlProperty(localName = "ratings")
        private Ratings ratings;

        public Ratings getRatings() { return ratings; }
        public void setRatings(Ratings ratings) { this.ratings = ratings; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Ratings {

        @JacksonXmlProperty(localName = "averageweight")
        private BggValueAttr averageWeight;

        public BggValueAttr getAverageWeight() { return averageWeight; }
        public void setAverageWeight(BggValueAttr averageWeight) { this.averageWeight = averageWeight; }
    }
}
