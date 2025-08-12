import { Modal, Input } from "antd";
import * as React from "react";
import { Button } from "../../common/Button";

type CreateWorkspaceMenuProps = {
  isVisible: boolean;
  onCreateWorkspace: (workspaceName: string) => void;
  onClose: () => void;
  onLoadWorkspace: (file: File) => void;
};

const CreateWorkspaceMenu = ({ isVisible, onCreateWorkspace, onClose, onLoadWorkspace }: CreateWorkspaceMenuProps) => {
  const [workspaceName, setWorkspaceName] = React.useState("workspace1");

  const handleWorkspaceNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWorkspaceName(e.target.value);
  };

  const handleWorkspaceCreate = () => {
    onCreateWorkspace(workspaceName);
  };

  const handleLoadFromFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.txt"; // Adjust allowed file types if needed
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        onLoadWorkspace(file);
      }
    };
    input.click();
  };

  return (
    <Modal open={isVisible} onCancel={onClose} footer={null}>
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
          <Button type="default" onClick={handleLoadFromFile}>
            Load from File
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CreateWorkspaceMenu;
