import React from "react";
import "antd/dist/reset.css";
import "./src/styles/global.css";

import AuthProvider from "./src/hooks/provider";

export const wrapRootElement = AuthProvider;

const codeToRunOnClient = `(function() {
  try {
    var mode = localStorage.getItem('darkmode');
    document.getElementsByTagName("html")[0].className === 'dark' ? 'dark' : 'light';
  } catch (e) {}
})();`;

export const onRenderBody = ({ setHeadComponents }) =>
  setHeadComponents([
    <script
      key="myscript"
      dangerouslySetInnerHTML={{ __html: codeToRunOnClient }}
    />,
  ]);
