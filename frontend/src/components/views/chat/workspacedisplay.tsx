import React, { useState, useRef, useEffect } from "react";

import { Workspace, Workflow } from "../../types/datamodel";

import {
  Button,
  Checkbox,
  Layout,
  Menu,
  Typography,
  List,
  Space,
  Modal,
  Input,
  message
} from "antd";

import {
  DownloadOutlined,
  PlayCircleOutlined,
  DeleteOutlined
} from "@ant-design/icons";

import "antd/dist/reset.css";
import { on } from "events";

const { Header, Sider, Content } = Layout;
const { Title, Paragraph } = Typography;

interface WorkspaceDisplayProps {
  workspace: Workspace | null;
  currentWorkflow: string | null;
  onDeleteSteps: (steps: string[]) => void;
  onSwitchWorkflow: (name: string) => void;
  onCreateWorkflow: (name: string) => void;
  onRunWorkflow: (workflow: string) => void;
  onDownloadWorkspace: () => void;
}

const WorkspaceDisplay: React.FC<WorkspaceDisplayProps> = ({
  workspace,
  currentWorkflow,
  onDeleteSteps,
  onSwitchWorkflow,
  onCreateWorkflow,
  onRunWorkflow,
  onDownloadWorkspace,
}) => {

  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>( null);
  const [selectedSteps, setSelectedSteps] = useState<number[]>([]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");

  useEffect(() => {
      const wf =
        workspace?.workflows.find((w) => w.name === currentWorkflow) ||
        workspace?.workflows[0];
      setSelectedWorkflow(wf || null);
    }, [workspace, currentWorkflow]);


  
const handleWorkflowSelect = (name: string) => {
    const wf = workspace?.workflows.find((w) => w.name === name);
    onSwitchWorkflow(name);
    setSelectedWorkflow(wf || null);
    setSelectedSteps([]);
  };

  const toggleStepSelection = (index: number) => {
    setSelectedSteps((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index]
    );
  };

  const downloadWorkspace = () => {
    /*
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${workspace?.name}.json`;
    a.click();
    */
   onDownloadWorkspace();
  };

  const deleteSelectedSteps = () => {
  if (!selectedWorkflow) return;
  if (selectedSteps.length === 0) {
    message.warning("Please select steps to delete.");
    return;
  }

  // Collect step identifiers (e.g., method names or descriptions)
  const stepsToDelete = selectedSteps.map((i) => i.toString());

  // Call the parent callback
  onDeleteSteps(stepsToDelete);
  setSelectedSteps([]);
  message.success("Selected steps deleted.");
};

  const runWorkflow = () => {
    onRunWorkflow(selectedWorkflow?.name || "");
    message.success(`Workflow "${selectedWorkflow?.name}" is running...`);
  };


return (
    <Layout style={{ height: "80vh" }}>
      <Header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#fff"
        }}
      >
        <Title level={3} style={{ color: "#fff", margin: 0 }}>
          {workspace?.name}
        </Title>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={downloadWorkspace}
        >
          Download Workspace
        </Button>
      </Header>

      <Layout>
        <Sider width={250} theme="light">
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }}
  >
    <Menu
      mode="inline"
      selectedKeys={[selectedWorkflow?.name || ""]}
      onClick={({ key }) => handleWorkflowSelect(key as string)}
      style={{ flex: 1 }} // This makes the menu take up remaining space
    >
      {workspace?.workflows.map((wf) => (
        <Menu.Item key={wf.name}>{wf.name}</Menu.Item>
      ))}
    </Menu>

    <div style={{ padding: "10px" }}>
        <Button block onClick={() => setIsModalVisible(true)}>
            New Workflow
        </Button>
    </div>
  </div>
</Sider>

        <Content style={{ padding: "20px" }}>
          {selectedWorkflow && (
            <>
              <Title level={4}>{selectedWorkflow.name}</Title>
              <Paragraph>{selectedWorkflow.description}</Paragraph>

              <List
                bordered
                dataSource={selectedWorkflow.steps}
                renderItem={(step, index) => (
                  <List.Item>
                    <Checkbox
                      checked={selectedSteps.includes(index)}
                      onChange={() => toggleStepSelection(index)}
                    >
                      <strong>{step.method}</strong> - {step.description}
                    </Checkbox>
                  </List.Item>
                )}
              />

              <Space style={{ marginTop: 16 }}>
                <Button
                  type="default"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={deleteSelectedSteps}
                  disabled={selectedSteps.length === 0}
                >
                  Delete Selected Steps
                </Button>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={runWorkflow}
                >
                  Run Workflow
                </Button>
              </Space>
            </>
          )}
        </Content>
      </Layout>
      <Modal
  title="Create New Workflow"
  open={isModalVisible}
  onOk={() => {
    if (!newWorkflowName.trim()) {
      message.error("Please enter a workflow name.");
      return;
    }
    onCreateWorkflow(newWorkflowName.trim());
    setIsModalVisible(false);
    setNewWorkflowName("");
    message.success(`Workflow "${newWorkflowName}" created!`);
  }}
  onCancel={() => {
    setIsModalVisible(false);
    setNewWorkflowName("");
  }}
>
  <Input
    placeholder="Enter workflow name"
    value={newWorkflowName}
    onChange={(e) => setNewWorkflowName(e.target.value)}
  />
</Modal>
    </Layout>
  );

};

export default WorkspaceDisplay;