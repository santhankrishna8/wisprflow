import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";
import Bubble from "./Bubble";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Bubble />
  </StrictMode>
);
