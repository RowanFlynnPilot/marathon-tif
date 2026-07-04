import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Embedded in a WordPress iframe: report document height to the host page so
// it can resize the iframe. ResizeObserver fires once on observe (covers
// load) and again whenever a drilldown changes the page height. A height
// integer is not sensitive, hence targetOrigin "*".
if (window.parent !== window) {
  new ResizeObserver(() => {
    window.parent.postMessage(
      { source: "marathon-tif", height: document.documentElement.offsetHeight },
      "*"
    );
  }).observe(document.documentElement);
}
