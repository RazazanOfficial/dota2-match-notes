import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "lenis/dist/lenis.css";
import "./styles.css";
import "./dashboard.css";
import "./experience.css";

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
