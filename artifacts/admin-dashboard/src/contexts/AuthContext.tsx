import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: string;
  staffRoleId: number | null;
  permissions: string[];
}

interface AuthContextType {
  token: string | null;
  user: UserProfile | null;
  login: (accessToken: string, refreshToken: string, user: UserProfile) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("accessToken"));
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem("userProfile");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (token) {
      localStorage.setItem("accessToken", token);
    } else {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("userProfile");
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("userProfile", JSON.stringify(user));
    }
  }, [user]);

  const login = (accessToken: string, refreshToken: string, newUser: UserProfile) => {
    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    setToken(accessToken);
    setUser(newUser);
    setLocation("/dashboard");
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setLocation("/login");
  };

  const isSuperAdmin = user?.role === "admin" && !user?.staffRoleId;

  const hasPermission = (permission: string): boolean => {
    if (!user || user.role !== "admin") return false;
    if (isSuperAdmin) return true;
    return user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{
      token,
      user,
      login,
      logout,
      isAuthenticated: !!token,
      isSuperAdmin,
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
