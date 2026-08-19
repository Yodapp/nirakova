import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Experience from "../app/Experience";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Experience />
  </StrictMode>,
);
