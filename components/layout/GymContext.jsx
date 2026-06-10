"use client";

import { createContext, useContext } from "react";

const GymContext = createContext({ gymName: "Your Gym" });

export function GymProvider({ gymName, children }) {
  return (
    <GymContext.Provider value={{ gymName: gymName || "Your Gym" }}>
      {children}
    </GymContext.Provider>
  );
}

export function useGym() {
  return useContext(GymContext);
}
