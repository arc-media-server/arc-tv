// Enact's packages are CommonJS; named imports avoid default-export interop differences between
// Vite's dev server and its production bundler.
import { Spottable } from '@enact/spotlight/Spottable';
import { SpotlightContainerDecorator } from '@enact/spotlight/SpotlightContainerDecorator';
import { Spotlight } from '@enact/spotlight';
import { useEffect, useRef, type ComponentProps, type ComponentType, type ReactNode, type RefObject } from 'react';

// Focus navigation with Enact Spotlight: anything Spottable can take focus from the remote's
// arrows (and LG's Magic Remote pointer), and OK fires its onClick. Containers remember the last
// focused child, so coming back to a row returns to the same poster.

type SpotProps = ComponentProps<'div'> & { spotlightId?: string; spotlightDisabled?: boolean; onSpotlightUp?: () => void; onSpotlightDown?: () => void };
type ContainerProps = ComponentProps<'div'> & { spotlightId?: string; spotlightDisabled?: boolean; spotlightRestrict?: 'none' | 'self-first' | 'self-only' };

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
export const Container = SpotlightContainerDecorator({ enterTo: 'last-focused', defaultElement: '[data-default]', restrict: 'self-first' }, 'div') as unknown as ComponentType<ContainerProps>;

/** A container that focuses its first child (or `[data-default]`) when entered. */
export const DefaultContainer = SpotlightContainerDecorator({ enterTo: 'default-element', defaultElement: '[data-default]' }, 'div') as unknown as ComponentType<ContainerProps>;

/** A group entered at its `[data-default]` element whenever the focus comes in (the sidebar's current section). */
export const EntryContainer = SpotlightContainerDecorator({ enterTo: 'default-element', defaultElement: '[data-default]', restrict: 'self-first' }, 'div') as unknown as ComponentType<ContainerProps>;

/** A dialog's or panel's group: the focus stays inside until it closes. */
// The decorator's spotlightRestrict prop defaults to 'self-first' and wins over the config's
// restrict, so the trap passes 'self-only' as the prop.
const TrapDiv = SpotlightContainerDecorator({ enterTo: 'default-element', defaultElement: '[data-default]' }, 'div') as unknown as ComponentType<ContainerProps>;
export function Trap(props: ContainerProps) {
  return <TrapDiv spotlightRestrict="self-only" {...props} />;
}

/**
 * Once `ready` (the screen's content has arrived), moves the focus to its `[data-default]`
 * element (or its first focusable), unless the focus is already inside it.
 */
export function useInitialFocus(root: RefObject<HTMLElement | null>, ready: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const timer = window.setTimeout(() => {
      const el = root.current;
      if (!el) return;
      const cur = Spotlight.getCurrent() as HTMLElement | null;
      if (cur && el.contains(cur)) return;
      const target = (el.querySelector('[data-default]') ?? el.querySelector('.spottable')) as HTMLElement | null;
      if (target) focusElement(target);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, root]);
}

/** Spotlight.focus with an element (its typings only list ids and selectors). */
export function focusElement(el: Element): boolean {
  return (Spotlight.focus as unknown as (target: Element) => boolean)(el);
}
