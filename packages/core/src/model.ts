import { isValidElement } from 'react';
import type { DeckDefinition, DefinedDeck, SlideMetadata } from './types';

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/** Define and eagerly verify a React-authored OpenPresent deck. */
export function defineDeck(definition: DeckDefinition): DefinedDeck {
  if (!definition.metadata?.id?.trim()) {
    throw new Error('OpenPresent deck metadata requires a non-empty "id".');
  }
  if (!definition.metadata?.title?.trim()) {
    throw new Error('OpenPresent deck metadata requires a non-empty "title".');
  }
  if (!Array.isArray(definition.slides) || definition.slides.length === 0) {
    throw new Error('OpenPresent deck must contain at least one <Slide>.');
  }

  const ids = new Set<string>();
  const slideIds = definition.slides.map((slide, index) => {
    if (!isValidElement(slide)) {
      throw new Error(`OpenPresent slide ${index + 1} is not a valid React element.`);
    }
    const id = slide.props.id?.trim();
    if (!id) {
      throw new Error(`OpenPresent slide ${index + 1} requires a non-empty "id" prop.`);
    }
    if (!ID_PATTERN.test(id)) {
      throw new Error(
        `OpenPresent slide ID "${id}" is invalid. Use letters, numbers, hyphens, or underscores and start with a letter or number.`,
      );
    }
    if (ids.has(id)) {
      throw new Error(`OpenPresent found duplicate slide ID "${id}". Slide IDs must be unique.`);
    }
    ids.add(id);
    return id;
  });

  return Object.freeze({
    ...definition,
    slides: Object.freeze([...definition.slides]) as unknown as DefinedDeck['slides'],
    slideIds: Object.freeze(slideIds),
  });
}

export function getSlideMetadata(deck: DefinedDeck): SlideMetadata[] {
  return deck.slides.map(({ props }) => ({
    id: props.id,
    title: props.title,
    label: props.label,
    notes: props.notes,
    transition: props.transition,
    data: props.data,
  }));
}
