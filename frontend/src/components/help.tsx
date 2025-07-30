import React from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { appContext } from "../hooks/provider";
import SignInModal from "./signin";
import { useSettingsStore, generateOpenAIModelConfig } from "./store";
import MonacoEditor from "@monaco-editor/react";
import { settingsAPI } from "./views/api";
import {
  Input,
  Switch,
  Button,
  Space,
  Tag,
  Divider,
  Modal,
  Tooltip,
  Select,
  Tabs,
  Input as AntInput,
  Upload,
  message,
} from "antd";
import { InfoCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { Plus } from "lucide-react";

const { TextArea } = AntInput;

interface HelpMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpMenu: React.FC<HelpMenuProps> = ({ isOpen, onClose }) => {

  const handleClose = () => {
    onClose();
  };

  return (
    <>
      <Modal
        open={isOpen}
        onCancel={handleClose}
        closable={true}
        footer={[]}
        width={700}
      >
        <div className="mt-12 space-y-4">
          <h1>Shell Command Menu</h1>
  <table border={1} cellPadding={8} cellSpacing={0} className="w-full">
    <thead>
      <tr>
        <th>Command</th>
        <th>Aliases</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>
      <tr><td>help</td><td>h, ?</td><td>Show this help message</td></tr>
      <tr><td>exit</td><td>quit</td><td>Exit the shell</td></tr>
      <tr><td>unknown</td><td>–</td><td>No matching command found</td></tr>
      <tr><td>workspace</td><td>ws, app, application</td><td>Create a new workspace with name 'name'</td></tr>
      <tr><td>workflow</td><td>wf, function, func, api</td><td>Create a new workflow with name 'name'</td></tr>
      <tr><td>delete</td><td>d, remove, undo</td><td>Delete step i in current workflow, or last step if unspecified</td></tr>
      <tr><td>print</td><td>p, show, list</td><td>Print the current workflow</td></tr>
      <tr><td>save</td><td>s, store, export</td><td>Save the workspace to a JSON file</td></tr>
      <tr><td>load</td><td>l, import</td><td>Load a workspace from a JSON file</td></tr>
      <tr><td>run</td><td>r, execute, start</td><td>Run the workflow specified in the JSON file</td></tr>
      <tr><td>goto</td><td>g, navigate</td><td>Navigate to a URL</td></tr>
      <tr><td>act</td><td>a, action, do, perform</td><td>Perform a natural language action on the page</td></tr>
      <tr><td>extract</td><td>x, scrape, get</td><td>Extract info from page based on the task</td></tr>
      <tr><td>browser</td><td>b</td><td>Start/stop recording browser interactions</td></tr>
      <tr><td>status</td><td>st</td><td>Show current shell and browser recording status</td></tr>
    </tbody>
  </table>
        </div>
      </Modal>
    </>
  );
};

export default HelpMenu;
