import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { CourseProvider } from "./context/CourseContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <CourseProvider>
        <App />
      </CourseProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
