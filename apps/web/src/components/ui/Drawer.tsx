import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { iconButtonClass } from './button-class';

/**
 * A modal panel: slides in from the right on wide screens and is a full-height sheet on phones.
 * Radix Dialog supplies focus containment, Esc to close, and focus return to the opener.
 */
export function Drawer({
  title,
  onClose,
  actions,
  children,
}: {
  /** The accessible name. The visible heading lives in `children`. */
  title: string;
  onClose: () => void;
  /** Controls shown in the header bar, left of Close. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        {/* Animations follow the system's reduced-motion setting. */}
        <MotionConfig reducedMotion="user">
          <Dialog.Overlay asChild>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/20 dark:bg-sunken/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
            />
          </Dialog.Overlay>
          <Dialog.Content
            asChild
            aria-describedby={undefined}
            // Focus the panel itself, not its first button, so opening doesn't ring "Share".
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              if (e.currentTarget instanceof HTMLElement) e.currentTarget.focus();
            }}
          >
            <motion.div
              tabIndex={-1}
              className="fixed inset-y-0 right-0 z-50 flex w-full flex-col outline-none bg-panel text-ink shadow-lift sm:max-w-[27.5rem] sm:border-l sm:border-line"
              initial={reduced ? { opacity: 0 } : { x: 48, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              <Dialog.Title className="sr-only">{title}</Dialog.Title>
              <div className="flex items-center justify-end gap-1 border-b border-line px-3 py-2">
                {actions}
                <Dialog.Close aria-label="Close" className={iconButtonClass()}>
                  <X aria-hidden="true" className="size-5" />
                </Dialog.Close>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
            </motion.div>
          </Dialog.Content>
        </MotionConfig>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
