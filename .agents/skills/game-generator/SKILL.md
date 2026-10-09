---
name: game-generator
description: Generate original game ideas, quests, missions, mechanics, enemies, characters, items, levels, events, challenges, narratives, and other game-design content. Use when asked to brainstorm or develop content for a video game, prototype, game jam, assignment, or existing game project.
---

# Game Generator

Generate practical, original, and usable game-design content based on the user's request.

## Workflow

1. Identify what the user wants: game concept, quest, mission, mechanic, enemy, character, item, level, event, narrative, or another type of content.
2. Preserve any existing game, genre, platform, tone, audience, mechanics, and scope constraints provided by the user.
3. Make reasonable assumptions for minor missing details. Ask a question only when missing information would substantially change the result.
4. Generate ideas that are meaningfully different from one another rather than superficial variations.
5. Keep complexity proportional to the request. Prefer simple, implementable ideas unless complexity is requested.
6. Before responding, check that the content is coherent, useful, and compatible with the user's constraints.

## Defaults

- Unknown platform: assume PC/console-style gameplay.
- Unknown scope: prefer small-to-medium scope.
- Unknown audience: assume a general gaming audience.
- Unknown tone: follow the genre and existing game context.
- Quick brainstorming: prioritize concise ideas over long explanations.
- Existing game: extend its current systems before introducing unrelated systems.

## Game Ideas

When generating a complete game concept, normally include:

- Title
- Genre
- Core hook
- Short concept
- Core gameplay loop
- Main mechanics
- Progression
- What makes it distinct
- Scope

Use this structure when appropriate:

```markdown
## [Game Title]

**Genre:** [genre]
**Core Hook:** [one-sentence hook]

### Concept
[Short description]

### Core Gameplay Loop
1. [Player action]
2. [Challenge or decision]
3. [Reward/progression]
4. [Repeat/evolve]

### Main Mechanics
- [Mechanic]
- [Mechanic]
- [Mechanic]

### Progression
[How the game develops]

### What Makes It Distinct
[Specific hook or interaction]

### Scope
[Simple / Moderate / Large]
```

## Quests and Missions

Focus on what the player actually does, not only the story.

Consider:
- Goal
- Setup
- Objectives
- Gameplay
- Complication
- Resolution
- Rewards
- Optional choices or consequences

Avoid making every quest a basic "go there, kill/collect something, return" structure unless simplicity is requested. Add a meaningful mechanic, decision, environmental interaction, constraint, or consequence when appropriate.

## Mechanics

Describe:
- Player action
- Game response
- Rules
- Risk/reward
- Interaction with other systems
- How the mechanic can evolve

## Enemies

Define enemies by behavior and counterplay, not only health and appearance.

Consider:
- Combat role
- Movement
- Attacks
- Special behavior
- Weakness/counterplay
- Difficulty
- Interaction with other enemies

## Characters

Prioritize gameplay relevance. Consider:
- Role
- Motivation
- Personality
- Relationship to the player
- Gameplay function
- Conflict
- Distinctive trait

Do not add extensive backstory unless requested.

## Items and Power-Ups

Consider:
- Function
- Activation
- Duration
- Limitations
- Strategic use
- Synergies
- Distinctive visual identity when relevant

## Levels and Environments

Consider:
- Player objective
- Layout
- Exploration
- Obstacles
- Encounters
- Pacing
- Difficulty progression
- Environmental storytelling when useful

Describe how the player interacts with and moves through the space, not only what it looks like.

## Multiple Ideas

When asked for multiple ideas:

- Make each idea meaningfully different.
- Vary the underlying gameplay, not just names or settings.
- Prefer 5 strong ideas over many weak variations.
- Follow the requested number when one is specified.
- Use a comparison table when it makes differences easier to understand.

Example:

| Idea | Core Mechanic | Hook | Complexity |
|---|---|---|---|
| [Name] | [Mechanic] | [Hook] | [Simple/Moderate/Complex] |

## Originality Check

Before finalizing an idea, ask internally:

> Could this describe dozens of existing games without changing anything?

If yes, add a specific hook, interaction, constraint, or system that gives it a clearer identity.

Do not add complexity merely to make an idea feel original. A simple mechanic with an interesting interaction is preferable to a complicated mechanic without a clear purpose.

## Existing Games

When working on an existing game:

1. Treat its established mechanics and terminology as the source of truth.
2. Do not casually replace existing systems.
3. Prefer additions that interact with the current gameplay loop.
4. Keep new content compatible with the game's existing tone and scope.
5. Clearly distinguish proposed additions from existing mechanics when useful.

## Gotchas

- Do not produce several ideas that are essentially the same mechanic with different names.
- Do not confuse lore with gameplay.
- Do not add mechanics just because they sound interesting; they should serve the gameplay loop.
- Do not over-engineer a simple prototype or game-jam request.
- Do not make every quest combat-focused.
- Do not make every enemy a basic fast/strong/ranged variation without meaningful behavioral differences.
- Do not bury a simple request under excessive explanation.

## Final Check

Before responding, verify:

- [ ] The output directly answers the request.
- [ ] Ideas are meaningfully distinct.
- [ ] Existing constraints are respected.
- [ ] Player interaction is understandable.
- [ ] The content is practical enough to prototype or implement.
- [ ] Unnecessary complexity has been removed.
- [ ] Generic ideas have a distinctive hook where appropriate.
