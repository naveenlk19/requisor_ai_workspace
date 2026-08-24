import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { UpgradeModal } from "@/components/shared/UpgradeModal";

export type UpgradeReason =
  | "token_limit"
  | "project_limit"
  | "feature_locked"
  | "agent_access"
  | "meeting_limit";

interface UpgradeModalContextType {
  showUpgrade: (reason?: UpgradeReason, customMessage?: string) => void;
  /**
   * Inspect a thrown error from a mutation and, if it's a 402 budget block,
   * open the upgrade modal with the right reason. Returns true if handled.
   */
  handleBudgetError: (err: any) => boolean;
}

const UpgradeModalContext = createContext<UpgradeModalContextType>({
  showUpgrade: () => {},
  handleBudgetError: () => false,
});

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<UpgradeReason>("token_limit");
  const [customMessage, setCustomMessage] = useState<string | undefined>(undefined);

  const showUpgrade = useCallback(
    (r: UpgradeReason = "token_limit", message?: string) => {
      setReason(r);
      setCustomMessage(message);
      setOpen(true);
    },
    [],
  );

  const handleBudgetError = useCallback(
    (err: any): boolean => {
      if (err?.status === 402) {
        const r: UpgradeReason =
          err?.data?.reason === "meeting_limit" ? "meeting_limit" : "token_limit";
        setReason(r);
        setCustomMessage(err?.data?.message || err?.message);
        setOpen(true);
        return true;
      }
      return false;
    },
    [],
  );

  return (
    <UpgradeModalContext.Provider value={{ showUpgrade, handleBudgetError }}>
      {children}
      <UpgradeModal
        open={open}
        onClose={() => setOpen(false)}
        reason={reason}
        customMessage={customMessage}
      />
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  return useContext(UpgradeModalContext);
}
