import { Modal, Collapse, Checkbox, Input, message } from "antd";
import * as React from "react";
import { Button } from "../../common/Button";
import { Workspace } from "../../types/datamodel";

type ShowWorkspaceMenuProps = {
  isVisible: boolean;
  workspace: Workspace | null;
  currentWorkflow: string | null;
  onClose: () => void;
  onDeleteSteps: (steps: string[]) => void;
  onSwitchWorkflow: (workflow: string) => void;
  onCreateWorkflow: (name: string) => void;
  onRunWorkflow: (workflow: string) => void;
  onDownloadWorkspace: () => void;
};

const { Panel } = Collapse;

const ShowWorkspaceMenu = ({
  isVisible,
  workspace,
  currentWorkflow,
  onClose,
  onDeleteSteps,
  onSwitchWorkflow,
  onCreateWorkflow,
  onRunWorkflow,
  onDownloadWorkspace,
}: ShowWorkspaceMenuProps) => {
  const [checkedSteps, setCheckedSteps] = React.useState<string[]>([]);
  const [newWorkflowName, setNewWorkflowName] = React.useState("");

  const current = workspace?.workflows.find((w) => w.name === currentWorkflow);
  const others = workspace?.workflows.filter((w) => w.name !== currentWorkflow);

  const handleCheckboxChange = (stepId: string, checked: boolean) => {
    setCheckedSteps((prev) =>
      checked ? [...prev, stepId] : prev.filter((id) => id !== stepId)
    );
  };

  const handleDelete = () => {
    onDeleteSteps(checkedSteps);
    setCheckedSteps([]);
  };

  const handleCreateWorkflow = () => {
    if (!newWorkflowName.trim()) {
      message.warning("Please enter a workflow name.");
      return;
    }
    onCreateWorkflow(newWorkflowName.trim());
    setNewWorkflowName("");
  };

  return (
    <Modal open={isVisible} onCancel={onClose} footer={null} width={700}>
      <div className="space-y-4 text-sm">
        {/* Header */}
        <div className="text-lg font-semibold text-primary">
          Workspace: {workspace?.name}
        </div>
        <div className="flex justify-between items-center">
          <Button type="default" onClick={onDownloadWorkspace}>
            Download Workspace
          </Button>
        </div>

        {/* Current Workflow */}
        {current && (
          <Collapse defaultActiveKey={["current"]}>
            <Panel header={current.name + " (current workflow)"} key="current">
              <div className="text-gray-600 mb-2">{current.description}</div>
              <ul className="list-disc pl-4 space-y-2">
                {current.steps.map((step, index) => {
                  const stepId = `${step.method}-${index}`;
                  return (
                    <li key={stepId}>
                      <Checkbox
                        checked={checkedSteps.includes(stepId)}
                        onChange={(e) =>
                          handleCheckboxChange(stepId, e.target.checked)
                        }
                      >
                        {step.method}: {step.description}
                      </Checkbox>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="primary"
                  onClick={handleDelete}
                  disabled={checkedSteps.length === 0}
                >
                  Delete Steps
                </Button>
                  <Button type="default" onClick={() => onRunWorkflow(current.name)}>
                    Run
                  </Button>
              </div>
            </Panel>
          </Collapse>
        )}

        {/* Other Workflows */}
        {others && others.length > 0 && (
          <Collapse>
            {others.map((workflow, index) => (
              <Panel header={workflow.name} key={index}>
                <div className="text-gray-600 mb-2">{workflow.description}</div>
                <ul className="list-disc pl-4 space-y-1 mb-2">
                  {workflow.steps.map((step, stepIndex) => (
                    <li key={stepIndex}>
                      {step.method}: {step.description}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 justify-end">
                  <Button type="default" onClick={() => onSwitchWorkflow(workflow.name)}>
                    Set as Current
                  </Button>
                  <Button type="default" onClick={() => onRunWorkflow(workflow.name)}>
                    Run
                  </Button>
                </div>
              </Panel>
            ))}
          </Collapse>
        )}

        {/* Create Workflow */}
        <div className="border-t pt-4 mt-4">
          <div className="font-semibold mb-2">Create New Workflow</div>
          <div className="flex gap-2">
            <Input
              placeholder="Workflow name"
              value={newWorkflowName}
              onChange={(e) => setNewWorkflowName(e.target.value)}
            />
            <Button type="primary" onClick={handleCreateWorkflow}>
              Create
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ShowWorkspaceMenu;
