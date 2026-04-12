"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface DeployNameModalProps {
  open: boolean;
  defaultName?: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export function DeployNameModal({ open, defaultName = "", onConfirm, onClose }: DeployNameModalProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync default name when modal opens
  useEffect(() => {
    if (open) {
      setName(defaultName);
      // Focus the input after animation
      setTimeout(() => inputRef.current?.select(), 80);
    }
  }, [open, defaultName]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      onConfirm(trimmed);
    },
    [name, onConfirm],
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Dialog — pixel-perfect Banani style */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="deploy-modal-title"
            aria-describedby="deploy-modal-desc"
            className="fixed left-1/2 top-1/2 z-50 grid w-full max-w-sm -translate-x-1/2 -translate-y-1/2 gap-5 overflow-hidden rounded-2xl bg-white p-[18px] text-sm shadow-lg"
            initial={{ opacity: 0, scale: 0.95, y: "-48%" }}
            animate={{ opacity: 1, scale: 1, y: "-50%" }}
            exit={{ opacity: 0, scale: 0.95, y: "-48%" }}
            transition={{ duration: 0.1, ease: "easeOut" }}
          >
            {/* Title */}
            <h2
              id="deploy-modal-title"
              className="text-sm/6 text-center font-semibold tracking-tight"
            >
              Deploy Model
            </h2>

            <hr className="-mx-[18px]" />

            {/* Description */}
            <p id="deploy-modal-desc" className="text-sm text-gray-500">
              Give your deployment a name. This will be used to identify your API endpoint.
            </p>

            {/* Form */}
            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Model v1"
                className="rounded-lg border-0 bg-gray-100 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:bg-gray-100 focus:outline-none"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!name.trim()}
                className="h-10 select-none content-center self-stretch rounded-lg bg-[#0066FF] px-4 py-3 text-sm font-semibold text-white grid disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Deploy
              </button>
            </form>

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-[18px] top-[18px] rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-300"
              aria-label="Close"
            >
              <X size={20} className="text-gray-500" />
              <span className="sr-only">Close</span>
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
