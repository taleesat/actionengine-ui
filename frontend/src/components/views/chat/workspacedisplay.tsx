import React, { useState, useEffect } from "react";

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
  Divider,
  Radio,
  message
} from "antd";

import {
  DownloadOutlined,
  PlusCircleOutlined,
  PlayCircleOutlined,
  DeleteOutlined
} from "@ant-design/icons";

import "antd/dist/reset.css";

const { Header, Sider, Content } = Layout;
const { Title, Paragraph } = Typography;

interface WorkspaceDisplayProps {
  workspace: Workspace | null;
  currentWorkflow: string | null;
  runStatus?: string;
  disabled?: boolean;
  onDeleteSteps: (steps: string[]) => void;
  onSwitchWorkflow: (name: string) => void;
  onCreateWorkflow: (name: string) => void;
  onRunWorkflow: (workflow: string) => void;
  onDownloadWorkspace: (format: string, generalized: boolean) => void;
}

const WorkspaceDisplay: React.FC<WorkspaceDisplayProps> = ({
  workspace,
  currentWorkflow,
  runStatus,
  disabled = false,
  onDeleteSteps,
  onSwitchWorkflow,
  onCreateWorkflow,
  onRunWorkflow,
  onDownloadWorkspace,
}) => {

  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [selectedSteps, setSelectedSteps] = useState<number[]>([]);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");

  const [isDownloadModalVisible, setIsDownloadModalVisible] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"json" | "python" | "mcp">("json");
  const [isGeneralized, setIsGeneralized] = useState(false);

  const isInputDisabled =
    disabled ||
    runStatus === "active" ||
    runStatus === "pausing";

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

  const openDownloadModal = () => {
    setIsDownloadModalVisible(true);
  };

  const handleDownload = () => {
    // Pass selected options to parent callback
    onDownloadWorkspace(downloadFormat, isGeneralized);
    setIsDownloadModalVisible(false);
    var format = downloadFormat == "json" ? "JSON" : downloadFormat == "python" ? "Python" : "MCP";
    message.success(`Downloading workspace as ${format}${isGeneralized ? " (generalized)" : ""}`);
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
    <Layout style={{ borderRadius: "8px", overflow: "hidden", height: "100%" }}>
      <Header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "#fff"
        }}
      >
        <Title level={3} style={{ color: "#fff", margin: 0 }}>
          Workspace: {workspace?.name}
        </Title>
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={openDownloadModal}
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

            <Typography.Title level={5} style={{ margin: "12px" }}>
              All Workflows
            </Typography.Title>
            <Divider style={{ margin: "0 0 8px 0" }} />

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
              <Button block onClick={() => setIsModalVisible(true)} icon={<PlusCircleOutlined />}>
                New Workflow
              </Button>
            </div>
          </div>
        </Sider>

        <Content style={{ padding: "20px" }}>
          {selectedWorkflow && (
            <>
              <Title level={4}>Workflow: {selectedWorkflow.name}</Title>
              <Paragraph>{selectedWorkflow.description}</Paragraph>


              <Title level={5} style={{ marginTop: "16px" }}>
                Steps in this Workflow
              </Title>

              <List
                bordered
                dataSource={selectedWorkflow.steps}
                renderItem={(step, index) => (
                  <List.Item>
                    <Checkbox
                      checked={selectedSteps.includes(index)}
                      onChange={() => toggleStepSelection(index)}
                      disabled={isInputDisabled}
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
                  disabled={isInputDisabled || selectedSteps.length === 0}
                >
                  Delete Selected Steps
                </Button>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={runWorkflow}
                  disabled={isInputDisabled}
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
      <Modal
        title="Download Workspace"
        open={isDownloadModalVisible}
        onOk={handleDownload}
        onCancel={() => setIsDownloadModalVisible(false)}
      >
        <Typography.Text>Select format:</Typography.Text>
        <Radio.Group
          onChange={(e) => setDownloadFormat(e.target.value)}
          value={downloadFormat}
          style={{ display: "block", marginTop: 8 }}
        >
          <Radio value="json">JSON</Radio>
          <Radio value="python">Python</Radio>
          <Radio value="mcp">MCP</Radio>
        </Radio.Group>

        <Divider />

        <Checkbox
          checked={isGeneralized}
          onChange={(e) => setIsGeneralized(e.target.checked)}
        >
          Generalize workspace
        </Checkbox>
      </Modal>
    </Layout>
  );

};

export default WorkspaceDisplay;