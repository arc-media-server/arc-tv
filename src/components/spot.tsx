// Enact's packages are CommonJS; named imports avoid default-export interop differences between
// Vite's dev server and its production bundler.
import { Spottable } from '@enact/spotlight/Spottable';
import { SpotlightContainerDecorator } from '@enact/spotlight/SpotlightContainerDecorator';
import type { ComponentProps, ComponentType, ReactNode } from 'react';

// Focus navigation with Enact Spotlight: anything Spottable can take focus from the remote's
// arrows (and LG's Magic Remote pointer), and OK fires its onClick. Containers remember the last
// focused child, so coming back to a row returns to the same poster.

type SpotProps = ComponentProps<'div'> & { spotlightId?: string; spotlightDisabled?: boolean; onSpotlightUp?: () => void; onSpotlightDown?: () => void };
type ContainerProps = ComponentProps<'div'> & { spotlightId?: string; spotlightRestrict?: 'none' | 'self-first' | 'self-only' };

// Enact's typings don't carry the wrapped element's props through, so they're restated here.
const SpotDiv = Spottable('div') as unknown as ComponentType<SpotProps>;
export const SpotInput = Spottable('input') as unknown as ComponentType<ComponentProps<'input'> & { spotlightId?: string }>;

export function Focusable(props: SpotProps) {
  return <SpotDiv role="button" {...props} />;
}

export function Button({ children, className = '', ...rest }: SpotProps & { children: ReactNode }) {
  return (
    <Focusable className={`btn ${className}`} {...rest}>
      {children}
    </Focusable>
  );
}

/** A group of focusables; arrows move inside it first, and it remembers the last focused child. */
export const Container = SpotlightContainerDecorator({ enterTo: 'last-focused', restrict: 'self-first' }, 'div') as unknown as ComponentType<ContainerProps>;

/** A container that focuses its first child (or `[data-default]`) when entered. */
export const DefaultContainer = SpotlightContainerDecorator({ enterTo: 'default-element', defaultElement: '[data-default]' }, 'div') as unknown as ComponentType<ContainerProps>;
