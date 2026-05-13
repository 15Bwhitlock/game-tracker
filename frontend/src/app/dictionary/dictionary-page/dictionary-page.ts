import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { GAME_CATEGORIES, GAME_MECHANICS } from '@shared/models';

export interface ComplexityLevel {
  value: number;
  label: string;
  bggRange: string;
  description: string;
  examples: string;
}

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface PlayerCountTip {
  count: string;
  description: string;
}

export interface PlayTimeTip {
  range: string;
  description: string;
}

export interface RatingTip {
  value: string;
  description: string;
}

@Component({
  selector: 'app-dictionary-page',
  imports: [FormsModule],
  templateUrl: './dictionary-page.html',
  styleUrl: './dictionary-page.scss'
})
export class DictionaryPage {
  readonly searchTerm = signal('');

  readonly complexityLevels: ComplexityLevel[] = [
    {
      value: 1,
      label: 'Very Light',
      bggRange: '1.0 – 1.7',
      description: 'Almost no rules — teachable in two minutes. No reading required. Perfect for non-gamers, young kids, or casual groups who just want something fun.',
      examples: 'Codenames, Uno, Coup, Dixit, Sushi Go',
    },
    {
      value: 2,
      label: 'Light',
      bggRange: '1.7 – 2.5',
      description: 'Simple rules with a touch of strategy. Usually teachable in under 10 minutes. Accessible to casual players while still rewarding good decisions.',
      examples: 'Ticket to Ride, Carcassonne, Azul, Catan, 7 Wonders',
    },
    {
      value: 3,
      label: 'Medium',
      bggRange: '2.5 – 3.3',
      description: 'Multiple interlocking systems. Requires some planning and familiarity with the rules before play flows naturally. Typically one dedicated rule-reader needed for the first game.',
      examples: 'Wingspan, Pandemic, Dominion, Agricola, Viticulture',
    },
    {
      value: 4,
      label: 'Heavy',
      bggRange: '3.3 – 4.0',
      description: 'Complex rule sets with many decisions per turn. Long play times are common. Best with experienced gamers who are comfortable with a learning curve and a thick rulebook.',
      examples: 'Scythe, Terraforming Mars, Arkham Horror, Power Grid',
    },
    {
      value: 5,
      label: 'Very Heavy',
      bggRange: '4.0 – 5.0',
      description: 'Deep, demanding games that require significant time investment to learn and play. Often multi-hour sessions with highly interconnected systems. Rewarding for dedicated enthusiasts.',
      examples: 'Twilight Imperium, Through the Ages, Gloomhaven, War of the Ring',
    },
  ];

  readonly glossaryTerms: GlossaryTerm[] = [
    { term: 'Euro Game / Eurogame', definition: 'A design style emphasizing resource management and indirect competition. Players rarely eliminate each other directly — they compete through efficient use of limited actions and resources. Typically lower luck, higher strategy.' },
    { term: 'Ameritrash / Thematic Game', definition: 'Games with heavy narrative and theme, lots of randomness, and frequent direct conflict. High variance — the dice gods matter. Fun, dramatic, and cinematic but can feel unfair. Think Arkham Horror or Risk.' },
    { term: 'Gateway Game', definition: 'An accessible, low-complexity game perfect for introducing non-gamers to the hobby. Easy to teach but interesting enough for experienced players to enjoy too. Examples: Ticket to Ride, Catan, Codenames.' },
    { term: 'Filler', definition: 'A short (15–30 min) game used to fill time between longer sessions, while waiting for people to arrive, or as a warm-up. Usually light on rules. Examples: Coup, Sushi Go, No Thanks.' },
    { term: 'Analysis Paralysis (AP)', definition: 'When a player becomes frozen by the number of choices available and takes too long to decide. More common in heavier games with many options. Can slow the whole table down significantly.' },
    { term: 'Alpha Player', definition: 'In cooperative games, a player who dominates decision-making and effectively tells others what to do, removing their agency. Often well-intentioned but undermines the fun for others.' },
    { term: 'Kingmaking', definition: 'When a player who cannot win themselves gets to decide who does by directing their resources, attacks, or votes toward one of the leaders. Common complaint in negotiation and political games.' },
    { term: 'Runaway Leader', definition: 'When one player gains a large enough advantage that others cannot realistically catch up — typically a sign of a weak catch-up mechanism in the game design.' },
    { term: 'Catch-up Mechanism', definition: 'A rule or system that helps trailing players stay competitive. Examples: placing last in a draft picks first next round, getting bonus resources when behind, or scaling income to position.' },
    { term: 'Player Elimination', definition: 'When a player is knocked out of the game and must wait for others to finish. Unpopular in modern game design — the eliminated player is bored and often the game is most interesting at the end.' },
    { term: 'Take-That', definition: 'A mechanic where players directly attack or set back each other\'s progress. Can be fun and interactive, or feel mean-spirited depending on the group. Common in Uno, Munchkin, and many card games.' },
    { term: 'Downtime', definition: 'The time spent waiting for your turn while other players take their actions. High downtime is a common complaint in heavier games with long turns or many players.' },
    { term: 'Hate Drafting', definition: 'In a drafting game, picking a card or item not because you want it but specifically to prevent a rival from getting it. A valid strategy that can frustrate opponents.' },
    { term: 'Quarterbacking', definition: 'Another term for the Alpha Player problem in cooperatives — one player "calls the plays" like a quarterback while others follow along without meaningful input.' },
    { term: 'Meeple', definition: 'A small wooden figure shaped like a person, commonly used as a worker or token in board games. The term originated in Carcassonne and is now used generically across the hobby.' },
    { term: 'BGG / BoardGameGeek', definition: 'The world\'s largest board game database, community, and review site (boardgamegeek.com). Complexity ratings, player counts, reviews, and forums for virtually every game ever published.' },
    { term: 'FLGS', definition: 'Friendly Local Game Store — your neighborhood board game shop. Often hosts game nights, demo events, and has knowledgeable staff. Supporting your FLGS keeps the local gaming community alive.' },
    { term: 'Solo Mode', definition: 'A way to play a game alone, either built into the game or through an unofficial "automa" ruleset. Many modern games include official solo variants that pit you against a simulated opponent.' },
    { term: 'Expansion', definition: 'Additional content for a base game that adds new rules, components, scenarios, or player options. Usually requires ownership of the base game to play. Can significantly extend replay value.' },
    { term: 'Automa', definition: 'A solo-play opponent system that simulates a human player using a deck of cards or simplified rules. Allows competitive games to be played solo without requiring a real opponent.' },
    { term: 'Semi-cooperative', definition: 'A hybrid structure where players cooperate against the game but one player can still emerge as the overall winner. Adds tension between teamwork and self-interest. Examples: Dead of Winter.' },
    { term: 'Fiddly', definition: 'Describes a game with many small components, tokens, or rules that create a lot of overhead during setup, teardown, or play. Not necessarily bad — some players enjoy the detail — but worth knowing before committing to a long session.' },
  ];

