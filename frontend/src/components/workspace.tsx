import { Modal, Input } from "antd";
import { setLocalStorage } from "./utils";
import { appContext } from "../hooks/provider";
import * as React from "react";
import { Button } from "./common/Button";

type WorkspaceMenuProps = {
  isVisible: boolean;
  onOk: (workspaceName: string) => void;
  onClose: () => void;
};

// This component receives the name of the workspace as a prop
const WorkspaceMenu = ({ isVisible, onOk, onClose }: WorkspaceMenuProps) => {
  const [workspaceName, setWorkspaceName] = React.useState("workspace1");
  const handleWorkspaceNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkspaceName(e.target.value);
  };

  const handleWorkspaceCreate = () => {
    onOk(workspaceName);
  }
  return (
    <Modal open={isVisible} onOk={() => onOk("")} onCancel={onClose} footer={null}>
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-2">New Workspace</h2>
        <Input
          type="text"
          placeholder="Workspace Name"
          value={workspaceName}
          onChange={handleWorkspaceNameChange}
          className="mb-4"
        />
        <div className="flex gap-2 px-2 justify-end">
          <Button type="primary" onClick={handleWorkspaceCreate}>
            Create
          </Button>
          <Button type="primary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default WorkspaceMenu;
