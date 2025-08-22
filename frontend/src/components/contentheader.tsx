import React from "react";
import { Plus } from "lucide-react";
import { Tooltip, Modal } from "antd";
import { appContext } from "../hooks/provider";
import { useConfigStore } from "../hooks/store";
import logo from "../assets/logo.svg";
import { Button } from "./common/Button";

const { confirm } = Modal;

type ContentHeaderProps = {
  onMobileMenuToggle: () => void;
  isMobileMenuOpen: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewSession: () => void;
};

const ContentHeader = ({
  isSidebarOpen,
  onToggleSidebar,
  onNewSession,
}: ContentHeaderProps) => {
  const { user } = React.useContext(appContext);
  useConfigStore();

  const handleNewSession = () => {
    confirm({
      title: 'Replace current workspace?',
      content: 'Creating a new workspace will remove the current one and this action cannot be undone.',
      okText: 'Yes, create new',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk() {
        console.log('Confirmed: create new workspace');
        onNewSession();
      },
      onCancel() {
        console.log('Action canceled');
      },
      maskClosable: false,
      centered: true
    });
  };

  return (
    <div className="sticky top-0 bg-primary">
      <div className="flex h-16 items-center justify-between">
        {/* Left side: Text and Sidebar Controls */}
        <div className="flex items-center">
          {/* New Session Button */}
          <div className="w-[40px]">
            <Tooltip title="Create new session">
              <Button
                variant="tertiary"
                size="sm"
                icon={<Plus className="w-6 h-6" />}
                onClick={handleNewSession}
                className="transition-colors hover:text-accent"
              />
            </Tooltip>
          </div>
          <div className="flex items-center space-x-2">
            <img src={logo} alt="Bedrock Logo" className="h-10 w-10" />
            <div className="text-primary text-2xl font-bold">Bedrock</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentHeader;
