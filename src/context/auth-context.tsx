import React, { createContext, useContext, useState } from 'react';

type AuthContextType = {
  isLoggedIn: boolean;
  selectedBranch: string;
  mobileNumber: string;
  login: (branch: string, mobile: string, pin: string) => boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('Choose your terminal');
  const [mobileNumber, setMobileNumber] = useState('');

  const login = (branch: string, mobile: string, pin: string) => {
    if (branch && branch !== 'Choose your terminal' && mobile.length >= 8 && pin.length === 4) {
      setSelectedBranch(branch);
      setMobileNumber(mobile);
      setIsLoggedIn(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsLoggedIn(false);
    setSelectedBranch('Choose your terminal');
    setMobileNumber('');
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, selectedBranch, mobileNumber, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