  readonly playerCountTips: PlayerCountTip[] = [
    { count: '1 (Solo)', description: 'Look for games with an official solo mode or "automa" system. Many cooperative games work great solo. Check the "Solo / Solitaire" mechanic.' },
    { count: '2 players', description: 'Tight head-to-head play. Many games are specifically designed or best at 2. Cooperative games also work well. Abstract and deduction games tend to shine here.' },
    { count: '3–4 players', description: 'The sweet spot for most modern games. The widest selection of titles is balanced for this range. If unsure, aim here.' },
    { count: '5–6 players', description: 'Party and social deduction games shine. Many euro games start to drag or require significant downtime. Check that the box explicitly supports this count.' },
    { count: '7+ players', description: 'Only specialized games handle this well. Look for Party or Social Deduction categories — Werewolf, Codenames, and similar large-group formats thrive here.' },
  ];

  readonly playTimeTips: PlayTimeTip[] = [
    { range: 'Under 30 min', description: 'Fillers — great for warming up, cooling down, or filling gaps. Often light on rules, high on fun. Easy to fit in two rounds.' },
    { range: '30–60 min', description: 'The "evening game" sweet spot. Two games fit comfortably in one sitting. Accessible enough to teach quickly, meaty enough to feel satisfying.' },
    { range: '1–2 hours', description: 'Standard modern board game length. Usually requires some rule-reading upfront but flows naturally once underway. Most game nights are built around this range.' },
    { range: '2–3 hours', description: 'Dedicated game night territory. Plan for a mid-game break. Best with a committed group that knows the rules — teaching a 2.5h game to new players adds significant time.' },
    { range: '3+ hours', description: 'Heavy commitments — Twilight Imperium territory. Schedule in advance, eat beforehand, and make sure everyone is in. Often the most memorable experiences, but only if the group is ready.' },
  ];

  readonly ratingScale: RatingTip[] = [
    { value: '10', description: 'My absolute favorite — I\'d drop anything to play this.' },
    { value: '9', description: 'Exceptional — always excited when it hits the table.' },
    { value: '8', description: 'Really good — happy to play anytime.' },
    { value: '7', description: 'Good — enjoy it, would agree to play.' },
    { value: '6', description: 'Fine — OK if others want it, but I wouldn\'t seek it out.' },
    { value: '5', description: 'Mediocre — plays out but doesn\'t excite me.' },
    { value: '4', description: 'Not for me — would skip given a choice.' },
    { value: '3', description: 'Bad — actively dislike it, rarely finish.' },
    { value: '2', description: 'Very bad — frustrating or broken.' },
    { value: '1', description: 'Unplayable — would not play again under any circumstances.' },
  ];

  readonly filteredGlossary = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return this.glossaryTerms;
    return this.glossaryTerms.filter(g =>
      g.term.toLowerCase().includes(term) || g.definition.toLowerCase().includes(term)
    );
  });

  readonly filteredCategories = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return GAME_CATEGORIES;
    return GAME_CATEGORIES.filter(c =>
      c.name.toLowerCase().includes(term) || c.description.toLowerCase().includes(term)
    );
  });

  readonly filteredMechanics = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return GAME_MECHANICS;
    return GAME_MECHANICS.filter(m =>
      m.name.toLowerCase().includes(term) || m.description.toLowerCase().includes(term)
    );
  });
}
