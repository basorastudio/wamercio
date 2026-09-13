import React from 'react';

type DesktopHeaderContextValue = {
  headerCenter: React.ReactNode;
  setHeaderCenter: React.Dispatch<React.SetStateAction<React.ReactNode>>;
  mobileHeaderAction: React.ReactNode;
  setMobileHeaderAction: React.Dispatch<React.SetStateAction<React.ReactNode>>;
  mobileHeaderPanel: React.ReactNode;
  setMobileHeaderPanel: React.Dispatch<React.SetStateAction<React.ReactNode>>;
};

const DesktopHeaderContext = React.createContext<DesktopHeaderContextValue | undefined>(undefined);

export const DesktopHeaderProvider = ({ children }: { children: React.ReactNode }) => {
  const [headerCenter, setHeaderCenter] = React.useState<React.ReactNode>(null);
  const [mobileHeaderAction, setMobileHeaderAction] = React.useState<React.ReactNode>(null);
  const [mobileHeaderPanel, setMobileHeaderPanel] = React.useState<React.ReactNode>(null);

  const value = React.useMemo(() => ({
    headerCenter,
    setHeaderCenter,
    mobileHeaderAction,
    setMobileHeaderAction,
    mobileHeaderPanel,
    setMobileHeaderPanel,
  }), [headerCenter, mobileHeaderAction, mobileHeaderPanel]);

  return (
    <DesktopHeaderContext.Provider value={value}>
      {children}
    </DesktopHeaderContext.Provider>
  );
};

export const useDesktopHeader = () => {
  const context = React.useContext(DesktopHeaderContext);
  if (!context) {
    throw new Error('useDesktopHeader must be used within a DesktopHeaderProvider');
  }
  return context;
};
