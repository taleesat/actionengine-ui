import { Modal, Input } from "antd";
import * as React from "react";
import { Button } from "../../common/Button";
import { Workspace } from "../../types/datamodel";

type ShowWorkspaceMenuProps = {
  isVisible: boolean;
  workspace: Workspace | null;
  currentWorkflow: string | null;
  onClose: () => void;
};

// This component receives the name of the workspace as a prop
const ShowWorkspaceMenu = ({ isVisible, workspace, currentWorkflow, onClose }: ShowWorkspaceMenuProps) => {
  return (
    <Modal open={isVisible} onCancel={onClose} footer={null}>
        <div className="space-y-2 text-sm">
        <div className="font-semibold text-primary mb-2">
          Workspace: {workspace?.name}
        </div>
        <div className="font-semibold text-primary mb-2">
          Current Workflow: {currentWorkflow}
        </div>
        {workspace?.workflows.map((workflow, index) => (
          <div key={index} className="border border-secondary rounded p-2">
            <div className="font-medium">{workflow.name}</div>
            <div className="text-sm text-gray-500">
              {workflow.description}
            </div>
            <ol className="list-decimal pl-4 mt-2">
              {workflow.steps.map((step, stepIndex) => (
                <li key={stepIndex}>
                  {step.method}: {step.description}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default ShowWorkspaceMenu;
