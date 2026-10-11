import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { buttonClass } from './button-class';

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
        <Dialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 z-40 bg-[#0b1f3a]/35 dark:bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
          />
        </Dialog.Overlay>
        <Dialog.Content asChild aria-describedby={undefined}>
          <motion.div
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-surface text-ink shadow-lift sm:max-w-[30rem] sm:border-l sm:border-line"
            initial={reduced ? { opacity: 0 } : { x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            <div className="flex items-center justify-end gap-1 border-b border-line px-3 py-2">
              {actions}
              <Dialog.Close
                aria-label="Close"
                className={buttonClass({ variant: 'ghost', size: 'icon' })}
              >
                <X aria-hidden="true" className="size-5" />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
