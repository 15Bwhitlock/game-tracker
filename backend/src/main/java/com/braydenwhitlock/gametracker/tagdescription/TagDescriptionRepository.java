package com.braydenwhitlock.gametracker.tagdescription;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface TagDescriptionRepository extends JpaRepository<TagDescription, Long> {

    // Case-insensitive — BGG casing can drift slightly for the same real-world term.
    @Query("select t from TagDescription t where lower(t.name) = lower(:name) and t.type = :type")
    Optional<TagDescription> findByNameIgnoreCaseAndType(@Param("name") String name, @Param("type") TagType type);
}
